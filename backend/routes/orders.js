// routes/orders.js
const express = require('express');
const router = express.Router();
const {
    checkoutInfo, checkout, myOrders, getOrder, artistOrders,
    updateOrderStatus, reviewPayment, markRefunded, submitPayment, cancelOrder,
} = require('../controllers/orderController');
const { requireAuth, requireRole } = require('../config/auth');

router.use(requireAuth);

// Buyer
router.get('/checkout-info', requireRole('buyer'), checkoutInfo);
router.post('/checkout', requireRole('buyer'), checkout);
router.get('/', requireRole('buyer'), myOrders);
router.post('/:id/payment', requireRole('buyer'), submitPayment);
router.put('/:id/cancel', requireRole('buyer'), cancelOrder);

// Artist
router.get('/artist', requireRole('artisan'), artistOrders);
router.put('/:id/status', requireRole('artisan'), updateOrderStatus);
router.put('/:id/payment', requireRole('artisan'), reviewPayment);
router.put('/:id/refund', requireRole('artisan'), markRefunded);

// Either (buyer or artisan, own records only)
router.get('/:id', requireRole('buyer', 'artisan'), getOrder);

module.exports = router;
