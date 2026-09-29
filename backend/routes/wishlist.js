// routes/wishlist.js
const express = require('express');
const router = express.Router();
const {
    getWishlist, addToWishlist, removeFromWishlist,
} = require('../controllers/wishlistController');
const { requireAuth, requireRole } = require('../config/auth');

router.use(requireAuth, requireRole('buyer'));

router.get('/', getWishlist);
router.post('/', addToWishlist);
router.delete('/:productId', removeFromWishlist);

module.exports = router;
