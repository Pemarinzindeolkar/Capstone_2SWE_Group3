// routes/upload.js
// Where uploaded images go:
//   - Cloudinary, when CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET are set
//   - otherwise the Postgres `image` table, served back by routes/images.js
// Both survive Render redeploys (local disk does not — it's wiped every deploy).
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const pool = require('../database');
const { requireAuth, requireRole } = require('../config/auth');

const router = express.Router();

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
const useCloudinary = Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);

console.log(useCloudinary ? 'Image uploads → Cloudinary' : 'Image uploads → Postgres (image table)');

function fileFilter(req, file, cb) {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only JPG, PNG, GIF or WebP images are allowed'));
}

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 },
});

async function saveToCloudinary(file) {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'labzo';
    const signature = crypto
        .createHash('sha1')
        .update(`folder=${folder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`)
        .digest('hex');

    const form = new FormData();
    form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
    form.append('api_key', CLOUDINARY_API_KEY);
    form.append('timestamp', String(timestamp));
    form.append('folder', folder);
    form.append('signature', signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Cloudinary upload failed');
    return data.secure_url;
}

async function saveToDatabase(file, user) {
    const id = crypto.randomBytes(16).toString('hex');
    await pool.query(
        'INSERT INTO image (image_id, uploader_role, uploader_id, mimetype, data) VALUES ($1, $2, $3, $4, $5)',
        [id, user.role, user.id, file.mimetype, file.buffer]
    );
    return '/api/images/' + id;
}

// Artisans upload product/profile/gallery images; buyers upload payment proofs
// and profile photos.
router.post('/', requireAuth, requireRole('artisan', 'buyer'), (req, res) => {
    upload.single('image')(req, res, async (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be under 5MB' : err.message;
            return res.status(400).json({ error: msg });
        }
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        try {
            const url = useCloudinary ? await saveToCloudinary(req.file) : await saveToDatabase(req.file, req.user);
            res.json({ url, size: req.file.size, mimetype: req.file.mimetype });
        } catch (e) {
            console.error('upload error:', e);
            res.status(500).json({ error: 'Upload failed' });
        }
    });
});

module.exports = router;
