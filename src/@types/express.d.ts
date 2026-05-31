declare namespace Express {
  interface Request {
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
}
