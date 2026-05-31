"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const express_validator_1 = require("express-validator");
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const validate = (validations) => {
    return async (req, res, next) => {
        try {
            await Promise.all(validations.map((validation) => validation.run(req)));
            const errors = (0, express_validator_1.validationResult)(req);
            if (errors.isEmpty()) {
                return next();
            }
            const extractedErrors = [];
            errors.array().map((err) => extractedErrors.push(err.msg));
            const error = new ApiError_1.default(400, extractedErrors.join(', '));
            return next(error);
        }
        catch (error) {
            console.error('Error en middleware de validación:', error);
            return next(new ApiError_1.default(500, 'Error interno del servidor durante la validación'));
        }
    };
};
exports.validate = validate;
//# sourceMappingURL=validate.middleware.js.map