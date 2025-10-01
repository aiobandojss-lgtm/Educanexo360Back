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
      index: true
    },
    platform: {
      type: String,
      enum: ['ios', 'android'],
      default: null
    },
    deviceInfo: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    fcmTokenUpdatedAt: {
      type: Date,
      default: null
    },
    
    // Campos para recuperación de contraseña
    resetPasswordToken: String,
    resetPasswordExpires: Date,
  },
  { timestamps: true },
);

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