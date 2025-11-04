// /api/login.js

// Impor koneksi database kita
const { db } = require('./_utils/db'); 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Ambil secret dari Vercel Environment Variables
const JWT_SECRET = process.env.JWT_SECRET;

// Ini adalah fungsi handler Vercel
export default async function handler(req, res) {
  
  // 1. Hanya izinkan metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. Salin-tempel logika Anda dari server.js
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password diperlukan' });
  }

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }
    
    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const tokenPayload = { userId: user.id, username: user.username, role: user.role };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });

    // 3. Kirim respons
    res.status(200).json({ success: true, message: 'Login berhasil', token, role: user.role });

  } catch (err) {
    console.error(err); // Selalu log error
    res.status(500).json({ error: 'Internal server error' });
  }
}