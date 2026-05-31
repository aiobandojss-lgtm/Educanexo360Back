"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSystem = exports.checkSystemStatus = void 0;
const escuela_model_1 = __importDefault(require("../models/escuela.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const mongoose_1 = __importDefault(require("mongoose"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const checkSystemStatus = async (req, res, next) => {
    try {
        const schoolCount = await escuela_model_1.default.countDocuments();
        const hasSchools = schoolCount > 0;
        const adminCount = await usuario_model_1.default.countDocuments({ tipo: 'ADMIN' });
        const hasAdmins = adminCount > 0;
        const initialized = hasSchools && hasAdmins;
        res.status(200).json({
            success: true,
            data: {
                initialized,
            },
        });
    }
    catch (error) {
        console.error('Error en checkSystemStatus:', error);
        next(error);
    }
};
exports.checkSystemStatus = checkSystemStatus;
const initializeSystem = async (req, res, next) => {
    let session = null;
    try {
        const setupToken = process.env.SYSTEM_SETUP_TOKEN;
        if (!setupToken) {
            throw new ApiError_1.default(403, 'Este endpoint no está disponible en este ambiente');
        }
        if (req.headers['x-setup-token'] !== setupToken) {
            throw new ApiError_1.default(403, 'Token de inicialización inválido');
        }
        const schoolCount = await escuela_model_1.default.countDocuments();
        const adminCount = await usuario_model_1.default.countDocuments({ tipo: 'ADMIN' });
        if (schoolCount > 0 || adminCount > 0) {
            throw new ApiError_1.default(400, 'El sistema ya ha sido inicializado');
        }
        session = await mongoose_1.default.startSession();
        session.startTransaction();
        const { escuela, admin } = req.body;
        if (!escuela.codigo) {
            throw new ApiError_1.default(400, 'El código de la escuela es requerido');
        }
        try {
            const periodos = [];
            const numPeriodos = escuela.configuracion.periodos_academicos || 4;
            for (let i = 0; i < numPeriodos; i++) {
                const startDate = new Date();
                startDate.setMonth(startDate.getMonth() + i * 3);
                const endDate = new Date(startDate);
                endDate.setMonth(endDate.getMonth() + 3);
                periodos.push({
                    numero: i + 1,
                    nombre: `Periodo ${i + 1}`,
                    fecha_inicio: startDate,
                    fecha_fin: endDate,
                });
            }
            const escuelaData = {
                nombre: escuela.nombre,
                codigo: escuela.codigo,
                direccion: escuela.direccion,
                telefono: escuela.telefono,
                email: escuela.email,
                estado: 'ACTIVO',
                configuracion: {
                    periodos_academicos: escuela.configuracion.periodos_academicos,
                    escala_calificacion: {
                        minima: escuela.configuracion.escala_calificacion.minima,
                        maxima: escuela.configuracion.escala_calificacion.maxima,
                    },
                    logros_por_periodo: 3,
                },
                periodos_academicos: periodos,
            };
            const newEscuela = new escuela_model_1.default(escuelaData);
            await newEscuela.save({ session });
        }
        catch (error) {
            console.error('Error al crear la escuela:', error);
            throw error;
        }
        const savedEscuela = await escuela_model_1.default.findOne({}, null, { session });
        if (!savedEscuela) {
            throw new Error('No se pudo crear la escuela');
        }
        let savedAdmin;
        try {
            const newAdmin = new usuario_model_1.default({
                ...admin,
                tipo: 'ADMIN',
                estado: 'ACTIVO',
                escuelaId: savedEscuela._id,
            });
            savedAdmin = await newAdmin.save({ session });
        }
        catch (error) {
            console.error('Error al crear el administrador:', error);
            throw error;
        }
        await session.commitTransaction();
        session.endSession();
        res.status(201).json({
            success: true,
            message: 'Sistema inicializado correctamente',
            data: {
                escuela: {
                    _id: savedEscuela._id,
                    nombre: savedEscuela.nombre,
                    codigo: escuela.codigo,
                    email: savedEscuela.email,
                },
                admin: {
                    _id: savedAdmin._id,
                    nombre: savedAdmin.nombre,
                    apellidos: savedAdmin.apellidos,
                    email: savedAdmin.email,
                    tipo: savedAdmin.tipo,
                },
            },
        });
    }
    catch (error) {
        console.error('Error en initializeSystem:', error);
        if (session) {
            try {
                await session.abortTransaction();
                session.endSession();
            }
            catch (sessionError) {
                console.error('Error al abortar la transacción:', sessionError);
            }
        }
        if (error instanceof ApiError_1.default) {
            next(error);
        }
        else {
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
            next(new ApiError_1.default(500, `Error al inicializar el sistema: ${errorMessage}`));
        }
    }
};
exports.initializeSystem = initializeSystem;
//# sourceMappingURL=system.controller.js.map