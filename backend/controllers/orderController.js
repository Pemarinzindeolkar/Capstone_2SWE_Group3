// controllers/orderController.js
const pool = require('../database');

// ---------------------------------------------------------------
// POST /api/orders/checkout   (buyer)
// Takes current cart, groups items by artisan, creates orders.
// ---------------------------------------------------------------
async function checkout(req, res) {
    const buyerId = req.user.id;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Lock the cart and fetch items
        const cartRes = await client.query(
            'SELECT cart_id FROM cart WHERE buyer_id = $1',
            [buyerId]
        );
        if (cartRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cart is empty' });
        }
        const cartId = cartRes.rows[0].cart_id;

        const items = await client.query(`
            SELECT ci.cart_item_id, ci.product_id, ci.quantity, ci.price,
                   p.artisan_id
            FROM cart_item ci
            JOIN product p ON p.product_id = ci.product_id
            WHERE ci.cart_id = $1
        `, [cartId]);

        if (items.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // Group by artisan
        const byArtisan = {};
        for (const row of items.rows) {
            if (!byArtisan[row.artisan_id]) byArtisan[row.artisan_id] = [];
            byArtisan[row.artisan_id].push(row);
        }

        const createdOrders = [];

        for (const [artisanId, artisanItems] of Object.entries(byArtisan)) {
            const total = artisanItems.reduce(
                (sum, r) => sum + Number(r.price) * r.quantity,
                0
            );

            const orderRes = await client.query(`
                INSERT INTO "order" (buyer_id, artisan_id, total, status)
                VALUES ($1, $2, $3, 'pending')
                RETURNING *
            `, [buyerId, artisanId, total.toFixed(2)]);

            const order = orderRes.rows[0];

            for (const item of artisanItems) {
                await client.query(`
                    INSERT INTO order_item (order_id, product_id, quantity, price)
                    VALUES ($1, $2, $3, $4)
                `, [order.order_id, item.product_id, item.quantity, item.price]);
            }

            createdOrders.push(order);
        }

        // Clear cart items
        await client.query('DELETE FROM cart_item WHERE cart_id = $1', [cartId]);

        await client.query('COMMIT');
        res.status(201).json({ orders: createdOrders });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('checkout error:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
}

// ---------------------------------------------------------------
// GET /api/orders   (buyer's orders)
// ---------------------------------------------------------------
async function myOrders(req, res) {
    const buyerId = req.user.id;
    try {
        const orders = await pool.query(`
            SELECT o.order_id, o.total, o.status, o.created_at,
                   a.artisan_id, a.name AS artisan_name
            FROM "order" o
            JOIN artisan a ON a.artisan_id = o.artisan_id
            WHERE o.buyer_id = $1
            ORDER BY o.created_at DESC
        `, [buyerId]);

        // Attach items to each order
        for (const order of orders.rows) {
            const items = await pool.query(`
                SELECT oi.order_item_id, oi.quantity, oi.price,
                       p.product_id, p.title, p.image_url
                FROM order_item oi
                JOIN product p ON p.product_id = oi.product_id
                WHERE oi.order_id = $1
            `, [order.order_id]);
            order.items = items.rows;
        }

        res.json({ count: orders.rowCount, orders: orders.rows });
    } catch (err) {
        console.error('myOrders error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// GET /api/orders/:id   (buyer's own order, or artist's received order)
// ---------------------------------------------------------------
async function getOrder(req, res) {
    const { id } = req.params;
    const { id: userId, role } = req.user;

    try {
        let sql, param;
        if (role === 'buyer') {
            sql = 'SELECT * FROM "order" WHERE order_id = $1 AND buyer_id = $2';
            param = [id, userId];
        } else if (role === 'artisan') {
            sql = 'SELECT * FROM "order" WHERE order_id = $1 AND artisan_id = $2';
            param = [id, userId];
        } else {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const orderRes = await pool.query(sql, param);
        if (orderRes.rowCount === 0) return res.status(404).json({ error: 'Order not found' });

        const order = orderRes.rows[0];
        const items = await pool.query(`
            SELECT oi.order_item_id, oi.quantity, oi.price,
                   p.product_id, p.title, p.image_url
            FROM order_item oi
            JOIN product p ON p.product_id = oi.product_id
            WHERE oi.order_id = $1
        `, [id]);

        order.items = items.rows;
        res.json({ order });
    } catch (err) {
        console.error('getOrder error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// GET /api/orders/artist   (orders received by the artist)
// ---------------------------------------------------------------
async function artistOrders(req, res) {
    const artisanId = req.user.id;
    try {
        const orders = await pool.query(`
            SELECT o.order_id, o.total, o.status, o.created_at,
                   b.buyer_id, b.name AS buyer_name, b.email AS buyer_email
            FROM "order" o
            JOIN buyer b ON b.buyer_id = o.buyer_id
            WHERE o.artisan_id = $1
            ORDER BY o.created_at DESC
        `, [artisanId]);

        for (const order of orders.rows) {
            const items = await pool.query(`
                SELECT oi.order_item_id, oi.quantity, oi.price,
                       p.product_id, p.title, p.image_url
                FROM order_item oi
                JOIN product p ON p.product_id = oi.product_id
                WHERE oi.order_id = $1
            `, [order.order_id]);
            order.items = items.rows;
        }

        res.json({ count: orders.rowCount, orders: orders.rows });
    } catch (err) {
        console.error('artistOrders error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// PUT /api/orders/:id/status   { status }   (artist only, own order)
// ---------------------------------------------------------------
async function updateOrderStatus(req, res) {
    const { id } = req.params;
    const artisanId = req.user.id;
    const { status } = req.body;

    const valid = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
    if (!valid.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const result = await pool.query(`
            UPDATE "order" SET status = $1
            WHERE order_id = $2 AND artisan_id = $3
            RETURNING *
        `, [status, id, artisanId]);

        if (result.rowCount === 0) return res.status(404).json({ error: 'Order not found' });
        res.json({ order: result.rows[0] });
    } catch (err) {
        console.error('updateOrderStatus error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

module.exports = { checkout, myOrders, getOrder, artistOrders, updateOrderStatus };
