const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password harus diisi' });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const role = 'User';
    await db.query(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [username, hashedPassword, role]
    );
    res.status(201).json({ message: 'Registrasi berhasil' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Username sudah terdaftar' });
    }
    console.error('Register error:', error);
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

// ==================== STATS ROUTES ====================

app.get('/api/stats', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User', 'View']);

    const today = new Date().toISOString().split('T')[0];
    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const [runningTotal] = await db.query("SELECT COUNT(*) as count FROM tickets WHERE status IN ('OPEN', 'SC')");
    const [runningBySubcat] = await db.query("SELECT subcategory, COUNT(*) as count FROM tickets WHERE status IN ('OPEN', 'SC') GROUP BY subcategory ORDER BY count DESC");
    
    const [closedTodayTotal] = await db.query("SELECT COUNT(*) as count FROM tickets WHERE status = 'CLOSED' AND DATE(last_update_time) = ?", [today]);
    const [closedTodayBySubcat] = await db.query("SELECT subcategory, COUNT(*) as count FROM tickets WHERE status = 'CLOSED' AND DATE(last_update_time) = ? GROUP BY subcategory ORDER BY count DESC", [today]);
    
    const [closedThisMonth] = await db.query("SELECT COUNT(*) as count FROM tickets WHERE status = 'CLOSED' AND DATE(last_update_time) >= ?", [firstDayOfMonth]);
    
    const [statusDist] = await db.query("SELECT status, COUNT(*) as count FROM tickets GROUP BY status ORDER BY count DESC");
    const [categoryDist] = await db.query("SELECT category, COUNT(*) as count FROM tickets GROUP BY category ORDER BY count DESC");

    res.json({
      runningDetails: {
        total: runningTotal[0].count,
        bySubcategory: runningBySubcat
      },
      closedTodayDetails: {
        total: closedTodayTotal[0].count,
        bySubcategory: closedTodayBySubcat
      },
      closedThisMonth: closedThisMonth[0].count,
      statusDistribution: statusDist,
      categoryDistribution: categoryDist
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Gagal mengambil statistik' });
  }
});

app.get('/api/stats/closed-trend', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User', 'View']);

    const days = parseInt(req.query.days) || 30;
    const [rows] = await db.query(`
      SELECT DATE(last_update_time) as date, COUNT(*) as count
      FROM tickets
      WHERE status = 'CLOSED' AND last_update_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(last_update_time)
      ORDER BY date ASC
    `, [days]);

    res.json(rows);
  } catch (error) {
    console.error('Trend error:', error);
    res.status(500).json({ error: 'Gagal mengambil data trend' });
  }
});

// ==================== TICKETS ROUTES ====================

app.get('/api/tickets/running', async (req, res) => {
  try {
    const user = await protect(req);
    restrictTo(user, ['Admin', 'User', 'View']);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    let query = `
      SELECT t.*, 
      GROUP_CONCAT(DISTINCT tech.name ORDER BY tech.name SEPARATOR ', ') as technician_details,
      u.username as updated_by
      FROM tickets t
      LEFT JOIN ticket_technicians tt ON t.id = tt.ticket_id
      LEFT JOIN technicians tech ON tt.technician_nik = tech.nik
      LEFT JOIN users u ON t.updated_by_user_id = u.id
      WHERE t.status IN ('OPEN', 'SC')
    `;

    if (req.query.startDate && req.query.endDate) {
      query += ` AND DATE(t.tiket_time) BETWEEN '${req.query.startDate}' AND '${req.query.endDate}'`;
    }

    query += ` GROUP BY t.id ORDER BY t.tiket_time DESC LIMIT ${limit} OFFSET ${offset}`;

    const [tickets] = await db.query(query);
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

    let query = `
      SELECT t.*, 
      GROUP_CONCAT(DISTINCT tech.name ORDER BY tech.name SEPARATOR ', ') as technician_details,
      u.username as updated_by
      FROM tickets t
      LEFT JOIN ticket_technicians tt ON t.id = tt.ticket_id
      LEFT JOIN technicians tech ON tt.technician_nik = tech.nik
      LEFT JOIN users u ON t.updated_by_user_id = u.id
      WHERE t.status = 'CLOSED'
    `;

    if (req.query.startDate && req.query.endDate) {
      query += ` AND DATE(t.last_update_time) BETWEEN '${req.query.startDate}' AND '${req.query.endDate}'`;
    }

    query += ` GROUP BY t.id ORDER BY t.last_update_time DESC LIMIT ${limit} OFFSET ${offset}`;

    const [tickets] = await db.query(query);
    
    let countQuery = "SELECT COUNT(*) as total FROM tickets WHERE status = 'CLOSED'";
    if (req.query.startDate && req.query.endDate) {
      countQuery += ` AND DATE(last_update_time) BETWEEN '${req.query.startDate}' AND '${req.query.endDate}'`;
    }
    const [totalResult] = await db.query(countQuery);
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
      SELECT t.id, t.id_tiket, t.category, t.subcategory, t.tiket_time, t.deskripsi, t.status,
      GROUP_CONCAT(DISTINCT tech.name ORDER BY tech.name SEPARATOR ', ') as technician_details,
      t.update_progres, t.last_update_time, u.username as updated_by
      FROM tickets t
      LEFT JOIN ticket_technicians tt ON t.id = tt.ticket_id
      LEFT JOIN technicians tech ON tt.technician_nik = tech.nik
      LEFT JOIN users u ON t.updated_by_user_id = u.id
      WHERE t.status = 'CLOSED'
    `;

    if (req.query.startDate && req.query.endDate) {
      query += ` AND DATE(t.last_update_time) BETWEEN '${req.query.startDate}' AND '${req.query.endDate}'`;
    }

    query += ` GROUP BY t.id ORDER BY t.last_update_time DESC`;

    const [tickets] = await db.query(query);

    if (tickets.length === 0) {
      return res.status(404).json({ error: 'Tidak ada data untuk diekspor' });
    }

    const fields = ['id', 'id_tiket', 'category', 'subcategory', 'tiket_time', 'deskripsi', 'status', 'technician_details', 'update_progres', 'last_update_time', 'updated_by'];
    const parser = new Parser({ fields });
    const csv = parser.parse(tickets);

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', 'attachment; filename=closed_tickets.csv');
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Gagal mengekspor data' });
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

    // Gunakan CONVERT_TZ untuk waktu yang konsisten
    const [result] = await db.query(
      'INSERT INTO tickets (category, subcategory, id_tiket, tiket_time, deskripsi, status, created_by_user_id, updated_by_user_id, last_update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CONVERT_TZ(NOW(), "+00:00", "+07:00"))',
      [category, subcategory, id_tiket, tiket_time, deskripsi, 'OPEN', user.userId, user.userId]
    );

    await db.query(
      'INSERT INTO ticket_history (ticket_id, change_details, changed_by) VALUES (?, ?, ?)',
      [result.insertId, `Tiket dibuat dengan status OPEN`, user.username]
    );

    res.status(201).json({ message: 'Tiket berhasil ditambahkan', ticketId: result.insertId });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ error: 'Gagal menambahkan tiket' });
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

    // Gunakan CONVERT_TZ untuk set timezone ke WIB (UTC+7)
    await db.query(
      'UPDATE tickets SET category = ?, subcategory = ?, status = ?, update_progres = ?, updated_by_user_id = ?, last_update_time = CONVERT_TZ(NOW(), "+00:00", "+07:00") WHERE id = ?',
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

// Export untuk Vercel
module.exports = app;