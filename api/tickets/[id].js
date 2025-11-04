// /api/tickets/[id].js

const { db } = require('../_utils/db'); // (perhatikan ../)

export default async function handler(req, res) {
  
  // Dapatkan 'id' dari URL
  const { id } = req.query;

  // --- Logika untuk DELETE ---
  if (req.method === 'DELETE') {
    try {
      // (Salin-tempel logika DELETE dari server.js)
      await db.query("DELETE FROM tickets WHERE id = ?", [id]);
      return res.status(200).json({ success: true, message: 'Tiket berhasil dihapus' });
    } catch(err) {
      return res.status(500).json({ error: 'Gagal menghapus tiket' });
    }
  }

  // --- Logika untuk PUT (Update) ---
  if (req.method === 'PUT') {
    try {
      // (Salin-tempel logika PUT dari server.js)
      // const { status, teknisi, ... } = req.body;
      // ... logika update Anda ...
      return res.status(200).json({ success: true, message: 'Tiket berhasil diupdate' });
    } catch (err) {
      return res.status(500).json({ error: 'Gagal mengupdate tiket' });
    }
  }

  // Jika metodenya bukan DELETE atau PUT, tolak
  return res.status(405).json({ error: 'Method Not Allowed' });
}