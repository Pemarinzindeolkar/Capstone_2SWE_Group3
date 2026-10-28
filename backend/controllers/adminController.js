// controllers/adminController.js
const pool = require('../database');

// ---------------------------------------------------------------
// GET /api/admin/stats
// ---------------------------------------------------------------
async function stats(req, res) {
    try {
        const result = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM buyer)::int                                   AS buyers,
                (SELECT COUNT(*) FROM artisan)::int                                 AS artisans,
                (SELECT COUNT(*) FROM artisan WHERE status = 'pending')::int        AS pending_artisans,
                (SELECT COUNT(*) FROM product WHERE status = 'available')::int      AS products,
                (SELECT COUNT(*) FROM "order")::int                                 AS orders,
                (SELECT COUNT(*) FROM payment WHERE status = 'pending')::int        AS pending_payments,
                (SELECT COALESCE(SUM(total), 0) FROM "order"
                    WHERE status IN ('paid', 'shipped', 'delivered'))::float        AS revenue,
                (SELECT COALESCE(SUM(COALESCE(commission, total * 0.08)), 0) FROM "order"
                    WHERE status IN ('paid', 'shipped', 'delivered'))::float        AS commission
        `);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('admin stats error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// GET /api/admin/artisans   (all artisans, incl. contact details)
// ---------------------------------------------------------------
async function listArtisans(req, res) {
    try {
        const result = await pool.query(`
            SELECT a.artisan_id, a.name, a.email, a.phone, a.technique,
                   a.craft_description, a.status, a.created_at,
                   COUNT(p.product_id)::int AS product_count
            FROM artisan a
            LEFT JOIN product p ON p.artisan_id = a.artisan_id
            GROUP BY a.artisan_id
            ORDER BY (a.status = 'pending') DESC, a.created_at DESC
        `);
        res.json({ count: result.rowCount, artisans: result.rows });
    } catch (err) {
        console.error('admin listArtisans error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// PUT /api/admin/artisans/:id/status   { status }
// ---------------------------------------------------------------
async function setArtisanStatus(req, res) {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'verified', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    try {
        const result = await pool.query(
            'UPDATE artisan SET status = $1 WHERE artisan_id = $2 RETURNING artisan_id, name, status',
            [status, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Artisan not found' });
        res.json({ artisan: result.rows[0] });
    } catch (err) {
        console.error('admin setArtisanStatus error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// GET /api/admin/payments
// ---------------------------------------------------------------
async function listPayments(req, res) {
    try {
        const result = await pool.query(`
            SELECT pay.proof_id, pay.order_id, pay.proof_url, pay.status, pay.uploaded_at,
                   o.total, o.status AS order_status,
                   b.name AS buyer_name, b.email AS buyer_email,
                   a.name AS artisan_name
            FROM payment pay
            JOIN "order" o ON o.order_id = pay.order_id
            JOIN buyer b   ON b.buyer_id = pay.buyer_id
            JOIN artisan a ON a.artisan_id = o.artisan_id
            ORDER BY (pay.status = 'pending') DESC, pay.uploaded_at DESC
        `);
        res.json({ count: result.rowCount, payments: result.rows });
    } catch (err) {
        console.error('admin listPayments error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// GET /api/admin/orders
// ---------------------------------------------------------------
async function listOrders(req, res) {
    try {
        const result = await pool.query(`
            SELECT o.order_id, o.total, o.status, o.created_at,
                   b.name AS buyer_name, a.name AS artisan_name,
                   (SELECT COUNT(*) FROM order_item oi WHERE oi.order_id = o.order_id)::int AS item_count
            FROM "order" o
            JOIN buyer b   ON b.buyer_id = o.buyer_id
            JOIN artisan a ON a.artisan_id = o.artisan_id
            ORDER BY o.created_at DESC
            LIMIT 200
        `);
        res.json({ count: result.rowCount, orders: result.rows });
    } catch (err) {
        console.error('admin listOrders error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

module.exports = { stats, listArtisans, setArtisanStatus, listPayments, listOrders };
