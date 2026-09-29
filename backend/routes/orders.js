// routes/orders.js
const express = require('express');
const router = express.Router();
const {
    checkout, myOrders, getOrder, artistOrders, updateOrderStatus,
} = require('../controllers/orderController');
const { requireAuth, requireRole } = require('../config/auth');

router.use(requireAuth);

// Buyer
router.post('/checkout', requireRole('buyer'), checkout);
router.get('/', requireRole('buyer'), myOrders);

// Artist
router.get('/artist', requireRole('artisan'), artistOrders);
router.put('/:id/status', requireRole('artisan'), updateOrderStatus);

// Either (buyer or artisan, own records only)
router.get('/:id', requireRole('buyer', 'artisan'), getOrder);

module.exports = router;
