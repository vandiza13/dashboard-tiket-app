const { db } = require('../_utils/db');
const { protect, restrictTo } = require('../_utils/auth');

export default async function handler(req, res) {
  try {
    const user = await protect(req);

    // --- LOGIKA UNTUK GET ---
    if (req.method === 'GET') {
      restrictTo(user, ['Admin', 'User', 'View']);
      
      const [rows] = await db.query("SELECT * FROM technicians ORDER BY name ASC");
      res.status(200).json(rows);
    
    // --- LOGIKA UNTUK POST ---
    } else if (req.method === 'POST') {
      restrictTo(user, ['Admin']);
      
      const { nik, name, phone_number } = req.body;
      if (!nik || !name) {
        return res.status(400).json({ error: 'NIK dan Nama tidak boleh kosong' });
      }
      if (nik.length !== 8 || !/^\d+$/.test(nik)) {
        return res.status(400).json({ error: 'NIK harus 8 digit angka' });
      }
      
      try {
        await db.query("INSERT INTO technicians (nik, name, phone_number) VALUES (?, ?, ?)", [nik, name, phone_number]);
        res.status(201).json({ success: true, message: 'Teknisi berhasil dibuat' });
      } catch(err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'NIK sudah terdaftar' });
        }
        throw err; // Lempar ke catch luar
      }
    
    // --- METODE LAIN ---
    } else {
      res.status(405).json({ error: 'Method Not Allowed' });
    }

  } catch (err) {
    console.error(err);
    res.status(401).json({ error: err.message || 'Gagal memproses teknisi' });
  }
}