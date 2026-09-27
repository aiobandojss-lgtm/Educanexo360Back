import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Usuario from '../models/usuario.model';
import Curso from '../models/curso.model';
import ApiError from '../utils/ApiError';
import { escapeRegex } from '../utils/escapeRegex';
import { numeroPagina, numeroLimite } from '../utils/paginacion';
import notificacionService from '../services/notificacion.service';
import { TipoNotificacion } from '../interfaces/INotificacion';
import { esRolAdministrativo, puedeGestionarRol } from '../utils/accesoAcademico';
import { preferenciaEmail, PREFERENCIAS_EMAIL } from '../utils/preferencias';
import { esEmailFicticio } from '../services/email.service';
import { encolarCorreoCuenta } from '../services/email/cuentas';

// Extender el tipo Request para incluir el usuario
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

// perfil por rutas punteadas (perfil.telefono...): solo los campos enviados, sin borrar los demás
const perfilPorRutas = (perfil: unknown): Record<string, string> => {
  const datos: Record<string, string> = {};
  if (perfil && typeof perfil === 'object') {
    ['telefono', 'direccion', 'foto'].forEach((campo) => {
      const valor = (perfil as Record<string, unknown>)[campo];
      if (typeof valor === 'string') datos[`perfil.${campo}`] = valor;
    });
  }
  return datos;
};

/**
 * ¿Queda al menos un ADMIN ACTIVO en el colegio? (extra auditoría 3.T: un colegio nunca queda sin administrador)
 */
const quedaAdminActivo = async (escuelaId: string): Promise<boolean> =>
  !!(await Usuario.exists({ escuelaId, tipo: 'ADMIN', estado: 'ACTIVO' }));

class UsuarioController {
  async obtenerUsuarios(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Agregar soporte para filtro por tipo de usuario
      const tipoUsuario = req.query.tipo as string;
      const searchTerm = req.query.q as string;

      const query: any = { escuelaId: req.user.escuelaId };

      // Agregar filtro por tipo si está especificado
      if (tipoUsuario) {
        query.tipo = tipoUsuario;
      }

      // Agregar búsqueda si hay término de búsqueda
      if (searchTerm) {
        query.$or = [
          { nombre: new RegExp(escapeRegex(searchTerm), 'i') },
          { apellidos: new RegExp(escapeRegex(searchTerm), 'i') },
          { email: new RegExp(escapeRegex(searchTerm), 'i') },
        ];
      }

      // Solo los campos que usan los clientes (listados y selectores) y .lean(): con miles de
      // usuarios los documentos completos pesaban MB. La lista blanca excluye los campos sensibles.
      const campos =
        '_id nombre apellidos email tipo estado escuelaId perfilRolId rolBase perfil info_academica createdAt';

      // Paginación OPCIONAL: solo si llega ?pagina (el web siempre manda limite=500 sin pagina
      // para llenar selectores y la tabla completa; paginar por limite lo truncaría)
      if (req.query.pagina !== undefined) {
        const pagina = numeroPagina(req.query.pagina);
        const limite = numeroLimite(req.query.limite, 50);
        const [usuarios, total] = await Promise.all([
          Usuario.find(query)
            .select(campos)
            .sort({ apellidos: 1, nombre: 1 })
            .skip((pagina - 1) * limite)
            .limit(limite)
            .lean(),
          Usuario.countDocuments(query),
        ]);
        res.json({
          success: true,
          data: usuarios,
          meta: { total, pagina, limite, totalPaginas: Math.ceil(total / limite) },
        });
        return;
      }

      const usuarios = await Usuario.find(query).select(campos).lean();

      res.json({
        success: true,
        data: usuarios,
      });
    } catch (error) {
      next(error);
    }
  }

  async obtenerUsuario(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar si el usuario está intentando acceder a su propio perfil o si tiene rol administrativo
      const solicitandoPropioUsuario = req.params.id === req.user._id;

      // Incluir RECTOR y COORDINADOR junto con ADMIN como roles con permisos administrativos
      const tieneRolAdministrativo = ['ADMIN', 'RECTOR', 'COORDINADOR'].includes(req.user.tipo);

      // ✅ NUEVO: Verificar si es acudiente intentando ver el perfil de un hijo asociado
      let esHijoAsociado = false;
      if (req.user.tipo === 'ACUDIENTE') {
        // Obtener el perfil del acudiente para verificar sus estudiantes asociados
        const acudiente = await Usuario.findById(req.user._id);
        const estudiantesAsociados = acudiente?.info_academica?.estudiantes_asociados || [];
        esHijoAsociado = estudiantesAsociados.some(
          (estudianteId) => estudianteId.toString() === req.params.id
        );
      }

      // ✅ MODIFICADO: Permitir acceso si es propio perfil, rol administrativo, O hijo asociado
      if (!solicitandoPropioUsuario && !tieneRolAdministrativo && !esHijoAsociado) {
        throw new ApiError(403, 'No tienes permiso para ver este perfil');
      }

      const usuario = await Usuario.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      }).select('-password');

      if (!usuario) {
        throw new ApiError(404, 'Usuario no encontrado');
      }

      // 🔧 NUEVA FUNCIONALIDAD: Si es ESTUDIANTE, buscar su curso
      if (usuario.tipo === 'ESTUDIANTE') {
        // Buscar el curso donde este estudiante está en el array de estudiantes
        const curso = await Curso.findOne({
          escuelaId: usuario.escuelaId,
          estudiantes: usuario._id,
          estado: 'ACTIVO'
        }).select('_id nombre nivel grado grupo jornada');

        // Si encontramos el curso, agregarlo a la respuesta
        if (curso) {
          // Convertir el usuario a objeto plano para poder modificarlo
          const usuarioObj = usuario.toObject();
          
          // Asegurar que info_academica existe
          if (!usuarioObj.info_academica) {
            usuarioObj.info_academica = {};
          }
          
          // Agregar el curso como objeto populated en grado (esto es lo que espera Flutter)
          (usuarioObj.info_academica as any).grado = {
            _id: curso._id,
            nombre: curso.nombre,
            nivel: curso.nivel,
            grado: curso.grado,
            grupo: curso.grupo,
            jornada: curso.jornada
          };

          res.json({
            success: true,
            data: usuarioObj,
          });
          return;
        }
      }

      // Si no es estudiante o no se encontró curso, devolver usuario normal
      res.json({
        success: true,
        data: usuario,
      });
    } catch (error) {
      next(error);
    }
  }

  // Actualización para el método actualizarUsuario

  async actualizarUsuario(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar si el usuario está intentando actualizar su propio perfil o si tiene rol administrativo
      const actualizandoPropioUsuario = req.params.id === req.user._id;

      // Roles administrativos (ADMIN, RECTOR, COORDINADOR, ADMINISTRATIVO); la jerarquía se valida abajo
      const tieneRolAdministrativo = esRolAdministrativo(req.user.tipo);

      if (!actualizandoPropioUsuario && !tieneRolAdministrativo) {
        throw new ApiError(403, 'No tienes permiso para modificar este perfil');
      }

      // Cuentas sin colegio (SUPER_ADMIN con escuelaId ''): todo se filtra por escuelaId, antes daba 500 (CastError)
      if (!mongoose.isValidObjectId(req.user.escuelaId)) {
        throw new ApiError(403, 'El usuario no tiene un colegio asociado');
      }

      // Si no tiene rol administrativo y está intentando cambiar el email, lo eliminamos de la solicitud
      if (!tieneRolAdministrativo && req.body.email !== req.user.email) {
        delete req.body.email; // Solo los roles administrativos pueden cambiar el email
      }

      // Verificar si están intentando actualizar el email
      if (req.body.email) {
        // Buscar el usuario que se está actualizando para verificar si el email es el mismo
        const usuarioActual = await Usuario.findById(req.params.id);

        if (!usuarioActual) {
          throw new ApiError(404, 'Usuario no encontrado');
        }

        // Solo verificar duplicados si el email está siendo cambiado
        if (usuarioActual.email !== req.body.email) {
          // Verificar si ya existe otro usuario con ese email en la misma escuela
          const emailExistente = await Usuario.findOne({
            email: req.body.email,
            escuelaId: req.user.escuelaId,
            _id: { $ne: req.params.id }, // Excluir el usuario actual de la búsqueda
          });

          if (emailExistente) {
            throw new ApiError(
              400,
              'El correo electrónico ya está en uso por otro usuario de esta escuela',
            );
          }
        }
      }

      // Permitir campos específicos para usuarios no administrativos
      let datosPermitidos: Record<string, unknown> = {};
      // Si el objetivo es un ADMIN: su tipo/estado previos, por si hay que revertir (último ADMIN activo)
      let adminAntes: { tipo: string; estado: string } | null = null;

      if (tieneRolAdministrativo && actualizandoPropioUsuario) {
        // Cuenta propia: datos personales (y email, como antes); nunca su propio tipo ni estado
        datosPermitidos = {
          nombre: req.body.nombre,
          apellidos: req.body.apellidos,
          email: req.body.email,
          ...perfilPorRutas(req.body.perfil),
        };
      } else if (tieneRolAdministrativo) {
        const usuarioObjetivo = await Usuario.findOne({
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        }).select('tipo estado');
        if (usuarioObjetivo?.tipo === 'ADMIN') {
          adminAntes = { tipo: usuarioObjetivo.tipo, estado: usuarioObjetivo.estado };
        }

        if (!usuarioObjetivo) {
          throw new ApiError(404, 'Usuario no encontrado');
        }

        // Jerarquía: solo usuarios de rango estrictamente inferior (ADMIN: todo menos SUPER_ADMIN).
        // Evita escalada lateral (p. ej. un COORDINADOR cambiando el email o el estado de un RECTOR).
        if (!puedeGestionarRol(req.user.tipo, usuarioObjetivo.tipo)) {
          throw new ApiError(403, 'No tienes permiso para modificar este perfil');
        }

        // Lista blanca: escuelaId, permisos, password, perfilRolId, fcmToken, etc. nunca se aceptan aquí
        const { nombre, apellidos, email, estado, perfil, tipo, info_academica } = req.body;
        datosPermitidos = { nombre, apellidos, email, estado };

        Object.assign(datosPermitidos, perfilPorRutas(perfil));

        // Cambiar el tipo de un usuario existente: SOLO ADMIN y SUPER_ADMIN (decisión de Aymer, auditoría 3.U).
        // RECTOR, COORDINADOR y ADMINISTRATIVO no cambian el tipo de nadie. Si llega igual al actual se
        // ignora: el formulario web siempre lo envía. SUPER_ADMIN como nuevo tipo lo bloquea la validación.
        if (tipo !== undefined && tipo !== usuarioObjetivo.tipo) {
          const puedeCambiarTipo = req.user.tipo === 'ADMIN' || req.user.tipo === 'SUPER_ADMIN';
          if (!puedeCambiarTipo || !puedeGestionarRol(req.user.tipo, tipo)) {
            throw new ApiError(403, 'No tienes permiso para cambiar el tipo de usuario');
          }
          datosPermitidos.tipo = tipo;
        }

        if (info_academica && typeof info_academica === 'object') {
          ['grado', 'grupo', 'codigo_estudiante'].forEach((campo) => {
            if (info_academica[campo] !== undefined) {
              datosPermitidos[`info_academica.${campo}`] = info_academica[campo];
            }
          });

          // Los estudiantes asociados deben ser ESTUDIANTES de la misma escuela
          if (Array.isArray(info_academica.estudiantes_asociados)) {
            // Acepta IDs o objetos poblados ({ _id }) según lo que envíe el cliente
            const idsUnicos = [
              ...new Set<string>(
                info_academica.estudiantes_asociados.map((item: any) =>
                  String(item && typeof item === 'object' ? item._id : item),
                ),
              ),
            ];
            if (idsUnicos.some((id) => !mongoose.isValidObjectId(id))) {
              throw new ApiError(400, 'ID de estudiante asociado no válido');
            }
            const validos = await Usuario.countDocuments({
              _id: { $in: idsUnicos },
              tipo: 'ESTUDIANTE',
              escuelaId: req.user.escuelaId,
            });
            if (validos !== idsUnicos.length) {
              throw new ApiError(400, 'Hay estudiantes asociados que no son válidos para esta escuela');
            }
            datosPermitidos['info_academica.estudiantes_asociados'] = idsUnicos;
          }
        }
      } else {
        // Usuarios normales solo pueden actualizar campos específicos
        datosPermitidos = {
          nombre: req.body.nombre,
          apellidos: req.body.apellidos,
          ...perfilPorRutas(req.body.perfil), // Incluye el teléfono (sin borrar dirección/foto)
        };
      }

      const usuario = await Usuario.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        datosPermitidos,
        { new: true, runValidators: true },
      ).select('-password');

      if (!usuario) {
        throw new ApiError(404, 'Usuario no encontrado');
      }

      // Último ADMIN activo (extra auditoría 3.T): si el cambio deja al colegio sin ningún ADMIN ACTIVO se
      // revierte y responde 409. Re-chequeo DESPUÉS de escribir: con dos cambios simultáneos al menos uno
      // se revierte, así nunca quedan los dos aplicados.
      if (adminAntes && (usuario.tipo !== 'ADMIN' || usuario.estado !== 'ACTIVO') && !(await quedaAdminActivo(req.user.escuelaId))) {
        await Usuario.updateOne({ _id: usuario._id }, { $set: adminAntes });
        throw new ApiError(409, 'No se puede dejar al colegio sin ningún administrador activo');
      }

      res.json({
        success: true,
        data: usuario,
      });
    } catch (error) {
      next(error);
    }
  }

  async buscarUsuarios(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const searchTerm = req.query.q as string;
      const filter = {
        escuelaId: req.user.escuelaId,
        $or: [
          { nombre: new RegExp(escapeRegex(searchTerm), 'i') },
          { apellidos: new RegExp(escapeRegex(searchTerm), 'i') },
          { email: new RegExp(escapeRegex(searchTerm), 'i') },
        ],
      };

      const usuarios = await Usuario.find(filter).select('-password').limit(10);

      res.json({
        success: true,
        data: usuarios,
      });
    } catch (error) {
      next(error);
    }
  }

  async cambiarPassword(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { passwordActual, nuevaPassword } = req.body;
      const usuario = await Usuario.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!usuario) {
        throw new ApiError(404, 'Usuario no encontrado');
      }

      const isPasswordMatch = await usuario.compararPassword(passwordActual);
      if (!isPasswordMatch) {
        throw new ApiError(400, 'La contraseña actual es incorrecta');
      }

      usuario.password = nuevaPassword;
      await usuario.save();

      res.json({
        success: true,
        message: 'Contraseña actualizada exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /usuarios/me/preferencias (Fase 4.5): preferencia de correo del usuario autenticado.
   * Si nunca la eligió, se devuelve la de su rol (ACUDIENTE → resumen; resto → inmediato).
   */
  async obtenerPreferencias(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ApiError(401, 'No autorizado');
      const usuario: any = await Usuario.findById(req.user._id).select('tipo preferencias').lean();
      if (!usuario) throw new ApiError(404, 'Usuario no encontrado');
      res.json({
        success: true,
        data: {
          email: preferenciaEmail(usuario),
          porDefecto: !usuario.preferencias?.email,
          opciones: PREFERENCIAS_EMAIL,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /usuarios/me/preferencias (Fase 4.5): cambia la preferencia de correo del usuario autenticado.
   * Prioridad ALTA, alertas y correos de cuenta salen siempre, sin importar la preferencia.
   */
  async actualizarPreferencias(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ApiError(401, 'No autorizado');
      const { email } = req.body;
      const r = await Usuario.updateOne({ _id: req.user._id }, { $set: { 'preferencias.email': email } });
      if (r.matchedCount === 0) throw new ApiError(404, 'Usuario no encontrado');
      res.json({
        success: true,
        data: { email, porDefecto: false, opciones: PREFERENCIAS_EMAIL },
        message: 'Preferencia de correo actualizada',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Solicitud de eliminación de cuenta (autoservicio desde la app móvil).
   * Requisito de Apple/Google: el usuario debe poder iniciar la eliminación
   * de su propia cuenta desde dentro de la app.
   *
   * Flujo: confirma identidad con la contraseña, desactiva la cuenta de
   * inmediato (bloquea el login), registra la solicitud y notifica a los
   * administradores de la escuela para que procesen el borrado definitivo
   * (los registros académicos pertenecen a la institución).
   */
  async solicitarEliminacionCuenta(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { password, motivo } = req.body;

      if (!password) {
        throw new ApiError(400, 'La contraseña es requerida para eliminar la cuenta');
      }

      // Cuentas sin colegio (SUPER_ADMIN con escuelaId '') no pasan por este flujo: antes daba 500 (CastError)
      if (!mongoose.isValidObjectId(req.user.escuelaId)) {
        throw new ApiError(403, 'Esta cuenta no pertenece a un colegio; su eliminación se gestiona con soporte');
      }

      // El usuario solo puede eliminar su PROPIA cuenta
      const usuario = await Usuario.findOne({
        _id: req.user._id,
        escuelaId: req.user.escuelaId,
      });

      if (!usuario) {
        throw new ApiError(404, 'Usuario no encontrado');
      }

      // Confirmar identidad con la contraseña
      const isPasswordMatch = await usuario.compararPassword(password);
      if (!isPasswordMatch) {
        throw new ApiError(400, 'La contraseña es incorrecta');
      }

      // Último ADMIN activo (extra auditoría 3.T): el único ADMIN no puede desactivar su propia cuenta
      if (
        usuario.tipo === 'ADMIN' &&
        !(await Usuario.exists({
          escuelaId: req.user.escuelaId,
          tipo: 'ADMIN',
          estado: 'ACTIVO',
          _id: { $ne: usuario._id },
        }))
      ) {
        throw new ApiError(409, 'Eres el único administrador activo del colegio; asigna otro antes de eliminar tu cuenta');
      }

      // Estado previo, por si hay que revertir (auditoría 4.M)
      const previo = {
        estado: usuario.estado,
        fcmToken: usuario.get('fcmToken') ?? null,
        fcmTokens: (usuario.get('fcmTokens') || []).map((t: any) => (t?.toObject ? t.toObject() : t)),
        eliminacionCuenta: (usuario.get('eliminacionCuenta') as any)?.toObject?.() ?? usuario.get('eliminacionCuenta'),
      };

      // Desactivar de inmediato (bloquea el login), limpiar token push
      // y registrar la solicitud de eliminación
      usuario.estado = 'INACTIVO';
      usuario.set('fcmToken', null);
      usuario.set('fcmTokens', []); // Fase 4.3: todos los dispositivos
      usuario.set('eliminacionCuenta', {
        solicitada: true,
        fecha: new Date(),
        motivo: motivo || undefined,
      });
      await usuario.save();

      // Auditoría 4.M: dos ADMIN pidiendo la eliminación a la vez pasaban ambos el control de arriba (cada uno veía
      // al otro activo). Se re-verifica ya guardado: si no queda otro ADMIN activo, se revierte esta cuenta → 409.
      if (
        usuario.tipo === 'ADMIN' &&
        !(await Usuario.exists({
          escuelaId: req.user.escuelaId,
          tipo: 'ADMIN',
          estado: 'ACTIVO',
          _id: { $ne: usuario._id },
        }))
      ) {
        await Usuario.updateOne(
          { _id: usuario._id },
          previo.eliminacionCuenta
            ? { $set: { estado: previo.estado, fcmToken: previo.fcmToken, fcmTokens: previo.fcmTokens, eliminacionCuenta: previo.eliminacionCuenta } }
            : { $set: { estado: previo.estado, fcmToken: previo.fcmToken, fcmTokens: previo.fcmTokens }, $unset: { eliminacionCuenta: '' } },
        );
        throw new ApiError(409, 'Eres el único administrador activo del colegio; asigna otro antes de eliminar tu cuenta');
      }

      // Notificar a los administradores de la escuela (no bloquea la solicitud)
      try {
        const admins = await Usuario.find({
          escuelaId: req.user.escuelaId,
          tipo: { $in: ['ADMIN', 'RECTOR', 'COORDINADOR'] },
          estado: 'ACTIVO',
        }).select('_id');

        if (admins.length > 0) {
          await notificacionService.crearNotificacionMasiva({
            usuarioIds: admins.map((a) => String(a._id)),
            titulo: 'Solicitud de eliminación de cuenta',
            mensaje: `${usuario.nombre} ${usuario.apellidos} (${usuario.email}) solicitó eliminar su cuenta y fue desactivado.${
              motivo ? ` Motivo: ${motivo}` : ''
            }`,
            tipo: TipoNotificacion.SISTEMA,
            escuelaId: req.user.escuelaId,
            entidadId: String(usuario._id),
            entidadTipo: 'Usuario',
            enviarEmail: true,
          });
        }
      } catch (notifError) {
        console.error('Error notificando solicitud de eliminación a admins:', notifError);
      }

      res.json({
        success: true,
        message:
          'Solicitud de eliminación registrada. Tu cuenta ha sido desactivada y será eliminada por el colegio.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reenvía el enlace para definir contraseña (auditoría 4.P). Mismo colegio (salvo SUPER_ADMIN), rango inferior
   * (puedeGestionarRol) y usuario ACTIVO. ESTUDIANTE → el enlace va a sus acudientes activos con correo real.
   */
  async reenviarEnlacePassword(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }
      const esSuperAdmin = req.user.tipo === 'SUPER_ADMIN';
      if (!esSuperAdmin && !mongoose.isValidObjectId(req.user.escuelaId)) {
        throw new ApiError(403, 'No tiene permisos para esta acción');
      }
      const objetivo: any = await Usuario.findOne({
        _id: req.params.id,
        ...(!esSuperAdmin && { escuelaId: req.user.escuelaId }),
        estado: 'ACTIVO',
      })
        .select('_id tipo email escuelaId')
        .lean();
      if (!objetivo) {
        throw new ApiError(404, 'Usuario no encontrado');
      }
      if (!puedeGestionarRol(req.user.tipo, objetivo.tipo)) {
        throw new ApiError(403, 'No tiene permisos para gestionar usuarios de este rol');
      }

      let enviarA: string[] = [];
      if (objetivo.tipo === 'ESTUDIANTE') {
        const acudientes = await Usuario.find({
          escuelaId: objetivo.escuelaId,
          tipo: 'ACUDIENTE',
          estado: 'ACTIVO',
          'info_academica.estudiantes_asociados': objetivo._id,
        })
          .select('_id email')
          .lean();
        enviarA = acudientes.filter((a: any) => a.email && !esEmailFicticio(a.email)).map((a: any) => String(a._id));
        if (enviarA.length === 0) {
          throw new ApiError(409, 'El estudiante no tiene acudientes activos con correo para enviarle el enlace');
        }
      } else {
        if (!objetivo.email || esEmailFicticio(objetivo.email)) {
          throw new ApiError(409, 'El usuario no tiene un correo real para enviarle el enlace');
        }
        enviarA = [String(objetivo._id)];
      }

      let encolados = 0;
      try {
        encolados = await encolarCorreoCuenta({
          tipo: 'definir',
          usuarioId: String(objetivo._id),
          enviarA,
          escuelaId: String(objetivo.escuelaId),
        });
      } catch (errorCola) {
        console.error('[Usuarios] No se pudo encolar el reenvío del enlace:', errorCola);
        throw new ApiError(503, 'No se pudo enviar el enlace en este momento; intente de nuevo');
      }
      // Auditoría 4.U: un reenvío por usuario cada 5 minutos (claveUnica por ventana)
      if (encolados === 0) {
        throw new ApiError(429, 'Ya se envió un enlace hace menos de 5 minutos');
      }

      res.json({
        success: true,
        data: { destinatarios: enviarA.length },
        message:
          objetivo.tipo === 'ESTUDIANTE'
            ? 'El enlace para definir la contraseña se envió a los acudientes del estudiante'
            : 'El enlace para definir la contraseña se envió al correo del usuario',
      });
    } catch (error) {
      next(error);
    }
  }

  async eliminarUsuario(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Roles administrativos (incluye ADMINISTRATIVO, coherente con PUT); la jerarquía se valida abajo
      if (!esRolAdministrativo(req.user.tipo)) {
        throw new ApiError(403, 'No tienes permiso para eliminar usuarios');
      }

      if (!mongoose.isValidObjectId(req.params.id)) {
        throw new ApiError(400, 'ID de usuario inválido');
      }

      // Nadie se desactiva a sí mismo por esta ruta (auditoría 3.T)
      if (String(req.params.id) === String(req.user._id)) {
        throw new ApiError(403, 'No puedes desactivar tu propia cuenta');
      }

      const objetivo = await Usuario.findOne({ _id: req.params.id, escuelaId: req.user.escuelaId })
        .select('tipo estado')
        .lean();

      if (!objetivo) {
        throw new ApiError(404, 'Usuario no encontrado');
      }

      // Jerarquía 3.B: solo usuarios de rango estrictamente inferior (ADMIN: todo menos SUPER_ADMIN).
      // Antes un COORDINADOR podía desactivar a un RECTOR o a un ADMIN (auditoría 3.T)
      if (!puedeGestionarRol(req.user.tipo, objetivo.tipo)) {
        throw new ApiError(403, 'No tienes permiso para desactivar este usuario');
      }

      const usuario = await Usuario.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        { estado: 'INACTIVO' },
        { new: true },
      );

      if (!usuario) {
        throw new ApiError(404, 'Usuario no encontrado');
      }

      // Último ADMIN activo (extra auditoría 3.T): re-chequeo después de escribir; si el colegio quedó sin
      // ningún ADMIN ACTIVO se revierte → 409 (dos ADMIN desactivándose mutuamente: al menos uno se revierte)
      if (objetivo.tipo === 'ADMIN' && !(await quedaAdminActivo(req.user.escuelaId))) {
        await Usuario.updateOne({ _id: usuario._id }, { $set: { estado: objetivo.estado } });
        throw new ApiError(409, 'No se puede desactivar al último administrador activo del colegio');
      }

      res.json({
        success: true,
        message: 'Usuario desactivado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  // -------- Métodos para la gestión de estudiantes asociados --------

  async obtenerEstudiantesAsociados(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar si el usuario existe
      const acudiente = await Usuario.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!acudiente) {
        throw new ApiError(404, 'Acudiente no encontrado');
      }

      // Verificar que sea un acudiente
      if (acudiente.tipo !== 'ACUDIENTE') {
        throw new ApiError(400, 'El usuario no es un acudiente');
      }

      // Obtener los IDs de estudiantes asociados
      const estudiantesIds = acudiente.info_academica?.estudiantes_asociados || [];

      // Buscar los estudiantes completos
      const estudiantes = await Usuario.find({
        _id: { $in: estudiantesIds },
        escuelaId: req.user.escuelaId,
      }).select('_id nombre apellidos email');

      res.json({
        success: true,
        data: estudiantes,
      });
    } catch (error) {
      next(error);
    }
  }

  async asociarEstudiante(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { estudianteId } = req.body;

      if (!estudianteId) {
        throw new ApiError(400, 'ID de estudiante requerido');
      }

      // Verificar si el acudiente existe y es tipo ACUDIENTE
      const acudiente = await Usuario.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!acudiente) {
        throw new ApiError(404, 'Acudiente no encontrado');
      }

      if (acudiente.tipo !== 'ACUDIENTE') {
        throw new ApiError(400, 'El usuario no es un acudiente');
      }

      // Verificar si el estudiante existe y es tipo ESTUDIANTE
      const estudiante = await Usuario.findOne({
        _id: estudianteId,
        tipo: 'ESTUDIANTE',
        escuelaId: req.user.escuelaId,
      });

      if (!estudiante) {
        throw new ApiError(404, 'Estudiante no encontrado');
      }

      // Verificar si el estudiante ya está asociado
      const estudiantesAsociados = acudiente.info_academica?.estudiantes_asociados || [];

      if (estudiantesAsociados.some((id) => id.toString() === estudianteId)) {
        throw new ApiError(400, 'El estudiante ya está asociado a este acudiente');
      }

      // Preparar la actualización basada en si info_academica ya existe
      let actualizacion;

      if (acudiente.info_academica) {
        // Si info_academica ya existe, usa $push para añadir a la lista existente
        actualizacion = await Usuario.findOneAndUpdate(
          { _id: req.params.id, escuelaId: req.user.escuelaId },
          { $push: { 'info_academica.estudiantes_asociados': estudianteId } },
          { new: true },
        );
      } else {
        // Si info_academica no existe, inicialízala con un array que contenga el estudianteId
        actualizacion = await Usuario.findOneAndUpdate(
          { _id: req.params.id, escuelaId: req.user.escuelaId },
          {
            $set: {
              info_academica: {
                estudiantes_asociados: [estudianteId],
              },
            },
          },
          { new: true },
        );
      }

      res.json({
        success: true,
        message: 'Estudiante asociado exitosamente',
        data: actualizacion,
      });
    } catch (error) {
      next(error);
    }
  }

  async eliminarAsociacionEstudiante(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const acudienteId = req.params.id;
      const estudianteId = req.params.estudianteId;

      // Verificar si el acudiente existe
      const acudiente = await Usuario.findOne({
        _id: acudienteId,
        escuelaId: req.user.escuelaId,
      });

      if (!acudiente) {
        throw new ApiError(404, 'Acudiente no encontrado');
      }

      if (acudiente.tipo !== 'ACUDIENTE') {
        throw new ApiError(400, 'El usuario no es un acudiente');
      }

      // Verificar si el estudiante está asociado
      if (
        !acudiente.info_academica?.estudiantes_asociados?.some(
          (id) => id.toString() === estudianteId,
        )
      ) {
        throw new ApiError(404, 'El estudiante no está asociado a este acudiente');
      }

      // Eliminar el estudiante de la lista de asociados
      await Usuario.findOneAndUpdate(
        { _id: acudienteId, escuelaId: req.user.escuelaId },
        { $pull: { 'info_academica.estudiantes_asociados': estudianteId } },
      );

      res.json({
        success: true,
        message: 'Asociación eliminada exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new UsuarioController();