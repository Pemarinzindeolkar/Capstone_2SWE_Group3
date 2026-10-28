// controllers/orderController.js
const pool = require('../database');
const {
    confirmPayment, setProofStatus, cancelOrder: cancelOrderTx, reserveStock,
    COMMISSION_RATE, fail,
} = require('../utils/orderPayment');

// ---------------------------------------------------------------
// Order lifecycle (see utils/orderPayment.js)
//   payment_submitted  placed at checkout together with the buyer's transfer
//                      receipt; stock reserved
//   paid               artist confirmed the money arrived in their account
//   shipped, delivered, cancelled
//   pending, approved  older approve-then-pay orders, still supported
//
// Moves the artist can make with PUT /:id/status. Confirming payment is
// separate (PUT /:id/payment).
// ---------------------------------------------------------------
const ARTIST_TRANSITIONS = {
    pending:           ['approved', 'cancelled'],
    approved:          ['cancelled'],
    payment_submitted: ['cancelled'],
    paid:              ['shipped', 'cancelled'],
    shipped:           ['delivered'],
    delivered:         [],
    cancelled:         [],
};

// Buyers can cancel until the artist confirms their payment
const BUYER_CANCELLABLE = ['pending', 'approved', 'payment_submitted'];

const DELIVERY_FIELDS = ['name', 'phone', 'address', 'city', 'dzongkhag'];

// Message for the first item whose quantity exceeds stock, or null
function stockProblem(items) {
    const short = items.find(i => i.quantity > i.stock);
    if (!short) return null;
    return short.stock === 0
        ? `"${short.title}" is out of stock`
        : `Only ${short.stock} of "${short.title}" left in stock`;
}

// Cart rows grouped by artisan, with each group's total
async function cartByArtisan(db, buyerId) {
    const items = await db.query(`
        SELECT ci.cart_item_id, ci.product_id, ci.quantity, ci.price,
               p.title, p.image_url, p.stock,
               a.artisan_id, a.name AS artisan_name,
               a.bank_name, a.account_name, a.account_number
        FROM cart c
        JOIN cart_item ci ON ci.cart_id = c.cart_id
        JOIN product p    ON p.product_id = ci.product_id
        JOIN artisan a    ON a.artisan_id = p.artisan_id
        WHERE c.buyer_id = $1
        ORDER BY a.name, ci.cart_item_id
    `, [buyerId]);

    const groups = new Map();
    for (const row of items.rows) {
        if (!groups.has(row.artisan_id)) {
            groups.set(row.artisan_id, {
                artisan_id: row.artisan_id,
                artisan_name: row.artisan_name,
                bank_name: row.bank_name,
                account_name: row.account_name,
                account_number: row.account_number,
                items: [],
                total: 0,
            });
        }
        const g = groups.get(row.artisan_id);
        g.items.push(row);
        g.total += Number(row.price) * row.quantity;
    }
    return { items: items.rows, groups: [...groups.values()] };
}

// ---------------------------------------------------------------
// GET /api/orders/checkout-info   (buyer)
// Everything the checkout page needs: the buyer's saved details (to
// pre-fill the form) and the bag split per artisan, with the bank
// account each part has to be paid into.
// ---------------------------------------------------------------
async function checkoutInfo(req, res) {
    try {
        const buyer = await pool.query(
            'SELECT name, email, phone, address, city, dzongkhag FROM buyer WHERE buyer_id = $1',
            [req.user.id]
        );
        const { groups } = await cartByArtisan(pool, req.user.id);
        const total = groups.reduce((s, g) => s + g.total, 0);

        res.json({
            buyer: buyer.rows[0],
            groups: groups.map(g => ({
                ...g,
                total: g.total.toFixed(2),
                payable: Boolean(g.account_number),
                items: g.items.map(i => ({
                    product_id: i.product_id, title: i.title, image_url: i.image_url,
                    quantity: i.quantity, price: i.price, stock: i.stock,
                })),
            })),
            total: total.toFixed(2),
            commission_rate: COMMISSION_RATE,
        });
    } catch (err) {
        console.error('checkoutInfo error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// POST /api/orders/checkout   (buyer)
// body: {
//   delivery: { name, phone, address, city, dzongkhag },
//   save_details: true|false,
//   payments: [{ artisan_id, journal_no, proof_url }]   one per artisan in the bag
// }
// Creates one order per artisan, already paid-for (status
// payment_submitted), reserves the stock and empties the bag.
// ---------------------------------------------------------------
async function checkout(req, res) {
    const buyerId = req.user.id;
    const delivery = req.body.delivery || {};
    const payments = Array.isArray(req.body.payments) ? req.body.payments : [];

    const missing = DELIVERY_FIELDS.find(f => !String(delivery[f] || '').trim());
    if (missing) return res.status(400).json({ error: `Please fill in your ${missing === 'dzongkhag' ? 'dzongkhag' : missing}` });
    const ship = Object.fromEntries(DELIVERY_FIELDS.map(f => [f, String(delivery[f]).trim()]));

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lock the bag so a double-click can't check it out twice
        const cart = await client.query('SELECT cart_id FROM cart WHERE buyer_id = $1 FOR UPDATE', [buyerId]);
        const { items, groups } = await cartByArtisan(client, buyerId);
        if (cart.rowCount === 0 || items.length === 0) throw fail(400, 'Your bag is empty');

        const problem = stockProblem(items);
        if (problem) throw fail(400, problem);

        const created = [];
        for (const g of groups) {
            if (!g.account_number) {
                throw fail(400, `${g.artisan_name} hasn't added a bank account yet, so their pieces can't be paid for. Remove them from your bag for now.`);
            }
            const pay = payments.find(p => Number(p.artisan_id) === g.artisan_id);
            if (!pay) throw fail(409, 'Your bag changed — please review the checkout page again');
            const journal = String(pay.journal_no || '').trim();
            if (!journal) throw fail(400, `Enter the journal number of your transfer to ${g.artisan_name}`);
            if (!pay.proof_url) throw fail(400, `Upload the receipt of your transfer to ${g.artisan_name}`);

            await reserveStock(client, g.items);

            const order = (await client.query(`
                INSERT INTO "order" (buyer_id, artisan_id, total, status, commission,
                                     ship_name, ship_phone, ship_address, ship_city, ship_dzongkhag)
                VALUES ($1, $2, $3, 'payment_submitted', $4, $5, $6, $7, $8, $9)
                RETURNING *
            `, [buyerId, g.artisan_id, g.total.toFixed(2), (g.total * COMMISSION_RATE).toFixed(2),
                ship.name, ship.phone, ship.address, ship.city, ship.dzongkhag])).rows[0];

            for (const item of g.items) {
                await client.query(
                    'INSERT INTO order_item (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
                    [order.order_id, item.product_id, item.quantity, item.price]
                );
            }
            await client.query(
                'INSERT INTO payment (order_id, buyer_id, proof_url, journal_no) VALUES ($1, $2, $3, $4)',
                [order.order_id, buyerId, pay.proof_url, journal.slice(0, 60)]
            );
            created.push(order);
        }

        if (req.body.save_details) {
            await client.query(
                'UPDATE buyer SET phone = $1, address = $2, city = $3, dzongkhag = $4 WHERE buyer_id = $5',
                [ship.phone, ship.address, ship.city, ship.dzongkhag, buyerId]
            );
        }

        await client.query('DELETE FROM cart_item WHERE cart_id = $1', [cart.rows[0].cart_id]);
        await client.query('COMMIT');
        res.status(201).json({ orders: created });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('checkout error:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
}

// Latest payment proof of each order, joined into order lists
const LATEST_PAYMENT = `
    LEFT JOIN LATERAL (
        SELECT status, proof_url, journal_no FROM payment
        WHERE payment.order_id = o.order_id
        ORDER BY uploaded_at DESC LIMIT 1
    ) pay ON true`;

const ORDER_COLUMNS = `
    o.order_id, o.total, o.status, o.created_at, o.commission,
    o.ship_name, o.ship_phone, o.ship_address, o.ship_city, o.ship_dzongkhag,
    pay.status AS payment_status, pay.proof_url, pay.journal_no`;

async function attachItems(orders) {
    for (const order of orders) {
        const items = await pool.query(`
            SELECT oi.order_item_id, oi.quantity, oi.price,
                   p.product_id, p.title, p.image_url, p.stock
            FROM order_item oi
            JOIN product p ON p.product_id = oi.product_id
            WHERE oi.order_id = $1
        `, [order.order_id]);
        order.items = items.rows;
    }
    return orders;
}

// ---------------------------------------------------------------
// GET /api/orders   (buyer's orders)
// ---------------------------------------------------------------
async function myOrders(req, res) {
    try {
        const orders = await pool.query(`
            SELECT ${ORDER_COLUMNS},
                   a.artisan_id, a.name AS artisan_name,
                   a.bank_name, a.account_name, a.account_number
            FROM "order" o
            JOIN artisan a ON a.artisan_id = o.artisan_id
            ${LATEST_PAYMENT}
            WHERE o.buyer_id = $1
            ORDER BY o.created_at DESC
        `, [req.user.id]);
        await attachItems(orders.rows);
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
    const ownerColumn = { buyer: 'buyer_id', artisan: 'artisan_id' }[role];
    if (!ownerColumn) return res.status(403).json({ error: 'Forbidden' });

    try {
        const orderRes = await pool.query(
            `SELECT * FROM "order" WHERE order_id = $1 AND ${ownerColumn} = $2`, [id, userId]
        );
        if (orderRes.rowCount === 0) return res.status(404).json({ error: 'Order not found' });
        const [order] = await attachItems(orderRes.rows);
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
    try {
        const orders = await pool.query(`
            SELECT ${ORDER_COLUMNS},
                   b.buyer_id, b.name AS buyer_name, b.email AS buyer_email
            FROM "order" o
            JOIN buyer b ON b.buyer_id = o.buyer_id
            ${LATEST_PAYMENT}
            WHERE o.artisan_id = $1
            ORDER BY o.created_at DESC
        `, [req.user.id]);
        await attachItems(orders.rows);
        res.json({ count: orders.rowCount, orders: orders.rows });
    } catch (err) {
        console.error('artistOrders error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// PUT /api/orders/:id/status   { status }   (artist only, own order)
// Follows ARTIST_TRANSITIONS. Cancelling returns reserved stock and
// flags the buyer's payment for a refund.
// ---------------------------------------------------------------
async function updateOrderStatus(req, res) {
    const { id } = req.params;
    const artisanId = req.user.id;
    const { status } = req.body;

    if (!ARTIST_TRANSITIONS[status]) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const own = await client.query(
            'SELECT status FROM "order" WHERE order_id = $1 AND artisan_id = $2 FOR UPDATE',
            [id, artisanId]
        );
        if (own.rowCount === 0) throw fail(404, 'Order not found');

        const current = own.rows[0].status;
        if (!(ARTIST_TRANSITIONS[current] || []).includes(status)) {
            const hint = ['approved', 'payment_submitted'].includes(current) && status === 'paid'
                ? ' — confirm the buyer\'s payment instead' : '';
            throw fail(400, `Can't change a ${current.replace(/_/g, ' ')} order to ${status}${hint}`);
        }

        let result;
        if (status === 'cancelled') {
            result = await cancelOrderTx(client, id, statusesThatCanBecome('cancelled'));
        } else {
            // Don't approve an old-style order that can no longer be filled
            if (status === 'approved') {
                const items = await client.query(`
                    SELECT oi.quantity, p.title, p.stock
                    FROM order_item oi JOIN product p ON p.product_id = oi.product_id
                    WHERE oi.order_id = $1
                `, [id]);
                const problem = stockProblem(items.rows);
                if (problem) throw fail(400, problem);
            }
            const upd = await client.query(
                'UPDATE "order" SET status = $1 WHERE order_id = $2 RETURNING *', [status, id]
            );
            result = { order: upd.rows[0] };
        }

        await client.query('COMMIT');
        res.json(result);
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('updateOrderStatus error:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
}

// Statuses the artist may move to `target` from
function statusesThatCanBecome(target) {
    return Object.keys(ARTIST_TRANSITIONS).filter(s => ARTIST_TRANSITIONS[s].includes(target));
}

// ---------------------------------------------------------------
// PUT /api/orders/:id/payment   { status: 'verified' | 'rejected' }
// (artist, own order) — review the buyer's latest transfer receipt.
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
        if (proof.rowCount === 0) throw fail(404, 'No payment receipt waiting for review');

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
// PUT /api/orders/:id/refund   (artist, own cancelled order)
// The artist sent the buyer's money back: refund_due → refunded.
// ---------------------------------------------------------------
async function markRefunded(req, res) {
    try {
        const result = await pool.query(`
            UPDATE payment pay SET status = 'refunded'
            FROM "order" o
            WHERE pay.order_id = o.order_id AND o.order_id = $1 AND o.artisan_id = $2
              AND o.status = 'cancelled' AND pay.status = 'refund_due'
            RETURNING pay.*
        `, [req.params.id, req.user.id]);
        if (result.rowCount === 0) return res.status(400).json({ error: 'No refund is due on this order' });
        res.json({ payment: result.rows[0] });
    } catch (err) {
        console.error('markRefunded error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// POST /api/orders/:id/payment   { proof_url, journal_no }   (buyer, own order)
// Re-send a receipt after the artist rejected the first one (or pay an
// older order the artist has approved).
// ---------------------------------------------------------------
async function submitPayment(req, res) {
    const { id } = req.params;
    const buyerId = req.user.id;
    const { proof_url } = req.body;
    const journal = String(req.body.journal_no || '').trim().slice(0, 60) || null;

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
        if (!['approved', 'payment_submitted'].includes(status)) {
            return res.status(400).json({ error: status === 'cancelled' ? 'Order was cancelled' : 'This order is already paid' });
        }

        // A receipt still waiting for review is replaced, not duplicated
        const result = pending_proof_id
            ? await pool.query(`
                UPDATE payment SET proof_url = $1, journal_no = COALESCE($2, journal_no), uploaded_at = NOW()
                WHERE proof_id = $3 AND status = 'pending'
                RETURNING *
            `, [proof_url, journal, pending_proof_id])
            : await pool.query(`
                INSERT INTO payment (order_id, buyer_id, proof_url, journal_no)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [id, buyerId, proof_url, journal]);
        if (result.rowCount === 0) {
            return res.status(409).json({ error: 'Your receipt was just reviewed — please refresh' });
        }

        res.status(201).json({ payment: result.rows[0] });
    } catch (err) {
        console.error('submitPayment error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// PUT /api/orders/:id/cancel   (buyer, own order, until payment is confirmed)
// ---------------------------------------------------------------
async function cancelOrder(req, res) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const own = await client.query(
            'SELECT 1 FROM "order" WHERE order_id = $1 AND buyer_id = $2', [req.params.id, req.user.id]
        );
        if (own.rowCount === 0) throw fail(404, 'Order not found');
        const result = await cancelOrderTx(client, req.params.id, BUYER_CANCELLABLE);
        await client.query('COMMIT');
        res.json(result);
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('cancelOrder error:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
}

module.exports = {
    checkoutInfo, checkout, myOrders, getOrder, artistOrders,
    updateOrderStatus, reviewPayment, markRefunded, submitPayment, cancelOrder,
};
