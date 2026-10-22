// migrate.js
// Applies schema.sql on server start. Every statement in it is idempotent
// (CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS), so it is safe to run
// on every boot — new tables/columns reach Render without running psql by hand.
const fs = require('fs');
const path = require('path');
const pool = require('./database');

async function migrate() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Database schema up to date');
}

module.exports = migrate;
