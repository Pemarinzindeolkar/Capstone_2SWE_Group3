// controllers/artisanController.js
const pool = require('../database');

// GET /api/artisans — public list of artisans (verified first, rejected hidden)
async function listArtisans(req, res) {
    try {
        const result = await pool.query(`
            SELECT
                a.artisan_id, a.name, a.technique, a.craft_description,
                a.workshop_name, a.location, a.photo_url, a.status, a.created_at,
                COUNT(p.product_id) FILTER (WHERE p.status = 'available')::int AS product_count
            FROM artisan a
            LEFT JOIN product p ON p.artisan_id = a.artisan_id
            WHERE a.status <> 'rejected'
            GROUP BY a.artisan_id
            ORDER BY (a.status = 'verified') DESC, a.created_at DESC
        `);
        res.json({ count: result.rowCount, artisans: result.rows });
    } catch (err) {
        console.error('listArtisans error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// GET /api/artisans/:id — public single artisan + their products
async function getArtisan(req, res) {
    const { id } = req.params;
    try {
        const artisanRes = await pool.query(`
            SELECT artisan_id, name, technique, craft_description,
                   workshop_name, location, photo_url, status, created_at
            FROM artisan WHERE artisan_id = $1 AND status <> 'rejected'
        `, [id]);

        if (artisanRes.rowCount === 0) {
            return res.status(404).json({ error: 'Artisan not found' });
        }

        const artisan = artisanRes.rows[0];

        const productsRes = await pool.query(`
            SELECT product_id, title, description, price, category, image_url, status, stock
            FROM product
            WHERE artisan_id = $1 AND status = 'available'
            ORDER BY created_at DESC
        `, [id]);

        artisan.products = productsRes.rows;

        const galleryRes = await pool.query(
            'SELECT artisan_image_id, image_url FROM artisan_image WHERE artisan_id = $1 ORDER BY created_at',
            [id]
        );
        artisan.gallery = galleryRes.rows;

        res.json({ artisan });
    } catch (err) {
        console.error('getArtisan error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// GET /api/artisans/me/gallery   (artisan)
// ---------------------------------------------------------------
async function myGallery(req, res) {
    try {
        const result = await pool.query(
            'SELECT artisan_image_id, image_url FROM artisan_image WHERE artisan_id = $1 ORDER BY created_at',
            [req.user.id]
        );
        res.json({ count: result.rowCount, gallery: result.rows });
    } catch (err) {
        console.error('myGallery error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// POST /api/artisans/me/gallery   { image_url }   (artisan)
// ---------------------------------------------------------------
async function addGalleryImage(req, res) {
    const { image_url } = req.body;
    if (!image_url) return res.status(400).json({ error: 'image_url required' });
    try {
        const count = await pool.query('SELECT COUNT(*)::int AS n FROM artisan_image WHERE artisan_id = $1', [req.user.id]);
        if (count.rows[0].n >= 12) return res.status(400).json({ error: 'Gallery is limited to 12 images' });

        const result = await pool.query(
            'INSERT INTO artisan_image (artisan_id, image_url) VALUES ($1, $2) RETURNING artisan_image_id, image_url',
            [req.user.id, image_url]
        );
        res.status(201).json({ image: result.rows[0] });
    } catch (err) {
        console.error('addGalleryImage error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// DELETE /api/artisans/me/gallery/:imageId   (artisan)
// ---------------------------------------------------------------
async function removeGalleryImage(req, res) {
    try {
        const result = await pool.query(
            'DELETE FROM artisan_image WHERE artisan_image_id = $1 AND artisan_id = $2 RETURNING artisan_image_id',
            [req.params.imageId, req.user.id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Image not found' });
        res.json({ deleted: result.rows[0].artisan_image_id });
    } catch (err) {
        console.error('removeGalleryImage error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

module.exports = { listArtisans, getArtisan, myGallery, addGalleryImage, removeGalleryImage };
