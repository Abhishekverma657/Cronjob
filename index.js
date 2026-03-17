import express from "express";
import dotenv from "dotenv";
dotenv.config();

// ✅ Database connection check
import conn from "./src/config/db_conn.js";

// ✅ Load Cron Jobs
import "./src/Cronjob/min5.js";
import "./src/Cronjob/agentcomm.js";
// import "./src/Cronjob/backup.js"; // Optional

const app = express();
const PORT = process.env.PORT || 7070;

app.get("/", (req, res) => {
  res.send("🚀 Khelo Standalone Cron Service is Running!");
});

app.get("/status", (req, res) => {
  res.json({
    status: "online",
    time: new Date().toLocaleString(),
    database: "connected"
  });
});

app.listen(PORT, () => {
  console.log("-----------------------------------------");
  console.log(`🚀 Cron Service listening on port ${PORT}`);
  console.log("🕒 Time: " + new Date().toLocaleString());
  console.log("📡 DB Host: " + (process.env.DB_HOST || 'localhost'));
  console.log("-----------------------------------------");
});

