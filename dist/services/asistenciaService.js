"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const instance = axios_1.default.create({
    baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api',
    headers: {
        'Content-Type': 'application/json',
    },
});
instance.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));
class AsistenciaService {
    async crearAsistencia(data) {
        try {
            const response = await instance.post('/asistencia', data);
            return response.data;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async obtenerAsistencias(params = {}) {
        try {
            const response = await instance.get('/asistencia', { params });
            return response.data;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async obtenerAsistenciaPorId(id) {
        try {
            const response = await instance.get(`/asistencia/${id}`);
            return response.data;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async actualizarAsistencia(id, data) {
        try {
            const response = await instance.put(`/asistencia/${id}`, data);
            return response.data;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async finalizarAsistencia(id) {
        try {
            const response = await instance.patch(`/asistencia/${id}/finalizar`);
            return response.data;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async eliminarAsistencia(id) {
        try {
            const response = await instance.delete(`/asistencia/${id}`);
            return response.data;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async obtenerAsistenciaDia(fecha, cursoId, asignaturaId) {
        try {
            const params = { fecha, cursoId, ...(asignaturaId && { asignaturaId }) };
            const response = await instance.get('/asistencia/dia', { params });
            return response.data;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async obtenerEstadisticasCurso(cursoId, desde, hasta, asignaturaId) {
        try {
            const params = {
                ...(desde && { desde }),
                ...(hasta && { hasta }),
                ...(asignaturaId && { asignaturaId }),
            };
            const response = await instance.get(`/asistencia/estadisticas/curso/${cursoId}`, { params });
            return response.data;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async obtenerEstadisticasEstudiante(estudianteId, desde, hasta, cursoId, asignaturaId) {
        try {
            const params = {
                ...(desde && { desde }),
                ...(hasta && { hasta }),
                ...(cursoId && { cursoId }),
                ...(asignaturaId && { asignaturaId }),
            };
            const response = await instance.get(`/asistencia/estadisticas/estudiante/${estudianteId}`, {
                params,
            });
            return response.data;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async obtenerResumenPeriodo(periodoId, cursoId) {
        try {
            const response = await instance.get(`/asistencia/resumen/periodo/${periodoId}`, {
                params: { cursoId },
            });
            return response.data;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    handleError(error) {
        if (error.response) {
            return {
                success: false,
                status: error.response.status,
                message: error.response.data.message || 'Error en la solicitud',
                error: error.response.data,
            };
        }
        else if (error.request) {
            return {
                success: false,
                message: 'No se recibió respuesta del servidor',
                error: error.request,
            };
        }
        else {
            return {
                success: false,
                message: 'Error al realizar la solicitud',
                error: error.message,
            };
        }
    }
}
exports.default = new AsistenciaService();
//# sourceMappingURL=asistenciaService.js.map