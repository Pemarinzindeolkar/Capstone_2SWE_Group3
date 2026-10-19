// utils/orderPayment.js
// Confirming / rejecting a buyer's payment proof. Shared by the artist
// (PUT /api/orders/:id/payment) and the admin (PUT /api/admin/payments/:id/status),
// so stock is reduced exactly once, whoever confirms first.
//
// All functions run inside the caller's transaction (`client` after BEGIN).
// They throw { status, message } for problems the user should see.

const PAID_STATUSES = ['paid', 'shipped', 'delivered'];

function fail(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

// Lock the order row so two confirmations can't both reduce stock
async function lockOrder(client, orderId) {
    const res = await client.query('SELECT * FROM "order" WHERE order_id = $1 FOR UPDATE', [orderId]);
    if (res.rowCount === 0) throw fail(404, 'Order not found');
    return res.rows[0];
}

// Mark the proof verified; if the order isn't paid yet, take its items out of
// stock and mark it paid.
async function confirmPayment(client, orderId, proofId) {
    const order = await lockOrder(client, orderId);

    if (!PAID_STATUSES.includes(order.status)) {
        if (order.status !== 'approved') {
            throw fail(400, order.status === 'cancelled'
                ? 'This order was cancelled'
                : 'The artist must approve this order before its payment can be confirmed');
        }

        const items = await client.query(`
            SELECT oi.product_id, oi.quantity, p.title
            FROM order_item oi JOIN product p ON p.product_id = oi.product_id
            WHERE oi.order_id = $1
        `, [orderId]);

        for (const item of items.rows) {
            const dec = await client.query(
                'UPDATE product SET stock = stock - $1 WHERE product_id = $2 AND stock >= $1',
                [item.quantity, item.product_id]
            );
            if (dec.rowCount === 0) {
                throw fail(400, `Not enough stock of "${item.title}" left — it may have sold to another buyer`);
            }
        }

        await client.query(`UPDATE "order" SET status = 'paid' WHERE order_id = $1`, [orderId]);
    }

    const proof = await client.query(
        `UPDATE payment SET status = 'verified' WHERE proof_id = $1 AND order_id = $2 RETURNING *`,
        [proofId, orderId]
    );
    if (proof.rowCount === 0) throw fail(404, 'Payment proof not found');
    return proof.rows[0];
}

// Mark the proof rejected (buyer can then upload a new one), or set it back to
// pending. Not allowed once the payment has been confirmed.
async function setProofStatus(client, orderId, proofId, status) {
    const order = await lockOrder(client, orderId);
    if (PAID_STATUSES.includes(order.status)) {
        throw fail(400, 'Payment for this order is already confirmed');
    }
    const proof = await client.query(
        'UPDATE payment SET status = $1 WHERE proof_id = $2 AND order_id = $3 RETURNING *',
        [status, proofId, orderId]
    );
    if (proof.rowCount === 0) throw fail(404, 'Payment proof not found');
    return proof.rows[0];
}

module.exports = { confirmPayment, setProofStatus, PAID_STATUSES };
