// routes/artisans.js
const express = require('express');
const router = express.Router();
const {
    listArtisans, getArtisan, myGallery, addGalleryImage, removeGalleryImage,
} = require('../controllers/artisanController');
const { requireAuth, requireRole } = require('../config/auth');

router.get('/', listArtisans);

// Artisan's own gallery — must come before /:id
router.get('/me/gallery', requireAuth, requireRole('artisan'), myGallery);
router.post('/me/gallery', requireAuth, requireRole('artisan'), addGalleryImage);
router.delete('/me/gallery/:imageId', requireAuth, requireRole('artisan'), removeGalleryImage);

router.get('/:id', getArtisan);

module.exports = router;
