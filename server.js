const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3001;
const JWT_SECRET = 'rahasia-super-aman-jangan-disebar';

app.use(cors());
app.use(express.json());

// Konfigurasi Koneksi Database (versi deployment)
const db = mysql.createConnection({
  host: process.env.MYSQLHOST || 'mysql.railway.internal',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || 'pgcVhHDrauwKnifjlFsAkgsOopIcEQGQ',
  database: process.env.MYSQLDATABASE || 'railway',
  port: process.env.MYSQLPORT || 3306
});

// === ENDPOINT DEBUGGING "HEALTH CHECK" ===
app.get('/', (req, res) => {
  res.json({
    message: "Server is running!",
    version: "2.1-port-fix"
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

app.post('/api/tickets', (req, res) => {
  const { id_tiket, deskripsi, status, teknisi, update_progres } = req.body;

  if (!id_tiket || !deskripsi) {
    return res.status(400).json({ error: 'id_tiket dan deskripsi wajib diisi' });
  }

  const sql = "INSERT INTO tickets (id_tiket, tiket_time, deskripsi, status, teknisi, update_progres) VALUES (?, NOW(), ?, ?, ?, ?)";
  db.query(sql, [id_tiket, deskripsi, status || 'Open', teknisi || null, update_progres || null], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: `id_tiket ${id_tiket} sudah ada di database` });
      }
      return res.status(500).json({ error: 'Gagal membuat tiket' });
    }
    res.status(201).json({ success: true, message: 'Tiket berhasil dibuat' });
  });
});

// PUT: Meng-update tiket berdasarkan ID
app.put('/api/tickets/:id', protect, restrictTo('Admin', 'User'), (req, res) => {
  const ticketId = req.params.id;
  const { status, teknisi, update_progres } = req.body;
  
  // Ambil username dari token JWT yang sudah diverifikasi oleh middleware 'protect'
  const updatedBy = req.user.username; 

  const sql = "UPDATE tickets SET status = ?, teknisi = ?, update_progres = ?, updated_by = ? WHERE id = ?";
  const values = [status, teknisi, update_progres, updatedBy, ticketId]; // Tambahkan updatedBy ke values

  db.query(sql, values, (err, result) => {
    if (err) { 
      console.error("Error updating ticket:", err);
      return res.status(500).json({ error: 'Gagal meng-update tiket di database' }); 
    }
    if (result.affectedRows === 0) { 
      return res.status(404).json({ error: 'Tiket tidak ditemukan' }); 
    }
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
  console.log(`🚀 Server backend berjalan di port ${port}`);
});
