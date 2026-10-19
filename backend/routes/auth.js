// routes/auth.js
const express = require('express');
const router = express.Router();
const { register, login, me, updateMe } = require('../controllers/authController');
const { requireAuth } = require('../config/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAuth, me);
router.put('/me', requireAuth, updateMe);

module.exports = router;
