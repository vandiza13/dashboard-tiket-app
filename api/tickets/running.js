const { db } = require('../_utils/db');
const { protect, restrictTo } = require('../_utils/auth');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User', 'View']);

    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    let whereClause = `WHERE t.status IN ('OPEN', 'SC')`;
    const params = [];

    if (startDate && endDate) {
        whereClause += ' AND DATE(t.tiket_time) BETWEEN ? AND ?';
        params.push(startDate, endDate);
    }

    const countSql = `SELECT COUNT(*) as total FROM tickets t ${whereClause}`;
    const dataSql = `SELECT t.*, GROUP_CONCAT(CONCAT(tech.name, ' (', tech.phone_number, ')') SEPARATOR ', ') as technician_details FROM tickets t LEFT JOIN technicians tech ON FIND_IN_SET(tech.nik, t.teknisi) ${whereClause} GROUP BY t.id ORDER BY t.tiket_time ASC LIMIT ? OFFSET ?;`;

    const [countResult] = await db.query(countSql, params);
    const totalItems = countResult[0].total;
    const totalPages = Math.max(1, Math.ceil(totalItems / limitNum));
    
    const [results] = await db.query(dataSql, [...params, limitNum, offset]);
    
    res.status(200).json({
        tickets: Array.isArray(results) ? results : [],
        totalPages: totalPages,
        currentPage: pageNum,
        totalItems: totalItems
    });

  } catch (err) {
    console.error(err);
    res.status(401).json({ error: err.message || 'Gagal mengambil tiket running' });
  }
}