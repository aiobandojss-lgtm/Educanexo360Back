// src/__tests__/k6a-escuelas-demo-ocultas.test.ts
//
// K6 (a): las dos escuelas demo (DEMO-EDUCANEXO, de pruebas, y la de los revisores de Google Play, _id a0a0…)
// no cuentan en los listados y tableros globales de SUPER_ADMIN, salvo ?incluirDemo=true:
//  - GET /escuelas (la web calcula "Total Escuelas" y "Activas" con esta lista);
//  - GET /superadmin/escuelas;
//  - GET /system/outbox sin escuelaId (vista global de la cola).
// Los roles de un colegio siguen recibiendo solo el suyo. /system/status y /system/initialize NO cambian.
//
// Los modelos se simulan: no se necesita MongoDB.

jest.mock('../models/escuela.model', () => ({
  __esModule: true,
  default: { find: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../models/outbox.model', () => ({
  __esModule: true,
  default: { aggregate: jest.fn(), findOne: jest.fn(), find: jest.fn() },
}));
jest.mock('../queue/outbox', () => ({
  estadoWorker: jest.fn(() => ({})),
  configuracionWorker: jest.fn(() => ({ maxIntentos: 5, maxIntentosCorreo: 8 })),
  TIPOS_CORREO: ['email', 'correo-cuenta'],
}));
jest.mock('../queue/monitorEnvios', () => ({ estadoMonitor: jest.fn(() => ({})) }));
jest.mock('../services/email/proveedores', () => ({ estadoCortocircuito: jest.fn(() => ({})) }));

import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import Escuela from '../models/escuela.model';
import Outbox from '../models/outbox.model';
import escuelaController from '../controllers/escuela.controller';
import { obtenerEstadoOutbox } from '../controllers/outbox.controller';
import { validacionIncluirDemo } from '../validations/escuela.validation';
import {
  CODIGO_ESCUELA_DEMO,
  ID_ESCUELA_REVISORES,
  esEscuelaSinCorreo,
  filtroEscuelasSinDemo,
  incluirDemo,
} from '../constants/escuelasDemo';

const ESCUELA = '507f1f77bcf86cd799439012';
const ID_DEMO_EDUCANEXO = '64e000000000000000000001';

const mockEscuela = Escuela as unknown as { find: jest.Mock; findOne: jest.Mock };
const mockOutbox = Outbox as unknown as { aggregate: jest.Mock; findOne: jest.Mock; find: jest.Mock };

const superAdmin = { _id: 'sa', tipo: 'SUPER_ADMIN' };
const admin = { _id: 'ad', tipo: 'ADMIN', escuelaId: ESCUELA };

beforeEach(() => {
  jest.clearAllMocks();
  mockEscuela.find.mockResolvedValue([]);
  mockEscuela.findOne.mockImplementation(() => ({
    select: () => ({ lean: () => Promise.resolve({ _id: new mongoose.Types.ObjectId(ID_DEMO_EDUCANEXO) }) }),
  }));
  const cadena = (r: unknown) => ({ sort: () => ({ select: () => ({ lean: () => Promise.resolve(r) }), limit: () => ({ select: () => ({ lean: () => Promise.resolve(r) }) }) }) });
  mockOutbox.aggregate.mockResolvedValue([]);
  mockOutbox.findOne.mockImplementation(() => cadena(null));
  mockOutbox.find.mockImplementation(() => cadena([]));
});

describe('constantes de escuelas demo', () => {
  it('filtroEscuelasSinDemo deja fuera las dos escuelas demo', () => {
    expect(filtroEscuelasSinDemo()).toEqual({
      $nor: [{ _id: new mongoose.Types.ObjectId(ID_ESCUELA_REVISORES) }, { codigo: CODIGO_ESCUELA_DEMO }],
    });
  });

  it('incluirDemo solo con el texto exacto "true"', () => {
    expect(incluirDemo({ incluirDemo: 'true' })).toBe(true);
    ['false', '1', 'TRUE', '', undefined, ['true']].forEach((v) => expect(incluirDemo({ incluirDemo: v })).toBe(false));
    expect(incluirDemo(undefined)).toBe(false);
  });

  it('esEscuelaSinCorreo: solo la escuela de revisores (DEMO-EDUCANEXO ya queda fuera por el dominio .invalid)', () => {
    expect(esEscuelaSinCorreo(ID_ESCUELA_REVISORES)).toBe(true);
    expect(esEscuelaSinCorreo(new mongoose.Types.ObjectId(ID_ESCUELA_REVISORES))).toBe(true);
    expect(esEscuelaSinCorreo(ESCUELA)).toBe(false);
    expect(esEscuelaSinCorreo(undefined)).toBe(false);
    expect(esEscuelaSinCorreo(null)).toBe(false);
  });
});

describe('GET /escuelas', () => {
  const llamar = async (user: unknown, query: Record<string, unknown> = {}) => {
    const req = { user, query } as unknown as Request;
    const res = { json: jest.fn() } as unknown as Response;
    await escuelaController.obtener(req, res, jest.fn());
  };

  it('SUPER_ADMIN: sin las escuelas demo por defecto', async () => {
    await llamar(superAdmin);
    expect(mockEscuela.find).toHaveBeenCalledWith(filtroEscuelasSinDemo());
  });

  it('SUPER_ADMIN con ?incluirDemo=true: todas', async () => {
    await llamar(superAdmin, { incluirDemo: 'true' });
    expect(mockEscuela.find).toHaveBeenCalledWith({});
  });

  it('ADMIN: solo su escuela (incluirDemo no aplica)', async () => {
    await llamar(admin, { incluirDemo: 'true' });
    expect(mockEscuela.find).toHaveBeenCalledWith({ _id: ESCUELA });
  });

  it('validación: incluirDemo con un valor distinto de true/false → error', async () => {
    const req = { query: { incluirDemo: 'si' } } as unknown as Request;
    for (const regla of validacionIncluirDemo) await regla.run(req);
    expect(validationResult(req).isEmpty()).toBe(false);
  });
});

describe('GET /system/outbox', () => {
  const llamar = async (user: unknown, query: Record<string, unknown> = {}) => {
    const req = { user, query } as unknown as Request;
    const res = { json: jest.fn() } as unknown as Response;
    const next = jest.fn();
    await obtenerEstadoOutbox(req as any, res, next);
    expect(next).not.toHaveBeenCalled();
    return mockOutbox.aggregate.mock.calls[0][0][0].$match; // filtro del conteo por estado
  };

  it('SUPER_ADMIN vista global: excluye los trabajos de las dos escuelas demo', async () => {
    const filtro = await llamar(superAdmin);
    expect(filtro.escuelaId.$nin.map(String)).toEqual([ID_ESCUELA_REVISORES, ID_DEMO_EDUCANEXO]);
    // el mismo filtro se aplica a los demás conteos y listados
    expect(mockOutbox.findOne.mock.calls[0][0].escuelaId).toEqual(filtro.escuelaId);
  });

  it('SUPER_ADMIN global sin colegio DEMO-EDUCANEXO creado: excluye solo la de revisores', async () => {
    mockEscuela.findOne.mockImplementation(() => ({ select: () => ({ lean: () => Promise.resolve(null) }) }));
    const filtro = await llamar(superAdmin);
    expect(filtro.escuelaId.$nin.map(String)).toEqual([ID_ESCUELA_REVISORES]);
  });

  it('SUPER_ADMIN con ?incluirDemo=true: toda la cola', async () => {
    expect(await llamar(superAdmin, { incluirDemo: 'true' })).toEqual({});
  });

  it('SUPER_ADMIN con ?escuelaId explícito (aunque sea demo): esa escuela', async () => {
    const filtro = await llamar(superAdmin, { escuelaId: ID_ESCUELA_REVISORES });
    expect(String(filtro.escuelaId)).toBe(ID_ESCUELA_REVISORES);
  });

  it('ADMIN: solo su colegio (sin cambios)', async () => {
    const filtro = await llamar(admin);
    expect(String(filtro.escuelaId)).toBe(ESCUELA);
    expect(mockEscuela.findOne).not.toHaveBeenCalled();
  });
});
