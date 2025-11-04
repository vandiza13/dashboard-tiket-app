const { db } = require('../_utils/db');
const { protect, restrictTo } = require('../_utils/auth');

export default async function handler(req, res) {
  const { nik } = req.query; // Ambil NIK dari URL

  try {
    const user = await protect(req);
    restrictTo(user, ['Admin']); // Hanya Admin

    // --- LOGIKA UNTUK UPDATE (PUT) ---
    if (req.method === 'PUT') {
      const { name, phone_number } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Nama tidak boleh kosong' });
      }
      
      await db.query("UPDATE technicians SET name = ?, phone_number = ? WHERE nik = ?", [name, phone_number, nik]);
      res.status(200).json({ success: true, message: 'Teknisi berhasil diupdate' });
    
    // --- LOGIKA UNTUK DELETE ---
    } else if (req.method === 'DELETE') {
      await db.query("DELETE FROM technicians WHERE nik = ?", [nik]);
      res.status(200).json({ success: true, message: 'Teknisi berhasil dihapus' });
    
    // --- METODE LAIN ---
    } else {
      res.status(405).json({ error: 'Method Not Allowed' });
    }

  } catch (err) {
    console.error(err);
    res.status(401).json({ error: err.message || 'Gagal memproses teknisi' });
  }
}