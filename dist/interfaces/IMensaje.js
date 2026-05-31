"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrioridadMensaje = exports.EstadoMensaje = exports.TipoMensaje = void 0;
var TipoMensaje;
(function (TipoMensaje) {
    TipoMensaje["INDIVIDUAL"] = "INDIVIDUAL";
    TipoMensaje["GRUPAL"] = "GRUPAL";
    TipoMensaje["INSTITUCIONAL"] = "INSTITUCIONAL";
    TipoMensaje["BORRADOR"] = "BORRADOR";
})(TipoMensaje || (exports.TipoMensaje = TipoMensaje = {}));
var EstadoMensaje;
(function (EstadoMensaje) {
    EstadoMensaje["ENVIADO"] = "ENVIADO";
    EstadoMensaje["BORRADOR"] = "BORRADOR";
    EstadoMensaje["ARCHIVADO"] = "ARCHIVADO";
    EstadoMensaje["ELIMINADO"] = "ELIMINADO";
})(EstadoMensaje || (exports.EstadoMensaje = EstadoMensaje = {}));
var PrioridadMensaje;
(function (PrioridadMensaje) {
    PrioridadMensaje["ALTA"] = "ALTA";
    PrioridadMensaje["NORMAL"] = "NORMAL";
    PrioridadMensaje["BAJA"] = "BAJA";
})(PrioridadMensaje || (exports.PrioridadMensaje = PrioridadMensaje = {}));
//# sourceMappingURL=IMensaje.js.map