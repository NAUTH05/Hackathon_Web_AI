const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination(_req, _file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename(_req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        const uniqueName = `${crypto.randomUUID()}${ext}`;
        cb(null, uniqueName);
    },
});

const fileFilter = (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Chỉ chấp nhận file ảnh (jpeg, png, webp, gif)'));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

// POST /api/upload/avatar
router.post('/avatar', authenticate, upload.single('avatar'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Không có file được tải lên' });
    }
    const backendBase = process.env.BACKEND_URL
        || `${req.protocol}://${req.get('host')}`;
    const url = `${backendBase}/uploads/avatars/${req.file.filename}`;
    res.json({ url });
});

// Error handler for multer
router.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File quá lớn. Tối đa 2MB.' });
    }
    res.status(400).json({ error: err.message || 'Upload thất bại' });
});

module.exports = router;
