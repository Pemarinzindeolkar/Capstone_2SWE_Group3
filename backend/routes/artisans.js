// routes/artisans.js
const express = require('express');
const router = express.Router();
const { listArtisans, getArtisan } = require('../controllers/artisanController');

router.get('/', listArtisans);
router.get('/:id', getArtisan);

module.exports = router;
