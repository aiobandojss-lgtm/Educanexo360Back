// src/__tests__/asistencia-aviso-ausencias.test.ts
//
// Aviso push "Ausencia registrada" al acudiente.
// Antes solo se enviaba al EDITAR un registro, y las apps crean el registro de una sola vez: en el uso
// normal el acudiente nunca recibía el aviso. Ahora se envía al CREAR, y al EDITAR solo por las
// ausencias nuevas (sin repetir el aviso de quien ya estaba AUSENTE).
//
// Los modelos y la cola de push se simulan: no se necesita MongoDB ni Firebase.

jest.mock('../models/asistencia.model', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() },
}));
jest.mock('../models/curso.model', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock('../models/usuario.model', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));
jest.mock('../models/asignatura.model', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../models/alertaAsistencia.model', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../services/alertaAsistencia.service', () => ({
  procesarAlertasAsistenciaCurso: jest.fn(),
}));
jest.mock('../services/pushNotification.service', () => ({
  __esModule: true,
  default: { idsConDispositivo: jest.fn(), encolarPush: jest.fn() },
}));

import mongoose from 'mongoose';
import Asistencia from '../models/asistencia.model';
import Curso from '../models/curso.model';
import Usuario from '../models/usuario.model';
import pushNotificationService from '../services/pushNotification.service';
import { crearAsistencia, actualizarAsistencia } from '../controllers/asistencia.controller';

const ESCUELA = '507f1f77bcf86cd799439012';
const RECTOR = '507f1f77bcf86cd799439011';
const CURSO = '64b000000000000000000001';
const ASIGNATURA = '64b000000000000000000002';
const ANA = '64b0000000000000000000a1';
const LUIS = '64b0000000000000000000a2';
const ACUDIENTE_ANA = '64b0000000000000000000c1';
const ACUDIENTE_LUIS = '64b0000000000000000000c2';

const estudiantes = [
  { _id: ANA, nombre: 'Ana', apellidos: 'Gómez' },
  { _id: LUIS, nombre: 'Luis', apellidos: 'Pérez' },
];
const acudientes = [
  { _id: ACUDIENTE_ANA, info_academica: { estudiantes_asociados: [ANA] } },
  { _id: ACUDIENTE_LUIS, info_academica: { estudiantes_asociados: [LUIS] } },
];

const mockAsistencia = Asistencia as unknown as { findOne: jest.Mock; create: jest.Mock };
const mockCurso = Curso as unknown as { findOne: jest.Mock };
const mockUsuario = Usuario as unknown as { find: jest.Mock };
const mockPush = pushNotificationService as unknown as {
  idsConDispositivo: jest.Mock;
  encolarPush: jest.Mock;
};

// Cadena .select().lean() de Mongoose
const consulta = (resultado: unknown) => ({
  select: () => ({ lean: () => Promise.resolve(resultado) }),
});

const usuarioRector = {
  _id: RECTOR,
  escuelaId: ESCUELA,
  tipo: 'RECTOR',
  email: 'rector@test.com',
  nombre: 'Test',
  apellidos: 'Rector',
  estado: 'ACTIVO',
  permisos: [],
};

const respuesta = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// El aviso es fire-and-forget: dejar que terminen las promesas pendientes
const esperarAvisos = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

beforeEach(() => {
  jest.clearAllMocks();

  mockCurso.findOne.mockReturnValue(consulta({ estudiantes: [ANA, LUIS] }));

  // Usuario.find: estudiantes ausentes (select 'nombre apellidos') o acudientes (select info_academica)
  mockUsuario.find.mockImplementation((filtro: any) => ({
    select: (campos: string) => ({
      lean: () => {
        const ids: string[] = (filtro._id.$in || []).map(String);
        const fuente = campos.includes('nombre') ? estudiantes : acudientes;
        return Promise.resolve(fuente.filter((u) => ids.includes(u._id)));
      },
    }),
  }));

  // Acudientes con app instalada: los de los estudiantes pedidos
  mockPush.idsConDispositivo.mockImplementation(async (filtro: any) => {
    const ids: string[] = filtro['info_academica.estudiantes_asociados'].$in.map(String);
    return acudientes
      .filter((a) => a.info_academica.estudiantes_asociados.some((e) => ids.includes(e)))
      .map((a) => a._id);
  });
  mockPush.encolarPush.mockResolvedValue(1);

  // Nombre de la asignatura (el controlador lo pide con mongoose.model('Asignatura'))
  jest.spyOn(mongoose, 'model').mockImplementation(((nombre: string) => {
    if (nombre !== 'Asignatura') throw new Error(`Modelo inesperado en la prueba: ${nombre}`);
    return { findOne: () => consulta({ nombre: 'Matemáticas' }) };
  }) as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Aviso de ausencia al acudiente', () => {
  it('al CREAR el registro avisa al acudiente de cada estudiante ausente', async () => {
    mockAsistencia.findOne.mockResolvedValue(null);
    mockAsistencia.create.mockImplementation(async (datos: any) => ({ _id: 'nuevo', ...datos }));

    const req: any = {
      user: usuarioRector,
      body: {
        fecha: '2026-11-20',
        cursoId: CURSO,
        asignaturaId: ASIGNATURA,
        estudiantes: [
          { estudianteId: ANA, estado: 'AUSENTE' },
          { estudianteId: LUIS, estado: 'PRESENTE' },
        ],
      },
    };
    const res = respuesta();
    const next = jest.fn();

    await crearAsistencia(req, res, next);
    await esperarAvisos();

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockPush.encolarPush).toHaveBeenCalledTimes(1);
    expect(mockPush.encolarPush).toHaveBeenCalledWith({
      usuarioIds: [ACUDIENTE_ANA],
      contenido: {
        titulo: 'Ausencia registrada',
        mensaje: 'Se registró la ausencia de Ana Gómez en Matemáticas el 20/11/2026.',
        data: { tipo: 'ausencia', estudianteId: ANA },
      },
      escuelaId: ESCUELA,
    });
  });

  it('al CREAR sin ausentes no envía ningún aviso', async () => {
    mockAsistencia.findOne.mockResolvedValue(null);
    mockAsistencia.create.mockImplementation(async (datos: any) => ({ _id: 'nuevo', ...datos }));

    const req: any = {
      user: usuarioRector,
      body: {
        fecha: '2026-11-20',
        cursoId: CURSO,
        estudiantes: [
          { estudianteId: ANA, estado: 'PRESENTE' },
          { estudianteId: LUIS, estado: 'TARDANZA' },
        ],
      },
    };

    await crearAsistencia(req, respuesta(), jest.fn());
    await esperarAvisos();

    expect(mockPush.idsConDispositivo).not.toHaveBeenCalled();
    expect(mockPush.encolarPush).not.toHaveBeenCalled();
  });

  it('al EDITAR solo avisa de las ausencias nuevas, no de quien ya estaba ausente', async () => {
    const registro: any = {
      _id: 'registro',
      escuelaId: ESCUELA,
      cursoId: CURSO,
      docenteId: RECTOR,
      asignaturaId: ASIGNATURA,
      fecha: new Date('2026-11-20T00:00:00.000Z'),
      estudiantes: [
        { estudianteId: ANA, estado: 'AUSENTE' }, // ya avisado al crear
        { estudianteId: LUIS, estado: 'PRESENTE' },
      ],
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockAsistencia.findOne.mockResolvedValue(registro);

    const req: any = {
      user: usuarioRector,
      params: { id: 'registro' },
      body: {
        estudiantes: [
          { estudianteId: ANA, estado: 'AUSENTE' },
          { estudianteId: LUIS, estado: 'AUSENTE' }, // ausencia nueva
        ],
      },
    };
    const res = respuesta();
    const next = jest.fn();

    await actualizarAsistencia(req, res, next);
    await esperarAvisos();

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPush.encolarPush).toHaveBeenCalledTimes(1);
    expect(mockPush.encolarPush).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioIds: [ACUDIENTE_LUIS],
        contenido: expect.objectContaining({
          mensaje: 'Se registró la ausencia de Luis Pérez en Matemáticas el 20/11/2026.',
          data: { tipo: 'ausencia', estudianteId: LUIS },
        }),
      }),
    );
  });

  it('al EDITAR sin ausencias nuevas no repite el aviso', async () => {
    const registro: any = {
      _id: 'registro',
      escuelaId: ESCUELA,
      cursoId: CURSO,
      docenteId: RECTOR,
      fecha: new Date('2026-11-20T00:00:00.000Z'),
      estudiantes: [
        { estudianteId: ANA, estado: 'AUSENTE' },
        { estudianteId: LUIS, estado: 'PRESENTE' },
      ],
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockAsistencia.findOne.mockResolvedValue(registro);

    const req: any = {
      user: usuarioRector,
      params: { id: 'registro' },
      body: {
        observacionesGenerales: 'Corrección de observaciones',
        estudiantes: [
          { estudianteId: ANA, estado: 'AUSENTE' },
          { estudianteId: LUIS, estado: 'PRESENTE' },
        ],
      },
    };

    await actualizarAsistencia(req, respuesta(), jest.fn());
    await esperarAvisos();

    expect(mockPush.idsConDispositivo).not.toHaveBeenCalled();
    expect(mockPush.encolarPush).not.toHaveBeenCalled();
  });

  it('sin asignatura el aviso sale con la fecha y sin nombre de materia', async () => {
    mockAsistencia.findOne.mockResolvedValue(null);
    mockAsistencia.create.mockImplementation(async (datos: any) => ({ _id: 'nuevo', ...datos }));

    const req: any = {
      user: usuarioRector,
      body: {
        fecha: '2026-11-20',
        cursoId: CURSO,
        estudiantes: [{ estudianteId: LUIS, estado: 'AUSENTE' }],
      },
    };

    await crearAsistencia(req, respuesta(), jest.fn());
    await esperarAvisos();

    expect(mockPush.encolarPush).toHaveBeenCalledWith(
      expect.objectContaining({
        contenido: expect.objectContaining({
          mensaje: 'Se registró la ausencia de Luis Pérez el 20/11/2026.',
        }),
      }),
    );
  });
});
