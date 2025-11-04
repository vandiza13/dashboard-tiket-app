const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Parser } = require('json2csv');

// --- PERUBAHAN 1: Impor DB dari file util ---
const { db } = require('./_utils/db'); 

const app = express();
// KITA TIDAK BUTUH PORT, Vercel mengaturnya

const JWT_SECRET = process.env.JWT_SECRET || 'rahasia-super-aman-jangan-disebar'; 
// (Sangat disarankan untuk MENGHAPUS '...rahasia...' dan hanya gunakan process.env.JWT_SECRET)

app.use(cors());
app.use(express.json());

// (Kita HAPUS fungsi 'db.getConnection' dan 'seedDatabase' dari sini. 
// Anda harus 'seed' Admin user Anda secara manual di TiDB Cloud 
// menggunakan DBeaver/TablePlus)

// --- SEMUA KODE MIDDLEWARE DAN ROUTE ANDA SAMA PERSIS ---
// --- Salin-tempel langsung dari server.js asli Anda ---

const protect = (req, res, next) => {
  // ... (kode protect Anda)
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
  // ... (kode restrictTo Anda)
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk melakukan aksi ini' });
    }
    next();
  };
};

// --- SEMUA ENDPOINT app.get, app.post, app.put, app.delete ---

// PENTING: Vercel akan menangani rute. 
// Jadi 'app.get('/', ...)' sekarang akan diakses di '/api'
// 'app.post('/api/register', ...)' akan diakses di '/api/register'
// Ini sudah benar, JANGAN ubah rute Anda.

app.get('/', (req, res) => res.json({ message: "Server is running!", version: "Final Vercel Monolith" }));
app.post('/api/register', async (req, res) => { /* ... kode Anda ... */ });
app.post('/api/login', async (req, res) => { /* ... kode Anda ... */ });
app.get('/api/profile', protect, async (req, res) => { /* ... kode Anda ... */ });
app.put('/api/profile/change-password', protect, async (req, res) => { /* ... kode Anda ... */ });
app.get('/api/stats', protect, restrictTo('Admin', 'User', 'View'), async (req, res) => { /* ... kode Anda ... */ });
app.get('/api/tickets/running', protect, restrictTo('Admin', 'User', 'View'), async (req, res) => { /* ... kode Anda ... */ });
app.get('/api/tickets/closed', protect, restrictTo('Admin', 'User', 'View'), async (req, res) => { /* ... kode Anda ... */ });
app.get('/api/tickets/closed/export', protect, restrictTo('Admin', 'User', 'View'), async (req, res) => { /* ... kode Anda ... */ });
app.post('/api/tickets', protect, restrictTo('Admin', 'User'), async (req, res) => { /* ... kode Anda ... */ });
app.put('/api/tickets/:id', protect, restrictTo('Admin', 'User'), async (req, res) => { /* ... kode Anda ... */ });
app.delete('/api/tickets/:id', protect, restrictTo('Admin'), async (req, res) => { /* ... kode Anda ... */ });
app.get('/api/tickets/:id/history', protect, restrictTo('Admin', 'User', 'View'), async (req, res) => { /* ... kode Anda ... */ });
app.get('/api/technicians', protect, restrictTo('Admin', 'User', 'View'), async (req, res) => { /* ... kode Anda ... */ });
app.get('/api/technicians/active', protect, restrictTo('Admin', 'User'), async (req, res) => { /* ... kode Anda ... */ });
app.post('/api/technicians', protect, restrictTo('Admin'), async (req, res) => { /* ... kode Anda ... */ });
app.put('/api/technicians/:nik', protect, restrictTo('Admin'), async (req, res) => { /* ... kode Anda ... */ });
app.put('/api/technicians/status/:nik', protect, restrictTo('Admin'), async (req, res) => { /* ... kode Anda ... */ });
app.delete('/api/technicians/:nik', protect, restrictTo('Admin'), async (req, res) => { /* ... kode Anda ... */ });


// --- PERUBAHAN 2: HAPUS app.listen ---
/*
app.listen(port, () => {
  console.log(`🚀 Server backend berjalan di port ${port}`);
});
*/

// --- PERUBAHAN 3: TAMBAHKAN ini di akhir ---
module.exports = app;
