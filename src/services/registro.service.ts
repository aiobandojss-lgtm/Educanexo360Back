import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import SolicitudRegistro, { EstadoSolicitud } from '../models/solicitud-registro.model';
import Usuario from '../models/usuario.model';
import Invitacion, { TipoInvitacion } from '../models/invitacion.model';
import Curso from '../models/curso.model';
import invitacionService from './invitacion.service';
import emailService from '../services/email.service';
import { estudianteService } from './estudiante.service';
import ApiError from '../utils/ApiError';
import { generarPasswordAleatoria } from '../utils/passwordUtils';
import mongoose from 'mongoose';

class RegistroService {
  /**
   * Notifica a los administradores sobre una nueva solicitud de registro
   */
  private async notificarNuevaSolicitud(solicitud: any) {
    try {
      // Enviar correo de notificación a los administradores
      await emailService.sendEmail({
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
    } catch (error) {
      console.error('Error al enviar notificación de nueva solicitud:', error);
    }
  }

  /**
   * Crea una nueva solicitud de registro
   */
  /**
   * Crea una nueva solicitud de registro
   */
  async crearSolicitud(data: {
    invitacionId: string;
    nombre: string;
    apellidos: string;
    email: string;
    telefono?: string;
    estudiantes: Array<{
      nombre: string;
      apellidos: string;
      fechaNacimiento?: Date;
      cursoId: string;
      codigo_estudiante?: string;
      email?: string; // Campo opcional
    }>;
  }) {
    // Validar la invitación
    const invitacion = await Invitacion.findById(data.invitacionId);

    if (!invitacion || invitacion.estado !== 'ACTIVO') {
      throw new ApiError(400, 'La invitación no es válida o ha expirado');
    }

    // Verificar si ya existe un usuario con ese email
    const usuarioExistente = await Usuario.findOne({ email: data.email });

    if (usuarioExistente) {
      throw new ApiError(400, 'Ya existe un usuario con ese correo electrónico');
    }

    // Verificar si ya existe una solicitud pendiente con ese email
    const solicitudExistente = await SolicitudRegistro.findOne({
      email: data.email,
      estado: EstadoSolicitud.PENDIENTE,
    });

    if (solicitudExistente) {
      throw new ApiError(
        400,
        'Ya existe una solicitud de registro pendiente con ese correo electrónico',
      );
    }

    // Array para almacenar advertencias sobre cambios automáticos
    const advertencias: string[] = [];

    // Procesar emails de estudiantes y detectar duplicados
    const estudiantesProcessed = data.estudiantes.map((estudiante, index) => {
      // Si el email del estudiante es igual al del acudiente, generar uno automático
      if (estudiante.email && estudiante.email.toLowerCase() === data.email.toLowerCase()) {
        advertencias.push(
          `El estudiante ${estudiante.nombre} ${estudiante.apellidos} usará un email generado automáticamente ya que coincide con el email del acudiente.`,
        );

        // Crear una nueva instancia sin email
        const estudianteSinEmail: {
          nombre: string;
          apellidos: string;
          fechaNacimiento?: Date;
          cursoId: string;
          codigo_estudiante?: string;
          email?: string;
        } = {
          nombre: estudiante.nombre,
          apellidos: estudiante.apellidos,
          fechaNacimiento: estudiante.fechaNacimiento,
          cursoId: estudiante.cursoId,
          codigo_estudiante: estudiante.codigo_estudiante,
          // No incluimos email
        };

        return estudianteSinEmail;
      }

      // Retornar el estudiante completo si no hay conflicto
      return estudiante;
    });

    // Verificar que los emails de estudiantes restantes no estén en uso
    for (const [index, estudiante] of estudiantesProcessed.entries()) {
      if (estudiante.email) {
        // Verificar si el email ya está en uso por otro usuario
        const estudianteExistente = await Usuario.findOne({ email: estudiante.email });
        if (estudianteExistente) {
          throw new ApiError(400, `El correo ${estudiante.email} ya está en uso por otro usuario`);
        }

        // Verificar si hay duplicados entre los mismos estudiantes de esta solicitud
        const duplicadoEnLista = estudiantesProcessed.find(
          (otroEst, otroIndex) =>
            otroIndex !== index &&
            otroEst.email &&
            otroEst.email.toLowerCase() === estudiante.email!.toLowerCase(),
        );

        if (duplicadoEnLista) {
          throw new ApiError(
            400,
            `El correo ${estudiante.email} está duplicado entre los estudiantes de esta solicitud`,
          );
        }
      }
    }

    // Crear la solicitud
    const solicitud = new SolicitudRegistro({
      invitacionId: new Types.ObjectId(data.invitacionId),
      escuelaId: invitacion.escuelaId,
      nombre: data.nombre,
      apellidos: data.apellidos,
      email: data.email,
      telefono: data.telefono,
      estudiantes: estudiantesProcessed.map((est) => ({
        ...est,
        cursoId: new Types.ObjectId(est.cursoId),
      })),
      estado: EstadoSolicitud.PENDIENTE,
      fechaSolicitud: new Date(),
    });

    await solicitud.save();

    // Enviar notificación a administradores
    await this.notificarNuevaSolicitud(solicitud);

    return {
      solicitud,
      advertencias, // Retornar advertencias para informar al usuario
    };
  }

  /**
   * Aprueba una solicitud de registro - VERSIÓN CORREGIDA
   */
  async aprobarSolicitud(solicitudId: string, usuarioAdminId: string) {
    console.log(`Iniciando aprobación de solicitud ${solicitudId} por admin ${usuarioAdminId}`);

    const solicitud = await SolicitudRegistro.findById(solicitudId);

    if (!solicitud) {
      throw new ApiError(404, 'Solicitud no encontrada');
    }

    if (solicitud.estado !== EstadoSolicitud.PENDIENTE) {
      throw new ApiError(400, 'Esta solicitud ya ha sido procesada');
    }

    // Iniciar transacción
    const session = await SolicitudRegistro.startSession();
    session.startTransaction();

    try {
      // Generar credenciales para acudiente
      const acudienteCredenciales = this.generarCredencialesUnicas(
        solicitud.nombre,
        solicitud.apellidos,
        solicitud.email,
      );

      console.log('Credenciales de acudiente generadas con éxito');

      // 1. CREAR ACUDIENTE
      const acudiente = new Usuario({
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

      // Convertir acudiente._id a string con tipo explícito para evitar errores
      const acudienteId = (acudiente._id as unknown as Types.ObjectId).toString();

      // 2. PROCESAR ESTUDIANTES (NUEVOS Y EXISTENTES)
      const estudiantesParaEmail = [];
      const estudiantesCreados: Types.ObjectId[] = [];
      const estudiantesAsociados: string[] = [];

      for (let i = 0; i < solicitud.estudiantes.length; i++) {
        const estData = solicitud.estudiantes[i];

        if (estData.esExistente && estData.estudianteExistenteId) {
          // ASOCIAR ESTUDIANTE EXISTENTE
          console.log(`Procesando estudiante existente: ${estData.estudianteExistenteId}`);

          // Verificar que puede ser asociado
          const verificacion = await estudianteService.puedeAsociarAcudiente(
            estData.estudianteExistenteId.toString(),
            solicitud.email,
            solicitud.escuelaId.toString(),
          );

          if (!verificacion.puede) {
            throw new ApiError(400, `No se puede asociar el estudiante: ${verificacion.razon}`);
          }

          // Asociar estudiante existente al nuevo acudiente
          await estudianteService.asociarEstudianteAcudiente(
            estData.estudianteExistenteId.toString(),
            acudienteId, // Usar acudienteId (string)
            estData.cursoId.toString(),
            session,
          );

          // Obtener datos del estudiante para el email
          const estudianteExistente = await estudianteService.obtenerEstudiantePorId(
            estData.estudianteExistenteId.toString(),
            solicitud.escuelaId.toString(),
          );

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
        } else {
          // CREAR NUEVO ESTUDIANTE
          console.log(`Creando nuevo estudiante: ${estData.nombre} ${estData.apellidos}`);

          const credenciales = this.generarCredencialesUnicas(
            estData.nombre,
            estData.apellidos,
            estData.email || null,
            estData.codigo_estudiante || null,
          );

          // Obtener información del curso
          let cursoInfo = {
            grado: '',
            grupo: '',
            nombre: '',
          };

          try {
            const curso = await Curso.findById(estData.cursoId);
            if (curso) {
              cursoInfo = {
                grado: curso.grado || '',
                grupo: curso.grupo || '',
                nombre: curso.nombre || '',
              };
            }
          } catch (error) {
            console.error('Error al obtener información del curso:', error);
          }

          // Crear estudiante
          const estudiante = new Usuario({
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

          // Actualizar curso con addToSet para evitar duplicados
          try {
            await Curso.findByIdAndUpdate(
              estData.cursoId,
              { $addToSet: { estudiantes: estudiante._id } },
              { session, new: true },
            );
            console.log(`Estudiante añadido al curso ${estData.cursoId}`);
          } catch (error) {
            console.error('Error al añadir estudiante al curso:', error);
          }

          // Guardar credenciales para email
          estudiantesParaEmail.push({
            nombre: `${estData.nombre} ${estData.apellidos}`,
            email: credenciales.email,
            password: credenciales.password,
            codigo: credenciales.codigo,
            curso: cursoInfo.nombre,
            emailGenerado: !estData.email,
            esExistente: false,
          });

          estudiantesCreados.push(estudiante._id as Types.ObjectId);

          // Añadir estudiante al acudiente
          acudiente.info_academica?.estudiantes_asociados?.push(estudiante._id as Types.ObjectId);
        }
      }

      // Actualizar acudiente con todos los estudiantes asociados
      await acudiente.save({ session });

      // 3. Registrar uso de invitación
      await invitacionService.registrarUso(
        solicitud.invitacionId.toString(),
        acudienteId, // Usar acudienteId (string)
        'ACUDIENTE',
      );

      // 4. Actualizar solicitud
      solicitud.estado = EstadoSolicitud.APROBADA;
      solicitud.fechaRevision = new Date();
      solicitud.revisadoPor = new Types.ObjectId(usuarioAdminId);
      solicitud.usuariosCreados = [acudiente._id as Types.ObjectId, ...estudiantesCreados];

      await solicitud.save({ session });

      // Confirmar transacción
      await session.commitTransaction();
      console.log('Transacción completada exitosamente');

      // 5. Enviar email con credenciales
      await this.enviarCorreoConfirmacion(
        acudienteCredenciales.email,
        `${solicitud.nombre} ${solicitud.apellidos}`,
        acudienteCredenciales.password,
        estudiantesParaEmail,
      );

      return {
        mensaje: 'Solicitud aprobada exitosamente',
        acudienteId: acudiente._id,
        estudiantesCreados: estudiantesCreados,
        estudiantesAsociados: estudiantesAsociados,
        totalEstudiantes: estudiantesCreados.length + estudiantesAsociados.length,
      };
    } catch (error) {
      // Revertir transacción
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

      throw new ApiError(500, errorMessage);
    } finally {
      session.endSession();
    }
  }

  /**
   * Rechaza una solicitud de registro
   */
  async rechazarSolicitud(solicitudId: string, usuarioAdminId: string, motivo: string) {
    const solicitud = await SolicitudRegistro.findById(solicitudId);

    if (!solicitud) {
      throw new ApiError(404, 'Solicitud no encontrada');
    }

    if (solicitud.estado !== EstadoSolicitud.PENDIENTE) {
      throw new ApiError(400, 'Esta solicitud ya ha sido procesada');
    }

    // Actualizar la solicitud
    solicitud.estado = EstadoSolicitud.RECHAZADA;
    solicitud.fechaRevision = new Date();
    solicitud.revisadoPor = new Types.ObjectId(usuarioAdminId);
    solicitud.comentarios = motivo;

    await solicitud.save();

    // Notificar al solicitante
    await emailService.sendEmail({
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

  /**
   * Obtiene solicitudes pendientes
   */
  async obtenerSolicitudesPendientes(escuelaId: string, pagina = 1, limite = 10) {
    const skip = (pagina - 1) * limite;

    try {
      // Asegurarnos que escuelaId sea un ObjectId válido
      let escuelaIdObj;
      try {
        if (mongoose.Types.ObjectId.isValid(escuelaId)) {
          escuelaIdObj = new mongoose.Types.ObjectId(escuelaId);
        } else {
          console.warn(`escuelaId inválido: ${escuelaId}, no se aplicará filtro de escuela`);
        }
      } catch (err) {
        console.error('Error al convertir escuelaId a ObjectId:', err);
      }

      // Construimos el filtro adecuadamente
      const filtro: { estado: EstadoSolicitud; escuelaId?: mongoose.Types.ObjectId } = {
        estado: EstadoSolicitud.PENDIENTE,
      };

      // Solo agregamos filtro de escuela si tenemos un ObjectId válido
      if (escuelaIdObj) {
        filtro.escuelaId = escuelaIdObj;
      }

      console.log('Filtro usado para buscar solicitudes:', JSON.stringify(filtro));

      const total = await SolicitudRegistro.countDocuments(filtro);
      console.log(`Total de solicitudes PENDIENTES con filtro: ${total}`);

      const solicitudes = await SolicitudRegistro.find(filtro)
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
    } catch (error) {
      console.error('Error al buscar solicitudes pendientes:', error);
      // En caso de error, devolver un objeto vacío pero válido
      return {
        total: 0,
        pagina,
        limite,
        solicitudes: [],
      };
    }
  }

  /**
   * Obtiene una solicitud por ID
   */
  async obtenerSolicitudPorId(id: string) {
    const solicitud = await SolicitudRegistro.findById(id).populate(
      'revisadoPor',
      'nombre apellidos',
    );

    if (!solicitud) {
      throw new ApiError(404, 'Solicitud no encontrada');
    }

    return solicitud;
  }

  /**
   * Obtiene el historial de solicitudes
   */
  async obtenerHistorialSolicitudes(
    escuelaId: string,
    estado?: EstadoSolicitud,
    pagina = 1,
    limite = 10,
  ) {
    const skip = (pagina - 1) * limite;

    const filtro: any = {
      escuelaId: new Types.ObjectId(escuelaId),
    };

    if (estado) {
      filtro.estado = estado;
    }

    const total = await SolicitudRegistro.countDocuments(filtro);

    const solicitudes = await SolicitudRegistro.find(filtro)
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

  /**
   * Genera credenciales únicas para un usuario
   */
  private generarCredencialesUnicas(
    nombre: string,
    apellidos: string,
    emailOriginal: string | null = null,
    codigoOriginal: string | null = null,
  ) {
    // Generar un UUID único para garantizar unicidad
    const uuid = uuidv4().substring(0, 8);
    const timestamp = Date.now().toString().substring(8, 13);

    // Normalizar nombre y apellidos
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

    // Email: usar el original o generar uno único
    const email =
      emailOriginal ||
      `${nombreNormalizado}.${apellidoNormalizado}.${uuid}@estudiante.educanexo.com`;

    // Generar contraseña aleatoria
    const password = generarPasswordAleatoria();

    // Código: usar el original o generar uno único
    const codigo =
      codigoOriginal ||
      `EST${nombre.charAt(0).toUpperCase()}${apellidos.charAt(0).toUpperCase()}${timestamp}${uuid}`;

    return {
      email,
      password,
      codigo,
    };
  }

  /**
   * Envía correo de confirmación con credenciales - MEJORADO
   */
  /**
   * Envía correo de confirmación con credenciales - MEJORADO CON URL
   */
  private async enviarCorreoConfirmacion(
    email: string,
    nombreCompleto: string,
    passwordAcudiente: string,
    credencialesEstudiantes: Array<{
      nombre: string;
      email: string;
      password: string;
      codigo: string;
      curso?: string;
      emailGenerado?: boolean;
      esExistente?: boolean;
    }>,
  ) {
    // Obtener URL de la plataforma desde variables de entorno o usar por defecto
    const PLATFORM_URL = process.env.FRONTEND_URL || 'https://educa-nexo360-react.vercel.app';
    const LOGIN_URL = `${PLATFORM_URL}/login`;

    // Construir lista de estudiantes para el correo
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
      } else {
        listaEstudiantes += `
- Estudiante: ${est.nombre} (NUEVO)
  Código: ${est.codigo}
  Curso: ${est.curso || 'No especificado'}
  Email: ${est.email}${est.emailGenerado ? ' (generado por el sistema)' : ''}
  Contraseña: ${est.password}
      `;
      }
    });

    // Enviar correo con las credenciales MEJORADO
    await emailService.sendEmail({
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

export const registroService = new RegistroService();
export default registroService;
