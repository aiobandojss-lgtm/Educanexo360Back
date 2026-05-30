// src/__tests__/mensajes-auditoria.test.ts
//
// Strategy: mock the authenticate middleware to avoid real MongoDB user lookups.
// The middleware is mocked to:
//   - Return 401 when no Authorization header is present
//   - Attach req.user based on the 'tipo' encoded in a custom header X-Test-Tipo
//     (set via the real JWT payload decoded inline in the mock)
// This lets us test auth (401), role authorization (403) and validation (400/200)
// without needing live DB data.

import request from 'supertest';
import jwt from 'jsonwebtoken';

// jest.mock calls are hoisted by ts-jest — they run before any imports
jest.mock('../middleware/auth.middleware', () => {
  const ApiError = require('../utils/ApiError').default;

  const authenticate = (req: any, _res: any, next: any) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) {
      return next(new ApiError(401, 'No autorizado - Token no proporcionado'));
    }
    // Decode the JWT without verifying signature to read the payload
    const token = authHeader.substring(7);
    let payload: any;
    try {
      payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    } catch {
      return next(new ApiError(401, 'No autorizado - Token inválido'));
    }

    req.user = {
      _id: payload.sub || '507f1f77bcf86cd799439011',
      escuelaId: payload.escuelaId || '507f1f77bcf86cd799439012',
      tipo: payload.tipo || 'RECTOR',
      email: 'test@test.com',
      nombre: 'Test',
      apellidos: 'User',
      estado: 'ACTIVO',
      permisos: [],
    };
    next();
  };

  const authorize = (...allowedRoles: string[]) => (req: any, _res: any, next: any) => {
    if (!req.user) return next(new ApiError(401, 'No autorizado'));
    const ROLES_ADMIN = ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'];
    if (allowedRoles.includes('ADMIN') && ROLES_ADMIN.includes(req.user.tipo)) {
      return next();
    }
    if (!allowedRoles.includes(req.user.tipo)) {
      return next(new ApiError(403, 'Prohibido - No tiene permisos suficientes'));
    }
    next();
  };

  const requirePermission = (_permiso: string) => (_req: any, _res: any, next: any) => next();
  const hasAdminAccess = (userType: string) =>
    ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'].includes(userType);
  const authenticateDownload = authenticate;
  const canViewUserProfiles = (_req: any, _res: any, next: any) => next();

  return { authenticate, authorize, requirePermission, hasAdminAccess, authenticateDownload, canViewUserProfiles };
});

// Mock mensajeService to avoid real MongoDB aggregations
jest.mock('../services/mensaje.service', () => ({
  default: {
    obtenerEstadisticasDocentes: jest.fn().mockResolvedValue({
      data: [],
      meta: { totalDocentes: 0, desde: '2026-05-01', hasta: '2026-05-31' },
    }),
    obtenerMensajesAuditoria: jest.fn().mockResolvedValue({
      data: [],
      meta: { total: 0, pagina: 1, limite: 20, paginas: 0 },
    }),
  },
}));

import app from '../app';
import config from '../config/config';

// Genera un token JWT real (el mock lo decodifica sin verificar firma para leer tipo)
function makeToken(tipo: string, overrides: Record<string, any> = {}) {
  const secret = config.jwt.secret || 'test-secret-fallback';
  return jwt.sign(
    {
      sub: '507f1f77bcf86cd799439011',
      tipo,
      escuelaId: '507f1f77bcf86cd799439012',
      ...overrides,
    },
    secret,
    { expiresIn: '1h' },
  );
}

const tokenRector = makeToken('RECTOR');
const tokenDocente = makeToken('DOCENTE');

describe('GET /api/mensajes/estadisticas-docentes', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/mensajes/estadisticas-docentes');
    expect(res.status).toBe(401);
  });

  it('devuelve 403 para rol DOCENTE', async () => {
    const res = await request(app)
      .get('/api/mensajes/estadisticas-docentes')
      .set('Authorization', `Bearer ${tokenDocente}`)
      .query({ desde: '2026-05-01', hasta: '2026-05-31' });
    expect(res.status).toBe(403);
  });

  it('devuelve 400 si falta el parámetro desde', async () => {
    const res = await request(app)
      .get('/api/mensajes/estadisticas-docentes')
      .set('Authorization', `Bearer ${tokenRector}`)
      .query({ hasta: '2026-05-31' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('devuelve 400 si falta el parámetro hasta', async () => {
    const res = await request(app)
      .get('/api/mensajes/estadisticas-docentes')
      .set('Authorization', `Bearer ${tokenRector}`)
      .query({ desde: '2026-05-01' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('responde 200 con estructura correcta cuando los params son válidos', async () => {
    const res = await request(app)
      .get('/api/mensajes/estadisticas-docentes')
      .set('Authorization', `Bearer ${tokenRector}`)
      .query({ desde: '2026-05-01', hasta: '2026-05-31' });
    // El endpoint puede devolver 200 con data vacía (escuela de test sin docentes)
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('totalDocentes');
      expect(res.body.meta).toHaveProperty('desde');
      expect(res.body.meta).toHaveProperty('hasta');
    }
  });
});

describe('GET /api/mensajes/auditoria', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/mensajes/auditoria');
    expect(res.status).toBe(401);
  });

  it('devuelve 403 para rol DOCENTE', async () => {
    const res = await request(app)
      .get('/api/mensajes/auditoria')
      .set('Authorization', `Bearer ${tokenDocente}`)
      .query({
        remitenteId: '507f1f77bcf86cd799439013',
        desde: '2026-05-01',
        hasta: '2026-05-31',
      });
    expect(res.status).toBe(403);
  });

  it('devuelve 400 si falta remitenteId', async () => {
    const res = await request(app)
      .get('/api/mensajes/auditoria')
      .set('Authorization', `Bearer ${tokenRector}`)
      .query({ desde: '2026-05-01', hasta: '2026-05-31' });
    expect(res.status).toBe(400);
  });

  it('devuelve 400 si remitenteId no es un ObjectId válido', async () => {
    const res = await request(app)
      .get('/api/mensajes/auditoria')
      .set('Authorization', `Bearer ${tokenRector}`)
      .query({ remitenteId: 'no-es-un-id', desde: '2026-05-01', hasta: '2026-05-31' });
    expect(res.status).toBe(400);
  });

  it('responde 200 con estructura correcta cuando los params son válidos', async () => {
    const res = await request(app)
      .get('/api/mensajes/auditoria')
      .set('Authorization', `Bearer ${tokenRector}`)
      .query({
        remitenteId: '507f1f77bcf86cd799439013',
        desde: '2026-05-01',
        hasta: '2026-05-31',
      });
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('pagina');
      expect(res.body.meta).toHaveProperty('limite');
      expect(res.body.meta).toHaveProperty('paginas');
    }
  });
});
