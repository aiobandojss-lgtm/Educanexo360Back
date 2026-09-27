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
exports.ORDEN_PRIORIDAD = void 0;
const mongoose_1 = __importStar(require("mongoose"));
exports.ORDEN_PRIORIDAD = { critica: 0, alta: 1, normal: 2 };
const OutboxSchema = new mongoose_1.Schema({
    tipo: { type: String, required: true },
    prioridad: { type: String, enum: ['critica', 'alta', 'normal'], default: 'normal' },
    orden: { type: Number, default: 2 },
    payload: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    estado: {
        type: String,
        enum: ['PENDIENTE', 'PROCESANDO', 'HECHO', 'FALLIDO'],
        default: 'PENDIENTE',
    },
    intentos: { type: Number, default: 0 },
    nextRunAt: { type: Date, default: Date.now },
    lockedUntil: { type: Date },
    error: { type: String },
    escuelaId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Escuela' },
    claveUnica: { type: String },
    enviados: { type: [String], default: [] },
    expireAt: { type: Date },
}, { timestamps: true, collection: 'outbox', minimize: false });
OutboxSchema.index({ estado: 1, orden: 1, nextRunAt: 1 });
OutboxSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
OutboxSchema.index({ claveUnica: 1 }, { unique: true, partialFilterExpression: { claveUnica: { $type: 'string' } } });
exports.default = mongoose_1.default.model('Outbox', OutboxSchema);
//# sourceMappingURL=outbox.model.js.map