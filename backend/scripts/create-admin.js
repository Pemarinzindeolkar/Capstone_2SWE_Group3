// scripts/create-admin.js
// Creates (or resets the password of) an admin account.
// Usage:  node scripts/create-admin.js <email> <password> [name]
const pool = require('../database');
const { hashPassword } = require('../utils/password');

async function main() {
    const [email, password, name = 'Labzo Admin'] = process.argv.slice(2);
    if (!email || !password) {
        console.log('Usage: node scripts/create-admin.js <email> <password> [name]');
        process.exit(1);
    }

    const hash = await hashPassword(password);
    const result = await pool.query(`
        INSERT INTO admin (name, email, password_hash)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name
        RETURNING admin_id, name, email
    `, [name, email, hash]);

    console.log('✅ Admin ready:', result.rows[0]);
    await pool.end();
}

main().catch(err => {
    console.error('❌ Failed:', err.message);
    process.exit(1);
});
