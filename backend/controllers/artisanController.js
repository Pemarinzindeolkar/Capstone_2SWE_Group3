// controllers/artisanController.js
const pool = require('../database');

// GET /api/artisans — public list of verified + pending artisans
async function listArtisans(req, res) {
    try {
        const result = await pool.query(`
            SELECT
                artisan_id, name, email, technique, craft_description,
                status, created_at
            FROM artisan
            ORDER BY created_at DESC
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
            SELECT artisan_id, name, email, technique, craft_description,
                   status, created_at
            FROM artisan WHERE artisan_id = $1
        `, [id]);

        if (artisanRes.rowCount === 0) {
            return res.status(404).json({ error: 'Artisan not found' });
        }

        const artisan = artisanRes.rows[0];

        const productsRes = await pool.query(`
            SELECT product_id, title, description, price, category, image_url, status
            FROM product
            WHERE artisan_id = $1 AND status = 'available'
            ORDER BY created_at DESC
        `, [id]);

        artisan.products = productsRes.rows;
        res.json({ artisan });
    } catch (err) {
        console.error('getArtisan error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

module.exports = { listArtisans, getArtisan };
