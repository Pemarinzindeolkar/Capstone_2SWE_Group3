// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==========================================
// SERVE FRONTEND (static files from public/)
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// API ROUTES
// ==========================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'labzo-backend' });
});

app.get('/api/db-test', async (req, res) => {
    try {
        const pool = require('./database');
        const result = await pool.query('SELECT NOW() AS now');
        res.json({ status: 'ok', db_time: result.rows[0].now });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/artisans', require('./routes/artisans'));
app.use('/api/cart',     require('./routes/cart'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/upload',   require('./routes/upload'));

// ==========================================
// FALLBACK: any non-API route → serve index.html
// (so /shop, /profile, etc. all load the SPA)
// ==========================================
app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
    console.log(`Labzo running on http://localhost:${PORT}`);
    console.log(`Frontend: http://localhost:${PORT}/`);
    console.log(`API:      http://localhost:${PORT}/api/health`);
});
