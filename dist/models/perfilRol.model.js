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
const permissions_1 = require("../constants/permissions");
const PerfilRolSchema = new mongoose_1.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
    },
    descripcion: {
        type: String,
        trim: true,
        maxlength: 500,
    },
    rolBase: {
        type: String,
        enum: ['DOCENTE', 'COORDINADOR', 'RECTOR', 'ADMINISTRATIVO', 'ACUDIENTE', 'ESTUDIANTE'],
        required: true,
    },
    permisos: {
        type: [String],
        enum: permissions_1.ALL_PERMISSIONS,
        default: [],
    },
    escuelaId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Escuela',
        required: true,
        index: true,
    },
    activo: {
        type: Boolean,
        default: true,
    },
    creadoPor: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true,
    },
}, { timestamps: true });
PerfilRolSchema.index({ escuelaId: 1, nombre: 1 }, { unique: true });
const PerfilRol = mongoose_1.default.model('PerfilRol', PerfilRolSchema);
exports.default = PerfilRol;
//# sourceMappingURL=perfilRol.model.js.map