// utils/seedAdmin.js
// Built-in admin account. There is no admin signup, so on every server start
// we make sure the admin from .env exists and its password matches:
//   ADMIN_EMAIL, ADMIN_PASSWORD (required), ADMIN_NAME (optional)
// Changing ADMIN_PASSWORD in .env (or on Render) and restarting updates it.
const pool = require('../database');
const { hashPassword, comparePassword } = require('./password');

async function ensureAdmin() {
    const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = 'Labzo Admin' } = process.env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        console.warn('⚠️  ADMIN_EMAIL / ADMIN_PASSWORD not set — no built-in admin account');
        return;
    }
    const email = ADMIN_EMAIL.trim().toLowerCase();

    // Emails are unique across all account types (login detects the role by email)
    const taken = await pool.query(
        'SELECT 1 FROM buyer WHERE LOWER(email) = $1 UNION ALL SELECT 1 FROM artisan WHERE LOWER(email) = $1',
        [email]
    );
    if (taken.rowCount > 0) {
        console.warn(`⚠️  ${email} is already a buyer/artisan account — built-in admin not created`);
        return;
    }

    const existing = await pool.query(
        'SELECT admin_id, password_hash FROM admin WHERE LOWER(email) = $1',
        [email]
    );

    if (existing.rowCount === 0) {
        await pool.query(
            'INSERT INTO admin (name, email, password_hash) VALUES ($1, $2, $3)',
            [ADMIN_NAME, email, await hashPassword(ADMIN_PASSWORD)]
        );
        console.log(`👤 Built-in admin created: ${email}`);
    } else if (!(await comparePassword(ADMIN_PASSWORD, existing.rows[0].password_hash))) {
        await pool.query(
            'UPDATE admin SET password_hash = $1 WHERE admin_id = $2',
            [await hashPassword(ADMIN_PASSWORD), existing.rows[0].admin_id]
        );
        console.log(`👤 Built-in admin password updated from .env: ${email}`);
    } else {
        console.log(`👤 Built-in admin ready: ${email}`);
    }
}

module.exports = ensureAdmin;
