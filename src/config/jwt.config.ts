import dotenv from 'dotenv';

dotenv.config();

interface JWTConfig {
  secret: string;
  expiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

const jwtSecret = process.env.JWT_SECRET;
const refreshSecret = process.env.REFRESH_TOKEN_SECRET;

if (!jwtSecret || !refreshSecret) {
  throw new Error(
    'FATAL: Las variables JWT_SECRET y REFRESH_TOKEN_SECRET son obligatorias. El servidor no puede arrancar sin ellas.',
  );
}

export const jwtConfig: JWTConfig = {
  secret: jwtSecret,
  expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  refreshSecret: refreshSecret,
  refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
} as const;

export const tokenTypes = {
  ACCESS: 'ACCESS',
  REFRESH: 'REFRESH',
} as const;
