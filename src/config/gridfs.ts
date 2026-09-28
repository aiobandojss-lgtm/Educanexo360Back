// src/config/gridfs.ts

import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { sanitizeFilename } from '../utils/sanitizeFilename';
import { LIMITES_SUBIDA, bytesMaximos } from '../utils/erroresSubida';

// Clase singleton para manejar GridFS
class GridFSManager {
  private static instance: GridFSManager;
  private bucket: GridFSBucket | null = null;
  private upload: multer.Multer | null = null;

  private constructor() {}

  public static getInstance(): GridFSManager {
    if (!GridFSManager.instance) {
      GridFSManager.instance = new GridFSManager();
    }
    return GridFSManager.instance;
  }

  public async initializeStorage(mongoURI: string, dbName: string = 'educaNexo360') {
    try {
      // Crear storage para multer (que apunta al filesystem temporal)
      const storage = multer.diskStorage({
        destination: function (req, file, cb) {
          cb(null, path.join(__dirname, '../../uploads/temp'));
        },
        filename: function (req, file, cb) {
          crypto.randomBytes(16, (err, buf) => {
            if (err) return cb(err, '');
            const filename = buf.toString('hex') + path.extname(sanitizeFilename(file.originalname));
            cb(null, filename);
          });
        },
      });

      // Configurar multer
      this.upload = multer({
        // Nombres de archivo en UTF-8: multer 2 (busboy 1) los decodifica como latin1 por defecto ("año" → "aÃ±o")
        defParamCharset: 'utf8',
        storage,
        limits: {
          fileSize: bytesMaximos(LIMITES_SUBIDA.calendario), // 5 MB (5.C10: el mensaje de error cita el mismo valor)
        },
      });

      // Obtener la conexión subyacente de MongoDB
      const db = mongoose.connection.db;
      if (db) {
        this.bucket = new GridFSBucket(db, { bucketName: 'uploads' });
        console.log('GridFS bucket created successfully');
      }
    } catch (error) {
      console.error('Error initializing GridFS:', error);
    }
  }

  public getBucket(): GridFSBucket | null {
    return this.bucket;
  }

  public getUpload(): multer.Multer | null {
    return this.upload;
  }
}

export default GridFSManager.getInstance();
