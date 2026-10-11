// controllers/productController.js
const pool = require('../database');

// ---------------------------------------------------------------
// GET /api/products
// Public. Returns all available products with artisan info.
// Supports ?category=... and ?artisan_id=... filters.
// ---------------------------------------------------------------
async function listProducts(req, res) {
    const { category, artisan_id, search } = req.query;

    let sql = `
        SELECT
            p.product_id, p.title, p.description, p.price, p.category,
            p.image_url, p.status, p.created_at,
            a.artisan_id, a.name AS artisan_name,
            a.technique, a.craft_description
        FROM product p
        JOIN artisan a ON a.artisan_id = p.artisan_id
        WHERE p.status = 'available'
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
                p.image_url, p.status, p.created_at,
                a.artisan_id, a.name AS artisan_name, a.email AS artisan_email,
                a.technique, a.craft_description, a.status AS artisan_status
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
// body: { title, description, price, category, image_url }
// ---------------------------------------------------------------
async function createProduct(req, res) {
    const { title, description, price, category, image_url } = req.body;
    const artisanId = req.user.id;

    if (!title || price === undefined) {
        return res.status(400).json({ error: 'Title and price are required' });
    }

    const numericPrice = Number(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ error: 'Invalid price' });
    }

    try {
        const result = await pool.query(`
            INSERT INTO product (artisan_id, title, description, price, category, image_url)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [artisanId, title, description || null, numericPrice, category || null, image_url || null]);

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
    const { title, description, price, category, image_url, status } = req.body;

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
                status      = COALESCE($6, status)
            WHERE product_id = $7
            RETURNING *
        `, [title, description, price, category, image_url, status, id]);

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
        const result = await pool.query(
            'DELETE FROM product WHERE product_id = $1 AND artisan_id = $2 RETURNING product_id',
            [id, artisanId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Product not found or not yours' });
        }
        res.json({ deleted: result.rows[0].product_id });
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
            WHERE artisan_id = $1
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
