"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.claveDeLote = void 0;
const crypto_1 = __importDefault(require("crypto"));
const claveDeLote = (prefijo, ids) => {
    const hash = crypto_1.default
        .createHash('sha1')
        .update([...ids].map(String).sort().join(','))
        .digest('hex')
        .slice(0, 20);
    return `${prefijo}:${hash}`;
};
exports.claveDeLote = claveDeLote;
//# sourceMappingURL=claveLote.js.map