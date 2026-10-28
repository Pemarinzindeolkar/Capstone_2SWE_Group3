// controllers/authController.js
const pool = require('../database');
const { hashPassword, comparePassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');

const ROLE_TABLES = {
    buyer:   { table: 'buyer',   idColumn: 'buyer_id' },
    artisan: { table: 'artisan', idColumn: 'artisan_id' },
    admin:   { table: 'admin',   idColumn: 'admin_id' },
};

// ---------------------------------------------------------------
// POST /api/auth/register
// body: { name, email, password, role }  role = "buyer" | "artisan"
// artisans may also send: { phone, technique, craft_description, workshop_name, location }
// ---------------------------------------------------------------
async function register(req, res) {
    const { name, email, password, role, phone, technique, craft_description, workshop_name, location } = req.body;

    if (!name || !email || !password || !role) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['buyer', 'artisan'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        // Emails are unique across ALL account types, so login can auto-detect the role
        const exists = await pool.query(`
            SELECT 1 FROM buyer WHERE email = $1
            UNION ALL SELECT 1 FROM artisan WHERE email = $1
            UNION ALL SELECT 1 FROM admin WHERE email = $1
        `, [email]);
        if (exists.rowCount > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const hash = await hashPassword(password);

        const result = role === 'buyer'
            ? await pool.query(
                `INSERT INTO buyer (name, email, password_hash)
                 VALUES ($1, $2, $3)
                 RETURNING buyer_id AS id, name, email, photo_url, status, created_at`,
                [name, email, hash]
            )
            : await pool.query(
                `INSERT INTO artisan (name, email, password_hash, phone, technique, craft_description, workshop_name, location)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING artisan_id AS id, name, email, phone, technique, craft_description,
                           workshop_name, location, photo_url, status, created_at`,
                [name, email, hash, phone || null, technique || null, craft_description || null,
                 workshop_name || null, location || null]
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

    if (!email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // If no role is given, check every account type in turn
    const roles = role ? [role] : ['buyer', 'artisan', 'admin'];
    if (!roles.every(r => ROLE_TABLES[r])) {
        return res.status(400).json({ error: 'Invalid role' });
    }

    try {
        for (const r of roles) {
            const { table, idColumn } = ROLE_TABLES[r];
            const statusCol = r === 'admin' ? `'active' AS status` : 'status';
            const result = await pool.query(
                `SELECT ${idColumn} AS id, name, email, password_hash, ${statusCol}
                 FROM ${table} WHERE email = $1`,
                [email]
            );
            if (result.rowCount === 0) continue;

            const user = result.rows[0];
            const ok = await comparePassword(password, user.password_hash);
            if (!ok) continue;

            delete user.password_hash;
            const token = signToken({ id: user.id, role: r, email: user.email });
            return res.json({ user: { ...user, role: r }, token });
        }

        res.status(401).json({ error: 'Invalid email or password' });
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
    const map = ROLE_TABLES[role];
    if (!map) return res.status(400).json({ error: 'Invalid role' });

    const cols = {
        buyer: 'name, email, photo_url, phone, address, city, dzongkhag, status, created_at',
        artisan: 'name, email, phone, technique, craft_description, workshop_name, location, photo_url, '
               + 'bank_name, account_name, account_number, status, created_at',
        admin: "name, email, 'active' AS status, created_at",
    }[role];

    try {
        const result = await pool.query(
            `SELECT ${map.idColumn} AS id, ${cols} FROM ${map.table} WHERE ${map.idColumn} = $1`,
            [id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ user: { ...result.rows[0], role } });
    } catch (err) {
        console.error('me error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// ---------------------------------------------------------------
// PUT /api/auth/me   (requires token)
// body: { name?, photo_url?, current_password?, new_password?,
//         buyers also: phone?, address?, city?, dzongkhag?   (pre-fill checkout)
//         artisans also: phone?, technique?, craft_description?, workshop_name?, location?,
//                        bank_name?, account_name?, account_number?   (buyers pay into this) }
// ---------------------------------------------------------------
async function updateMe(req, res) {
    const { id, role } = req.user;
    const map = ROLE_TABLES[role];
    if (!map) return res.status(400).json({ error: 'Invalid role' });

    const {
        name, photo_url, phone, technique, craft_description, workshop_name, location,
        address, city, dzongkhag, bank_name, account_name, account_number,
        current_password, new_password,
    } = req.body;
    if (name !== undefined && !String(name).trim()) {
        return res.status(400).json({ error: 'Name cannot be empty' });
    }

    try {
        // Optional password change — requires the current password
        if (new_password) {
            if (new_password.length < 6) {
                return res.status(400).json({ error: 'New password must be at least 6 characters' });
            }
            const cur = await pool.query(
                `SELECT password_hash FROM ${map.table} WHERE ${map.idColumn} = $1`, [id]
            );
            if (cur.rowCount === 0) return res.status(404).json({ error: 'User not found' });
            const ok = await comparePassword(current_password || '', cur.rows[0].password_hash);
            if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });

            const hash = await hashPassword(new_password);
            await pool.query(
                `UPDATE ${map.table} SET password_hash = $1 WHERE ${map.idColumn} = $2`, [hash, id]
            );
        }

        if (role === 'artisan') {
            await pool.query(`
                UPDATE artisan SET
                    name              = COALESCE($1, name),
                    phone             = COALESCE($2, phone),
                    technique         = COALESCE($3, technique),
                    craft_description = COALESCE($4, craft_description),
                    workshop_name     = COALESCE($5, workshop_name),
                    location          = COALESCE($6, location),
                    photo_url         = COALESCE($7, photo_url),
                    bank_name         = COALESCE($8, bank_name),
                    account_name      = COALESCE($9, account_name),
                    account_number    = COALESCE($10, account_number)
                WHERE artisan_id = $11
            `, [name?.trim() || null, phone ?? null, technique ?? null, craft_description ?? null,
                workshop_name ?? null, location ?? null, photo_url ?? null,
                bank_name?.trim() ?? null, account_name?.trim() ?? null, account_number?.trim() ?? null, id]);
        } else if (role === 'buyer') {
            await pool.query(`
                UPDATE buyer SET
                    name      = COALESCE($1, name),
                    photo_url = COALESCE($2, photo_url),
                    phone     = COALESCE($3, phone),
                    address   = COALESCE($4, address),
                    city      = COALESCE($5, city),
                    dzongkhag = COALESCE($6, dzongkhag)
                WHERE buyer_id = $7
            `, [name?.trim() || null, photo_url ?? null, phone?.trim() ?? null, address?.trim() ?? null,
                city?.trim() ?? null, dzongkhag ?? null, id]);
        } else {
            await pool.query(
                'UPDATE admin SET name = COALESCE($1, name) WHERE admin_id = $2',
                [name?.trim() || null, id]
            );
        }

        return me(req, res);
    } catch (err) {
        console.error('updateMe error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

module.exports = { register, login, me, updateMe };
