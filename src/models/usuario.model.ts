import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUsuario } from '../interfaces/IUsuario'; // ✅ QUITAR TipoUsuario, EstadoUsuario

const UsuarioSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    apellidos: {
      type: String,
      required: true,
      trim: true,
    },
    tipo: {
      type: String,
      enum: [
        'SUPER_ADMIN',
        'ADMIN',
        'DOCENTE',
        'ACUDIENTE',
        'ESTUDIANTE',
        'COORDINADOR',
        'RECTOR',
        'ADMINISTRATIVO',
      ],
      required: true,
    },
    estado: {
      type: String,
      enum: ['ACTIVO', 'INACTIVO'],
      default: 'ACTIVO',
    },
    escuelaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Escuela',
      required: function (this: IUsuario) {
        return this.tipo !== 'SUPER_ADMIN';
      },
    },
    permisos: {
      type: [String],
      default: [],
    },
    perfil: {
      telefono: String,
      direccion: String,
      foto: String,
    },
    info_academica: {
      grado: String,
      grupo: String,
      codigo_estudiante: String,
      estudiantes_asociados: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }],
      asignaturas_asignadas: [
        {
          asignaturaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asignatura' },
          cursoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Curso' },
        },
      ],
    },
    
    // 🔥 CAMPOS FCM AGREGADOS AQUÍ
    fcmToken: {
      type: String,
      default: null,
    },
    platform: {
      type: String,
      enum: ['ios', 'android'],
    },
    deviceInfo: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    fcmTokenUpdatedAt: {
      type: Date,
      default: null
    },
    // Fase 4.3: varios dispositivos por usuario (máx. 5; al registrar uno nuevo sale el más viejo).
    // fcmToken (arriba) se conserva con el último token registrado por compatibilidad.
    fcmTokens: {
      type: [
        new mongoose.Schema(
          {
            token: { type: String, required: true },
            platform: { type: String, enum: ['ios', 'android'] },
            deviceInfo: { type: mongoose.Schema.Types.Mixed },
            updatedAt: { type: Date },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    
    // Campos para RBAC — perfil de rol personalizado por escuela (opcional)
    rolBase: {
      type: String,
      enum: ['DOCENTE', 'COORDINADOR', 'RECTOR', 'ADMINISTRATIVO', 'ACUDIENTE', 'ESTUDIANTE'],
    },
    perfilRolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PerfilRol',
    },

    // Campos para recuperación de contraseña
    resetPasswordToken: String,
    resetPasswordExpires: Date,

    // Solicitud de eliminación de cuenta (autoservicio desde la app móvil)
    eliminacionCuenta: {
      solicitada: { type: Boolean, default: false },
      fecha: Date,
      motivo: String,
    },
  },
  { timestamps: true },
);

// Índices (Fase 3): listados por escuela/tipo/estado, búsqueda de acudientes por hijo,
// reset de contraseña y tokens FCM reales (parcial: el default null no ocupa espacio)
UsuarioSchema.index({ escuelaId: 1, tipo: 1, estado: 1 });
UsuarioSchema.index({ 'info_academica.estudiantes_asociados': 1 });
UsuarioSchema.index({ resetPasswordToken: 1 }, { sparse: true });
UsuarioSchema.index(
  { fcmToken: 1 },
  { name: 'fcmToken_parcial', partialFilterExpression: { fcmToken: { $type: 'string' } } },
);
// Fase 4.3: un token pertenece a UN solo usuario (garantizado en la base). Parcial por $type string: sin eso
// los usuarios sin dispositivos chocarían como duplicados de null. _autoIndex:false → NO se crea al arrancar:
// lo crea src/scripts/migrar-fcm-tokens.js --aplicar DESPUÉS de migrar y deduplicar (sync-indexes lo muestra
// como faltante en simulación hasta entonces).
UsuarioSchema.index(
  { 'fcmTokens.token': 1 },
  {
    name: 'fcmTokens_token_unico',
    unique: true,
    partialFilterExpression: { 'fcmTokens.token': { $type: 'string' } },
    _autoIndex: false,
  } as any,
);

// Campos que nunca deben salir en una respuesta HTTP
const CAMPOS_SENSIBLES = [
  'password',
  'resetPasswordToken',
  'resetPasswordExpires',
  'fcmToken',
  'fcmTokenUpdatedAt',
  'deviceInfo',
  'fcmTokens',
];

// Elimina los campos sensibles al serializar (res.json usa toJSON; también aplica a populate).
// Nota: .lean() y $lookup NO pasan por aquí; deben proyectar sus campos explícitamente.
const ocultarCamposSensibles = (_doc: unknown, ret: Record<string, unknown>) => {
  CAMPOS_SENSIBLES.forEach((campo) => delete ret[campo]);
  return ret;
};

UsuarioSchema.set('toJSON', { transform: ocultarCamposSensibles });
UsuarioSchema.set('toObject', { transform: ocultarCamposSensibles });

// Middleware pre-save para hash de contraseña
UsuarioSchema.pre('save', async function (next) {
  // Usar casting explícito para la parte del this
  const user = this as any;

  // Solo hashear la contraseña si ha sido modificada o es nueva
  if (!user.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(user.password, salt);
    user.password = hashedPassword;
    next();
  } catch (error: any) {
    next(error);
  }
});

// Método para comparar contraseñas
UsuarioSchema.methods.compararPassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Crear y exportar el modelo
const Usuario = mongoose.model<IUsuario>('Usuario', UsuarioSchema);

export default Usuario;