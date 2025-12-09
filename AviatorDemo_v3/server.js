// server.js - Aviator demo server (SQLite for easy local setup). Demo-only: not production-ready.
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'secret_demo';
const ADMIN_USER = process.env.ADMIN_USER || 'sahu';
const ADMIN_PASS = process.env.ADMIN_PASS || '5678';

// Simple SQLite DB (file: aviator.db)
const dbFile = path.join(__dirname, 'aviator.db');
const db = new sqlite3.Database(dbFile);

function runAsync(sql, params=[]){ return new Promise((res,rej)=> db.run(sql, params, function(err){ if(err) rej(err); else res(this); })); }
function allAsync(sql, params=[]){ return new Promise((res,rej)=> db.all(sql, params, (err,rows)=> err ? rej(err): res(rows))); }
function getAsync(sql, params=[]){ return new Promise((res,rej)=> db.get(sql, params, (err,row)=> err ? rej(err): res(row))); }

// Init tables
async function initDb(){
  await runAsync(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, mobile TEXT UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await runAsync(`CREATE TABLE IF NOT EXISTS otps (id INTEGER PRIMARY KEY AUTOINCREMENT, mobile TEXT, otp TEXT, expires_at DATETIME, used INTEGER DEFAULT 0)`);
  await runAsync(`CREATE TABLE IF NOT EXISTS wallets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, balance REAL DEFAULT 0, currency TEXT DEFAULT 'INR')`);
  await runAsync(`CREATE TABLE IF NOT EXISTS rounds (id INTEGER PRIMARY KEY, hash TEXT, secret TEXT, started_at DATETIME, crash_multiplier REAL)`);
  await runAsync(`CREATE TABLE IF NOT EXISTS bets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, round_id INTEGER, amount REAL, cashed_out_multiplier REAL, status TEXT DEFAULT 'placed', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await runAsync(`CREATE TABLE IF NOT EXISTS withdraw_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, amount REAL, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await runAsync(`CREATE TABLE IF NOT EXISTS promos (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, amount REAL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await runAsync(`CREATE TABLE IF NOT EXISTS referrals (id INTEGER PRIMARY KEY AUTOINCREMENT, referrer_id INTEGER, referee_id INTEGER, amount REAL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
}
initDb().catch(console.error);

// Utility functions
function generateOtp(){ return String(Math.floor(100000 + Math.random()*900000)); }
function sha256Hex(s){ return crypto.createHash('sha256').update(s).digest('hex'); }
function generateSeed(){ return crypto.randomBytes(32).toString('hex'); }

// Auth middleware (JWT)
function authMiddleware(req,res,next){
  const h = req.headers.authorization;
  if(!h) return res.status(401).send({error:'no auth'});
  const token = h.split(' ')[1];
  try{ const p = jwt.verify(token, JWT_SECRET); req.user = p; next(); } catch(e){ return res.status(401).send({error:'invalid token'}); }
}

// OTP endpoints (demo: logs OTP on server console)
app.post('/api/auth/request-otp', async (req,res)=>{
  const { mobile } = req.body;
  if(!mobile) return res.status(400).send({ error:'mobile required' });
  const otp = generateOtp();
  const expires = Date.now() + 5*60*1000;
  await runAsync('INSERT INTO otps (mobile, otp, expires_at, used) VALUES (?, ?, ?, 0)', [mobile, otp, expires]);
  console.log('DEBUG OTP for', mobile, otp); // Replace with real SMS in prod
  return res.send({ ok:true, message:'OTP sent (check server logs for demo)' });
});

app.post('/api/auth/verify-otp', async (req,res)=>{
  const { mobile, otp } = req.body;
  if(!mobile||!otp) return res.status(400).send({error:'mobile+otp required'});
  const row = await getAsync('SELECT * FROM otps WHERE mobile=? AND otp=? AND used=0 ORDER BY id DESC LIMIT 1', [mobile, otp]);
  if(!row) return res.status(400).send({error:'invalid otp'});
  if(Date.now() > row.expires_at) return res.status(400).send({error:'otp expired'});
  await runAsync('UPDATE otps SET used=1 WHERE id=?', [row.id]);
  let user = await getAsync('SELECT * FROM users WHERE mobile=?', [mobile]);
  if(!user){
    const r = await runAsync('INSERT INTO users (mobile) VALUES (?)', [mobile]);
    user = await getAsync('SELECT * FROM users WHERE id=?', [r.lastID]);
    await runAsync('INSERT INTO wallets (user_id, balance, currency) VALUES (?, 0, ?)', [user.id, process.env.CURRENCY || 'INR']);
  }
  const token = jwt.sign({ userId: user.id, mobile: user.mobile }, JWT_SECRET, { expiresIn: '30d' });
  return res.send({ ok:true, token, user: { id: user.id, mobile: user.mobile } });
});

// Wallet endpoints
app.get('/api/wallet', authMiddleware, async (req,res)=>{
  const w = await getAsync('SELECT * FROM wallets WHERE user_id=?', [req.user.userId]);
  return res.send({ ok:true, wallet: w });
});

app.post('/api/wallet/deposit', authMiddleware, async (req,res)=>{
  const { amount } = req.body;
  if(!amount || amount <= 0) return res.status(400).send({error:'invalid amount'});
  await runAsync('UPDATE wallets SET balance = balance + ? WHERE user_id = ?', [amount, req.user.userId]);
  return res.send({ ok:true });
});

app.post('/api/wallet/withdraw', authMiddleware, async (req,res)=>{
  const { amount } = req.body;
  const w = await getAsync('SELECT balance FROM wallets WHERE user_id=?', [req.user.userId]);
  if(!w || amount > w.balance) return res.status(400).send({ error:'insufficient' });
  await runAsync('UPDATE wallets SET balance = balance - ? WHERE user_id = ?', [amount, req.user.userId]);
  return res.send({ ok:true });
});

// Admin login (simple)
app.post('/api/admin/login', (req,res)=>{
  const { username, password } = req.body;
  if(username===process.env.ADMIN_USER && password===process.env.ADMIN_PASS){
    const token = jwt.sign({ admin:true, username }, JWT_SECRET, { expiresIn: '7d' });
    return res.send({ ok:true, token });
  }
  return res.status(401).send({ error:'invalid admin' });
});

// Socket & rounds (provably-fair demo)
let currentRound = null;
const roundInterval = 8000; // ms per round in demo

function startRound(){
  const secret = generateSeed();
  const hash = sha256Hex(secret);
  const roundId = Date.now();
  currentRound = { id: roundId, secret, hash, startedAt: Date.now(), crashMultiplier: null };
  io.emit('round:new', { id: roundId, hash });
  // Determine crash multiplier deterministically
  const num = BigInt('0x' + secret.slice(0,16));
  const crash = 1 + Number(num % BigInt(5000)) / 100; // 1.00 ... ~51.00
  const crashMultiplier = Math.max(1.0, Math.min(crash, 100));
  currentRound.crashMultiplier = parseFloat(crashMultiplier.toFixed(2));
  // simulate ticks
  const start = Date.now();
  const tick = setInterval(()=>{
    const elapsed = Date.now()-start;
    const t = elapsed / (roundInterval - 200);
    const multiplier = Math.min(1 + Math.pow(2.0, t*6)/20, currentRound.crashMultiplier);
    io.emit('round:tick', { id: roundId, multiplier: Number(multiplier.toFixed(2)) });
    if(multiplier >= currentRound.crashMultiplier){
      clearInterval(tick);
      setTimeout(()=>{
        io.emit('round:crash', { id: roundId, multiplier: currentRound.crashMultiplier, secret: currentRound.secret });
        // save round to DB
        runAsync('INSERT OR REPLACE INTO rounds (id, hash, secret, started_at, crash_multiplier) VALUES (?, ?, ?, ?, ?)', [roundId, currentRound.hash, currentRound.secret, new Date().toISOString(), currentRound.crashMultiplier]);
        setTimeout(startRound, 1500);
      }, 600);
    }
  }, 100);
}

io.on('connection', (socket)=>{
  console.log('client connected', socket.id);
  if(currentRound) socket.emit('round:new', { id: currentRound.id, hash: currentRound.hash });
  socket.on('place_bet', async (data)=>{
    // data: { token, roundId, amount }
    try{
      const payload = jwt.verify(data.token, JWT_SECRET);
      const userId = payload.userId;
      // check wallet
      const w = await getAsync('SELECT balance FROM wallets WHERE user_id=?', [userId]);
      if(!w || w.balance < data.amount) return socket.emit('bet:rejected', { error:'insufficient' });
      // deduct immediately
      await runAsync('UPDATE wallets SET balance = balance - ? WHERE user_id=?', [data.amount, userId]);
      const r = await runAsync('INSERT INTO bets (user_id, round_id, amount) VALUES (?, ?, ?)', [userId, data.roundId, data.amount]);
      socket.emit('bet:accepted', { ok:true, betId: r.lastID });
    }catch(e){
      socket.emit('bet:rejected', { error:'auth' });
    }
  });

  socket.on('cashout', async (data)=>{
    // data: { token, betId }
    try{
      const payload = jwt.verify(data.token, JWT_SECRET);
      const userId = payload.userId;
      const bet = await getAsync('SELECT * FROM bets WHERE id=? AND user_id=?', [data.betId, userId]);
      if(!bet) return socket.emit('cashout:rejected', { error:'no bet' });
      if(bet.status !== 'placed') return socket.emit('cashout:rejected', { error:'already cashed' });
      // current multiplier = currentRound multiplier (server-side authoritative)
      const mult = currentRound ? currentRound.crashMultiplier : 1.0;
      // If crash already happened and multiplier <= crash => too late (lost)
      if(mult <= currentRound.crashMultiplier && Date.now() - currentRound.startedAt > roundInterval) {
        // treat as lost
        await runAsync('UPDATE bets SET status=? WHERE id=?', ['lost', bet.id]);
        return socket.emit('cashout:rejected', { error:'already crashed' });
      }
      // For demo: use round's current visible multiplier as payout
      const payout = parseFloat((bet.amount * mult).toFixed(2));
      await runAsync('UPDATE bets SET status=?, cashed_out_multiplier=? WHERE id=?', ['cashed', mult, bet.id]);
      await runAsync('UPDATE wallets SET balance = balance + ? WHERE user_id=?', [payout, userId]);
      socket.emit('cashout:ok', { ok:true, payout, multiplier: mult });
    }catch(e){ socket.emit('cashout:rejected', { error:'auth' }); }
  });

  socket.on('disconnect', ()=>{});
});


// Withdraw request endpoint (user)
app.post('/api/wallet/withdraw/request', authMiddleware, async (req,res)=>{
  const { amount } = req.body;
  if(!amount || amount <= 0) return res.status(400).send({error:'invalid amount'});
  const w = await getAsync('SELECT balance FROM wallets WHERE user_id=?', [req.user.userId]);
  if(!w || amount > w.balance) return res.status(400).send({ error:'insufficient' });
  // deduct immediately and create withdraw request (in real app you'd keep pending until processed)
  await runAsync('UPDATE wallets SET balance = balance - ? WHERE user_id = ?', [amount, req.user.userId]);
  const r = await runAsync('INSERT INTO withdraw_requests (user_id, amount, status) VALUES (?, ?, ?)', [req.user.userId, amount, 'pending']);
  return res.send({ ok:true, requestId: r.lastID });
});

// Admin: list users
app.get('/api/admin/users', authMiddleware, async (req,res)=>{
  // only allow admin
  try{ const p = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET); if(!p || !p.username) return res.status(403).send({error:'forbidden'}); }catch(e){ return res.status(403).send({error:'forbidden'}); }
  const users = await allAsync('SELECT id, mobile, created_at FROM users ORDER BY id DESC LIMIT 200');
  return res.send({ ok:true, users });
});

// Admin: list bets
app.get('/api/admin/bets', authMiddleware, async (req,res)=>{
  try{ const p = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET); if(!p || !p.username) return res.status(403).send({error:'forbidden'}); }catch(e){ return res.status(403).send({error:'forbidden'}); }
  const bets = await allAsync('SELECT * FROM bets ORDER BY id DESC LIMIT 200');
  return res.send({ ok:true, bets });
});

// Admin: list withdraw requests
app.get('/api/admin/withdraws', authMiddleware, async (req,res)=>{
  try{ const p = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET); if(!p || !p.username) return res.status(403).send({error:'forbidden'}); }catch(e){ return res.status(403).send({error:'forbidden'}); }
  const withdraws = await allAsync('SELECT * FROM withdraw_requests ORDER BY id DESC LIMIT 200');
  return res.send({ ok:true, withdraws });
});

// Admin: referrals list
app.get('/api/admin/referrals', authMiddleware, async (req,res)=>{
  try{ const p = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET); if(!p || !p.username) return res.status(403).send({error:'forbidden'}); }catch(e){ return res.status(403).send({error:'forbidden'}); }
  const referrals = await allAsync('SELECT * FROM referrals ORDER BY id DESC LIMIT 200');
  return res.send({ ok:true, referrals });
});
});

// Admin: approve withdraw
app.post('/api/admin/withdraws/approve', authMiddleware, async (req,res)=>{
  const { id } = req.body;
  try{ const p = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET); if(!p || !p.username) return res.status(403).send({error:'forbidden'}); }catch(e){ return res.status(403).send({error:'forbidden'}); }
  const reqRow = await getAsync('SELECT * FROM withdraw_requests WHERE id=?', [id]);
  if(!reqRow) return res.status(404).send({ error:'not found' });
  if(reqRow.status !== 'pending') return res.status(400).send({ error:'invalid status' });
  await runAsync('UPDATE withdraw_requests SET status=? WHERE id=?', ['approved', id]);
  return res.send({ ok:true });
});

// Admin: reject withdraw (refund)
app.post('/api/admin/withdraws/reject', authMiddleware, async (req,res)=>{
  const { id } = req.body;
  try{ const p = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET); if(!p || !p.username) return res.status(403).send({error:'forbidden'}); }catch(e){ return res.status(403).send({error:'forbidden'}); }
  const reqRow = await getAsync('SELECT * FROM withdraw_requests WHERE id=?', [id]);
  if(!reqRow) return res.status(404).send({ error:'not found' });
  if(reqRow.status !== 'pending') return res.status(400).send({ error:'invalid status' });
  // refund balance
  await runAsync('UPDATE wallets SET balance = balance + ? WHERE user_id=?', [reqRow.amount, reqRow.user_id]);
  await runAsync('UPDATE withdraw_requests SET status=? WHERE id=?', ['rejected', id]);
  return res.send({ ok:true });
});


// Admin: create promo code
app.post('/api/admin/promo', authMiddleware, async (req,res)=>{
  try{ const p = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET); if(!p || !p.username) return res.status(403).send({error:'forbidden'}); }catch(e){ return res.status(403).send({error:'forbidden'}); }
  const { code, amount } = req.body;
  if(!code || !amount) return res.status(400).send({ error:'invalid' });
  await runAsync('INSERT INTO promos (code, amount) VALUES (?, ?)', [code, amount]);
  return res.send({ ok:true });
});

// User: redeem promo
app.post('/api/promo/redeem', authMiddleware, async (req,res)=>{
  const { code } = req.body;
  const row = await getAsync('SELECT * FROM promos WHERE code=?', [code]);
  if(!row) return res.status(404).send({ error:'not found' });
  // credit wallet with promo.amount
  await runAsync('UPDATE wallets SET balance = balance + ? WHERE user_id=?', [row.amount, req.user.userId]);
  return res.send({ ok:true, amount: row.amount });
});

// When placing bet, record referral if provided via data.ref
// (modify place_bet handler earlier to accept ref and record referrals)
// For simplicity, add a new endpoint to record referral after verify
app.post('/api/referral/record', authMiddleware, async (req,res)=>{
  const { refCode, amount } = req.body;
  if(!refCode) return res.status(400).send({ error:'no ref' });
  // find user with mobile equal refCode (for demo we treat refCode as mobile)
  const refUser = await getAsync('SELECT * FROM users WHERE mobile=?', [refCode]);
  if(!refUser) return res.status(404).send({ error:'no ref user' });
  const bonus = parseFloat((amount * 0.05).toFixed(2)); // 5% fixed as per config
  // credit referrer wallet
  await runAsync('UPDATE wallets SET balance = balance + ? WHERE user_id=?', [bonus, refUser.id]);
  await runAsync('INSERT INTO referrals (referrer_id, referee_id, amount) VALUES (?, ?, ?)', [refUser.id, req.user.userId, bonus]);
  return res.send({ ok:true, bonus });
});

// User bets list
app.get('/api/user/bets', authMiddleware, async (req,res)=>{
  const bets = await allAsync('SELECT * FROM bets WHERE user_id=? ORDER BY id DESC LIMIT 200', [req.user.userId]);
  return res.send({ ok:true, bets });
});

server.listen(PORT, ()=>{
  console.log('Aviator demo server running on', PORT);
  startRound();
});