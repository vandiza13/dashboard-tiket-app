const { db } = require('../_utils/db');
const { protect, restrictTo } = require('../_utils/auth');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User']);

    const { id_tiket, deskripsi, tiket_time, category, subcategory } = req.body;
    if (!id_tiket || !deskripsi || !tiket_time || !category || !subcategory) {
      return res.status(400).json({ error: 'Semua field termasuk kategori harus diisi' });
    }
    
    await db.query("INSERT INTO tickets (id_tiket, deskripsi, category, subcategory, tiket_time, status) VALUES (?, ?, ?, ?, ?, 'OPEN')", [id_tiket, deskripsi, category, subcategory, tiket_time]);
    res.status(201).json({ success: true, message: 'Tiket berhasil dibuat' });
  
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: err.message || 'Gagal menyimpan tiket' });
  }
}