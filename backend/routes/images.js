// routes/images.js
// Serves images stored in the Postgres `image` table (see routes/upload.js).
const express = require('express');
const pool = require('../database');

const router = express.Router();

router.get('/:id', async (req, res) => {
    const { id } = req.params;
    if (!/^[a-f0-9]{32}$/.test(id)) return res.status(404).end();
    try {
        const result = await pool.query('SELECT mimetype, data FROM image WHERE image_id = $1', [id]);
        if (result.rowCount === 0) return res.status(404).end();
        const { mimetype, data } = result.rows[0];
        res.set('Content-Type', mimetype);
        res.set('Cache-Control', 'public, max-age=31536000, immutable'); // ids never change
        res.send(data);
    } catch (err) {
        console.error('image serve error:', err);
        res.status(500).end();
    }
});

module.exports = router;
