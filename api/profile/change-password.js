const { db } = require('../_utils/db');
const { protect } = require('../_utils/auth');
const bcrypt = require('bcryptjs');

export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const userPayload = await protect(req);
    
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Semua field password harus diisi.' });
    }

    const [rows] = await db.query("SELECT password_hash FROM users WHERE id = ?", [userPayload.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    }
    
    const user = rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Password saat ini salah.' });
    }
    
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, userPayload.userId]);
    res.status(200).json({ success: true, message: 'Password berhasil diubah.' });

  } catch (err) {
    res.status(401).json({ error: err.message });
  }
}