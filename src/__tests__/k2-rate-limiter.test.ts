// src/__tests__/k2-rate-limiter.test.ts
//
// K2: el rateLimiter guardaba la marca de tiempo ANTES de comparar con el límite. Una petición rechazada (429)
// también contaba: un cliente que reintentaba sin parar renovaba su propio bloqueo indefinidamente y el arreglo
// de su clave crecía con cada 429. Ahora solo se registran las peticiones aceptadas.
//
// El reloj se simula con jest.spyOn(Date, 'now'): no hay esperas reales.

jest.mock('../utils/logger', () => ({
  __esModule: true,
  logger: { warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { rateLimiter } from '../middleware/performance.middleware';

const VENTANA = 60_000;
const mockWarn = logger.warn as jest.Mock;

let ahora = 1_000_000;
jest.spyOn(Date, 'now').mockImplementation(() => ahora);

const peticion = (ip = '10.0.0.1') =>
  ({ ip, method: 'GET', baseUrl: '/api/public', socket: {}, headers: {} }) as unknown as Request;

// Ejecuta el middleware y devuelve el código HTTP (200 si dejó pasar)
const ejecutar = (limitador: ReturnType<typeof rateLimiter>, ip?: string): number => {
  let codigo = 200;
  const res = {
    status(c: number) {
      codigo = c;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  const next: NextFunction = jest.fn();
  limitador(peticion(ip), res, next);
  return codigo;
};

beforeEach(() => {
  ahora = 1_000_000;
  mockWarn.mockClear();
});

describe('rateLimiter (K2)', () => {
  it('deja pasar hasta el límite y rechaza la siguiente con 429', () => {
    const limitador = rateLimiter(VENTANA, 3);
    expect([ejecutar(limitador), ejecutar(limitador), ejecutar(limitador)]).toEqual([200, 200, 200]);
    expect(ejecutar(limitador)).toBe(429);
  });

  it('los reintentos rechazados NO renuevan el bloqueo: al vencer la ventana de las aceptadas vuelve a pasar', () => {
    const limitador = rateLimiter(VENTANA, 2);
    ejecutar(limitador); // t = 0
    ahora += 1_000;
    ejecutar(limitador); // t = 1 s
    // El cliente reintenta sin parar durante casi toda la ventana
    for (let s = 2; s < 60; s++) {
      ahora = 1_000_000 + s * 1_000;
      expect(ejecutar(limitador)).toBe(429);
    }
    // t = 60 s: venció la primera aceptada (t = 0). Antes del arreglo seguía bloqueado por los 429 recientes.
    ahora = 1_000_000 + VENTANA;
    expect(ejecutar(limitador)).toBe(200);
  });

  it('cada clave tiene su propio cupo', () => {
    const limitador = rateLimiter(VENTANA, 1);
    expect(ejecutar(limitador, '10.0.0.1')).toBe(200);
    expect(ejecutar(limitador, '10.0.0.1')).toBe(429);
    expect(ejecutar(limitador, '10.0.0.2')).toBe(200);
  });

  it('respeta el keyGenerator (p. ej. por usuario)', () => {
    const limitador = rateLimiter(VENTANA, 1, () => 'u:abc');
    expect(ejecutar(limitador, '10.0.0.1')).toBe(200);
    expect(ejecutar(limitador, '10.0.0.2')).toBe(429); // otra IP, mismo usuario
  });

  it('el aviso [429] sale una sola vez por clave y ventana, aunque se reintente muchas veces', () => {
    const limitador = rateLimiter(VENTANA, 1);
    ejecutar(limitador);
    for (let i = 0; i < 20; i++) ejecutar(limitador);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0][0]).toContain('[429] GET /api/public (límite 1 en 60 s, por IP)');
    // El aviso no lleva la IP
    expect(mockWarn.mock.calls[0][0]).not.toContain('10.0.0.1');
  });

  it('vuelve a avisar en la ventana siguiente si el cliente sigue excediendo el límite', () => {
    const limitador = rateLimiter(VENTANA, 1);
    ejecutar(limitador); // aceptada en t = 0
    ejecutar(limitador); // 429 → aviso 1
    ahora += VENTANA; // vence la aceptada
    expect(ejecutar(limitador)).toBe(200);
    expect(ejecutar(limitador)).toBe(429); // aviso 2: pasó una ventana desde el aviso 1
    expect(mockWarn).toHaveBeenCalledTimes(2);
  });
});
