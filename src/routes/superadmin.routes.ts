// src/routes/superadmin.routes.ts
import express, { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import Escuela from '../models/escuela.model';
import Usuario from '../models/usuario.model';

// Extender la interfaz Request para incluir el campo user
interface RequestWithUser extends Request {
  user?: {
    _id: string;
    escuelaId: string;
    tipo: string;
    email: string;
    nombre: string;
    apellidos: string;
    estado: string;
    permisos: string[];
    perfilRolId?: string;
  };
}

const router = express.Router();

// Verificar que es SUPER_ADMIN (función simple, sin archivo separado)
const esSuperAdmin = (req: RequestWithUser, res: Response, next: NextFunction) => {
  if (req.user && req.user.tipo === 'SUPER_ADMIN') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Acceso denegado' });
  }
};

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(esSuperAdmin);

// Ruta para verificar el estado del API de Super Admin
router.get('/status', (req: RequestWithUser, res: Response) => {
  try {
    res.json({
      success: true,
      message: 'Super Admin API funcionando correctamente',
      user: req.user ? `${req.user.nombre} ${req.user.apellidos}` : 'Unknown',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Ruta para obtener todas las escuelas
router.get('/escuelas', async (req: Request, res: Response) => {
  try {
    const escuelas = await Escuela.find();
    res.json({ success: true, data: escuelas });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Ruta para crear una escuela con su primer administrador
router.post('/escuelas', async (req: Request, res: Response) => {
  try {
    const { escuela: escuelaData, administrador: adminData } = req.body;

    // Crear la escuela
    const nuevaEscuela = new Escuela(escuelaData);
    await nuevaEscuela.save();

    // Crear el administrador
    const nuevoAdmin = new Usuario({
      ...adminData,
      escuelaId: nuevaEscuela._id,
      tipo: 'ADMIN',
    });
    await nuevoAdmin.save();

    res.status(201).json({
      success: true,
      data: {
        escuela: nuevaEscuela,
        administrador: {
          _id: nuevoAdmin._id,
          nombre: nuevoAdmin.nombre,
          apellidos: nuevoAdmin.apellidos,
          email: nuevoAdmin.email,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
