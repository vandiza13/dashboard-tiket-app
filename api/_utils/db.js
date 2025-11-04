const mysql = require('mysql2/promise');

// Buat pool koneksi sekali saja
const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT || 3306,
  
  // PENTING: Set timezone ke WIB (UTC+7)
  timezone: '+07:00',
  
  // Tambahan untuk TiDB Cloud
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true 
  },

  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  
  // Tambahan: Set timezone saat koneksi dibuat
  connectTimeout: 10000,
  dateStrings: false // Biarkan MySQL parse date sebagai Date object
});

// Ekspor pool-nya agar bisa dipakai di file lain
module.exports = { db };