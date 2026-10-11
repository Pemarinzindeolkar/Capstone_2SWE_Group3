// utils/jwt.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = '7d';

function signToken(payload) {
    return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

function verifyToken(token) {
    return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };
