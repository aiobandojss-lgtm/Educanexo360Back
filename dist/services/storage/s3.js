"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearAlmacenS3 = void 0;
const crypto_1 = __importDefault(require("crypto"));
const stream_1 = require("stream");
const requerida = (nombre) => {
    const v = process.env[nombre];
    if (!v)
        throw new Error(`Almacenamiento S3: falta la variable ${nombre}`);
    return v;
};
const errorSeguro = (operacion, error) => {
    let texto = String(error?.message || error);
    for (const k of ['S3_SECRET_ACCESS_KEY', 'S3_ACCESS_KEY_ID']) {
        const v = process.env[k];
        if (v)
            texto = texto.split(v).join('***');
    }
    const e = new Error(`S3 ${operacion}: ${texto}`);
    e.name = error?.name || 'S3Error';
    e.codigoS3 = error?.name;
    e.status = error?.$metadata?.httpStatusCode;
    return e;
};
const crearAlmacenS3 = () => {
    const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
    const bucket = requerida('S3_BUCKET');
    const cliente = new S3Client({
        region: process.env.S3_REGION || 'us-east-1',
        ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        credentials: { accessKeyId: requerida('S3_ACCESS_KEY_ID'), secretAccessKey: requerida('S3_SECRET_ACCESS_KEY') },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return {
        nombre: 's3',
        async guardar(origen, clave, meta) {
            const hash = crypto_1.default.createHash('sha256');
            let tamaño = 0;
            const cuerpo = new stream_1.PassThrough();
            origen.on('data', (trozo) => {
                hash.update(trozo);
                tamaño += trozo.length;
            });
            origen.on('error', (e) => cuerpo.destroy(e));
            origen.pipe(cuerpo);
            try {
                await cliente.send(new PutObjectCommand({
                    Bucket: bucket,
                    Key: clave,
                    Body: cuerpo,
                    ContentLength: meta.tamaño,
                    ContentType: meta.tipo,
                    Metadata: { nombre: encodeURIComponent(meta.nombre), ...(meta.extra || {}) },
                }));
            }
            catch (error) {
                throw errorSeguro('guardar', error);
            }
            return { clave, tamaño, sha256: hash.digest('hex') };
        },
        async leer(clave) {
            try {
                const r = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: clave }));
                return r.Body;
            }
            catch (error) {
                throw errorSeguro('leer', error);
            }
        },
        async eliminar(clave) {
            try {
                await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: clave }));
            }
            catch (error) {
                throw errorSeguro('eliminar', error);
            }
        },
        async existe(clave) {
            try {
                await cliente.send(new HeadObjectCommand({ Bucket: bucket, Key: clave }));
                return true;
            }
            catch (error) {
                if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound')
                    return false;
                throw errorSeguro('existe', error);
            }
        },
    };
};
exports.crearAlmacenS3 = crearAlmacenS3;
//# sourceMappingURL=s3.js.map