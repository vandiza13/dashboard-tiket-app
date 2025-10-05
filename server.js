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
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'tiket_db',
  port: process.env.MYSQLPORT || 3306,
  timezone: '+07:00' // Tambahkan baris ini untuk zona waktu WIB
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

// === API TIKET (DENGAN QUERY YANG DIPERBAIKI) ===
app.get('/api/tickets', protect, restrictTo('Admin', 'User', 'View'), (req, res) => {
  const sql = `
    SELECT 
      t.*, 
      GROUP_CONCAT(CONCAT(tech.name, ' (', tech.phone_number, ')') SEPARATOR ', ') as technician_details
    FROM tickets t
    LEFT JOIN technicians tech ON FIND_IN_SET(tech.nik, t.teknisi)
    GROUP BY t.id
    ORDER BY t.tiket_time ASC;
  `;
  db.query(sql, (err, results) => {
    if (err) { 
      console.error("Error fetching tickets:", err);
      return res.status(500).json({ error: 'Failed to fetch tickets' }); 
    }
    res.json(results);
  });
});

// POST: Membuat tiket baru
app.post('/api/tickets', protect, restrictTo('Admin', 'User'), (req, res) => {
  const { id_tiket, deskripsi, tiket_time } = req.body;
  if (!id_tiket || !deskripsi || !tiket_time) { 
    return res.status(400).json({ error: 'ID Tiket, Deskripsi, dan Waktu Tiket tidak boleh kosong' }); 
  }

  // PERBAIKAN: SQL sekarang memiliki 4 '?' dan 'values' memiliki 4 data
  const sql = "INSERT INTO tickets (id_tiket, deskripsi, tiket_time, status) VALUES (?, ?, ?, ?)";
  const values = [id_tiket, deskripsi, tiket_time, 'OPEN']; 

  db.query(sql, values, (err, result) => {
    if (err) { 
      console.error("Error creating ticket:", err);
      return res.status(500).json({ error: 'Gagal menyimpan tiket ke database' }); 
    }
    res.status(201).json({ success: true, message: 'Tiket berhasil dibuat' });
  });
});

// PUT: Meng-update tiket berdasarkan ID (menyimpan NIK)
app.put('/api/tickets/:id', protect, restrictTo('Admin', 'User'), (req, res) => {
  const ticketId = req.params.id;
  let { status, teknisi, update_progres } = req.body; 
  const updatedBy = req.user.username;
  const lastUpdateTime = new Date(); 

  // teknisi sekarang berisi array NIK, kita gabungkan jadi string
  const teknisiNiks = Array.isArray(teknisi) ? teknisi.join(',') : '';

  const sql = "UPDATE tickets SET status = ?, teknisi = ?, update_progres = ?, updated_by = ?, last_update_time = ? WHERE id = ?";
  const values = [status, teknisiNiks, update_progres, updatedBy, lastUpdateTime, ticketId];

  db.query(sql, values, (err, result) => {
    if (err) { 
      console.error("Error updating ticket:", err);
      return res.status(500).json({ error: 'Gagal meng-update tiket' }); 
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

// === API UNTUK TEKNISI (FINAL) ===

// GET: Mengambil SEMUA teknisi untuk halaman manajemen
app.get('/api/technicians', protect, restrictTo('Admin', 'User', 'View'), (req, res) => {
  const sql = "SELECT * FROM technicians ORDER BY name ASC";
  db.query(sql, (err, results) => {
    if (err) { return res.status(500).json({ error: 'Gagal mengambil data teknisi' }); }
    res.json(results);
  });
});

// GET: Mengambil teknisi yang AKTIF saja (untuk dropdown tiket)
app.get('/api/technicians/active', protect, restrictTo('Admin', 'User'), (req, res) => {
    const sql = "SELECT * FROM technicians WHERE is_active = TRUE ORDER BY name ASC";
    db.query(sql, (err, results) => {
        if (err) { return res.status(500).json({ error: 'Gagal mengambil data teknisi aktif' }); }
        res.json(results);
    });
});

// POST: Membuat teknisi baru (hanya Admin)
app.post('/api/technicians', protect, restrictTo('Admin'), (req, res) => {
  const { nik, name, phone_number } = req.body;
  if (!nik || !name) { return res.status(400).json({ error: 'NIK dan Nama tidak boleh kosong' }); }
  // PERUBAHAN: Validasi NIK 8 digit
  if (nik.length !== 8 || !/^\d+$/.test(nik)) { return res.status(400).json({ error: 'NIK harus terdiri dari 8 digit angka' }); }

  const sql = "INSERT INTO technicians (nik, name, phone_number) VALUES (?, ?, ?)";
  db.query(sql, [nik, name, phone_number], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') { return res.status(409).json({ error: 'NIK sudah terdaftar' }); }
      return res.status(500).json({ error: 'Gagal menyimpan teknisi' });
    }
    res.status(201).json({ success: true, message: 'Teknisi berhasil dibuat' });
  });
});

// PUT: Mengubah data teknisi (nama & no.hp) (hanya Admin)
app.put('/api/technicians/:nik', protect, restrictTo('Admin'), (req, res) => {
    const { name, phone_number } = req.body;
    if (!name) { return res.status(400).json({ error: 'Nama tidak boleh kosong' }); }

    const sql = "UPDATE technicians SET name = ?, phone_number = ? WHERE nik = ?";
    db.query(sql, [name, phone_number, req.params.nik], (err, result) => {
        if (err) { return res.status(500).json({ error: 'Gagal mengupdate teknisi' }); }
        res.json({ success: true, message: 'Teknisi berhasil diupdate' });
    });
});

// PUT: Mengubah status is_active (hadir/libur) (hanya Admin)
app.put('/api/technicians/status/:nik', protect, restrictTo('Admin'), (req, res) => {
    const { is_active } = req.body;
    const sql = "UPDATE technicians SET is_active = ? WHERE nik = ?";
    db.query(sql, [is_active, req.params.nik], (err, result) => {
        if (err) { return res.status(500).json({ error: 'Gagal mengupdate status teknisi' }); }
        res.json({ success: true, message: 'Status teknisi berhasil diupdate' });
    });
});

// DELETE: Menghapus teknisi (hanya Admin)
app.delete('/api/technicians/:nik', protect, restrictTo('Admin'), (req, res) => {
  const sql = "DELETE FROM technicians WHERE nik = ?";
  db.query(sql, [req.params.nik], (err, result) => {
    if (err) { return res.status(500).json({ error: 'Gagal menghapus teknisi' }); }
    res.json({ success: true, message: 'Teknisi berhasil dihapus' });
  });
});

app.listen(port, () => {
  console.log(`🚀 Server backend berjalan di port ${port}`);
});
