const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');
const { db } = require('./_utils/db');
const { protect, restrictTo } = require('./_utils/auth');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'rahasia-super-aman-jangan-disebar';

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api', (req, res) => {
  res.json({ 
    message: "Server is running!", 
    version: "Vercel Production",
    timestamp: new Date().toISOString()
  });
});

// ==================== AUTH ROUTES ====================

app.post('/api/register', async (req, res) => {
  try {
    const adminUser = await protect(req);
    restrictTo(adminUser, ['Admin']);

    const { username, password, role } = req.body; 
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Username, password, dan role harus diisi' });
    }
    
    if (!['User', 'View', 'Admin'].includes(role)) {
      return res.status(400).json({ error: 'Role tidak valid' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [username, hashedPassword, role]
    );
    res.status(201).json({ message: 'Pengguna baru berhasil dibuat' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Username sudah terdaftar' });
    }
    console.error('Register error:', error);
    if (error.message.includes('Akses ditolak') || error.message.includes('tidak memiliki izin')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password harus diisi' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      message: 'Login berhasil', 
      token, 
      role: user.role 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// ==================== PROFILE ROUTES ====================

app.get('/api/profile', async (req, res) => {
  try {
    const user = await protect(req);
    const [rows] = await db.query(
      'SELECT id, username, role, created_at FROM users WHERE id = ?',
      [user.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.put('/api/profile/change-password', async (req, res) => {
  try {
    const user = await protect(req);
    const { currentPassword, newPassword } = req.body;

    const [rows] = await db.query('SELECT password FROM users WHERE id = ?', [user.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Password lama tidak sesuai' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedNewPassword, user.userId]);

    res.json({ message: 'Password berhasil diubah' });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// ==================== USER MANAGEMENT (ADMIN) ROUTES ====================

// GET: Ambil semua pengguna (Hanya Admin)
app.get('/api/users', async (req, res) => {
  try {
    const adminUser = await protect(req);
    restrictTo(adminUser, ['Admin']);

    // Ambil semua pengguna KECUALI admin yang sedang login
    const [users] = await db.query(
      "SELECT id, username, role, created_at FROM users WHERE id != ? ORDER BY username ASC",
      [adminUser.userId]
    );
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    if (error.message.includes('Akses ditolak') || error.message.includes('tidak memiliki izin')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Gagal mengambil data pengguna' });
  }
});

// PUT: Update role pengguna (Hanya Admin)
app.put('/api/users/:id', async (req, res) => {
  try {
    const adminUser = await protect(req);
    restrictTo(adminUser, ['Admin']);

    const { id } = req.params;
    const { role } = req.body;

    if (!role || !['User', 'View', 'Admin'].includes(role)) {
      return res.status(400).json({ error: 'Role tidak valid' });
    }

    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    res.json({ message: 'Role pengguna berhasil diperbarui' });
  } catch (error) {
    console.error('Update user role error:', error);
    if (error.message.includes('Akses ditolak') || error.message.includes('tidak memiliki izin')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Gagal memperbarui role pengguna' });
  }
});

app.put('/api/users/:id/reset-password', async (req, res) => {
  try {
    const adminUser = await protect(req);
    restrictTo(adminUser, ['Admin']);

    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);

    res.json({ message: 'Password pengguna berhasil di-reset' });
  } catch (error) {
    console.error('Reset password error:', error);
    if (error.message.includes('Akses ditolak') || error.message.includes('tidak memiliki izin')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Gagal mereset password' });
  }
});

// DELETE: Hapus pengguna (Hanya Admin)
app.delete('/api/users/:id', async (req, res) => {
  try {
    const adminUser = await protect(req);
    restrictTo(adminUser, ['Admin']);

    const { id } = req.params;

    // TODO: Anda mungkin perlu menangani tiket/data lain yang terkait dengan user ini
    // (misalnya, set 'created_by_user_id' di tiket menjadi NULL atau 'deleted_user')

    await db.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'Pengguna berhasil dihapus' });
  } catch (error) {
    console.error('Delete user error:', error);
    if (error.message.includes('Akses ditolak') || error.message.includes('tidak memiliki izin')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Gagal menghapus pengguna' });
  }
});


// ==================== STATS ROUTES ====================

// --- api/index.js ---

app.get('/api/stats', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User', 'View']);

    const { startDate, endDate } = req.query;

    // 1. Setup Tanggal
    const now = new Date();
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now);
    const firstDayOfMonth = today.substring(0, 7) + '-01';

    // 2. Filter Dinamis untuk Closed Card
    let periodCondition = "AND DATE(last_update_time) = ?";
    let periodParams = [today];
    let periodLabel = "Closed Hari Ini";

    if (startDate && endDate) {
        periodCondition = "AND DATE(last_update_time) BETWEEN ? AND ?";
        periodParams = [startDate, endDate];
        periodLabel = "Closed (Terfilter)";
    }

    // 3. Eksekusi Query
    const [runningTotal] = await db.query("SELECT COUNT(*) as count FROM tickets WHERE status IN ('OPEN', 'SC')");
    
    // Hapus runningBySubcat jika ingin diganti chart bulanan, atau biarkan untuk list text
    const [runningBySubcat] = await db.query("SELECT subcategory, COUNT(*) as count FROM tickets WHERE status IN ('OPEN', 'SC') GROUP BY subcategory ORDER BY count DESC");
    
    const [closedPeriodTotal] = await db.query(`SELECT COUNT(*) as count FROM tickets WHERE status = 'CLOSED' ${periodCondition}`, periodParams);
    const [closedPeriodBySubcat] = await db.query(`SELECT subcategory, COUNT(*) as count FROM tickets WHERE status = 'CLOSED' ${periodCondition} GROUP BY subcategory ORDER BY count DESC`, periodParams);
    
    const [closedThisMonth] = await db.query("SELECT COUNT(*) as count FROM tickets WHERE status = 'CLOSED' AND DATE(last_update_time) >= ?", [firstDayOfMonth]);
    
    const [statusDist] = await db.query("SELECT status, COUNT(*) as count FROM tickets GROUP BY status ORDER BY count DESC");

    // --- QUERY BARU: Distribusi Kategori Per Bulan (6 Bulan Terakhir) ---
    // Mengambil data berdasarkan tiket_time (waktu tiket dibuat)
    const [subcategoryMonthly] = await db.query(`
      SELECT 
        DATE_FORMAT(tiket_time, '%Y-%m') as month, 
        subcategory, 
        COUNT(*) as count 
      FROM tickets 
      WHERE tiket_time >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month, subcategory 
      ORDER BY month ASC
    `);
    // -------------------------------------------------------------------

    res.json({
      periodLabel,
      runningDetails: { total: runningTotal[0].count, bySubcategory: runningBySubcat },
      closedPeriodDetails: { total: closedPeriodTotal[0].count, bySubcategory: closedPeriodBySubcat },
      closedThisMonth: closedThisMonth[0].count,
      statusDistribution: statusDist,
      subcategoryMonthlyDistribution: subcategoryMonthly // <-- Kirim data baru ini
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});


// ==================== TICKETS ROUTES ==================

app.get('/api/tickets/running', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User', 'View']);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    let params = [];

    let query = `
      SELECT 
        t.id, 
        t.id_tiket, 
        t.category, 
        t.subcategory, 
        t.tiket_time, 
        t.deskripsi, 
        t.status, 
        t.update_progres, 
        t.last_update_time, 
        t.created_by_user_id, 
        t.updated_by_user_id,
        GROUP_CONCAT(DISTINCT CONCAT(tech.name, ' (', IFNULL(tech.phone_number, 'No HP'), ')') ORDER BY tech.name SEPARATOR ', ') as technician_details,
        GROUP_CONCAT(DISTINCT tech.nik ORDER BY tech.nik SEPARATOR ',') as assigned_technician_niks,
        ANY_VALUE(u.username) as updated_by
      FROM tickets t
      LEFT JOIN ticket_technicians tt ON t.id = tt.ticket_id
      LEFT JOIN technicians tech ON tt.technician_nik = tech.nik
      LEFT JOIN users u ON t.updated_by_user_id = u.id
      WHERE t.status IN ('OPEN', 'SC')
    `;

    if (req.query.startDate && req.query.endDate) {
      query += ` AND DATE(t.tiket_time) BETWEEN ? AND ?`;
      params.push(req.query.startDate, req.query.endDate);
    }

      query += ` GROUP BY t.id ORDER BY t.tiket_time DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

    const [tickets] = await db.query(query, params);
    const [totalResult] = await db.query("SELECT COUNT(*) as total FROM tickets WHERE status IN ('OPEN', 'SC')");
    const total = totalResult[0].total;

    res.json({
      tickets,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalTickets: total
    });
  } catch (error) {
    console.error('Running tickets error:', error);
    res.status(500).json({ error: 'Gagal mengambil tiket running' });
  }
});

app.get('/api/tickets/closed', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User', 'View']);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    let queryParams = [];

    let query = `
      SELECT 
        t.id, 
        t.id_tiket, 
        t.category, 
        t.subcategory, 
        t.tiket_time, 
        t.deskripsi, 
        t.status, 
        t.update_progres, 
        t.last_update_time, 
        t.created_by_user_id, 
        t.updated_by_user_id,
        GROUP_CONCAT(DISTINCT CONCAT(tech.name, ' (', IFNULL(tech.phone_number, 'No HP'), ')') ORDER BY tech.name SEPARATOR ', ') as technician_details,
        GROUP_CONCAT(DISTINCT tech.nik ORDER BY tech.nik SEPARATOR ',') as assigned_technician_niks,
        ANY_VALUE(u.username) as updated_by
      FROM tickets t
      LEFT JOIN ticket_technicians tt ON t.id = tt.ticket_id
      LEFT JOIN technicians tech ON tt.technician_nik = tech.nik
      LEFT JOIN users u ON t.updated_by_user_id = u.id
      WHERE t.status = 'CLOSED'
    `;

    if (req.query.startDate && req.query.endDate) {
      query += ` AND DATE(t.tiket_time) BETWEEN ? AND ?`;
      queryParams.push(req.query.startDate, req.query.endDate);
    }

    query += ` GROUP BY t.id ORDER BY t.tiket_time DESC LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    const [tickets] = await db.query(query, queryParams);
    
    let countQuery = "SELECT COUNT(*) as total FROM tickets WHERE status = 'CLOSED'";
    let countParams = []; 
    if (req.query.startDate && req.query.endDate) {
      countQuery += ` AND DATE(tiket_time) BETWEEN ? AND ?`;
      countParams.push(req.query.startDate, req.query.endDate);
    }
    const [totalResult] = await db.query(countQuery, countParams);
    const total = totalResult[0].total;

    res.json({
      tickets,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalTickets: total
    });
  } catch (error) {
    console.error('Closed tickets error:', error);
    res.status(500).json({ error: 'Gagal mengambil tiket closed' });
  }
});

app.get('/api/tickets/closed/export', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User', 'View']);

    let query = `
      SELECT 
        t.id, 
        t.id_tiket, 
        t.category, 
        t.subcategory, 
        t.tiket_time, 
        t.deskripsi, 
        t.status,
        t.update_progres, 
        t.last_update_time,
        GROUP_CONCAT(DISTINCT CONCAT(tech.name, ' (', IFNULL(tech.phone_number, 'No HP'), ')') ORDER BY tech.name SEPARATOR ', ') as technician_details,
        ANY_VALUE(u.username) as updated_by
      FROM tickets t
      LEFT JOIN ticket_technicians tt ON t.id = tt.ticket_id
      LEFT JOIN technicians tech ON tt.technician_nik = tech.nik
      LEFT JOIN users u ON t.updated_by_user_id = u.id
      WHERE t.status = 'CLOSED'
    `;

    const params = [];
    if (req.query.startDate && req.query.endDate) {
      query += ` AND DATE(t.tiket_time) BETWEEN ? AND ?`;
      params.push(req.query.startDate, req.query.endDate);
    }

    query += ` GROUP BY t.id ORDER BY t.tiket_time DESC`;

    const [tickets] = await db.query(query, params);

    if (tickets.length === 0) {
      return res.status(404).json({ error: 'Tidak ada data untuk diekspor pada rentang tanggal ini.' });
    }

    // Konversi datetime ke format WIB untuk Excel
    const ticketsFormatted = tickets.map(ticket => ({
      ...ticket,
      tiket_time: formatDateTimeForExcel(ticket.tiket_time),
      last_update_time: formatDateTimeForExcel(ticket.last_update_time)
    }));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Laporan Tiket Closed');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'ID Tiket', key: 'id_tiket', width: 25 },
      { header: 'Kategori', key: 'category', width: 15 },
      { header: 'Sub-kategori', key: 'subcategory', width: 20 },
      { header: 'Waktu Tiket (WIB)', key: 'tiket_time', width: 25 },
      { header: 'Deskripsi', key: 'deskripsi', width: 50 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Teknisi', key: 'technician_details', width: 40 },
      { header: 'Update Progres', key: 'update_progres', width: 60 },
      { header: 'Update Terakhir (WIB)', key: 'last_update_time', width: 25 },
      { header: 'Updated By', key: 'updated_by', width: 20 }
    ];

    worksheet.addRows(ticketsFormatted);

    // Styling
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '366092' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
      };
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
          };
        });
      }
    });
    
    worksheet.getColumn('deskripsi').alignment = { wrapText: true };
    worksheet.getColumn('update_progres').alignment = { wrapText: true };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Laporan_Tiket_Closed_${new Date().toISOString().slice(0,10)}.xlsx"`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Gagal mengekspor data. Terjadi kesalahan di server.' });
  }
});

app.post('/api/tickets', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User']);

    const { category, subcategory, id_tiket, tiket_time, deskripsi } = req.body;
    if (!category || !subcategory || !id_tiket || !tiket_time || !deskripsi) {
      return res.status(400).json({ error: 'Semua field harus diisi' });
    }

    // Gunakan NOW() yang sudah timezone-aware dari pool connection
    const [result] = await db.query(
    'INSERT INTO tickets (category, subcategory, id_tiket, tiket_time, deskripsi, status, created_by_user_id, updated_by_user_id, last_update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
    [category, subcategory, id_tiket, tiket_time, deskripsi, 'OPEN', user.userId, user.userId]
  );

    await db.query(
      'INSERT INTO ticket_history (ticket_id, change_details, changed_by) VALUES (?, ?, ?)',
      [result.insertId, `Tiket dibuat dengan status OPEN`, user.username]
    );

    res.status(201).json({ message: 'Tiket berhasil ditambahkan', ticketId: result.insertId });

    } catch (error) {
  // --- TAMBAHKAN PENGECEKAN INI ---
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(400).json({ error: 'ID Tiket sudah ada dalam Dashboard' });
  }
  // ---------------------------------
  console.error('Create ticket error:', error);
  res.status(500).json({ error: 'Terjadi kesalahan server saat menambahkan tiket' });
}
});

app.put('/api/tickets/:id', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User']);

    const { id } = req.params;
    const { category, subcategory, status, teknisi, update_progres } = req.body;

    const [oldTicket] = await db.query('SELECT * FROM tickets WHERE id = ?', [id]);
    if (oldTicket.length === 0) {
      return res.status(404).json({ error: 'Tiket tidak ditemukan' });
    }

    // Gunakan NOW() yang sudah timezone-aware
    await db.query(
      'UPDATE tickets SET category = ?, subcategory = ?, status = ?, update_progres = ?, updated_by_user_id = ?, last_update_time = NOW() WHERE id = ?',
      [category, subcategory, status, update_progres, user.userId, id]
    );

    await db.query('DELETE FROM ticket_technicians WHERE ticket_id = ?', [id]);
    
    if (teknisi && Array.isArray(teknisi) && teknisi.length > 0) {
      for (const nik of teknisi) {
        await db.query('INSERT INTO ticket_technicians (ticket_id, technician_nik) VALUES (?, ?)', [id, nik]);
      }
    }

    let changeDetails = `Status: ${oldTicket[0].status} → ${status}`;
    if (update_progres) changeDetails += `; Update Progres: ${update_progres}`;

    await db.query(
      'INSERT INTO ticket_history (ticket_id, change_details, changed_by) VALUES (?, ?, ?)',
      [id, changeDetails, user.username]
    );

    res.json({ message: 'Tiket berhasil diperbarui' });
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({ error: 'Gagal memperbarui tiket' });
  }
});

app.delete('/api/tickets/:id', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin']);

    const { id } = req.params;
    await db.query('DELETE FROM ticket_technicians WHERE ticket_id = ?', [id]);
    await db.query('DELETE FROM ticket_history WHERE ticket_id = ?', [id]);
    await db.query('DELETE FROM tickets WHERE id = ?', [id]);

    res.json({ message: 'Tiket berhasil dihapus' });
  } catch (error) {
    console.error('Delete ticket error:', error);
    res.status(500).json({ error: 'Gagal menghapus tiket' });
  }
});

app.get('/api/tickets/:id/history', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User', 'View']);

    const { id } = req.params;
    const [history] = await db.query(
      'SELECT * FROM ticket_history WHERE ticket_id = ? ORDER BY change_timestamp DESC',
      [id]
    );

    res.json(history);
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Gagal mengambil riwayat' });
  }
});

// ==================== TECHNICIANS ROUTES ====================

app.get('/api/technicians', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User', 'View']);

    const [technicians] = await db.query('SELECT * FROM technicians ORDER BY name ASC');
    res.json(technicians);
  } catch (error) {
    console.error('Technicians error:', error);
    res.status(500).json({ error: 'Gagal mengambil data teknisi' });
  }
});

app.get('/api/technicians/active', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User']);

    const [technicians] = await db.query('SELECT * FROM technicians WHERE is_active = 1 ORDER BY name ASC');
    res.json(technicians);
  } catch (error) {
    console.error('Active technicians error:', error);
    res.status(500).json({ error: 'Gagal mengambil teknisi aktif' });
  }
});

app.post('/api/technicians', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin']);

    const { nik, name, phone_number } = req.body;
    if (!nik || !name) {
      return res.status(400).json({ error: 'NIK dan nama harus diisi' });
    }

    await db.query(
      'INSERT INTO technicians (nik, name, phone_number, is_active) VALUES (?, ?, ?, 1)',
      [nik, name, phone_number]
    );

    res.status(201).json({ message: 'Teknisi berhasil ditambahkan' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'NIK sudah terdaftar' });
    }
    console.error('Add technician error:', error);
    res.status(500).json({ error: 'Gagal menambahkan teknisi' });
  }
});

app.put('/api/technicians/:nik', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin']);

    const { nik } = req.params;
    const { name, phone_number } = req.body;

    await db.query(
      'UPDATE technicians SET name = ?, phone_number = ? WHERE nik = ?',
      [name, phone_number, nik]
    );

    res.json({ message: 'Teknisi berhasil diperbarui' });
  } catch (error) {
    console.error('Update technician error:', error);
    res.status(500).json({ error: 'Gagal memperbarui teknisi' });
  }
});

app.put('/api/technicians/status/:nik', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin']);

    const { nik } = req.params;
    const { is_active } = req.body;

    await db.query('UPDATE technicians SET is_active = ? WHERE nik = ?', [is_active, nik]);
    res.json({ message: 'Status teknisi berhasil diperbarui' });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Gagal mengubah status teknisi' });
  }
});

app.delete('/api/technicians/:nik', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin']);

    const { nik } = req.params;
    await db.query('DELETE FROM ticket_technicians WHERE technician_nik = ?', [nik]);
    await db.query('DELETE FROM technicians WHERE nik = ?', [nik]);

    res.json({ message: 'Teknisi berhasil dihapus' });
  } catch (error) {
    console.error('Delete technician error:', error);
    res.status(500).json({ error: 'Gagal menghapus teknisi' });
  }
});

// Helper function untuk format datetime ke WIB untuk Excel
function formatDateTimeForExcel(datetime) {
  if (!datetime) return '';
  const date = new Date(datetime);
  if (isNaN(date.getTime())) return datetime;
  
  // Format: DD/MM/YYYY HH:mm WIB
  const options = {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  
  return new Intl.DateTimeFormat('id-ID', options).format(date) + ' WIB';
}

// Export untuk Vercel
module.exports = app;