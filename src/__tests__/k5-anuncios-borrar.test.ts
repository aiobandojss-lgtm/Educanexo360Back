// src/__tests__/k5-anuncios-borrar.test.ts
//
// K5 (aprobado por Aymer el 2-oct): DELETE /anuncios/:id y DELETE /anuncios/:id/adjuntos/:archivoId.
// ADMIN, RECTOR y COORDINADOR borran cualquier anuncio de su colegio; DOCENTE y ADMINISTRATIVO solo los suyos.
// Antes solo el creador o ADMIN: un rector no podía retirar el anuncio de un docente.
// Editar, publicar y agregar adjuntos NO cambian (creador o ADMIN).
//
// Los modelos y el almacenamiento se simulan: no se necesita MongoDB ni S3.

jest.mock('../models/anuncio.model', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock('../models/usuario.model', () => ({ __esModule: true, default: {} }));
jest.mock('../utils/referenciasArchivos', () => ({ eliminarSiNoReferenciados: jest.fn() }));
jest.mock('../services/storage', () => ({ abrirArchivo: jest.fn(), eliminarArchivo: jest.fn() }));
jest.mock('../utils/adjuntos', () => ({ subirAdjuntos: jest.fn(), eliminarAdjuntos: jest.fn() }));
jest.mock('../services/pushNotification.service', () => ({ __esModule: true, default: {} }));

import { Request, Response } from 'express';
import Anuncio from '../models/anuncio.model';
import { eliminarSiNoReferenciados } from '../utils/referenciasArchivos';
import { eliminarArchivo } from '../services/storage';
import anuncioController, { puedeBorrarAnuncio } from '../controllers/anuncio.controller';

const ESCUELA = '507f1f77bcf86cd799439012';
const AUTOR = '64d000000000000000000001';
const OTRO = '64d000000000000000000002';
const ARCHIVO = '64d0000000000000000000f1';

const mockAnuncio = Anuncio as unknown as { findOne: jest.Mock };

// Anuncio simulado (documento de Mongoose) creado por AUTOR, con un adjunto
const anuncioDe = (creador: string | null) => {
  const doc: any = {
    _id: '64d0000000000000000000a1',
    creador,
    archivosAdjuntos: [{ fileId: { toString: () => ARCHIVO }, nombre: 'circular.pdf' }],
    deleteOne: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  };
  return doc;
};

const usuario = (tipo: string, _id = OTRO) => ({ _id, escuelaId: ESCUELA, tipo });

const llamar = async (accion: 'eliminar' | 'eliminarAdjunto', user: unknown) => {
  const req = { params: { id: '64d0000000000000000000a1', archivoId: ARCHIVO }, user } as unknown as Request;
  const res = { json: jest.fn() } as unknown as Response;
  const next = jest.fn();
  await (anuncioController as any)[accion](req, res, next);
  return { res: res as unknown as { json: jest.Mock }, next };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('puedeBorrarAnuncio', () => {
  const anuncio = { creador: AUTOR };

  it.each(['ADMIN', 'RECTOR', 'COORDINADOR'])('%s borra un anuncio ajeno', (tipo) => {
    expect(puedeBorrarAnuncio(usuario(tipo), anuncio)).toBe(true);
  });

  it.each(['DOCENTE', 'ADMINISTRATIVO'])('%s NO borra un anuncio ajeno', (tipo) => {
    expect(puedeBorrarAnuncio(usuario(tipo), anuncio)).toBe(false);
  });

  it.each(['DOCENTE', 'ADMINISTRATIVO'])('%s borra los suyos', (tipo) => {
    expect(puedeBorrarAnuncio(usuario(tipo, AUTOR), anuncio)).toBe(true);
  });

  it('compara el creador como ObjectId o como texto', () => {
    const creadorObjectId = { toString: () => AUTOR };
    expect(puedeBorrarAnuncio(usuario('DOCENTE', AUTOR), { creador: creadorObjectId })).toBe(true);
  });

  it('anuncio sin creador (usuario borrado): solo los roles que borran cualquiera, sin lanzar', () => {
    expect(puedeBorrarAnuncio(usuario('DOCENTE'), { creador: null })).toBe(false);
    expect(puedeBorrarAnuncio(usuario('RECTOR'), { creador: null })).toBe(true);
  });
});

describe('DELETE /anuncios/:id', () => {
  it('RECTOR borra el anuncio de un docente y sus archivos', async () => {
    const anuncio = anuncioDe(AUTOR);
    mockAnuncio.findOne.mockResolvedValue(anuncio);
    const { res, next } = await llamar('eliminar', usuario('RECTOR'));
    expect(next).not.toHaveBeenCalled();
    expect(anuncio.deleteOne).toHaveBeenCalled();
    expect(eliminarSiNoReferenciados).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('la consulta siempre va filtrada por el colegio del usuario', async () => {
    mockAnuncio.findOne.mockResolvedValue(null);
    const { next } = await llamar('eliminar', usuario('COORDINADOR'));
    expect(mockAnuncio.findOne).toHaveBeenCalledWith(expect.objectContaining({ escuelaId: ESCUELA }));
    expect(next.mock.calls[0][0].statusCode).toBe(404); // anuncio de otro colegio: no se encuentra
  });

  it('ADMINISTRATIVO no borra un anuncio ajeno → 403 sin borrar', async () => {
    const anuncio = anuncioDe(AUTOR);
    mockAnuncio.findOne.mockResolvedValue(anuncio);
    const { next } = await llamar('eliminar', usuario('ADMINISTRATIVO'));
    expect(next.mock.calls[0][0].statusCode).toBe(403);
    expect(anuncio.deleteOne).not.toHaveBeenCalled();
  });

  it('DOCENTE borra el suyo', async () => {
    const anuncio = anuncioDe(AUTOR);
    mockAnuncio.findOne.mockResolvedValue(anuncio);
    const { next } = await llamar('eliminar', usuario('DOCENTE', AUTOR));
    expect(next).not.toHaveBeenCalled();
    expect(anuncio.deleteOne).toHaveBeenCalled();
  });
});

describe('DELETE /anuncios/:id/adjuntos/:archivoId', () => {
  it('COORDINADOR quita el adjunto de un anuncio ajeno', async () => {
    const anuncio = anuncioDe(AUTOR);
    mockAnuncio.findOne.mockResolvedValue(anuncio);
    const { next } = await llamar('eliminarAdjunto', usuario('COORDINADOR'));
    expect(next).not.toHaveBeenCalled();
    expect(anuncio.archivosAdjuntos).toHaveLength(0);
    expect(anuncio.save).toHaveBeenCalled();
    expect(eliminarArchivo).toHaveBeenCalled();
  });

  it('DOCENTE no quita el adjunto de un anuncio ajeno → 403', async () => {
    const anuncio = anuncioDe(AUTOR);
    mockAnuncio.findOne.mockResolvedValue(anuncio);
    const { next } = await llamar('eliminarAdjunto', usuario('DOCENTE'));
    expect(next.mock.calls[0][0].statusCode).toBe(403);
    expect(anuncio.archivosAdjuntos).toHaveLength(1);
    expect(eliminarArchivo).not.toHaveBeenCalled();
  });
});

describe('sin cambios: editar sigue siendo solo del creador o ADMIN', () => {
  it('RECTOR no puede editar un anuncio ajeno', async () => {
    mockAnuncio.findOne.mockResolvedValue(anuncioDe(AUTOR));
    const req = { params: { id: '64d0000000000000000000a1' }, body: { titulo: 'Nuevo' }, user: usuario('RECTOR') } as unknown as Request;
    const next = jest.fn();
    await anuncioController.actualizar(req as any, { json: jest.fn() } as unknown as Response, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });
});
