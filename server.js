const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3001;
const JWT_SECRET = 'rahasia-super-aman-jangan-disebar';

app.use(cors());
app.use(express.json());

const db = mysql.createPool({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'tiket_db',
  port: process.env.MYSQLPORT || 3306,
  timezone: '+07:00',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

db.getConnection()
  .then(connection => {
    console.log('✅ Successfully connected to the database.');
    connection.release();
    seedDatabase();
  })
  .catch(err => {
    console.error('❌ Error connecting to database:', err);
  });

async function seedDatabase() {
  const usersToSeed = [
    { username: 'admin', password: 'password123', role: 'Admin' },
    { username: 'user', password: 'password123', role: 'User' },
    { username: 'view', password: 'password123', role: 'View' }
  ];
  for (const userData of usersToSeed) {
    try {
        const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [userData.username]);
        if (rows.length === 0) {
            console.log(`Creating user: ${userData.username}`);
            const hash = await bcrypt.hash(userData.password, 10);
            await db.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [userData.username, hash, userData.role]);
            console.log(`✅ User ${userData.username} created successfully.`);
        }
    } catch (err) {
        console.error(`Error seeding user ${userData.username}:`, err);
    }
  }
}

const protect = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Akses ditolak, tidak ada token' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token tidak valid' });
    req.user = user;
    next();
  });
};

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk melakukan aksi ini' });
    }
    next();
  };
};

app.get('/', (req, res) => res.json({ message: "Server is running!", version: "Final" }));

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username dan password diperlukan' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO users (username, password_hash) VALUES (?, ?)", [username, hash]);
    res.status(201).json({ success: true, message: 'Registrasi berhasil' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username sudah digunakan' });
    res.status(500).json({ error: 'Gagal mendaftarkan pengguna' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username dan password diperlukan' });
  try {
    const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
    if (rows.length === 0) return res.status(401).json({ error: 'Username atau password salah' });
    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Username atau password salah' });
    const tokenPayload = { userId: user.id, username: user.username, role: user.role };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });
    res.json({ success: true, message: 'Login berhasil', token, role: user.role });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/profile', protect, async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id, username, role, created_at FROM users WHERE id = ?", [req.user.userId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil profil' });
    }
});

app.put('/api/profile/change-password', protect, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Semua field password harus diisi.' });
    try {
        const [rows] = await db.query("SELECT password_hash FROM users WHERE id = ?", [req.user.userId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
        const user = rows[0];
        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) return res.status(401).json({ error: 'Password saat ini salah.' });
        const hash = await bcrypt.hash(newPassword, 10);
        await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.user.userId]);
        res.json({ success: true, message: 'Password berhasil diubah.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengubah password.' });
    }
});

app.get('/api/stats', protect, restrictTo('Admin', 'User', 'View'), async (req, res) => {
    try {
        const overviewSql = `SELECT (SELECT COUNT(*) FROM tickets WHERE status IN ('OPEN', 'SC')) as totalRunning, (SELECT COUNT(*) FROM tickets WHERE status = 'CLOSED' AND MONTH(last_update_time) = MONTH(CURDATE()) AND YEAR(last_update_time) = YEAR(CURDATE())) as closedThisMonth`;
        const [overviewResult] = await db.query(overviewSql);
        const statusSql = "SELECT status, COUNT(*) as count FROM tickets GROUP BY status";
        const [statusResult] = await db.query(statusSql);
        const categorySql = "SELECT category, COUNT(*) as count FROM tickets WHERE category IS NOT NULL AND category != '' GROUP BY category";
        const [categoryResult] = await db.query(categorySql);
        res.json({
            overview: overviewResult[0],
            statusDistribution: statusResult,
            categoryDistribution: categoryResult
        });
    } catch (err) {
        console.error("Error fetching stats:", err);
        res.status(500).json({ error: 'Gagal mengambil data statistik' });
    }
});

app.get('/api/tickets/running', protect, restrictTo('Admin', 'User', 'View'), async (req, res) => {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let whereClause = `WHERE t.status IN ('OPEN', 'SC')`;
    const params = [];
    if (startDate && endDate) {
        whereClause += ' AND DATE(t.tiket_time) BETWEEN ? AND ?';
        params.push(startDate, endDate);
    }
    const countSql = `SELECT COUNT(*) as total FROM tickets t ${whereClause}`;
    const dataSql = `SELECT t.*, GROUP_CONCAT(CONCAT(tech.name, ' (', tech.phone_number, ')') SEPARATOR ', ') as technician_details FROM tickets t LEFT JOIN technicians tech ON FIND_IN_SET(tech.nik, t.teknisi) ${whereClause} GROUP BY t.id ORDER BY t.tiket_time ASC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)};`;
    try {
        const [countResult] = await db.query(countSql, params);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);
        const [results] = await db.query(dataSql, params);
        res.json({
            tickets: results,
            totalPages: totalPages,
            currentPage: parseInt(page),
            totalItems: totalItems
        });
    } catch (err) {
        res.status(500).json({ error: `Gagal mengambil tiket running` });
    }
});

app.get('/api/tickets/closed', protect, restrictTo('Admin', 'User', 'View'), async (req, res) => {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let whereClause = `WHERE t.status = 'CLOSED'`;
    const params = [];
    if (startDate && endDate) {
        whereClause += ' AND DATE(t.tiket_time) BETWEEN ? AND ?';
        params.push(startDate, endDate);
    }
    const countSql = `SELECT COUNT(*) as total FROM tickets t ${whereClause}`;
    const dataSql = `SELECT t.*, GROUP_CONCAT(CONCAT(tech.name, ' (', tech.phone_number, ')') SEPARATOR ', ') as technician_details FROM tickets t LEFT JOIN technicians tech ON FIND_IN_SET(tech.nik, t.teknisi) ${whereClause} GROUP BY t.id ORDER BY t.tiket_time DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)};`;
    try {
        const [countResult] = await db.query(countSql, params);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);
        const [results] = await db.query(dataSql, params);
        res.json({
            tickets: results,
            totalPages: totalPages,
            currentPage: parseInt(page),
            totalItems: totalItems
        });
    } catch (err) {
        res.status(500).json({ error: `Gagal mengambil tiket closed` });
    }
});

app.post('/api/tickets', protect, restrictTo('Admin', 'User'), async (req, res) => {
  const { id_tiket, deskripsi, tiket_time, category, subcategory } = req.body;
  if (!id_tiket || !deskripsi || !tiket_time || !category || !subcategory) return res.status(400).json({ error: 'Semua field termasuk kategori harus diisi' }); 
  try {
    await db.query("INSERT INTO tickets (id_tiket, deskripsi, category, subcategory, tiket_time, status) VALUES (?, ?, ?, ?, ?, 'OPEN')", [id_tiket, deskripsi, category, subcategory, tiket_time]);
    res.status(201).json({ success: true, message: 'Tiket berhasil dibuat' });
  } catch(err) {
    res.status(500).json({ error: 'Gagal menyimpan tiket' });
  }
});

app.put('/api/tickets/:id', protect, restrictTo('Admin', 'User'), async (req, res) => {
  const ticketId = req.params.id;
  const { status, teknisi, update_progres, category, subcategory } = req.body;
  const updatedBy = req.user.username;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT * FROM tickets WHERE id = ?", [ticketId]);
    if (rows.length === 0) throw new Error('Tiket tidak ditemukan');
    const oldTicket = rows[0];
    const teknisiNiks = Array.isArray(teknisi) ? teknisi.join(',') : '';
    await connection.query("UPDATE tickets SET status = ?, teknisi = ?, update_progres = ?, updated_by = ?, last_update_time = ?, category = ?, subcategory = ? WHERE id = ?", [status, teknisiNiks, update_progres, updatedBy, new Date(), category, subcategory, ticketId]);
    let changes = [];
    if (oldTicket.status !== status) changes.push(`Status: '${oldTicket.status}' -> '${status}'`);
    if (oldTicket.teknisi !== teknisiNiks) changes.push(`Teknisi diubah`);
    if (oldTicket.update_progres !== update_progres) changes.push(`Progres diubah`);
    if (changes.length > 0) {
      await connection.query("INSERT INTO ticket_history (ticket_id, changed_by, change_details, change_timestamp) VALUES (?, ?, ?, ?)", [ticketId, updatedBy, changes.join('. '), new Date()]);
    }
    await connection.commit();
    res.json({ success: true, message: 'Tiket berhasil diupdate' });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: 'Gagal mengupdate tiket' });
  } finally {
    connection.release();
  }
});

app.delete('/api/tickets/:id', protect, restrictTo('Admin'), async (req, res) => {
  try {
    await db.query("DELETE FROM tickets WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: 'Tiket berhasil dihapus' });
  } catch(err) {
    res.status(500).json({ error: 'Gagal menghapus tiket' });
  }
});

app.get('/api/tickets/:id/history', protect, restrictTo('Admin', 'User', 'View'), async (req, res) => {
  try {
    const [history] = await db.query("SELECT * FROM ticket_history WHERE ticket_id = ? ORDER BY change_timestamp DESC", [req.params.id]);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil riwayat tiket' });
  }
});

app.get('/api/technicians', protect, restrictTo('Admin', 'User', 'View'), async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM technicians ORDER BY name ASC");
    res.json(rows);
  } catch(err) {
    res.status(500).json({ error: 'Gagal mengambil data teknisi' });
  }
});

app.get('/api/technicians/active', protect, restrictTo('Admin', 'User'), async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM technicians WHERE is_active = TRUE ORDER BY name ASC");
        res.json(rows);
    } catch(err) {
        res.status(500).json({ error: 'Gagal mengambil data teknisi aktif' });
    }
});

app.post('/api/technicians', protect, restrictTo('Admin'), async (req, res) => {
  const { nik, name, phone_number } = req.body;
  if (!nik || !name) return res.status(400).json({ error: 'NIK dan Nama tidak boleh kosong' });
  if (nik.length !== 8 || !/^\d+$/.test(nik)) return res.status(400).json({ error: 'NIK harus 8 digit angka' });
  try {
    await db.query("INSERT INTO technicians (nik, name, phone_number) VALUES (?, ?, ?)", [nik, name, phone_number]);
    res.status(201).json({ success: true, message: 'Teknisi berhasil dibuat' });
  } catch(err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'NIK sudah terdaftar' });
    res.status(500).json({ error: 'Gagal menyimpan teknisi' });
  }
});

app.put('/api/technicians/:nik', protect, restrictTo('Admin'), async (req, res) => {
    const { name, phone_number } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama tidak boleh kosong' });
    try {
        await db.query("UPDATE technicians SET name = ?, phone_number = ? WHERE nik = ?", [name, phone_number, req.params.nik]);
        res.json({ success: true, message: 'Teknisi berhasil diupdate' });
    } catch(err) {
        res.status(500).json({ error: 'Gagal mengupdate teknisi' });
    }
});

app.put('/api/technicians/status/:nik', protect, restrictTo('Admin'), async (req, res) => {
    const { is_active } = req.body;
    try {
        await db.query("UPDATE technicians SET is_active = ? WHERE nik = ?", [is_active, req.params.nik]);
        res.json({ success: true, message: 'Status teknisi berhasil diupdate' });
    } catch(err) {
        res.status(500).json({ error: 'Gagal mengupdate status teknisi' });
    }
});

app.delete('/api/technicians/:nik', protect, restrictTo('Admin'), async (req, res) => {
  try {
    await db.query("DELETE FROM technicians WHERE nik = ?", [req.params.nik]);
    res.json({ success: true, message: 'Teknisi berhasil dihapus' });
  } catch(err) {
    res.status(500).json({ error: 'Gagal menghapus teknisi' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server backend berjalan di port ${port}`);
});

