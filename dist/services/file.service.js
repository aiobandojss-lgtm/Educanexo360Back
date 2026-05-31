"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mongoose_1 = __importDefault(require("mongoose"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const gridfs_1 = __importDefault(require("../config/gridfs"));
class FileService {
    async processFiles(req, userId, entityId, entityType = 'anuncio') {
        const adjuntos = [];
        let imagenPortada;
        const errors = [];
        if (!req.files ||
            (Array.isArray(req.files) && req.files.length === 0) ||
            (!Array.isArray(req.files) && Object.keys(req.files).length === 0)) {
            return { adjuntos, imagenPortada, errors };
        }
        try {
            const bucket = gridfs_1.default.getBucket();
            if (!bucket) {
                throw new ApiError_1.default(500, 'Servicio de archivos no disponible');
            }
            const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
            const totalSize = files.reduce((sum, file) => sum + file.size, 0);
            const MAX_TOTAL_SIZE = 15 * 1024 * 1024;
            if (totalSize > MAX_TOTAL_SIZE) {
                throw new ApiError_1.default(400, `El tamaño total de los archivos no puede superar los 15MB (tamaño actual: ${(totalSize /
                    (1024 * 1024)).toFixed(2)}MB)`);
            }
            for (const file of files) {
                const esImagenPortada = file.fieldname === 'imagenPortada';
                try {
                    const filename = file.filename || path_1.default.basename(file.path);
                    const uploadStream = bucket.openUploadStream(filename, {
                        metadata: {
                            originalName: file.originalname,
                            contentType: file.mimetype,
                            size: file.size,
                            uploadedBy: userId,
                            esImagenPortada,
                        },
                    });
                    const fileContent = fs_1.default.readFileSync(file.path);
                    uploadStream.write(fileContent);
                    uploadStream.end();
                    if (esImagenPortada) {
                        const url = entityId
                            ? `/api/${entityType}s/${entityId}/imagen/${uploadStream.id}`
                            : `/api/${entityType}s/temp/imagen/${uploadStream.id}`;
                        imagenPortada = {
                            fileId: uploadStream.id,
                            url,
                        };
                    }
                    else {
                        adjuntos.push({
                            fileId: uploadStream.id,
                            nombre: file.originalname,
                            tipo: file.mimetype,
                            tamaño: file.size,
                            fechaSubida: new Date(),
                        });
                    }
                    try {
                        fs_1.default.unlinkSync(file.path);
                    }
                    catch (error) {
                        console.error('Error eliminando archivo temporal:', error);
                    }
                }
                catch (error) {
                    errors.push(`Error procesando archivo ${file.originalname}: ${error}`);
                    console.error(`Error procesando archivo ${file.originalname}:`, error);
                }
            }
        }
        catch (error) {
            if (error instanceof ApiError_1.default) {
                throw error;
            }
            throw new ApiError_1.default(500, `Error procesando archivos: ${error}`);
        }
        return { adjuntos, imagenPortada, errors };
    }
    async deleteFile(fileId) {
        try {
            const bucket = gridfs_1.default.getBucket();
            if (!bucket) {
                throw new ApiError_1.default(500, 'Servicio de archivos no disponible');
            }
            const id = typeof fileId === 'string' ? new mongoose_1.default.Types.ObjectId(fileId) : fileId;
            await bucket.delete(id);
            return true;
        }
        catch (error) {
            console.error(`Error eliminando archivo ${fileId}:`, error);
            return false;
        }
    }
}
exports.default = new FileService();
//# sourceMappingURL=file.service.js.map