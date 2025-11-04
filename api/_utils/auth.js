const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Pengganti middleware 'protect'.
 * Memverifikasi token dan mengembalikan payload user.
 * Akan melempar (throw) error jika gagal.
 */
async function protect(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    throw new Error('Akses ditolak, tidak ada token');
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    return user; // Mengembalikan payload { userId, username, role }
  } catch (err) {
    throw new Error('Token tidak valid');
  }
}

/**
 * Pengganti middleware 'restrictTo'.
 * Memeriksa apakah role user diizinkan.
 * Akan melempar (throw) error jika tidak diizinkan.
 */
function restrictTo(user, roles) {
  if (!roles.includes(user.role)) {
    throw new Error('Anda tidak memiliki izin untuk melakukan aksi ini');
  }
  // Jika diizinkan, tidak melakukan apa-apa
}

module.exports = { protect, restrictTo };