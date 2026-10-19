// routes/admin.js
const express = require('express');
const router = express.Router();
const {
    stats, listArtisans, setArtisanStatus, listPayments, setPaymentStatus, listOrders,
} = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../config/auth');

router.use(requireAuth, requireRole('admin'));

router.get('/stats', stats);
router.get('/artisans', listArtisans);
router.put('/artisans/:id/status', setArtisanStatus);
router.get('/payments', listPayments);
router.put('/payments/:id/status', setPaymentStatus);
router.get('/orders', listOrders);

module.exports = router;
