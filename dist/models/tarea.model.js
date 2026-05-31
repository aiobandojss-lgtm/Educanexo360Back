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
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const ArchivoSchema = new mongoose_1.Schema({
    fileId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
    },
    nombre: {
        type: String,
        required: true,
    },
    tipo: {
        type: String,
        required: true,
    },
    tamaño: {
        type: Number,
        required: true,
    },
    fechaSubida: {
        type: Date,
        default: Date.now,
    },
});
const VistaSchema = new mongoose_1.Schema({
    estudianteId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true,
    },
    fechaVista: {
        type: Date,
        default: Date.now,
    },
});
const EntregaSchema = new mongoose_1.Schema({
    estudianteId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true,
    },
    fechaEntrega: {
        type: Date,
    },
    estado: {
        type: String,
        enum: ['PENDIENTE', 'VISTA', 'ENTREGADA', 'ATRASADA', 'CALIFICADA'],
        default: 'PENDIENTE',
    },
    archivos: [ArchivoSchema],
    comentarioEstudiante: {
        type: String,
        trim: true,
    },
    calificacion: {
        type: Number,
        min: 0,
    },
    comentarioDocente: {
        type: String,
        trim: true,
    },
    fechaCalificacion: {
        type: Date,
    },
    intentos: {
        type: Number,
        default: 0,
    },
});
const TareaSchema = new mongoose_1.Schema({
    titulo: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200,
    },
    descripcion: {
        type: String,
        required: true,
        trim: true,
    },
    docenteId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true,
        index: true,
    },
    asignaturaId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Asignatura',
        required: true,
        index: true,
    },
    cursoId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Curso',
        required: true,
        index: true,
    },
    estudiantesIds: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'Usuario',
        },
    ],
    fechaAsignacion: {
        type: Date,
        default: Date.now,
    },
    fechaLimite: {
        type: Date,
        required: true,
        index: true,
    },
    tipo: {
        type: String,
        enum: ['INDIVIDUAL', 'GRUPAL'],
        default: 'INDIVIDUAL',
    },
    prioridad: {
        type: String,
        enum: ['ALTA', 'MEDIA', 'BAJA'],
        default: 'MEDIA',
    },
    permiteTardias: {
        type: Boolean,
        default: true,
    },
    calificacionMaxima: {
        type: Number,
        required: true,
        min: 1,
        max: 10,
    },
    pesoEvaluacion: {
        type: Number,
        min: 0,
        max: 100,
    },
    archivosReferencia: [ArchivoSchema],
    vistas: [VistaSchema],
    entregas: [EntregaSchema],
    estado: {
        type: String,
        enum: ['ACTIVA', 'CERRADA', 'CANCELADA'],
        default: 'ACTIVA',
    },
    escuelaId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Escuela',
        required: true,
        index: true,
    },
}, {
    timestamps: true,
});
TareaSchema.index({ escuelaId: 1, estado: 1, fechaLimite: -1 });
TareaSchema.index({ docenteId: 1, estado: 1 });
TareaSchema.index({ cursoId: 1, fechaLimite: -1 });
TareaSchema.index({ 'entregas.estudianteId': 1 });
TareaSchema.methods.actualizarEstadosEntregas = function () {
    const ahora = new Date();
    const fechaLimite = this.fechaLimite;
    this.entregas.forEach((entrega) => {
        if (entrega.estado === 'CALIFICADA') {
            return;
        }
        if (entrega.estado === 'ENTREGADA' && entrega.fechaEntrega && entrega.fechaEntrega > fechaLimite) {
            entrega.estado = 'ATRASADA';
        }
        if ((entrega.estado === 'PENDIENTE' || entrega.estado === 'VISTA') &&
            ahora > fechaLimite &&
            !entrega.fechaEntrega) {
            entrega.estado = 'ATRASADA';
        }
    });
};
TareaSchema.methods.obtenerEstadisticas = function () {
    const totalEstudiantes = this.entregas.length;
    const entregadas = this.entregas.filter((e) => e.fechaEntrega).length;
    const pendientes = this.entregas.filter((e) => e.estado === 'PENDIENTE' || e.estado === 'VISTA').length;
    const atrasadas = this.entregas.filter((e) => e.estado === 'ATRASADA').length;
    const calificadas = this.entregas.filter((e) => e.estado === 'CALIFICADA').length;
    const calificaciones = this.entregas
        .filter((e) => e.calificacion !== undefined && e.calificacion !== null)
        .map((e) => e.calificacion);
    const promedioCalificacion = calificaciones.length > 0
        ? calificaciones.reduce((a, b) => a + b, 0) / calificaciones.length
        : undefined;
    return {
        totalEstudiantes,
        entregadas,
        pendientes,
        atrasadas,
        calificadas,
        promedioCalificacion,
        porcentajeEntrega: totalEstudiantes > 0 ? (entregadas / totalEstudiantes) * 100 : 0,
    };
};
exports.default = mongoose_1.default.model('Tarea', TareaSchema);
//# sourceMappingURL=tarea.model.js.map