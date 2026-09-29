// controllers/wishlistController.js
const pool = require('../database');

async function getWishlist(req, res) {
    const buyerId = req.user.id;
    try {
        const result = await pool.query(`
            SELECT
                w.wishlist_id, w.added_at,
                p.product_id, p.title, p.price, p.image_url, p.category,
                a.artisan_id, a.name AS artisan_name
            FROM wishlist w
            JOIN product p ON p.product_id = w.product_id
            JOIN artisan a ON a.artisan_id = p.artisan_id
            WHERE w.buyer_id = $1
            ORDER BY w.added_at DESC
        `, [buyerId]);
        res.json({ count: result.rowCount, items: result.rows });
    } catch (err) {
        console.error('getWishlist error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

async function addToWishlist(req, res) {
    const buyerId = req.user.id;
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ error: 'product_id required' });

    try {
        const result = await pool.query(`
            INSERT INTO wishlist (buyer_id, product_id)
            VALUES ($1, $2)
            ON CONFLICT (buyer_id, product_id) DO NOTHING
            RETURNING *
        `, [buyerId, product_id]);
        res.status(201).json({ item: result.rows[0] || { message: 'Already saved' } });
    } catch (err) {
        console.error('addToWishlist error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

async function removeFromWishlist(req, res) {
    const buyerId = req.user.id;
    const { productId } = req.params;
    try {
        const result = await pool.query(
            'DELETE FROM wishlist WHERE buyer_id = $1 AND product_id = $2 RETURNING wishlist_id',
            [buyerId, productId]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Not in wishlist' });
        res.json({ removed: true });
    } catch (err) {
        console.error('removeFromWishlist error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
