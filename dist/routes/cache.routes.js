"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const simpleCache_1 = require("../cache/simpleCache");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/stats', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN'), (req, res) => {
    try {
        const stats = (0, simpleCache_1.getCacheStats)();
        res.json({
            success: true,
            data: stats,
            totalKeys: simpleCache_1.cache.keys().length,
            keys: simpleCache_1.cache.keys(),
        });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
router.delete('/clear', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN'), (req, res) => {
    try {
        simpleCache_1.cache.flushAll();
        console.log('🗑️ Cache completamente limpiado por:', req.user?.email);
        res.json({ success: true, message: 'Cache limpiado exitosamente' });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=cache.routes.js.map