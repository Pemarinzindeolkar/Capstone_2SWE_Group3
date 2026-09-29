// utils/password.js
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

async function hashPassword(plain) {
    return await bcrypt.hash(plain, SALT_ROUNDS);
}

async function comparePassword(plain, hash) {
    return await bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, comparePassword };
