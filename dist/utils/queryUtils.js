"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryUtils = void 0;
class QueryUtils {
    constructor(model) {
        this.model = model;
    }
    async findWithPagination(filter = {}, options = {}) {
        const page = Math.max(1, options.page || 1);
        const limit = Math.max(1, Math.min(100, options.limit || 10));
        const skip = (page - 1) * limit;
        const query = this.model.find(filter).lean().select('-__v');
        if (options.sort) {
            query.sort(options.sort.split(',').join(' '));
        }
        if (options.fields) {
            query.select(options.fields.split(',').join(' '));
        }
        query.skip(skip).limit(limit);
        const [data, total] = await Promise.all([query.exec(), this.model.countDocuments(filter)]);
        return {
            data: data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async findOne(filter) {
        const result = await this.model.findOne(filter).lean().select('-__v').exec();
        return result;
    }
    async findById(id, extraFilter = {}) {
        const result = await this.model
            .findOne({ _id: id, ...extraFilter })
            .lean()
            .select('-__v')
            .exec();
        return result;
    }
    async update(filter, update) {
        const result = await this.model
            .findOneAndUpdate(filter, update, {
            new: true,
            runValidators: true,
            lean: true,
        })
            .select('-__v')
            .exec();
        return result;
    }
}
exports.QueryUtils = QueryUtils;
exports.default = QueryUtils;
//# sourceMappingURL=queryUtils.js.map