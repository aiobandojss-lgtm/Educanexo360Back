"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registroService = void 0;
const mongoose_1 = require("mongoose");
const uuid_1 = require("uuid");
const solicitud_registro_model_1 = __importStar(require("../models/solicitud-registro.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const invitacion_model_1 = __importDefault(require("../models/invitacion.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const invitacion_service_1 = __importDefault(require("./invitacion.service"));
const email_service_1 = __importDefault(require("../services/email.service"));
const estudiante_service_1 = require("./estudiante.service");
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const passwordUtils_1 = require("../utils/passwordUtils");
const mongoose_2 = __importDefault(require("mongoose"));
class RegistroService {
    async notificarNuevaSolicitud(solicitud) {
        try {
            await email_service_1.default.sendEmail({
                to: process.env.ADMIN_EMAIL || 'admin@educanexo360.com',
                subject: 'Nueva solicitud de registro recibida',
                text: `Se ha recibido una nueva solicitud de registro:
          
Nombre: ${solicitud.nombre} ${solicitud.apellidos}
Email: ${solicitud.email}
Teléfono: ${solicitud.telefono || 'No proporcionado'}
Estudiantes: ${solicitud.estudiantes.length}
          
Por favor, revise la solicitud en el panel de administración.
        `,
            });
            console.log(`Notificación enviada para la solicitud ${solicitud._id}`);
        }
        catch (error) {
            console.error('Error al enviar notificación de nueva solicitud:', error);
        }
    }
    async crearSolicitud(data) {
        const invitacion = await invitacion_model_1.default.findById(data.invitacionId);
        if (!invitacion || invitacion.estado !== 'ACTIVO') {
            throw new ApiError_1.default(400, 'La invitación no es válida o ha expirado');
        }
        const usuarioExistente = await usuario_model_1.default.findOne({ email: data.email });
        if (usuarioExistente) {
            throw new ApiError_1.default(400, 'Ya existe un usuario con ese correo electrónico');
        }
        const solicitudExistente = await solicitud_registro_model_1.default.findOne({
            email: data.email,
            estado: solicitud_registro_model_1.EstadoSolicitud.PENDIENTE,
        });
        if (solicitudExistente) {
            throw new ApiError_1.default(400, 'Ya existe una solicitud de registro pendiente con ese correo electrónico');
        }
        const advertencias = [];
        const estudiantesProcessed = data.estudiantes.map((estudiante, index) => {
            if (estudiante.email && estudiante.email.toLowerCase() === data.email.toLowerCase()) {
                advertencias.push(`El estudiante ${estudiante.nombre} ${estudiante.apellidos} usará un email generado automáticamente ya que coincide con el email del acudiente.`);
                const estudianteSinEmail = {
                    nombre: estudiante.nombre,
                    apellidos: estudiante.apellidos,
                    fechaNacimiento: estudiante.fechaNacimiento,
                    cursoId: estudiante.cursoId,
                    codigo_estudiante: estudiante.codigo_estudiante,
                };
                return estudianteSinEmail;
            }
            return estudiante;
        });
        for (const [index, estudiante] of estudiantesProcessed.entries()) {
            if (estudiante.email) {
                const estudianteExistente = await usuario_model_1.default.findOne({ email: estudiante.email });
                if (estudianteExistente) {
                    throw new ApiError_1.default(400, `El correo ${estudiante.email} ya está en uso por otro usuario`);
                }
                const duplicadoEnLista = estudiantesProcessed.find((otroEst, otroIndex) => otroIndex !== index &&
                    otroEst.email &&
                    otroEst.email.toLowerCase() === estudiante.email.toLowerCase());
                if (duplicadoEnLista) {
                    throw new ApiError_1.default(400, `El correo ${estudiante.email} está duplicado entre los estudiantes de esta solicitud`);
                }
            }
        }
        const solicitud = new solicitud_registro_model_1.default({
            invitacionId: new mongoose_1.Types.ObjectId(data.invitacionId),
            escuelaId: invitacion.escuelaId,
            nombre: data.nombre,
            apellidos: data.apellidos,
            email: data.email,
            telefono: data.telefono,
            estudiantes: estudiantesProcessed.map((est) => ({
                ...est,
                cursoId: new mongoose_1.Types.ObjectId(est.cursoId),
            })),
            estado: solicitud_registro_model_1.EstadoSolicitud.PENDIENTE,
            fechaSolicitud: new Date(),
        });
        await solicitud.save();
        await this.notificarNuevaSolicitud(solicitud);
        return {
            solicitud,
            advertencias,
        };
    }
    async aprobarSolicitud(solicitudId, usuarioAdminId) {
        console.log(`Iniciando aprobación de solicitud ${solicitudId} por admin ${usuarioAdminId}`);
        const solicitud = await solicitud_registro_model_1.default.findById(solicitudId);
        if (!solicitud) {
            throw new ApiError_1.default(404, 'Solicitud no encontrada');
        }
        if (solicitud.estado !== solicitud_registro_model_1.EstadoSolicitud.PENDIENTE) {
            throw new ApiError_1.default(400, 'Esta solicitud ya ha sido procesada');
        }
        const session = await solicitud_registro_model_1.default.startSession();
        session.startTransaction();
        try {
            const acudienteCredenciales = this.generarCredencialesUnicas(solicitud.nombre, solicitud.apellidos, solicitud.email);
            console.log('Credenciales de acudiente generadas con éxito');
            const acudiente = new usuario_model_1.default({
                nombre: solicitud.nombre,
                apellidos: solicitud.apellidos,
                email: acudienteCredenciales.email,
                password: acudienteCredenciales.password,
                tipo: 'ACUDIENTE',
                estado: 'ACTIVO',
                escuelaId: solicitud.escuelaId,
                perfil: {
                    telefono: solicitud.telefono || '',
                    direccion: '',
                    foto: '',
                },
                info_academica: {
                    estudiantes_asociados: [],
                    asignaturas_asignadas: [],
                },
                permisos: [],
            });
            await acudiente.save({ session });
            console.log(`Acudiente creado con ID: ${acudiente._id}`);
            const acudienteId = acudiente._id.toString();
            const estudiantesParaEmail = [];
            const estudiantesCreados = [];
            const estudiantesAsociados = [];
            for (let i = 0; i < solicitud.estudiantes.length; i++) {
                const estData = solicitud.estudiantes[i];
                if (estData.esExistente && estData.estudianteExistenteId) {
                    console.log(`Procesando estudiante existente: ${estData.estudianteExistenteId}`);
                    const verificacion = await estudiante_service_1.estudianteService.puedeAsociarAcudiente(estData.estudianteExistenteId.toString(), solicitud.email, solicitud.escuelaId.toString());
                    if (!verificacion.puede) {
                        throw new ApiError_1.default(400, `No se puede asociar el estudiante: ${verificacion.razon}`);
                    }
                    await estudiante_service_1.estudianteService.asociarEstudianteAcudiente(estData.estudianteExistenteId.toString(), acudienteId, estData.cursoId.toString(), session);
                    const estudianteExistente = await estudiante_service_1.estudianteService.obtenerEstudiantePorId(estData.estudianteExistenteId.toString(), solicitud.escuelaId.toString());
                    if (estudianteExistente) {
                        estudiantesParaEmail.push({
                            nombre: `${estudianteExistente.nombre} ${estudianteExistente.apellidos}`,
                            email: estudianteExistente.email,
                            password: 'Usar credenciales existentes',
                            codigo: estudianteExistente.codigo_estudiante || 'N/A',
                            curso: estudianteExistente.curso?.nombre || 'No especificado',
                            esExistente: true,
                        });
                        estudiantesAsociados.push(estudianteExistente._id);
                    }
                }
                else {
                    console.log(`Creando nuevo estudiante: ${estData.nombre} ${estData.apellidos}`);
                    const credenciales = this.generarCredencialesUnicas(estData.nombre, estData.apellidos, estData.email || null, estData.codigo_estudiante || null);
                    let cursoInfo = {
                        grado: '',
                        grupo: '',
                        nombre: '',
                    };
                    try {
                        const curso = await curso_model_1.default.findById(estData.cursoId);
                        if (curso) {
                            cursoInfo = {
                                grado: curso.grado || '',
                                grupo: curso.grupo || '',
                                nombre: curso.nombre || '',
                            };
                        }
                    }
                    catch (error) {
                        console.error('Error al obtener información del curso:', error);
                    }
                    const estudiante = new usuario_model_1.default({
                        nombre: estData.nombre,
                        apellidos: estData.apellidos,
                        email: credenciales.email,
                        password: credenciales.password,
                        tipo: 'ESTUDIANTE',
                        estado: 'ACTIVO',
                        escuelaId: solicitud.escuelaId,
                        perfil: {
                            telefono: '',
                            direccion: '',
                            foto: '',
                            fechaNacimiento: estData.fechaNacimiento,
                        },
                        info_academica: {
                            codigo_estudiante: credenciales.codigo,
                            grado: cursoInfo.grado,
                            grupo: cursoInfo.grupo,
                        },
                        permisos: [],
                    });
                    await estudiante.save({ session });
                    console.log(`Estudiante creado con ID: ${estudiante._id}`);
                    try {
                        await curso_model_1.default.findByIdAndUpdate(estData.cursoId, { $addToSet: { estudiantes: estudiante._id } }, { session, new: true });
                        console.log(`Estudiante añadido al curso ${estData.cursoId}`);
                    }
                    catch (error) {
                        console.error('Error al añadir estudiante al curso:', error);
                    }
                    estudiantesParaEmail.push({
                        nombre: `${estData.nombre} ${estData.apellidos}`,
                        email: credenciales.email,
                        password: credenciales.password,
                        codigo: credenciales.codigo,
                        curso: cursoInfo.nombre,
                        emailGenerado: !estData.email,
                        esExistente: false,
                    });
                    estudiantesCreados.push(estudiante._id);
                    acudiente.info_academica?.estudiantes_asociados?.push(estudiante._id);
                }
            }
            await acudiente.save({ session });
            await invitacion_service_1.default.registrarUso(solicitud.invitacionId.toString(), acudienteId, 'ACUDIENTE');
            solicitud.estado = solicitud_registro_model_1.EstadoSolicitud.APROBADA;
            solicitud.fechaRevision = new Date();
            solicitud.revisadoPor = new mongoose_1.Types.ObjectId(usuarioAdminId);
            solicitud.usuariosCreados = [acudiente._id, ...estudiantesCreados];
            await solicitud.save({ session });
            await session.commitTransaction();
            console.log('Transacción completada exitosamente');
            await this.enviarCorreoConfirmacion(acudienteCredenciales.email, `${solicitud.nombre} ${solicitud.apellidos}`, acudienteCredenciales.password, estudiantesParaEmail);
            return {
                mensaje: 'Solicitud aprobada exitosamente',
                acudienteId: acudiente._id,
                estudiantesCreados: estudiantesCreados,
                estudiantesAsociados: estudiantesAsociados,
                totalEstudiantes: estudiantesCreados.length + estudiantesAsociados.length,
            };
        }
        catch (error) {
            await session.abortTransaction();
            console.error('Error detallado:', error);
            let errorMessage = 'Error al aprobar solicitud';
            if (error instanceof Error) {
                console.error('Error detallado:', error.message);
                if (error.message.includes('E11000 duplicate key error')) {
                    const campo = error.message.includes('email')
                        ? 'email'
                        : error.message.includes('codigo_estudiante')
                            ? 'código de estudiante'
                            : 'un campo único';
                    errorMessage = `Error de duplicación en ${campo}. Por favor, contacte al administrador del sistema.`;
                }
            }
            throw new ApiError_1.default(500, errorMessage);
        }
        finally {
            session.endSession();
        }
    }
    async rechazarSolicitud(solicitudId, usuarioAdminId, motivo) {
        const solicitud = await solicitud_registro_model_1.default.findById(solicitudId);
        if (!solicitud) {
            throw new ApiError_1.default(404, 'Solicitud no encontrada');
        }
        if (solicitud.estado !== solicitud_registro_model_1.EstadoSolicitud.PENDIENTE) {
            throw new ApiError_1.default(400, 'Esta solicitud ya ha sido procesada');
        }
        solicitud.estado = solicitud_registro_model_1.EstadoSolicitud.RECHAZADA;
        solicitud.fechaRevision = new Date();
        solicitud.revisadoPor = new mongoose_1.Types.ObjectId(usuarioAdminId);
        solicitud.comentarios = motivo;
        await solicitud.save();
        await email_service_1.default.sendEmail({
            to: solicitud.email,
            subject: 'Solicitud de registro - No aprobada',
            text: `Estimado/a ${solicitud.nombre} ${solicitud.apellidos},

Su solicitud de registro en el sistema EducaNexo360 no ha sido aprobada por el siguiente motivo:

${motivo}

Si considera que esto es un error, por favor contacte directamente con la institución educativa.

Saludos cordiales,
El equipo de EducaNexo360`,
        });
        return {
            mensaje: 'Solicitud rechazada exitosamente',
        };
    }
    async obtenerSolicitudesPendientes(escuelaId, pagina = 1, limite = 10) {
        const skip = (pagina - 1) * limite;
        try {
            let escuelaIdObj;
            try {
                if (mongoose_2.default.Types.ObjectId.isValid(escuelaId)) {
                    escuelaIdObj = new mongoose_2.default.Types.ObjectId(escuelaId);
                }
                else {
                    console.warn(`escuelaId inválido: ${escuelaId}, no se aplicará filtro de escuela`);
                }
            }
            catch (err) {
                console.error('Error al convertir escuelaId a ObjectId:', err);
            }
            const filtro = {
                estado: solicitud_registro_model_1.EstadoSolicitud.PENDIENTE,
            };
            if (escuelaIdObj) {
                filtro.escuelaId = escuelaIdObj;
            }
            console.log('Filtro usado para buscar solicitudes:', JSON.stringify(filtro));
            const total = await solicitud_registro_model_1.default.countDocuments(filtro);
            console.log(`Total de solicitudes PENDIENTES con filtro: ${total}`);
            const solicitudes = await solicitud_registro_model_1.default.find(filtro)
                .sort({ fechaSolicitud: -1 })
                .skip(skip)
                .limit(limite);
            console.log(`Solicitudes encontradas: ${solicitudes.length}`);
            return {
                total,
                pagina,
                limite,
                solicitudes,
            };
        }
        catch (error) {
            console.error('Error al buscar solicitudes pendientes:', error);
            return {
                total: 0,
                pagina,
                limite,
                solicitudes: [],
            };
        }
    }
    async obtenerSolicitudPorId(id) {
        const solicitud = await solicitud_registro_model_1.default.findById(id).populate('revisadoPor', 'nombre apellidos');
        if (!solicitud) {
            throw new ApiError_1.default(404, 'Solicitud no encontrada');
        }
        return solicitud;
    }
    async obtenerHistorialSolicitudes(escuelaId, estado, pagina = 1, limite = 10) {
        const skip = (pagina - 1) * limite;
        const filtro = {
            escuelaId: new mongoose_1.Types.ObjectId(escuelaId),
        };
        if (estado) {
            filtro.estado = estado;
        }
        const total = await solicitud_registro_model_1.default.countDocuments(filtro);
        const solicitudes = await solicitud_registro_model_1.default.find(filtro)
            .sort({ fechaSolicitud: -1 })
            .skip(skip)
            .limit(limite)
            .populate('revisadoPor', 'nombre apellidos');
        return {
            total,
            pagina,
            limite,
            solicitudes,
        };
    }
    generarCredencialesUnicas(nombre, apellidos, emailOriginal = null, codigoOriginal = null) {
        const uuid = (0, uuid_1.v4)().substring(0, 8);
        const timestamp = Date.now().toString().substring(8, 13);
        const nombreNormalizado = nombre
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '');
        const apellidoNormalizado = apellidos
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '');
        const email = emailOriginal ||
            `${nombreNormalizado}.${apellidoNormalizado}.${uuid}@estudiante.educanexo.com`;
        const password = (0, passwordUtils_1.generarPasswordAleatoria)();
        const codigo = codigoOriginal ||
            `EST${nombre.charAt(0).toUpperCase()}${apellidos.charAt(0).toUpperCase()}${timestamp}${uuid}`;
        return {
            email,
            password,
            codigo,
        };
    }
    async enviarCorreoConfirmacion(email, nombreCompleto, passwordAcudiente, credencialesEstudiantes) {
        const PLATFORM_URL = process.env.FRONTEND_URL || 'https://educanexo360-web.vercel.app';
        const LOGIN_URL = `${PLATFORM_URL}/login`;
        let listaEstudiantes = '';
        credencialesEstudiantes.forEach((est) => {
            if (est.esExistente) {
                listaEstudiantes += `
- Estudiante: ${est.nombre} (EXISTENTE - ya asociado)
  Código: ${est.codigo}
  Curso: ${est.curso || 'No especificado'}
  Email: ${est.email}
  Contraseña: ${est.password}
      `;
            }
            else {
                listaEstudiantes += `
- Estudiante: ${est.nombre} (NUEVO)
  Código: ${est.codigo}
  Curso: ${est.curso || 'No especificado'}
  Email: ${est.email}${est.emailGenerado ? ' (generado por el sistema)' : ''}
  Contraseña: ${est.password}
      `;
            }
        });
        await email_service_1.default.sendEmail({
            to: email,
            subject: '🎓 ¡Bienvenido a EducaNexo360! - Credenciales de Acceso',
            text: `¡Bienvenido/a ${nombreCompleto} a EducaNexo360!

Su solicitud de registro ha sido aprobada. A continuación encontrará las credenciales de acceso para usted y sus estudiantes asociados:

🔗 ACCEDER A LA PLATAFORMA:
   ${LOGIN_URL}

📱 TAMBIÉN DISPONIBLE EN MÓVIL:
   Próximamente en Play Store y App Store

═══════════════════════════════════════════════════

👨‍👩‍👧‍👦 SUS CREDENCIALES DE ACUDIENTE:
- Email: ${email}
- Contraseña: ${passwordAcudiente}

🎓 ESTUDIANTES ASOCIADOS:
${listaEstudiantes}

═══════════════════════════════════════════════════

📋 NOTA IMPORTANTE:
- Los estudiantes marcados como "EXISTENTES" ya tenían cuenta en el sistema y ahora han sido asociados a usted como acudiente adicional.
- Los estudiantes marcados como "NUEVOS" son cuentas creadas específicamente para esta solicitud.

🔐 SEGURIDAD:
Por favor, conserve estas credenciales en un lugar seguro y cámbielas en su primer inicio de sesión por su propia seguridad.

🌐 ACCESO:
Puede acceder al sistema desde cualquier dispositivo con internet:
• Computador: ${LOGIN_URL}
• Celular o Tablet: ${LOGIN_URL}
• Aplicación Móvil: Próximamente disponible

📞 ¿NECESITA AYUDA?
Si tiene dificultades para ingresar, contacte a la institución educativa o escriba a soporte técnico.

¡Esperamos que disfrute de la experiencia EducaNexo360!

Saludos cordiales,
El equipo de EducaNexo360

───────────────────────────────────────────────────
Este es un mensaje automático del sistema EducaNexo360.
Para soporte técnico: soporte@educanexo360.creativebycode.com
whatsApp: +57 3185489198`,
        });
    }
}
exports.registroService = new RegistroService();
exports.default = exports.registroService;
//# sourceMappingURL=registro.service.js.map