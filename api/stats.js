const { db } = require('./_utils/db');
const { protect, restrictTo } = require('./_utils/auth');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User', 'View']);

    // Salin-tempel SEMUA logika query Anda dari server.js
    const [runningTotalRows] = await db.query("SELECT COUNT(*) as total FROM tickets WHERE status IN ('OPEN', 'SC')");
    const [runningBySubcat] = await db.query("SELECT subcategory, COUNT(*) as count FROM tickets WHERE status IN ('OPEN', 'SC') GROUP BY subcategory");
    const [closedTodayRows] = await db.query("SELECT COUNT(*) as total FROM tickets WHERE status = 'CLOSED' AND DATE(last_update_time) = CURDATE()");
    // ... (query Anda yang lain) ...
    const [closedTodayBySubcat] = await db.query(
        "SELECT subcategory, COUNT(*) as count FROM tickets WHERE status = 'CLOSED' AND DATE(last_update_time) = CURDATE() GROUP BY subcategory"
    );
    const [closedThisMonthRows] = await db.query(
        "SELECT COUNT(*) as total FROM tickets WHERE status = 'CLOSED' AND MONTH(last_update_time) = MONTH(CURDATE()) AND YEAR(last_update_time) = YEAR(CURDATE())"
    );
    const [statusDistribution] = await db.query(
        "SELECT status, COUNT(*) as count FROM tickets GROUP BY status"
    );
    const [categoryDistribution] = await db.query(
        "SELECT category, COUNT(*) as count FROM tickets WHERE category IS NOT NULL AND category != '' GROUP BY category"
    );

    // Kirim respons
    res.status(200).json({
        runningDetails: {
            total: runningTotalRows[0]?.total || 0,
            bySubcategory: runningBySubcat
        },
        closedTodayDetails: {
            total: closedTodayRows[0]?.total || 0,
            bySubcategory: closedTodayBySubcat
        },
        closedThisMonth: closedThisMonthRows[0]?.total || 0,
        statusDistribution,
        categoryDistribution
    });

  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(401).json({ error: err.message || 'Gagal mengambil data statistik' });
  }
}