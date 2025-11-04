const { db } = require('../_utils/db');
const { protect } = require('../_utils/auth');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Panggil helper 'protect' di awal
    const user = await protect(req); 

    const [rows] = await db.query("SELECT id, username, role, created_at FROM users WHERE id = ?", [user.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    }
    res.status(200).json(rows[0]);
  
  } catch (err) {
    // Tangkap error dari 'protect' atau 'db.query'
    res.status(401).json({ error: err.message });
  }
}