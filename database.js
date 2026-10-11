// database.js
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => console.log('✅ Connected to Postgres'));
pool.on('error', (err) => console.error('❌ Postgres error:', err.message));

module.exports = pool;
