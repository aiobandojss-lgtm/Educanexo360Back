// src/__tests__/k6b-escuela-revisores-sin-correo.test.ts
//
// K6 (b): los usuarios de la escuela de los revisores de Google Play (_id a0a0…a0) usan el dominio REAL
// educanexo360.creativebycode.com, así que hasta ahora sí les salían correos. Se bloquea el correo POR ESCUELA
// (no por dominio) en todos los caminos:
//  - construirTrabajosCorreo / encolarCorreo (alertas, mensajes, notificaciones, registro): no se crea el trabajo;
//  - handler 'email' de la cola: defensa para trabajos ya encolados o llamadores que no pasen por ahí;
//  - correos de cuenta (reset, bienvenida, definir): se encolan, pero el worker los omite sin enviar ni generar
//    enlace (la app responde igual que en cualquier colegio);
//  - resumen diario.
// El push y la campanita siguen funcionando en esa escuela: el revisor los prueba.
//
// Modelos, proveedor de correo, cupo y FCM se simulan: no se necesita MongoDB ni red.

const handlers = new Map<string, (trabajo: any, ctx: any) => Promise<void>>();
jest.mock('../queue/outbox', () => ({
  registrarHandler: jest.fn((tipo: string, fn: any) => handlers.set(tipo, fn)),
  registrarTareaPeriodica: jest.fn(),
  registrarObservadorFallido: jest.fn(),
  encolar: jest.fn(async (t: unknown[]) => (Array.isArray(t) ? t.length : 1)),
  ReprogramarTrabajo: class extends Error {},
  FalloDefinitivo: class extends Error {},
}));
jest.mock('../queue/monitorEnvios', () => ({
  registrarEnvioProveedor: jest.fn(),
  registrarFallido: jest.fn(),
  revisarCierre: jest.fn(),
}));
const mockSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/email/proveedores', () => ({
  obtenerProveedor: () => ({ send: mockSend }),
  registrarObservadorEnvios: jest.fn(),
}));
jest.mock('../services/email/cupo', () => ({
  reservarCupo: jest.fn().mockResolvedValue('2026-11-22'),
  liberarCupo: jest.fn(),
  cupoDeHoy: jest.fn(),
}));
jest.mock('../services/email/plantillas', () => ({
  renderizarCorreo: jest.fn(() => ({ subject: 'Asunto', html: '<p>x</p>' })),
}));
jest.mock('../services/pushNotification.service', () => ({
  __esModule: true,
  MAX_REINTENTOS_TOKENS: 3,
  default: {
    disponible: true,
    obtenerTokens: jest.fn().mockResolvedValue(['token-revisor']),
    enviarMulticast: jest.fn().mockResolvedValue({ transitorios: [] }),
  },
}));
jest.mock('../services/mensaje.service', () => ({ __esModule: true, default: {} }));
jest.mock('../models/mensaje.model', () => ({ __esModule: true, default: { find: jest.fn(), exists: jest.fn() } }));
jest.mock('../models/notificacion.model', () => ({
  __esModule: true,
  default: { aggregate: jest.fn(), updateMany: jest.fn() },
}));
jest.mock('../models/usuario.model', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findById: jest.fn(), find: jest.fn(), updateOne: jest.fn() },
}));
jest.mock('../config/config', () => ({ __esModule: true, default: { frontendUrl: 'https://front.test' } }));

import mongoose from 'mongoose';
import { construirTrabajosCorreo } from '../services/email.service';
import { encolar } from '../queue/outbox';
import { procesarCorreoCuenta } from '../services/email/cuentas';
import { procesarResumenDiario } from '../services/resumenDiario.service';
import Usuario from '../models/usuario.model';
import Notificacion from '../models/notificacion.model';
import Mensaje from '../models/mensaje.model';
import pushNotificationService from '../services/pushNotification.service';
import { ID_ESCUELA_REVISORES } from '../constants/escuelasDemo';
import '../queue/handlers'; // registra los handlers en el mapa simulado

const OTRA_ESCUELA = '507f1f77bcf86cd799439012';
const REVISOR_ID = '64f000000000000000000001';
const DOCENTE_ID = '64f000000000000000000002';

const mockUsuario = Usuario as unknown as Record<'findOne' | 'findById' | 'find' | 'updateOne', jest.Mock>;
const consulta = (r: unknown) => ({ select: () => ({ lean: () => Promise.resolve(r), sort: () => ({ lean: () => Promise.resolve(r) }) }) });
const ctx = () => ({
  enviados: new Set<string>(),
  marcarEnviados: jest.fn().mockResolvedValue(undefined),
  comprobarCancelacion: jest.fn(),
});
const revisor = { _id: REVISOR_ID, email: 'demo.admin@educanexo360.creativebycode.com', nombre: 'Demo', escuelaId: ID_ESCUELA_REVISORES };
const docente = { _id: DOCENTE_ID, email: 'docente@colegio.edu.co', nombre: 'Ana', escuelaId: OTRA_ESCUELA };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('construirTrabajosCorreo (encolar)', () => {
  const opciones = (escuelaId?: string) => ({
    destinatarios: [{ email: revisor.email, nombre: 'Demo' }],
    plantilla: 'texto',
    datos: {},
    escuelaId,
  });

  it('escuela de revisores: no crea trabajos de correo', () => {
    expect(construirTrabajosCorreo(opciones(ID_ESCUELA_REVISORES))).toEqual([]);
  });

  it('el bloqueo es por escuela, no por dominio: el mismo dominio en otra escuela sí recibe correo', () => {
    expect(construirTrabajosCorreo(opciones(OTRA_ESCUELA))).toHaveLength(1);
  });
});

describe("handler 'email' (cola)", () => {
  const trabajo = (escuelaId?: unknown) => ({
    _id: 't1',
    tipo: 'email',
    prioridad: 'normal',
    escuelaId,
    payload: { plantilla: 'texto', datos: {}, destinatarios: [{ email: revisor.email }] },
  });

  it('trabajo de la escuela de revisores (p. ej. encolado antes del despliegue): termina sin enviar', async () => {
    await handlers.get('email')!(trabajo(new mongoose.Types.ObjectId(ID_ESCUELA_REVISORES)), ctx());
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('trabajo de otra escuela: envía', async () => {
    await handlers.get('email')!(trabajo(new mongoose.Types.ObjectId(OTRA_ESCUELA)), ctx());
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});

describe("handler 'push': sigue funcionando en la escuela de revisores", () => {
  it('envía el push a los dispositivos del revisor', async () => {
    await handlers.get('push')!(
      {
        _id: 'p1',
        tipo: 'push',
        prioridad: 'normal',
        escuelaId: new mongoose.Types.ObjectId(ID_ESCUELA_REVISORES),
        payload: { usuarioIds: [REVISOR_ID], titulo: 'Nuevo mensaje', mensaje: 'Hola' },
      },
      ctx(),
    );
    expect((pushNotificationService as any).enviarMulticast).toHaveBeenCalledWith(['token-revisor'], expect.anything());
  });
});

describe('correos de cuenta (reset, bienvenida, definir)', () => {
  const caducaEn = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

  it('reset con escuelaId de revisores en el trabajo: no envía ni genera enlace', async () => {
    await procesarCorreoCuenta({ tipo: 'reset', usuarioId: REVISOR_ID, escuelaId: ID_ESCUELA_REVISORES, caducaEn: caducaEn() });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockUsuario.updateOne).not.toHaveBeenCalled();
  });

  it('reset SIN escuelaId en el trabajo, pero el usuario es de la escuela de revisores: no envía', async () => {
    mockUsuario.findOne.mockReturnValue(consulta(revisor));
    await procesarCorreoCuenta({ tipo: 'reset', usuarioId: REVISOR_ID, caducaEn: caducaEn() });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockUsuario.updateOne).not.toHaveBeenCalled();
  });

  it('bienvenida de un acudiente de la escuela de revisores: no envía', async () => {
    mockUsuario.findById.mockReturnValue(consulta(revisor));
    await procesarCorreoCuenta({ tipo: 'bienvenida', acudienteId: REVISOR_ID, estudiantes: [], caducaEn: caducaEn() });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('definir para un usuario de la escuela de revisores: no envía', async () => {
    mockUsuario.findOne.mockReturnValue(consulta(revisor));
    await procesarCorreoCuenta({ tipo: 'definir', usuarioId: REVISOR_ID, enviarA: [REVISOR_ID], caducaEn: caducaEn() });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockUsuario.find).not.toHaveBeenCalled();
  });

  it('reset de un usuario de otra escuela: envía y guarda el enlace (sin cambios)', async () => {
    mockUsuario.findOne.mockReturnValue(consulta(docente));
    await procesarCorreoCuenta({ tipo: 'reset', usuarioId: DOCENTE_ID, escuelaId: OTRA_ESCUELA, caducaEn: caducaEn() });
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: docente.email }));
    expect(mockUsuario.updateOne).toHaveBeenCalled();
  });
});

describe('resumen diario', () => {
  it('no incluye a los usuarios de la escuela de revisores', async () => {
    const mensajeId = new mongoose.Types.ObjectId();
    (Notificacion as any).aggregate.mockResolvedValue([
      { _id: REVISOR_ID, notifIds: ['n1'], items: [{ mensajeId, titulo: 'M', remitente: 'R', fecha: new Date() }] },
      { _id: DOCENTE_ID, notifIds: ['n2'], items: [{ mensajeId, titulo: 'M', remitente: 'R', fecha: new Date() }] },
    ]);
    mockUsuario.find.mockReturnValue(consulta([revisor, docente]));
    (Mensaje as any).find.mockReturnValue(consulta([{ _id: mensajeId, asunto: 'Asunto', lecturas: [] }]));

    const correos = await procesarResumenDiario('2026-11-22', new Date('2026-11-22T12:00:00Z'));

    expect(correos).toBe(1);
    const trabajos = (encolar as jest.Mock).mock.calls[0][0];
    const destinatarios = trabajos.flatMap((t: any) => t.payload.destinatarios.map((d: any) => d.email));
    expect(destinatarios).toEqual([docente.email]);
  });
});
