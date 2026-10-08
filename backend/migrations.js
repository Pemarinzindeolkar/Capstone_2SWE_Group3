// migrations.js
// Small, idempotent schema updates that run on every server start.
// Each statement must be safe to run repeatedly (use IF NOT EXISTS).
const pool = require('./database');

const MIGRATIONS = [
    // Artist registration: extra details collected in signup steps 1 & 2
    `ALTER TABLE artisan
        ADD COLUMN IF NOT EXISTS phone         VARCHAR(30),
        ADD COLUMN IF NOT EXISTS workshop_name VARCHAR(150),
        ADD COLUMN IF NOT EXISTS city          VARCHAR(100),
        ADD COLUMN IF NOT EXISTS country       VARCHAR(100)`,
];

async function runMigrations() {
    for (const sql of MIGRATIONS) {
        await pool.query(sql);
    }
    console.log(`✅ Migrations applied (${MIGRATIONS.length})`);
}

module.exports = runMigrations;
