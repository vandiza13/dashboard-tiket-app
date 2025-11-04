const { db } = require('../../_utils/db');
const { protect, restrictTo } = require('../../_utils/auth');

export default async function handler(req, res) {
  const { nik } = req.query; // Ambil NIK dari URL

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const user = await protect(req);
    restrictTo(user, ['Admin']); // Hanya Admin

    const { is_active } = req.body;
    await db.query("UPDATE technicians SET is_active = ? WHERE nik = ?", [is_active, nik]);
    res.status(200).json({ success: true, message: 'Status teknisi berhasil diupdate' });

  } catch (err) {
    console.error(err);
    res.status(401).json({ error: err.message || 'Gagal mengupdate status teknisi' });
  }
}