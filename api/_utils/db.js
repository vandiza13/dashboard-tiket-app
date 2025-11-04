const mysql = require('mysql2/promise');

// Buat pool koneksi sekali saja
const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT || 3306,
  timezone: '+07:00',
  
  // --- TAMBAHAN PENTING UNTUK TiDB CLOUD ---
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true 
  },
  // -----------------------------------------

  waitForConnections: true,
  connectionLimit: 5, // 5 sudah cukup untuk serverless
  queueLimit: 0
});

// Ekspor pool-nya agar bisa dipakai di file lain
module.exports = { db };
