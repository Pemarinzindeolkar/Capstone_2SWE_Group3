// routes/cart.js
const express = require('express');
const router = express.Router();
const {
    getCart, addToCart, updateCartItem, removeCartItem, clearCart,
} = require('../controllers/cartController');
const { requireAuth, requireRole } = require('../config/auth');

router.use(requireAuth, requireRole('buyer'));

router.get('/', getCart);
router.post('/items', addToCart);
router.put('/items/:id', updateCartItem);
router.delete('/items/:id', removeCartItem);
router.delete('/', clearCart);

module.exports = router;
