// ================= 小队远征 · Phase 2 服务器 =================
// 零依赖纯 Node.js：账号 / 云存档 / 异步竞技场
// 启动: node server.js  (默认端口 3000, 环境变量 PORT 可覆盖)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const LOGIC = require('./logic.js');

const DB_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;

// ---------- 数据库（JSON 文件 + 内存缓存，防抖写入） ----------
let db;
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
catch (e) { db = { users: {}, sessions: {}, saves: {}, snapshots: {} }; }
let saveTimer = null;
function saveDB() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  }, 300);
}

function publicUser(u) {
  return { id: u.id, name: u.name, points: u.points, wins: u.wins, losses: u.losses };
}
function rankOf(userId) {
  const list = Object.values(db.users).sort((a, b) => b.points - a.points);
  const i = list.findIndex(u => u.id === userId);
  return i < 0 ? '-' : i + 1;
}
function authUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const uid = db.sessions[token];
  return uid ? db.users[uid] : null;
}

// ---------- 静态文件 ----------
function sendFile(res, name, type) {
  try {
    const data = fs.readFileSync(path.join(__dirname, name));
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('not found'); }
}

function readBody(req) {
  return new Promise(resolve => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 500 * 1024) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// ---------- API ----------
async function handleApi(req, res, url) {
  const p = url.pathname;
  const body = await readBody(req);

  // 注册
  if (p === '/api/register' && req.method === 'POST') {
    const name = String(body.name || '').trim();
    const pw = String(body.password || '');
    if (name.length < 2 || name.length > 12) return json(res, 400, { error: '用户名需 2-12 个字符' });
    if (pw.length < 4) return json(res, 400, { error: '密码至少 4 位' });
    if (Object.values(db.users).some(u => u.name === name)) return json(res, 400, { error: '用户名已被占用' });
    const id = crypto.randomBytes(8).toString('hex');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
    db.users[id] = { id, name, salt, hash, points: 0, wins: 0, losses: 0, createdAt: Date.now() };
    const token = crypto.randomBytes(24).toString('hex');
    db.sessions[token] = id;
    saveDB();
    return json(res, 200, { token, user: publicUser(db.users[id]) });
  }

  // 登录
  if (p === '/api/login' && req.method === 'POST') {
    const name = String(body.name || '').trim();
    const pw = String(body.password || '');
    const u = Object.values(db.users).find(x => x.name === name);
    if (!u) return json(res, 400, { error: '用户不存在' });
    const hash = crypto.scryptSync(pw, u.salt, 32).toString('hex');
    if (hash !== u.hash) return json(res, 400, { error: '密码错误' });
    const token = crypto.randomBytes(24).toString('hex');
    db.sessions[token] = u.id;
    saveDB();
    return json(res, 200, { token, user: publicUser(u), save: db.saves[u.id] || null });
  }

  const u = authUser(req);
  if (!u) return json(res, 401, { error: '未登录或会话过期' });

  // 我的信息
  if (p === '/api/me' && req.method === 'GET') {
    return json(res, 200, { user: publicUser(u), rank: rankOf(u.id), save: db.saves[u.id] || null });
  }

  // 上传云存档（同时更新竞技快照）
  if (p === '/api/save' && req.method === 'POST') {
    const g = body.save;
    if (!g || !(g.collection || Array.isArray(g.heroes)) || typeof g.stage !== 'number')
      return json(res, 400, { error: '存档格式无效' });
    db.saves[u.id] = g;
    db.snapshots[u.id] = { name: u.name, ...LOGIC.makeSnapshot(g), updatedAt: Date.now() };
    saveDB();
    return json(res, 200, { ok: true, power: db.snapshots[u.id].power });
  }

  // 下载云存档
  if (p === '/api/save' && req.method === 'GET') {
    return json(res, 200, { save: db.saves[u.id] || null });
  }

  // 登出
  if (p === '/api/logout' && req.method === 'POST') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    delete db.sessions[token]; saveDB();
    return json(res, 200, { ok: true });
  }

  // 竞技场：推荐对手（战力接近 + 随机）
  if (p === '/api/arena/opponents' && req.method === 'GET') {
    const mine = db.snapshots[u.id];
    const myPower = mine ? mine.power : 0;
    const all = Object.entries(db.snapshots).filter(([id]) => id !== u.id && db.users[id]);
    const scored = all.map(([id, s]) => ({ id, name: s.name, power: s.power,
      points: db.users[id].points, diff: Math.abs(s.power - myPower) }));
    scored.sort((a, b) => a.diff - b.diff);
    const near = scored.slice(0, 3);
    const random = scored.slice(3);
    while (near.length < 4 && random.length) {
      near.push(random.splice(Math.floor(Math.random() * random.length), 1)[0]);
    }
    return json(res, 200, { opponents: near.slice(0, 4) });
  }

  // 排行榜
  if (p === '/api/arena/leaderboard' && req.method === 'GET') {
    const list = Object.values(db.users).sort((a, b) => b.points - a.points).slice(0, 30)
      .map((x, i) => ({ rank: i + 1, name: x.name, points: x.points,
        wins: x.wins, losses: x.losses, me: x.id === u.id }));
    return json(res, 200, { list, myRank: rankOf(u.id) });
  }

  // 挑战（服务器端裁决，完全公平）
  if (p === '/api/arena/challenge' && req.method === 'POST') {
    const targetId = String(body.target || '');
    const def = db.snapshots[targetId];
    const atkSave = db.saves[u.id];
    if (!def) return json(res, 400, { error: '对手不存在或尚未上传快照' });
    if (!atkSave) return json(res, 400, { error: '请先把存档上传到云端再挑战' });
    if (targetId === u.id) return json(res, 400, { error: '不能挑战自己' });

    const atk = LOGIC.migrate(atkSave);
    let defTeam = def.team;
    if (!defTeam && def.heroes) defTeam = LOGIC.migrate({ heroes: def.heroes }).team;
    if (!defTeam || !defTeam.length) return json(res, 400, { error: '对手快照已过期，对方需要重新上传' });
    const result = LOGIC.simulateArena(atk, defTeam);
    const win = result.win;
    const delta = win ? 20 : 5;
    u.points += delta;
    if (win) u.wins++; else u.losses++;
    saveDB();
    return json(res, 200, { win, delta, points: u.points, rank: rankOf(u.id),
      defName: def.name, defPower: def.power, result });
  }

  json(res, 404, { error: '接口不存在' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/' || url.pathname === '/game.html') {
      if (req.method === 'GET') return sendFile(res, 'game.html', 'text/html; charset=utf-8');
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      return await handleApi(req, res, url);
    }
    res.writeHead(404); res.end('not found');
  } catch (e) {
    console.error(e);
    json(res, 500, { error: '服务器内部错误' });
  }
});

server.listen(PORT, () => console.log(`🚀 小队远征服务器已启动: http://localhost:${PORT}`));
