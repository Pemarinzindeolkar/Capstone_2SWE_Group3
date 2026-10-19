// controllers/productController.js
const pool = require('../database');

// Stock must be a whole number >= 0. Returns null if invalid.
function parseStock(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : null;
}

// ---------------------------------------------------------------
// GET /api/products
// Public. Returns all available products with artisan info.
// Supports ?category=... ?artisan_id=... ?search=... ?limit=... filters.
// ---------------------------------------------------------------
async function listProducts(req, res) {
    const { category, artisan_id, search, limit } = req.query;

    let sql = `
        SELECT
            p.product_id, p.title, p.description, p.price, p.category,
            p.image_url, p.status, p.stock, p.created_at,
            a.artisan_id, a.name AS artisan_name,
            a.technique, a.craft_description, a.status AS artisan_status
        FROM product p
        JOIN artisan a ON a.artisan_id = p.artisan_id
        WHERE p.status = 'available' AND a.status <> 'rejected'
    `;
    const params = [];

    if (category) {
        params.push(category);
        sql += ` AND p.category = $${params.length}`;
    }
    if (artisan_id) {
        params.push(artisan_id);
        sql += ` AND p.artisan_id = $${params.length}`;
    }
    if (search) {
        params.push(`%${search}%`);
        sql += ` AND (p.title ILIKE $${params.length} OR p.description ILIKE $${params.length})`;
    }

    sql += ' ORDER BY p.created_at DESC';

    const n = parseInt(limit);
    if (n > 0) {
        params.push(Math.min(n, 100));
        sql += ` LIMIT $${params.length}`;
    }

    try {
        const result = await pool.query(sql, params);
        res.json({ count: result.rowCount, products: result.rows });
    } catch (err) {
        console.error('listProducts error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// GET /api/products/:id
// Public. One product with full artisan info.
// ---------------------------------------------------------------
async function getProduct(req, res) {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT
                p.product_id, p.title, p.description, p.price, p.category,
                p.image_url, p.status, p.stock, p.created_at,
                a.artisan_id, a.name AS artisan_name, a.photo_url AS artisan_photo,
                a.technique, a.craft_description, a.workshop_name, a.location,
                a.status AS artisan_status
            FROM product p
            JOIN artisan a ON a.artisan_id = p.artisan_id
            WHERE p.product_id = $1
        `, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ product: result.rows[0] });
    } catch (err) {
        console.error('getProduct error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// POST /api/products   (Artist only)
// body: { title, description, price, category, image_url, stock }
// ---------------------------------------------------------------
async function createProduct(req, res) {
    const { title, description, price, category, image_url, stock = 1 } = req.body;
    const artisanId = req.user.id;

    if (!title || price === undefined) {
        return res.status(400).json({ error: 'Title and price are required' });
    }

    const numericPrice = Number(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ error: 'Invalid price' });
    }

    const numericStock = parseStock(stock);
    if (numericStock === null) {
        return res.status(400).json({ error: 'Stock must be a whole number (0 or more)' });
    }

    try {
        const result = await pool.query(`
            INSERT INTO product (artisan_id, title, description, price, category, image_url, stock)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [artisanId, title, description || null, numericPrice, category || null, image_url || null, numericStock]);

        res.status(201).json({ product: result.rows[0] });
    } catch (err) {
        console.error('createProduct error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// PUT /api/products/:id   (Artist, own product only)
// ---------------------------------------------------------------
async function updateProduct(req, res) {
    const { id } = req.params;
    const artisanId = req.user.id;
    const { title, description, price, category, image_url, status, stock } = req.body;

    let numericStock = null;
    if (stock !== undefined && stock !== null && stock !== '') {
        numericStock = parseStock(stock);
        if (numericStock === null) {
            return res.status(400).json({ error: 'Stock must be a whole number (0 or more)' });
        }
    }

    try {
        // Verify ownership
        const own = await pool.query(
            'SELECT artisan_id FROM product WHERE product_id = $1',
            [id]
        );
        if (own.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
        if (own.rows[0].artisan_id !== artisanId) {
            return res.status(403).json({ error: 'Not your product' });
        }

        const result = await pool.query(`
            UPDATE product SET
                title       = COALESCE($1, title),
                description = COALESCE($2, description),
                price       = COALESCE($3, price),
                category    = COALESCE($4, category),
                image_url   = COALESCE($5, image_url),
                status      = COALESCE($6, status),
                stock       = COALESCE($7, stock)
            WHERE product_id = $8
            RETURNING *
        `, [title, description, price, category, image_url, status, numericStock, id]);

        res.json({ product: result.rows[0] });
    } catch (err) {
        console.error('updateProduct error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// DELETE /api/products/:id   (Artist, own product only)
// ---------------------------------------------------------------
async function deleteProduct(req, res) {
    const { id } = req.params;
    const artisanId = req.user.id;

    try {
        const own = await pool.query(
            'SELECT product_id FROM product WHERE product_id = $1 AND artisan_id = $2',
            [id, artisanId]
        );
        if (own.rowCount === 0) {
            return res.status(404).json({ error: 'Product not found or not yours' });
        }

        // Products that appear in past orders can't be hard-deleted (order history
        // must keep pointing at them), so archive them instead.
        const ordered = await pool.query('SELECT 1 FROM order_item WHERE product_id = $1 LIMIT 1', [id]);
        if (ordered.rowCount > 0) {
            await pool.query("UPDATE product SET status = 'archived' WHERE product_id = $1", [id]);
            await pool.query('DELETE FROM cart_item WHERE product_id = $1', [id]);
            return res.json({ archived: Number(id) });
        }

        await pool.query('DELETE FROM product WHERE product_id = $1', [id]);
        res.json({ deleted: Number(id) });
    } catch (err) {
        console.error('deleteProduct error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// GET /api/products/me   (Artist, own products only)
// ---------------------------------------------------------------
async function myProducts(req, res) {
    const artisanId = req.user.id;
    try {
        const result = await pool.query(`
            SELECT * FROM product
            WHERE artisan_id = $1 AND status <> 'archived'
            ORDER BY created_at DESC
        `, [artisanId]);
        res.json({ count: result.rowCount, products: result.rows });
    } catch (err) {
        console.error('myProducts error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

module.exports = {
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    myProducts,
};
