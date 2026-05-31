"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EstadoNotificacion = exports.TipoNotificacion = void 0;
var TipoNotificacion;
(function (TipoNotificacion) {
    TipoNotificacion["MENSAJE"] = "MENSAJE";
    TipoNotificacion["CALIFICACION"] = "CALIFICACION";
    TipoNotificacion["SISTEMA"] = "SISTEMA";
    TipoNotificacion["EVENTO"] = "EVENTO";
    TipoNotificacion["ALERTA_ASISTENCIA"] = "ALERTA_ASISTENCIA";
})(TipoNotificacion || (exports.TipoNotificacion = TipoNotificacion = {}));
var EstadoNotificacion;
(function (EstadoNotificacion) {
    EstadoNotificacion["PENDIENTE"] = "PENDIENTE";
    EstadoNotificacion["LEIDA"] = "LEIDA";
    EstadoNotificacion["ARCHIVADA"] = "ARCHIVADA";
})(EstadoNotificacion || (exports.EstadoNotificacion = EstadoNotificacion = {}));
//# sourceMappingURL=INotificacion.js.map