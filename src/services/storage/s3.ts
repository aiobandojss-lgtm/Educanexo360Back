import crypto from 'crypto';
import { PassThrough, Readable } from 'stream';
import { ArchivoStorage, MetaArchivo, ResultadoGuardar } from './tipos';

/**
 * Almacén S3 compatible (Fase 5.1): Backblaze B2, Cloudflare R2 o AWS S3 cambiando solo variables.
 *   S3_ENDPOINT          p. ej. https://s3.us-west-004.backblazeb2.com | https://<cuenta>.r2.cloudflarestorage.com
 *                        (vacío en AWS S3)
 *   S3_REGION            p. ej. us-west-004 (B2), auto (R2), us-east-1 (AWS)
 *   S3_BUCKET            nombre del bucket (privado)
 *   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY   credenciales (SOLO por entorno; nunca en logs)
 *   S3_FORCE_PATH_STYLE  'true' para servidores locales de prueba; B2/R2/AWS funcionan sin él
 */
const requerida = (nombre: string): string => {
  const v = process.env[nombre];
  if (!v) throw new Error(`Almacenamiento S3: falta la variable ${nombre}`);
  return v;
};

/** Mensaje de error sin datos sensibles (el SDK no incluye el secreto, pero por si acaso se enmascara). */
const errorSeguro = (operacion: string, error: any): Error => {
  let texto = String(error?.message || error);
  for (const k of ['S3_SECRET_ACCESS_KEY', 'S3_ACCESS_KEY_ID']) {
    const v = process.env[k];
    if (v) texto = texto.split(v).join('***');
  }
  const e: any = new Error(`S3 ${operacion}: ${texto}`);
  e.name = error?.name || 'S3Error';
  e.codigoS3 = error?.name;
  e.status = error?.$metadata?.httpStatusCode;
  return e;
};

export const crearAlmacenS3 = (): ArchivoStorage => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
  const bucket = requerida('S3_BUCKET');
  const cliente = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: requerida('S3_ACCESS_KEY_ID'), secretAccessKey: requerida('S3_SECRET_ACCESS_KEY') },
    // B2 y R2 no soportan (o no del todo) los checksums CRC32 por defecto de los SDK recientes
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  return {
    nombre: 's3',
    async guardar(origen: Readable, clave: string, meta: MetaArchivo): Promise<ResultadoGuardar> {
      const hash = crypto.createHash('sha256');
      let tamaño = 0;
      const cuerpo = new PassThrough();
      origen.on('data', (trozo: Buffer) => {
        hash.update(trozo);
        tamaño += trozo.length;
      });
      origen.on('error', (e) => cuerpo.destroy(e));
      origen.pipe(cuerpo);
      try {
        await cliente.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: clave,
            Body: cuerpo,
            ContentLength: meta.tamaño,
            ContentType: meta.tipo,
            // Metadata S3: solo ASCII; el nombre original va codificado
            Metadata: { nombre: encodeURIComponent(meta.nombre), ...(meta.extra || {}) },
          }),
        );
      } catch (error) {
        throw errorSeguro('guardar', error);
      }
      return { clave, tamaño, sha256: hash.digest('hex') };
    },
    async leer(clave: string): Promise<Readable> {
      try {
        const r = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: clave }));
        return r.Body as Readable;
      } catch (error) {
        throw errorSeguro('leer', error);
      }
    },
    async eliminar(clave: string): Promise<void> {
      try {
        await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: clave }));
      } catch (error) {
        throw errorSeguro('eliminar', error);
      }
    },
    async existe(clave: string): Promise<boolean> {
      try {
        await cliente.send(new HeadObjectCommand({ Bucket: bucket, Key: clave }));
        return true;
      } catch (error: any) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return false;
        throw errorSeguro('existe', error);
      }
    },
  };
};
