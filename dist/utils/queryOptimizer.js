"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryOptimizer = void 0;
class QueryOptimizer {
    static optimizeFind(query) {
        query.lean();
        query.select('-__v');
        return query;
    }
    static optimizeFindOne(query) {
        query.lean();
        query.select('-__v');
        return query;
    }
    static async executeWithTimeout(query, timeoutMs = 5000) {
        const timeout = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`La consulta excedió el tiempo límite de ${timeoutMs}ms`));
            }, timeoutMs);
        });
        return Promise.race([query, timeout]);
    }
    static createProjection(fields) {
        const projection = {};
        fields.forEach((field) => {
            projection[field] = 1;
        });
        return projection;
    }
    static createAggregationPipeline({ match = {}, sort = { createdAt: -1 }, limit = 10, skip = 0, project = {}, }) {
        return [
            { $match: match },
            { $sort: sort },
            { $skip: skip },
            { $limit: limit },
            { $project: project },
        ];
    }
}
exports.QueryOptimizer = QueryOptimizer;
//# sourceMappingURL=queryOptimizer.js.map