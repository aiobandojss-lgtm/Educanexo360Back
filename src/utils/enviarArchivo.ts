import { Readable } from 'stream';
import { Response, NextFunction } from 'express';
import ApiError from './ApiError';

/**
 * Envía un archivo por stream a la respuesta (Fase 5, auditoría 5.C1).
 *
 * - Si el cliente corta la descarga (móvil sin señal), se DESTRUYE el stream de origen: con S3, el Body de
 *   GetObject queda si no pausado reteniendo su socket; con ~50 así el pool del SDK se agota y toda operación S3
 *   (subidas, descargas, HEAD) queda en cola en el único proceso.
 * - Error antes de enviar cabeceras → 500 JSON como siempre; error a mitad del envío → se destruye la respuesta
 *   (el cliente ve la descarga cortada en vez de quedarse esperando).
 * No se usa stream.pipeline: destruiría la respuesta también ante un error ANTES del primer byte y el cliente
 * recibiría un corte en lugar del 500 JSON.
 */
export const enviarArchivo = (origen: Readable, res: Response, next: NextFunction, mensajeError = 'Error al descargar el archivo'): void => {
  let terminado = false;
  res.on('finish', () => {
    terminado = true;
  });
  res.on('close', () => {
    if (!terminado) origen.destroy();
  });
  origen.on('error', (error) => {
    console.error('Error en stream de descarga:', error);
    if (!res.headersSent) next(new ApiError(500, mensajeError));
    else res.destroy();
  });
  origen.pipe(res);
};
