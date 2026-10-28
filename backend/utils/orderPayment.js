// utils/orderPayment.js
// Confirming / rejecting a buyer's payment and cancelling orders, used by the
// artist's order actions (controllers/orderController.js).
//
// Order lifecycle (one-page checkout):
//   payment_submitted  buyer placed the order and sent the artisan a transfer
//                      receipt; stock is reserved at this point
//   paid               artisan confirmed the money arrived
//   shipped, delivered, cancelled
// Older orders may still be 'pending' / 'approved' (approve-then-pay flow);
// their stock is only reduced when payment is confirmed.
//
// All functions run inside the caller's transaction (`client` after BEGIN).
// They throw { status, message } for problems the user should see.

const PAID_STATUSES = ['paid', 'shipped', 'delivered'];

// Orders whose items are currently taken out of stock
const STOCK_HELD_STATUSES = ['payment_submitted', ...PAID_STATUSES];

// Labzo's commission on every order (the artisan pays it to Labzo)
const COMMISSION_RATE = 0.08;

function fail(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

// Lock the order row so two actions on it can't interleave
async function lockOrder(client, orderId) {
    const res = await client.query('SELECT * FROM "order" WHERE order_id = $1 FOR UPDATE', [orderId]);
    if (res.rowCount === 0) throw fail(404, 'Order not found');
    return res.rows[0];
}

// Take items out of stock; fails if any product no longer has enough
async function reserveStock(client, items) {
    for (const item of items) {
        const dec = await client.query(
            'UPDATE product SET stock = stock - $1 WHERE product_id = $2 AND stock >= $1',
            [item.quantity, item.product_id]
        );
        if (dec.rowCount === 0) {
            throw fail(400, `Not enough stock of "${item.title}" left — it may have sold to another buyer`);
        }
    }
}

async function orderItems(client, orderId) {
    const res = await client.query(`
        SELECT oi.product_id, oi.quantity, p.title
        FROM order_item oi JOIN product p ON p.product_id = oi.product_id
        WHERE oi.order_id = $1
    `, [orderId]);
    return res.rows;
}

// Mark the proof verified and the order paid.
async function confirmPayment(client, orderId, proofId) {
    const order = await lockOrder(client, orderId);

    if (order.status === 'cancelled') throw fail(400, 'This order was cancelled');
    if (!PAID_STATUSES.includes(order.status)) {
        if (order.status === 'pending') {
            throw fail(400, 'Approve this order before confirming its payment');
        }
        // Old approve-then-pay orders reserve stock only now
        if (order.status === 'approved') await reserveStock(client, await orderItems(client, orderId));
        await client.query(`UPDATE "order" SET status = 'paid' WHERE order_id = $1`, [orderId]);
    }

    const proof = await client.query(
        `UPDATE payment SET status = 'verified' WHERE proof_id = $1 AND order_id = $2 RETURNING *`,
        [proofId, orderId]
    );
    if (proof.rowCount === 0) throw fail(404, 'Payment proof not found');
    return proof.rows[0];
}

// Mark the proof rejected (the buyer can then upload a new one).
// Not allowed once the payment has been confirmed.
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

// Cancel an order: put reserved stock back, and if the buyer's money may have
// reached the artisan (a receipt that wasn't rejected), flag it 'refund_due'.
// `allowed` = the statuses this caller may cancel from.
async function cancelOrder(client, orderId, allowed) {
    const order = await lockOrder(client, orderId);
    if (!allowed.includes(order.status)) {
        throw fail(400, order.status === 'cancelled'
            ? 'This order is already cancelled'
            : `A ${order.status.replace(/_/g, ' ')} order can't be cancelled — contact the ${allowed.includes('paid') ? 'buyer' : 'artisan'}`);
    }

    if (STOCK_HELD_STATUSES.includes(order.status)) {
        for (const item of await orderItems(client, orderId)) {
            await client.query('UPDATE product SET stock = stock + $1 WHERE product_id = $2',
                [item.quantity, item.product_id]);
        }
    }

    const refund = await client.query(`
        UPDATE payment SET status = 'refund_due'
        WHERE order_id = $1 AND status IN ('pending', 'verified')
    `, [orderId]);

    const res = await client.query(
        `UPDATE "order" SET status = 'cancelled' WHERE order_id = $1 RETURNING *`, [orderId]
    );
    return { order: res.rows[0], refundDue: refund.rowCount > 0 };
}

module.exports = {
    confirmPayment, setProofStatus, cancelOrder, reserveStock,
    PAID_STATUSES, STOCK_HELD_STATUSES, COMMISSION_RATE, fail,
};
