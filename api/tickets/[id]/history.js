const { db } = require('../../_utils/db');
const { protect, restrictTo } = require('../../_utils/auth');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id } = req.query; // Ambil ID dari URL

  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User', 'View']);

    const [history] = await db.query("SELECT * FROM ticket_history WHERE ticket_id = ? ORDER BY change_timestamp DESC", [id]);
    res.status(200).json(history);
  
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: err.message || 'Gagal mengambil riwayat tiket' });
  }
}