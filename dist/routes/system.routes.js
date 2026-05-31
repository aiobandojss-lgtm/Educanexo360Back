"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const system_controller_1 = require("../controllers/system.controller");
const validate_middleware_1 = require("../middleware/validate.middleware");
const system_validation_1 = require("../validations/system.validation");
const router = express_1.default.Router();
router.get('/status', system_controller_1.checkSystemStatus);
router.post('/initialize', (0, validate_middleware_1.validate)(system_validation_1.systemInitializeValidation), system_controller_1.initializeSystem);
exports.default = router;
//# sourceMappingURL=system.routes.js.map