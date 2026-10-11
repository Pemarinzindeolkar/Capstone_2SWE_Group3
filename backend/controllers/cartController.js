// controllers/cartController.js
const pool = require('../database');

// Helper: get or create cart for buyer
async function getOrCreateCart(buyerId) {
    let result = await pool.query(
        'SELECT cart_id FROM cart WHERE buyer_id = $1',
        [buyerId]
    );
    if (result.rowCount === 0) {
        result = await pool.query(
            'INSERT INTO cart (buyer_id) VALUES ($1) RETURNING cart_id',
            [buyerId]
        );
    }
    return result.rows[0].cart_id;
}

// ---------------------------------------------------------------
// GET /api/cart   (buyer only)
// Returns the cart with all items + product info + total
// ---------------------------------------------------------------
async function getCart(req, res) {
    const buyerId = req.user.id;
    try {
        const cartId = await getOrCreateCart(buyerId);

        const items = await pool.query(`
            SELECT
                ci.cart_item_id, ci.quantity, ci.price,
                p.product_id, p.title, p.image_url, p.category,
                a.artisan_id, a.name AS artisan_name
            FROM cart_item ci
            JOIN product p ON p.product_id = ci.product_id
            JOIN artisan a ON a.artisan_id = p.artisan_id
            WHERE ci.cart_id = $1
            ORDER BY ci.cart_item_id DESC
        `, [cartId]);

        const total = items.rows.reduce(
            (sum, row) => sum + Number(row.price) * row.quantity,
            0
        );

        res.json({
            cart_id: cartId,
            count: items.rowCount,
            total: Number(total.toFixed(2)),
            items: items.rows,
        });
    } catch (err) {
        console.error('getCart error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// POST /api/cart/items   { product_id, quantity }
// ---------------------------------------------------------------
async function addToCart(req, res) {
    const buyerId = req.user.id;
    const { product_id, quantity = 1 } = req.body;

    if (!product_id) return res.status(400).json({ error: 'product_id required' });
    const qty = Math.max(1, parseInt(quantity));

    try {
        const cartId = await getOrCreateCart(buyerId);

        // Get product price + ensure it exists and is available
        const prod = await pool.query(
            "SELECT product_id, price, status FROM product WHERE product_id = $1",
            [product_id]
        );
        if (prod.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
        if (prod.rows[0].status !== 'available') {
            return res.status(400).json({ error: 'Product not available' });
        }

        const price = prod.rows[0].price;

        // Upsert: if already in cart, add quantity
        const result = await pool.query(`
            INSERT INTO cart_item (cart_id, product_id, quantity, price)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (cart_id, product_id)
            DO UPDATE SET quantity = cart_item.quantity + EXCLUDED.quantity
            RETURNING *
        `, [cartId, product_id, qty, price]);

        res.status(201).json({ item: result.rows[0] });
    } catch (err) {
        console.error('addToCart error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// PUT /api/cart/items/:id   { quantity }
// ---------------------------------------------------------------
async function updateCartItem(req, res) {
    const buyerId = req.user.id;
    const { id } = req.params;
    const { quantity } = req.body;
    const qty = parseInt(quantity);

    if (!qty || qty < 1) {
        return res.status(400).json({ error: 'Quantity must be at least 1' });
    }

    try {
        const cartId = await getOrCreateCart(buyerId);
        const result = await pool.query(`
            UPDATE cart_item SET quantity = $1
            WHERE cart_item_id = $2 AND cart_id = $3
            RETURNING *
        `, [qty, id, cartId]);

        if (result.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
        res.json({ item: result.rows[0] });
    } catch (err) {
        console.error('updateCartItem error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// DELETE /api/cart/items/:id
// ---------------------------------------------------------------
async function removeCartItem(req, res) {
    const buyerId = req.user.id;
    const { id } = req.params;

    try {
        const cartId = await getOrCreateCart(buyerId);
        const result = await pool.query(
            'DELETE FROM cart_item WHERE cart_item_id = $1 AND cart_id = $2 RETURNING cart_item_id',
            [id, cartId]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
        res.json({ deleted: result.rows[0].cart_item_id });
    } catch (err) {
        console.error('removeCartItem error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// DELETE /api/cart   (clear all)
// ---------------------------------------------------------------
async function clearCart(req, res) {
    const buyerId = req.user.id;
    try {
        const cartId = await getOrCreateCart(buyerId);
        await pool.query('DELETE FROM cart_item WHERE cart_id = $1', [cartId]);
        res.json({ cleared: true });
    } catch (err) {
        console.error('clearCart error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

module.exports = {
    getCart,
    addToCart,
    updateCartItem,
    removeCartItem,
    clearCart,
};
