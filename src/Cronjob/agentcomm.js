import cron from "node-cron";
import conn from "../config/db_conn.js";

// Daily balance transfer cron (Original agentcomm.js)
cron.schedule("0 0 * * *", async () => {
  try {
     const sql = `
       UPDATE user
       SET
         winamount = COALESCE(winamount,0) + COALESCE(winner,0),
         winner = 0
       WHERE winner > 0
     `;
    const [result] = await conn.query(sql);
    if (result.affectedRows > 0) {
      console.log("Daily Winner-to-Winamount transfer done. Users updated:", result.affectedRows);
    }
  } catch (err) {
    console.error("AgentComm Cron error:", err);
  }
});

console.log("AgentComm cron initialized (Daily 12 AM).");
