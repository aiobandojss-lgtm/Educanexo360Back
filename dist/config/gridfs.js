"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_1 = require("mongodb");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const sanitizeFilename_1 = require("../utils/sanitizeFilename");
class GridFSManager {
    constructor() {
        this.bucket = null;
        this.upload = null;
    }
    static getInstance() {
        if (!GridFSManager.instance) {
            GridFSManager.instance = new GridFSManager();
        }
        return GridFSManager.instance;
    }
    async initializeStorage(mongoURI, dbName = 'educaNexo360') {
        try {
            const storage = multer_1.default.diskStorage({
                destination: function (req, file, cb) {
                    cb(null, path_1.default.join(__dirname, '../../uploads/temp'));
                },
                filename: function (req, file, cb) {
                    crypto_1.default.randomBytes(16, (err, buf) => {
                        if (err)
                            return cb(err, '');
                        const filename = buf.toString('hex') + path_1.default.extname((0, sanitizeFilename_1.sanitizeFilename)(file.originalname));
                        cb(null, filename);
                    });
                },
            });
            this.upload = (0, multer_1.default)({
                storage,
                limits: {
                    fileSize: 5 * 1024 * 1024,
                },
            });
            const db = mongoose_1.default.connection.db;
            if (db) {
                this.bucket = new mongodb_1.GridFSBucket(db, { bucketName: 'uploads' });
                console.log('GridFS bucket created successfully');
            }
        }
        catch (error) {
            console.error('Error initializing GridFS:', error);
        }
    }
    getBucket() {
        return this.bucket;
    }
    getUpload() {
        return this.upload;
    }
}
exports.default = GridFSManager.getInstance();
//# sourceMappingURL=gridfs.js.map