"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeFilename = sanitizeFilename;
const path_1 = __importDefault(require("path"));
function sanitizeFilename(filename) {
    const safe = path_1.default.basename(filename)
        .replace(/[^a-zA-Z0-9\-_. ]/g, '_')
        .replace(/\.{2,}/g, '.')
        .replace(/\s+/g, '_')
        .substring(0, 200);
    return safe || 'archivo';
}
//# sourceMappingURL=sanitizeFilename.js.map