"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardCache = void 0;
class DashboardCache {
    constructor() {
        this.cache = new Map();
    }
    async get(key) {
        const item = this.cache.get(key);
        if (!item)
            return null;
        const now = Date.now();
        if (now - item.timestamp > item.ttl * 1000) {
            this.cache.delete(key);
            return null;
        }
        return item.data;
    }
    async set(key, data, ttlSeconds = 120) {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttlSeconds,
        });
    }
    async invalidate(pattern) {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
            }
        }
    }
    async clear() {
        this.cache.clear();
    }
    async invalidateUserDashboard(userId, escuelaId) {
        const patterns = [
            `dashboard_stats_${userId}_${escuelaId}`,
            `dashboard_optimized_${userId}_${escuelaId}`,
        ];
        for (const pattern of patterns) {
            this.cache.delete(pattern);
        }
    }
}
exports.dashboardCache = new DashboardCache();
//# sourceMappingURL=dashboardCache.js.map