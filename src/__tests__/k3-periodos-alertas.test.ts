// src/__tests__/k3-periodos-alertas.test.ts
//
// K3: periodos académicos y alertas de inasistencia.
//  a) Alertas: si el periodoId del registro ya no existe en la escuela, el periodo se ubica por la FECHA DEL
//     REGISTRO y, si no, por la fecha de hoy (antes: sin periodo → sin alerta).
//  b) PUT /escuelas/:id/periodos: se conserva el _id de los periodos existentes (por _id o por número).
//  c) Validador: fecha_fin se compara con la fecha_inicio del MISMO periodo (antes leía req.body.fecha_inicio,
//     que no existe, y aceptaba periodos que terminan antes de empezar).
//
// Los modelos y servicios externos se simulan: no se necesita MongoDB.

jest.mock('../models/escuela.model', () => ({
  __esModule: true,
  default: { findById: jest.fn(), findByIdAndUpdate: jest.fn() },
}));
jest.mock('../models/asistencia.model', () => ({ __esModule: true, default: {} }));
jest.mock('../models/alertaAsistencia.model', () => ({ __esModule: true, default: {} }));
jest.mock('../models/curso.model', () => ({ __esModule: true, default: {} }));
jest.mock('../models/usuario.model', () => ({ __esModule: true, default: {} }));
jest.mock('../models/notificacion.model', () => ({ __esModule: true, default: {} }));
jest.mock('../models/mensaje.model', () => ({ __esModule: true, default: {} }));
jest.mock('../services/email.service', () => ({ encolarCorreo: jest.fn() }));
jest.mock('../services/pushNotification.service', () => ({ __esModule: true, default: {} }));
jest.mock('../utils/logger', () => ({
  __esModule: true,
  logger: { warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import Escuela from '../models/escuela.model';
import { logger } from '../utils/logger';
import { obtenerPeriodoVigente } from '../services/alertaAsistencia.service';
import { conservarIdsPeriodos } from '../utils/periodosAcademicos';
import escuelaController from '../controllers/escuela.controller';
import { actualizarPeriodosValidation } from '../validations/escuela.validation';

const ESCUELA = '507f1f77bcf86cd799439012';
const P1 = '64c000000000000000000001';
const P2 = '64c000000000000000000002';
const P3 = '64c000000000000000000003';

// Periodos como los guarda la web: hora local de Colombia (00:00 = 05:00Z)
const periodos = [
  { _id: new mongoose.Types.ObjectId(P1), numero: 1, nombre: 'Periodo 1', fecha_inicio: new Date('2026-02-01T05:00:00Z'), fecha_fin: new Date('2026-04-30T05:00:00Z') },
  { _id: new mongoose.Types.ObjectId(P2), numero: 2, nombre: 'Periodo 2', fecha_inicio: new Date('2026-05-01T05:00:00Z'), fecha_fin: new Date('2026-08-31T05:00:00Z') },
  { _id: new mongoose.Types.ObjectId(P3), numero: 3, nombre: 'Periodo 3', fecha_inicio: new Date('2026-09-01T05:00:00Z'), fecha_fin: new Date('2026-11-30T05:00:00Z') },
];

const mockEscuela = Escuela as unknown as { findById: jest.Mock; findByIdAndUpdate: jest.Mock };
const consulta = (resultado: unknown) => ({ select: () => ({ lean: () => Promise.resolve(resultado) }) });

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-15T15:00:00Z') }); // "hoy" cae en el periodo 3
  mockEscuela.findById.mockReset();
  mockEscuela.findByIdAndUpdate.mockReset();
  mockEscuela.findById.mockImplementation(() => consulta({ periodos_academicos: periodos }));
  (logger.warn as jest.Mock).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('obtenerPeriodoVigente: orden periodoId → fecha del registro → hoy', () => {
  it('1) usa el periodoId del registro si todavía existe', async () => {
    const periodo = await obtenerPeriodoVigente(ESCUELA, P1, new Date('2026-10-01T00:00:00Z'));
    expect(periodo?.id).toBe(P1);
    expect(periodo?.desde.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(periodo?.hastaExclusivo.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('2) periodoId que ya no existe → periodo que contiene la fecha del registro (con aviso en el log)', async () => {
    const borrado = '64c0000000000000000000ff';
    const periodo = await obtenerPeriodoVigente(ESCUELA, borrado, new Date('2026-03-10T00:00:00Z'));
    expect(periodo?.id).toBe(P1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`El periodo ${borrado} ya no existe`));
  });

  it('2) sin periodoId: un registro del periodo 1 finalizado tarde cuenta en el periodo 1, no en el de hoy', async () => {
    const periodo = await obtenerPeriodoVigente(ESCUELA, undefined, new Date('2026-04-20T00:00:00Z'));
    expect(periodo?.id).toBe(P1);
  });

  it('2) el primer y el último día del periodo cuentan (fecha calendario, aunque el periodo esté a 05:00Z)', async () => {
    expect((await obtenerPeriodoVigente(ESCUELA, undefined, new Date('2026-05-01T00:00:00Z')))?.id).toBe(P2);
    expect((await obtenerPeriodoVigente(ESCUELA, undefined, new Date('2026-08-31T00:00:00Z')))?.id).toBe(P2);
    expect((await obtenerPeriodoVigente(ESCUELA, undefined, new Date('2026-09-01T00:00:00Z')))?.id).toBe(P3);
  });

  it('acepta la fecha del registro como texto ISO', async () => {
    expect((await obtenerPeriodoVigente(ESCUELA, undefined, '2026-06-15T00:00:00.000Z'))?.id).toBe(P2);
  });

  it('3) fecha del registro fuera de todo periodo → periodo vigente hoy', async () => {
    const periodo = await obtenerPeriodoVigente(ESCUELA, undefined, new Date('2025-12-15T00:00:00Z'));
    expect(periodo?.id).toBe(P3);
  });

  it('3) sin periodoId ni fecha → periodo vigente hoy (comportamiento anterior)', async () => {
    expect((await obtenerPeriodoVigente(ESCUELA))?.id).toBe(P3);
  });

  it('fecha inválida → se ignora y se usa hoy', async () => {
    expect((await obtenerPeriodoVigente(ESCUELA, undefined, 'no-es-fecha'))?.id).toBe(P3);
  });

  it('sin ningún periodo aplicable → null (no se evalúa)', async () => {
    jest.setSystemTime(new Date('2027-01-15T15:00:00Z'));
    expect(await obtenerPeriodoVigente(ESCUELA, '64c0000000000000000000ff', new Date('2025-12-15T00:00:00Z'))).toBeNull();
  });
});

describe('conservarIdsPeriodos', () => {
  const existentes = periodos.map((p) => ({ _id: p._id, numero: p.numero }));
  const entrante = (numero: number, extra: Record<string, unknown> = {}) => ({
    numero,
    nombre: `P${numero}`,
    fecha_inicio: '2026-02-01',
    fecha_fin: '2026-04-30',
    ...extra,
  });

  it('sin _id en lo que manda el cliente: conserva el _id del periodo con el mismo número', () => {
    const resultado = conservarIdsPeriodos(existentes, [entrante(1), entrante(2), entrante(3)]);
    expect(resultado.map((p) => String(p._id))).toEqual([P1, P2, P3]);
  });

  it('con _id existente: lo respeta aunque cambie el número', () => {
    const resultado = conservarIdsPeriodos(existentes, [entrante(5, { _id: P2 })]);
    expect(String(resultado[0]._id)).toBe(P2);
    expect(resultado[0].numero).toBe(5);
  });

  it('el _id explícito tiene prioridad sobre el emparejamiento por número', () => {
    // El primero tiene número 1 sin _id; el segundo pide explícitamente el _id del periodo 1
    const resultado = conservarIdsPeriodos(existentes, [entrante(1), entrante(4, { _id: P1 })]);
    expect(resultado[0]._id).toBeUndefined(); // P1 ya lo tomó el segundo
    expect(String(resultado[1]._id)).toBe(P1);
  });

  it('periodo nuevo o _id desconocido: sin _id (Mongoose genera uno)', () => {
    const resultado = conservarIdsPeriodos(existentes, [entrante(4), entrante(6, { _id: '64c0000000000000000000ff' })]);
    expect(resultado[0]._id).toBeUndefined();
    expect(resultado[1]._id).toBeUndefined();
  });

  it('un número repetido no reutiliza el mismo _id dos veces', () => {
    const resultado = conservarIdsPeriodos(existentes, [entrante(1), entrante(1)]);
    expect(String(resultado[0]._id)).toBe(P1);
    expect(resultado[1]._id).toBeUndefined();
  });

  it('solo copia los campos del esquema', () => {
    const [p] = conservarIdsPeriodos(existentes, [entrante(1, { estado: 'X', $where: 'y' })]);
    expect(Object.keys(p).sort()).toEqual(['_id', 'fecha_fin', 'fecha_inicio', 'nombre', 'numero']);
  });
});

describe('PUT /escuelas/:id/periodos (controlador)', () => {
  const llamar = async (body: unknown) => {
    const req = {
      params: { id: ESCUELA },
      body,
      user: { _id: 'u1', escuelaId: ESCUELA, tipo: 'ADMIN' },
    } as unknown as Request;
    const res = { json: jest.fn() } as unknown as Response;
    const next = jest.fn();
    await escuelaController.actualizarPeriodosAcademicos(req, res, next);
    return { res, next };
  };

  it('guarda los periodos con los _id existentes', async () => {
    mockEscuela.findByIdAndUpdate.mockResolvedValue({ _id: ESCUELA });
    await llamar({
      periodos_academicos: [
        { numero: 1, nombre: 'Primero', fecha_inicio: '2026-02-01', fecha_fin: '2026-04-30' },
        { numero: 2, nombre: 'Segundo', fecha_inicio: '2026-05-01', fecha_fin: '2026-08-31' },
      ],
    });
    const actualizacion = mockEscuela.findByIdAndUpdate.mock.calls[0][1];
    expect(actualizacion.periodos_academicos.map((p: any) => String(p._id))).toEqual([P1, P2]);
    expect(actualizacion.periodos_academicos[0].nombre).toBe('Primero');
  });

  it('escuela inexistente → 404 sin actualizar', async () => {
    mockEscuela.findById.mockImplementation(() => consulta(null));
    const { next } = await llamar({ periodos_academicos: [] });
    expect(next.mock.calls[0][0].statusCode).toBe(404);
    expect(mockEscuela.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe('actualizarPeriodosValidation: fecha_fin posterior a la fecha_inicio del mismo periodo', () => {
  const validar = async (periodosBody: unknown[]) => {
    const req = { body: { periodos_academicos: periodosBody } } as unknown as Request;
    for (const regla of actualizarPeriodosValidation) await regla.run(req);
    return validationResult(req).array().map((e: any) => `${e.path}: ${e.msg}`);
  };

  it('rechaza un periodo que termina antes de empezar (antes pasaba)', async () => {
    const errores = await validar([
      { numero: 1, nombre: 'P1', fecha_inicio: '2026-02-01', fecha_fin: '2026-04-30' },
      { numero: 2, nombre: 'P2', fecha_inicio: '2026-08-31', fecha_fin: '2026-05-01' },
    ]);
    expect(errores).toEqual([
      'periodos_academicos[1].fecha_fin: La fecha de fin debe ser posterior a la fecha de inicio',
    ]);
  });

  it('acepta periodos bien formados', async () => {
    const errores = await validar([
      { numero: 1, nombre: 'P1', fecha_inicio: '2026-02-01', fecha_fin: '2026-04-30' },
      { numero: 2, nombre: 'P2', fecha_inicio: '2026-05-01', fecha_fin: '2026-08-31' },
    ]);
    expect(errores).toEqual([]);
  });

  it('fecha_inicio inválida: solo reporta el error de fecha_inicio', async () => {
    const errores = await validar([{ numero: 1, nombre: 'P1', fecha_inicio: 'x', fecha_fin: '2026-04-30' }]);
    expect(errores).toEqual(['periodos_academicos[0].fecha_inicio: Fecha de inicio inválida']);
  });
});
