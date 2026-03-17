import cron from "node-cron";
import conn from "../config/db_conn.js";

// --- Logic from original min5.js ---

async function getBettingDataFromDB(periodid) {
  const [rows] = await conn.query(
    "SELECT userid, mobile, bet_number, betamount FROM betting WHERE periodid = ?",
    [periodid]
  );
  const bettingData = [];
  rows.forEach(row => {
    let parsedBets;
    try {
      parsedBets = JSON.parse(row.bet_number);
    } catch {
      parsedBets = [];
    }
    parsedBets.forEach(bet => {
      const entries = Object.entries(bet);
      if (entries.length > 0) {
        const [betNumber, betAmount] = entries[0];
        bettingData.push({
          userid: row.userid,
          mobile: row.mobile,
          bet_number: betNumber,
          betamount: Number(betAmount),
          periodid,
        });
      }
    });
  });
  return bettingData;
}

async function generatearray(data, pool) {
  const resultMap = {};
  for (let i = 0; i < 100; i++) {
    resultMap[i.toString().padStart(2, "0")] = 0;
  }
  for (const row of data) {
    const bet = row.bet_number;
    const amt = Number(row.betamount);
    if (/^\d{1,2}$/.test(bet)) {
      const num = bet.padStart(2, "0");
      resultMap[num] += amt * 90;
    } else if (/^A\d$/.test(bet)) {
      const d = Number(bet[1]);
      for (let i = 0; i < 10; i++) {
        const num = `${d}${i}`;
        resultMap[num] += amt * 9;
      }
    } else if (/^B\d$/.test(bet)) {
      const d = Number(bet[1]);
      for (let i = 0; i < 10; i++) {
        const num = `${i}${d}`.padStart(2, "0");
        resultMap[num] += amt * 9;
      }
    }
  }
  return pickWinner(resultMap, pool);
}

function pickWinner(resultMap, pool) {
  let list = Object.entries(resultMap).map(([num, amt]) => ({
    num,
    amt: Number(amt),
  }));
  if (!list.length) return null;
  if (pool <= 0) {
    const minAmt = Math.min(...list.map(x => x.amt));
    const lowest = list.filter(x => x.amt === minAmt);
    return lowest[Math.floor(Math.random() * lowest.length)];
  }
  const underPool = list.filter(x => x.amt < pool && x.amt > 0);
  if (!underPool.length) {
    const minAmt = Math.min(...list.map(x => x.amt));
    const lowest = list.filter(x => x.amt === minAmt);
    return lowest[Math.floor(Math.random() * lowest.length)];
  }
  const maxAmt = Math.max(...underPool.map(x => x.amt));
  const winners = underPool.filter(x => x.amt === maxAmt);
  return winners[Math.floor(Math.random() * winners.length)];
}

async function pickWinnerNumber(periodid) {
  const [poolRows] = await conn.query(`SELECT pool FROM admin_pool WHERE id = 1`);
  if (!poolRows.length) return { winner: null, reason: "no-pool-found" };
  const pool = Number(poolRows[0].pool);
  const data = await getBettingDataFromDB(periodid);
  if (data.length === 0) {
    const rand = Math.floor(Math.random() * 100).toString().padStart(2, "0");
    return { winner: rand };
  }
  const cxx = await generatearray(data, pool);
  return { winner: cxx.num };
}

async function runCycle() {
  const [last] = await conn.query("SELECT gameid FROM bet_result ORDER BY id DESC LIMIT 1");
  let currentPeriod;
  if (!last.length) {
    currentPeriod = 202050827080855;
    const nextId = currentPeriod + 1;
    await conn.query(
      "INSERT INTO bet_result (gameid, bet_amount, win_amount, win_number, resulttype) VALUES (?,0,0,0,'auto')",
      [nextId]
    );
    return;
  } else {
    currentPeriod = Number(last[0].gameid);
  }
  const nextPeriod = currentPeriod + 1;
  const [[cfg]] = await conn.query("SELECT winner, status FROM bet_result_set WHERE id=1");
  const fixed = (cfg.winner || 0);
  let xvalue = 1; // Default to 1 since column is missing in setting table

  let result;
  let resulttype;
  if (fixed !== "0") {
    xvalue = 1; // Defaulting to 1 as it's not in the settings table

    resulttype = "admin";
    result = { winner: fixed.toString().padStart(2, "0") };
  } else if (cfg.status == 1) {
    resulttype = "pool";
    result = await pickWinnerNumber(nextPeriod);
  } else {
    resulttype = "auto";
    const rnd = Math.floor(Math.random() * 100).toString().padStart(2, "0");
    result = { winner: rnd };
  }
  await settleNextGame(result.winner, nextPeriod, resulttype, xvalue);
}

async function settleNextGame(winNum, currentPeriod, resulttype, xvalue) {
  const nextPeriod = Number(currentPeriod) + 1;
  await conn.query("UPDATE bet_result_set SET winner='0' WHERE id=1");

  const twoDigit = winNum.padStart(2, "0");
  const digitA = "A" + twoDigit[0];
  const digitB = "B" + twoDigit[1];
  let totalBet = 0, totalWin = 0;
  const [bets] = await conn.query(
    "SELECT id,userid, bet_number, betamount FROM betting WHERE periodid = ?",
    [currentPeriod]
  );
  const userResults = {};
  for (const row of bets) {
    let parsedBets;
    try {
      parsedBets = JSON.parse(row.bet_number);
    } catch {
      parsedBets = [];
    }
    let userTotalWin = 0;
    parsedBets.forEach(bet => {
      const entries = Object.entries(bet);
      if (entries.length > 0) {
        const [betNumber, betAmount] = entries[0];
        let winAmt = 0;
        if (betNumber === twoDigit) winAmt = (betAmount * 90) * xvalue;
        else if (betNumber === digitA) winAmt = (betAmount * 9) * xvalue;
        else if (betNumber === digitB) winAmt = (betAmount * 9) * xvalue;
        userTotalWin += winAmt;
      }
    });
    totalBet += row.betamount;
    totalWin += userTotalWin;
    await conn.query(
      "UPDATE betting SET winamount = ?, win_number = ? WHERE id = ?",
      [userTotalWin, twoDigit, row.id]
    );
    if (!userResults[row.userid]) {
      userResults[row.userid] = { totalWin: 0 };
    }
    userResults[row.userid].totalWin += userTotalWin;
  }
  for (const [userid, r] of Object.entries(userResults)) {
    if (r.totalWin > 0) {
      await conn.query("UPDATE user SET winner = winner + ? WHERE id = ?", [r.totalWin, userid]);
    }
  }
  await conn.query(
    "INSERT INTO bet_result (gameid, bet_amount, win_amount, win_number, xvalue, resulttype) VALUES (?,?,?,?,?,?)",
    [currentPeriod, totalBet, totalWin, twoDigit, xvalue, resulttype]
  );
  await conn.query("UPDATE admin_pool SET pool = pool-? WHERE id=1", [totalWin]);
  console.log(`Period ${currentPeriod} settled. Winner: ${twoDigit}`);
}

cron.schedule("*/5 * * * *", async () => {
  try {
    console.log("Running 5-minute settlement cycle...");
    await runCycle();
  } catch (err) {
    console.error("Cron Error:", err);
  }
});
