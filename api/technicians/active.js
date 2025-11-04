const { db } = require('../_utils/db');
const { protect, restrictTo } = require('../_utils/auth');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const user = await protect(req);
    // Endpoint ini hanya membolehkan Admin dan User di kode asli
    restrictTo(user, ['Admin', 'User']);

    const [rows] = await db.query("SELECT * FROM technicians WHERE is_active = TRUE ORDER BY name ASC");
    res.status(200).json(rows);

  } catch (err) {
    console.error(err);
    res.status(401).json({ error: err.message || 'Gagal mengambil data teknisi aktif' });
  }
}