// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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

// Home page hero slideshow: every image in homepage_images/, this one first
const HERO_DIR = path.join(__dirname, 'homepage_images');
const HERO_FIRST = 'AG276-Punap-Ugyen-Yak-snow-mountain48C1700-1-2048x1366';
app.use('/homepage_images', express.static(HERO_DIR, { maxAge: '7d' }));

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

app.get('/api/homepage-images', (req, res) => {
    fs.readdir(HERO_DIR, (err, files) => {
        if (err) return res.json({ images: [] });
        const images = files
            .filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f))
            .sort((a, b) => b.startsWith(HERO_FIRST) - a.startsWith(HERO_FIRST) || a.localeCompare(b))
            .map(f => '/homepage_images/' + encodeURIComponent(f));
        res.json({ images });
    });
});

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/artisans', require('./routes/artisans'));
app.use('/api/cart',     require('./routes/cart'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/upload',   require('./routes/upload'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/images',   require('./routes/images'));

// ==========================================
// FALLBACK: any non-API route → serve index.html
// (so /shop, /profile, etc. all load the SPA)
// ==========================================
app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Apply schema changes, then start listening (start anyway if the DB is down,
// so /api/health still answers and the error is visible in the logs)
require('./migrate')()
    .then(() => require('./utils/seedAdmin')())
    .catch(err => console.error(' Startup DB setup failed:', err.message))
    .finally(() => {
        app.listen(PORT, () => {
            console.log(`Labzo running on http://localhost:${PORT}`);
            console.log(`Frontend: http://localhost:${PORT}/`);
            console.log(`API:      http://localhost:${PORT}/api/health`);
        });
    });
