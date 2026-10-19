// controllers/orderController.js
const pool = require('../database');
const { confirmPayment, setProofStatus } = require('../utils/orderPayment');

// ---------------------------------------------------------------
// Order lifecycle
//   pending    buyer placed order, waiting for the artist to approve it
//   approved   artist approved; buyer pays and uploads a payment screenshot
//              (the screenshot's review state lives in payment.status)
//   paid       artist or admin confirmed the payment → stock is reduced
//   shipped, delivered, cancelled
//
// Moves the artist can make with PUT /:id/status. Confirming payment is
// separate (PUT /:id/payment), because it also reduces stock.
// ---------------------------------------------------------------
const ARTIST_TRANSITIONS = {
    pending:   ['approved', 'cancelled'],
    approved:  ['cancelled'],
    paid:      ['shipped'],
    shipped:   ['delivered'],
    delivered: [],
    cancelled: [],
};

// Message for the first item whose quantity exceeds stock, or null
function stockProblem(items) {
    const short = items.find(i => i.quantity > i.stock);
    if (!short) return null;
    return short.stock === 0
        ? `"${short.title}" is out of stock`
        : `Only ${short.stock} of "${short.title}" left in stock`;
}

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
                   p.artisan_id, p.title, p.stock
            FROM cart_item ci
            JOIN product p ON p.product_id = ci.product_id
            WHERE ci.cart_id = $1
        `, [cartId]);

        if (items.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // Stock is only reduced when payment is confirmed, but don't take
        // orders we already know can't be filled
        const problem = stockProblem(items.rows);
        if (problem) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: problem });
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
                   a.artisan_id, a.name AS artisan_name,
                   pay.status AS payment_status, pay.proof_url
            FROM "order" o
            JOIN artisan a ON a.artisan_id = o.artisan_id
            LEFT JOIN LATERAL (
                SELECT status, proof_url FROM payment
                WHERE payment.order_id = o.order_id
                ORDER BY uploaded_at DESC LIMIT 1
            ) pay ON true
            WHERE o.buyer_id = $1
            ORDER BY o.created_at DESC
        `, [buyerId]);

        // Attach items to each order
        for (const order of orders.rows) {
            const items = await pool.query(`
                SELECT oi.order_item_id, oi.quantity, oi.price,
                       p.product_id, p.title, p.image_url, p.stock
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
                   p.product_id, p.title, p.image_url, p.stock
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
                   b.buyer_id, b.name AS buyer_name, b.email AS buyer_email,
                   pay.status AS payment_status, pay.proof_url
            FROM "order" o
            JOIN buyer b ON b.buyer_id = o.buyer_id
            LEFT JOIN LATERAL (
                SELECT status, proof_url FROM payment
                WHERE payment.order_id = o.order_id
                ORDER BY uploaded_at DESC LIMIT 1
            ) pay ON true
            WHERE o.artisan_id = $1
            ORDER BY o.created_at DESC
        `, [artisanId]);

        for (const order of orders.rows) {
            const items = await pool.query(`
                SELECT oi.order_item_id, oi.quantity, oi.price,
                       p.product_id, p.title, p.image_url, p.stock
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
// Follows ARTIST_TRANSITIONS.
// ---------------------------------------------------------------
async function updateOrderStatus(req, res) {
    const { id } = req.params;
    const artisanId = req.user.id;
    const { status } = req.body;

    if (!ARTIST_TRANSITIONS[status]) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const own = await pool.query(
            'SELECT status FROM "order" WHERE order_id = $1 AND artisan_id = $2',
            [id, artisanId]
        );
        if (own.rowCount === 0) return res.status(404).json({ error: 'Order not found' });

        const current = own.rows[0].status;
        if (!(ARTIST_TRANSITIONS[current] || []).includes(status)) {
            const hint = current === 'approved' && status === 'paid'
                ? ' — confirm the buyer\'s payment screenshot instead' : '';
            return res.status(400).json({ error: `Can't change a ${current} order to ${status}${hint}` });
        }

        // Don't approve an order that can no longer be filled
        if (status === 'approved') {
            const items = await pool.query(`
                SELECT oi.quantity, p.title, p.stock
                FROM order_item oi JOIN product p ON p.product_id = oi.product_id
                WHERE oi.order_id = $1
            `, [id]);
            const problem = stockProblem(items.rows);
            if (problem) return res.status(400).json({ error: problem });
        }

        // Status in WHERE: if it changed meanwhile, nothing is updated
        const result = await pool.query(`
            UPDATE "order" SET status = $1
            WHERE order_id = $2 AND artisan_id = $3 AND status = $4
            RETURNING *
        `, [status, id, artisanId, current]);

        if (result.rowCount === 0) return res.status(409).json({ error: 'Order changed — please refresh' });
        res.json({ order: result.rows[0] });
    } catch (err) {
        console.error('updateOrderStatus error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// PUT /api/orders/:id/payment   { status: 'verified' | 'rejected' }
// (artist, own order) — review the buyer's latest payment screenshot.
// Verifying marks the order paid and reduces stock.
// ---------------------------------------------------------------
async function reviewPayment(req, res) {
    const { id } = req.params;
    const { status } = req.body;
    if (!['verified', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const proof = await client.query(`
            SELECT pay.proof_id FROM payment pay
            JOIN "order" o ON o.order_id = pay.order_id
            WHERE pay.order_id = $1 AND o.artisan_id = $2 AND pay.status = 'pending'
            ORDER BY pay.uploaded_at DESC LIMIT 1
        `, [id, req.user.id]);
        if (proof.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'No payment screenshot waiting for review' });
        }

        const payment = status === 'verified'
            ? await confirmPayment(client, id, proof.rows[0].proof_id)
            : await setProofStatus(client, id, proof.rows[0].proof_id, 'rejected');

        await client.query('COMMIT');
        res.json({ payment });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('reviewPayment error:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
}

// ---------------------------------------------------------------
// POST /api/orders/:id/payment   { proof_url }   (buyer, own order)
// Buyer submits proof of a bank transfer (e.g. mBoB screenshot),
// once the artist has approved the order.
// ---------------------------------------------------------------
async function submitPayment(req, res) {
    const { id } = req.params;
    const buyerId = req.user.id;
    const { proof_url } = req.body;

    if (!proof_url) return res.status(400).json({ error: 'proof_url required' });

    try {
        const own = await pool.query(`
            SELECT o.status,
                   (SELECT proof_id FROM payment WHERE order_id = o.order_id AND status = 'pending'
                    ORDER BY uploaded_at DESC LIMIT 1) AS pending_proof_id
            FROM "order" o WHERE o.order_id = $1 AND o.buyer_id = $2
        `, [id, buyerId]);
        if (own.rowCount === 0) return res.status(404).json({ error: 'Order not found' });
        const { status, pending_proof_id } = own.rows[0];
        if (status === 'pending') {
            return res.status(400).json({ error: 'Please wait for the artist to approve your order before paying' });
        }
        if (status !== 'approved') {
            return res.status(400).json({ error: status === 'cancelled' ? 'Order was cancelled' : 'This order is already paid' });
        }

        // A screenshot still waiting for review is replaced, not duplicated
        const result = pending_proof_id
            ? await pool.query(`
                UPDATE payment SET proof_url = $1, uploaded_at = NOW()
                WHERE proof_id = $2 AND status = 'pending'
                RETURNING *
            `, [proof_url, pending_proof_id])
            : await pool.query(`
                INSERT INTO payment (order_id, buyer_id, proof_url)
                VALUES ($1, $2, $3)
                RETURNING *
            `, [id, buyerId, proof_url]);
        if (result.rowCount === 0) {
            return res.status(409).json({ error: 'Your screenshot was just reviewed — please refresh' });
        }

        res.status(201).json({ payment: result.rows[0] });
    } catch (err) {
        console.error('submitPayment error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// PUT /api/orders/:id/cancel   (buyer, own order, until it is paid)
// ---------------------------------------------------------------
async function cancelOrder(req, res) {
    try {
        const result = await pool.query(`
            UPDATE "order" SET status = 'cancelled'
            WHERE order_id = $1 AND buyer_id = $2 AND status IN ('pending', 'approved')
            RETURNING *
        `, [req.params.id, req.user.id]);
        if (result.rowCount === 0) {
            return res.status(400).json({ error: 'Paid orders can no longer be cancelled' });
        }
        res.json({ order: result.rows[0] });
    } catch (err) {
        console.error('cancelOrder error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

module.exports = { checkout, myOrders, getOrder, artistOrders, updateOrderStatus, reviewPayment, submitPayment, cancelOrder };
