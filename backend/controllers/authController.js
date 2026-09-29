// controllers/authController.js
const pool = require('../database');
const { hashPassword, comparePassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');

// ---------------------------------------------------------------
// POST /api/auth/register
// body: { name, email, password, role }  role = "buyer" | "artisan"
// ---------------------------------------------------------------
async function register(req, res) {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['buyer', 'artisan'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }

    try {
        const table = role === 'buyer' ? 'buyer' : 'artisan';
        const idColumn = role === 'buyer' ? 'buyer_id' : 'artisan_id';

        // Check if email already exists in this table
        const exists = await pool.query(
            `SELECT ${idColumn} FROM ${table} WHERE email = $1`,
            [email]
        );
        if (exists.rowCount > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const hash = await hashPassword(password);

        const result = await pool.query(
            `INSERT INTO ${table} (name, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING ${idColumn} AS id, name, email, status, created_at`,
            [name, email, hash]
        );

        const user = result.rows[0];

        // Auto-create empty cart for buyers
        if (role === 'buyer') {
            await pool.query(
                'INSERT INTO cart (buyer_id) VALUES ($1)',
                [user.id]
            );
        }

        const token = signToken({ id: user.id, role, email: user.email });

        res.status(201).json({ user: { ...user, role }, token });
    } catch (err) {
        console.error('register error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// POST /api/auth/login
// body: { email, password, role }  role = "buyer" | "artisan" | "admin"
// ---------------------------------------------------------------
async function login(req, res) {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        let table, idColumn;
        if (role === 'buyer') { table = 'buyer'; idColumn = 'buyer_id'; }
        else if (role === 'artisan') { table = 'artisan'; idColumn = 'artisan_id'; }
        else if (role === 'admin') { table = 'admin'; idColumn = 'admin_id'; }
        else return res.status(400).json({ error: 'Invalid role' });

        const result = await pool.query(
            `SELECT ${idColumn} AS id, name, email, password_hash, status
             FROM ${table} WHERE email = $1`,
            [email]
        );

        if (result.rowCount === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const ok = await comparePassword(password, user.password_hash);
        if (!ok) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        delete user.password_hash;

        const token = signToken({ id: user.id, role, email: user.email });
        res.json({ user: { ...user, role }, token });
    } catch (err) {
        console.error('login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// GET /api/auth/me   (requires token)
// ---------------------------------------------------------------
async function me(req, res) {
    const { id, role } = req.user;

    let table, idColumn;
    if (role === 'buyer') { table = 'buyer'; idColumn = 'buyer_id'; }
    else if (role === 'artisan') { table = 'artisan'; idColumn = 'artisan_id'; }
    else if (role === 'admin') { table = 'admin'; idColumn = 'admin_id'; }

    try {
        const result = await pool.query(
            `SELECT ${idColumn} AS id, name, email, status, created_at
             FROM ${table} WHERE ${idColumn} = $1`,
            [id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ user: { ...result.rows[0], role } });
    } catch (err) {
        console.error('me error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

module.exports = { register, login, me };
