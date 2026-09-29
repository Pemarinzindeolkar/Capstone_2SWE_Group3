// routes/products.js
const express = require('express');
const router = express.Router();
const {
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    myProducts,
} = require('../controllers/productController');
const { requireAuth, requireRole } = require('../config/auth');

// Public
router.get('/', listProducts);

// Artist only — must come before /:id to avoid conflict
router.get('/me', requireAuth, requireRole('artisan'), myProducts);
router.post('/', requireAuth, requireRole('artisan'), createProduct);
router.put('/:id', requireAuth, requireRole('artisan'), updateProduct);
router.delete('/:id', requireAuth, requireRole('artisan'), deleteProduct);

// Public single product (keep LAST so /me isn't shadowed)
router.get('/:id', getProduct);

module.exports = router;
