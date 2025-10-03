const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = 3001;
const JWT_SECRET = 'rahasia-super-aman-jangan-disebar';

app.use(cors());
app.use(express.json());

// Konfigurasi Koneksi Database (versi deployment)
const db = mysql.createConnection({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'tiket_db',
  port: process.env.MYSQLPORT || 3306
});

db.connect(err => {
  if (err) {
    console.error('❌ Error connecting to database:', err);
    return;
  }
  console.log('✅ Successfully connected to the database.');
});


// === ENDPOINT DEBUGGING "HEALTH CHECK" ===
app.get('/', (req, res) => {
  res.json({
    message: "Server is running!",
    version: "2.0-with-auth" // Penanda versi kode
  });
});


// === API UNTUK AUTENTIKASI ===
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password diperlukan' });
  }
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) { return res.status(500).json({ error: 'Gagal mengenkripsi password' }); }
    const sql = "INSERT INTO users (username, password_hash) VALUES (?, ?)";
    db.query(sql, [username, hash], (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') { return res.status(409).json({ error: 'Username sudah digunakan' }); }
        return res.status(500).json({ error: 'Gagal mendaftarkan pengguna' });
      }
      res.status(201).json({ success: true, message: 'Registrasi berhasil' });
    });
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password diperlukan' });
  }
  const sql = "SELECT * FROM users WHERE username = ?";
  db.query(sql, [username], (err, results) => {
    if (err || results.length === 0) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }
    const user = results[0];
    bcrypt.compare(password, user.password_hash, (err, isMatch) => {
      if (err || !isMatch) {
        return res.status(401).json({ error: 'Username atau password salah' });
      }
      const tokenPayload = { userId: user.id, username: user.username, role: user.role };
      const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });
      res.json({ success: true, message: 'Login berhasil', token: token, role: user.role });
    });
  });
});

// === MIDDLEWARE UNTUK PROTEKSI API ===
const protect = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) { return res.status(401).json({ error: 'Akses ditolak, tidak ada token' }); }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) { return res.status(403).json({ error: 'Token tidak valid' }); }
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

// === API TIKET DENGAN PROTEKSI PERAN ===
app.get('/api/tickets', protect, restrictTo('Admin', 'User', 'View'), (req, res) => {
  const sql = "SELECT * FROM tickets ORDER BY tiket_time ASC";
  db.query(sql, (err, results) => {
    if (err) { return res.status(500).json({ error: 'Failed to fetch tickets' }); }
    res.json(results);
  });
});

app.post('/api/tickets', protect, restrictTo('Admin', 'User'), (req, res) => {
  const { id_tiket, deskripsi, tiket_time } = req.body;
  if (!id_tiket || !deskripsi || !tiket_time) { return res.status(400).json({ error: 'ID Tiket, Deskripsi, dan Waktu Tiket tidak boleh kosong' }); }
  const sql = "INSERT INTO tickets (id_tiket, deskripsi, tiket_time, status) VALUES (?, ?, ?, 'OPEN')";
  db.query(sql, [id_tiket, deskripsi, tiket_time], (err, result) => {
    if (err) { return res.status(500).json({ error: 'Gagal menyimpan tiket' }); }
    res.status(201).json({ success: true, message: 'Tiket berhasil dibuat' });
  });
});

app.put('/api/tickets/:id', protect, restrictTo('Admin', 'User'), (req, res) => {
  const { status, teknisi, update_progres } = req.body;
  const sql = "UPDATE tickets SET status = ?, teknisi = ?, update_progres = ? WHERE id = ?";
  db.query(sql, [status, teknisi, update_progres, req.params.id], (err, result) => {
    if (err) { return res.status(500).json({ error: 'Gagal meng-update tiket' }); }
    res.json({ success: true, message: 'Tiket berhasil di-update' });
  });
});

app.delete('/api/tickets/:id', protect, restrictTo('Admin'), (req, res) => {
  const sql = "DELETE FROM tickets WHERE id = ?";
  db.query(sql, [req.params.id], (err, result) => {
    if (err) { return res.status(500).json({ error: 'Gagal menghapus tiket' }); }
    res.json({ success: true, message: 'Tiket berhasil dihapus' });
  });
});

app.listen(port, () => {
  console.log(`🚀 Server backend berjalan di http://localhost:${port}`);
});