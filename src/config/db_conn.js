import mysql from 'mysql2/promise';
import dotenv from "dotenv";
dotenv.config();

const conn = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NSME || 'funtarget',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection on startup
(async () => {
  try {
    const connection = await conn.getConnection();
    console.log("✅ Database Connected from Standalone Cron Service!");
    connection.release();
  } catch (err) {
    console.error("❌ Database Connection Error:", err.message);
  }
})();

export default conn;
