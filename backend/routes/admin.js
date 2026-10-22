// routes/admin.js
const express = require('express');
const router = express.Router();
const {
    stats, listArtisans, setArtisanStatus, listPayments, listOrders,
} = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../config/auth');

router.use(requireAuth, requireRole('admin'));

router.get('/stats', stats);
router.get('/artisans', listArtisans);
router.put('/artisans/:id/status', setArtisanStatus);
// Admins can view payment proofs, but only the artist verifies them (PUT /api/orders/:id/payment)
router.get('/payments', listPayments);
router.get('/orders', listOrders);

module.exports = router;
