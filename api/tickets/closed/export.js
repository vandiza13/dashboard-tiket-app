const { db } = require('../../_utils/db');
const { protect, restrictTo } = require('../../_utils/auth');
const { Parser } = require('json2csv');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User', 'View']);

    const { startDate, endDate } = req.query;
    let whereClause = `WHERE t.status = 'CLOSED'`;
    const params = [];

    if (startDate && endDate) {
        whereClause += ' AND DATE(t.tiket_time) BETWEEN ? AND ?';
        params.push(startDate, endDate);
    }
    
    const sql = `
        SELECT 
            t.id_tiket, t.category, t.subcategory, t.tiket_time,
            t.last_update_time, t.deskripsi, t.status,
            GROUP_CONCAT(tech.name SEPARATOR ', ') as teknisi_nama,
            t.update_progres, t.updated_by
        FROM tickets t 
        LEFT JOIN technicians tech ON FIND_IN_SET(tech.nik, t.teknisi) 
        ${whereClause} 
        GROUP BY t.id 
        ORDER BY t.tiket_time DESC;
    `;

    const [results] = await db.query(sql, params);

    if (results.length === 0) {
        return res.status(404).send("Tidak ada data untuk diexport pada rentang tanggal ini.");
    }

    const fields = [
        { label: 'ID Tiket', value: 'id_tiket' },
        { label: 'Kategori', value: 'category' },
        { label: 'Jenis Tiket', value: 'subcategory' },
        { label: 'Waktu Tiket', value: 'tiket_time' },
        { label: 'Waktu Selesai', value: 'last_update_time' },
        { label: 'Deskripsi', value: 'deskripsi' },
        { label: 'Status', value: 'status' },
        { label: 'Teknisi', value: 'teknisi_nama' },
        { label: 'Update Progres', value: 'update_progres' },
        { label: 'Diupdate Oleh', value: 'updated_by' }
    ];
    
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(results);

    // Atur header agar browser mengunduh file
    res.header('Content-Type', 'text/csv');
    res.attachment(`Laporan Tiket Closed - ${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csv);

  } catch (err) {
    console.error("Error exporting closed tickets:", err);
    res.status(401).json({ error: err.message || 'Gagal mengekspor data' });
  }
}