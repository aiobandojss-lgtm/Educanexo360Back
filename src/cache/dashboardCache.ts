// src/services/cache/dashboardCache.ts
class DashboardCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  async get(key: string): Promise<any | null> {
    const item = this.cache.get(key);

    if (!item) return null;

    const now = Date.now();
    if (now - item.timestamp > item.ttl * 1000) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  async set(key: string, data: any, ttlSeconds: number = 120): Promise<void> {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlSeconds,
    });
  }

  async invalidate(pattern: string): Promise<void> {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  // Invalidar cache cuando se crean/modifican entidades
  async invalidateUserDashboard(userId: string, escuelaId: string): Promise<void> {
    const patterns = [
      `dashboard_stats_${userId}_${escuelaId}`,
      `dashboard_optimized_${userId}_${escuelaId}`,
    ];

    for (const pattern of patterns) {
      this.cache.delete(pattern);
    }
  }
}

export const dashboardCache = new DashboardCache();
