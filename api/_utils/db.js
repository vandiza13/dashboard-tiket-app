// /api/_utils/db.js

const mysql = require('mysql2/promise');

// Buat pool koneksi.
// Ini akan menggunakan environment variables yang akan kita set di Vercel
const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT || 3306,
  timezone: '+07:00',
  ssl: {
    // Diperlukan untuk TiDB Cloud
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true 
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Ekspor pool-nya agar bisa dipakai di file lain
module.exports = { db };