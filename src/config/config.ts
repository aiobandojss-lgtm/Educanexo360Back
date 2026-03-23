// src/config/config.ts

import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

export default {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/educaNexo360',

  jwt: {
    secret: process.env.JWT_SECRET as string,
    accessExpirationMinutes: process.env.JWT_ACCESS_EXPIRATION_MINUTES || '1d',
    refreshExpirationDays: process.env.JWT_REFRESH_EXPIRATION_DAYS || '7d',
    resetPasswordExpirationMinutes: 10,
  },

  email: {
    host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    user: process.env.EMAIL_USER || 'usuario_ethereal',
    pass: process.env.EMAIL_PASS || 'password_ethereal',
    secure: process.env.EMAIL_SECURE === 'true',
    tlsRejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED !== 'false',
    senderName: process.env.EMAIL_SENDER_NAME || 'EducaNexo360',
    senderEmail: process.env.EMAIL_SENDER_EMAIL || 'no-reply@educanexo360.com',
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',

  uploadLimit: process.env.UPLOAD_LIMIT || '5mb',
};
