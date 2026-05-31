"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryCache = void 0;
class MemoryCache {
    constructor(defaultTTL = 300000) {
        this.cache = new Map();
        this.defaultTTL = defaultTTL;
        this.startCleanupInterval();
    }
    set(key, value, ttl = this.defaultTTL) {
        const expiry = Date.now() + ttl;
        this.cache.set(key, { value, expiry });
    }
    get(key) {
        const item = this.cache.get(key);
        if (!item)
            return null;
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        return item.value;
    }
    async getOrSet(key, callback, ttl = this.defaultTTL) {
        const cachedValue = this.get(key);
        if (cachedValue !== null)
            return cachedValue;
        const freshValue = await callback();
        this.set(key, freshValue, ttl);
        return freshValue;
    }
    delete(pattern) {
        if (pattern instanceof RegExp) {
            for (const key of this.cache.keys()) {
                if (pattern.test(key)) {
                    this.cache.delete(key);
                }
            }
        }
        else {
            this.cache.delete(pattern);
        }
    }
    clear() {
        this.cache.clear();
    }
    startCleanupInterval() {
        setInterval(() => {
            const now = Date.now();
            for (const [key, item] of this.cache.entries()) {
                if (now > item.expiry) {
                    this.cache.delete(key);
                }
            }
        }, 60000);
    }
}
exports.memoryCache = new MemoryCache();
//# sourceMappingURL=memoryCache.js.map