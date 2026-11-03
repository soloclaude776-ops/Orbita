// Servidor de Cubix: entrega el juego y sincroniza el mundo y los jugadores por WebSocket.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';           // clave para poder hacer "Mundo nuevo"
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'world.json');

// Estado del mundo: semilla + hora de inicio del día, y los bloques cambiados por chunk
let state = { meta: { seed: (Math.random() * 1e9) | 0, t0: Date.now() }, chunks: {} };
try { state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { /* mundo nuevo */ }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(DATA_FILE, JSON.stringify(state), () => {}), 2000);
}

const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.end('ok'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
  res.end(html);
});

const wss = new WebSocketServer({ server, maxPayload: 512 * 1024 });
const clients = new Map(); // ws -> { id, name, p, admin }
let nextId = 1;

function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const ws of clients.keys()) if (ws !== except && ws.readyState === 1) ws.send(s);
}

wss.on('connection', ws => {
  const c = { id: 'p' + nextId++, name: 'Jugador', p: null, admin: false };
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'hello') {
      c.name = String(m.name || 'Jugador').slice(0, 20);
      c.admin = !!ADMIN_KEY && m.key === ADMIN_KEY;
      clients.set(ws, c);
      const peers = [...clients.values()].filter(o => o !== c && o.p).map(o => ({ id: o.id, name: o.name, p: o.p }));
      ws.send(JSON.stringify({ t: 'init', you: c.id, meta: state.meta, chunks: state.chunks, peers }));
      return;
    }
    if (!clients.has(ws)) return;
    if (m.t === 'pres' && m.p && typeof m.p === 'object') {
      c.p = m.p; broadcast({ t: 'peer', id: c.id, name: c.name, p: m.p }, ws);
    } else if (m.t === 'chunk' && /^c_\d+_\d+$/.test(m.ck) && m.b && typeof m.b === 'object') {
      state.chunks[m.ck] = m.b; save(); broadcast({ t: 'chunk', ck: m.ck, b: m.b }, ws);
    } else if (m.t === 'chunkdel' && c.admin && /^c_\d+_\d+$/.test(m.ck)) {
      delete state.chunks[m.ck]; save(); broadcast({ t: 'chunkdel', ck: m.ck }, ws);
    } else if (m.t === 'meta' && m.meta) {
      const seed = Number(m.meta.seed) | 0, t0 = Number(m.meta.t0) || Date.now();
      const newWorld = seed !== state.meta.seed;
      if (newWorld && !c.admin) return; // solo el admin puede borrar el mundo
      if (newWorld) state.chunks = {};
      state.meta = { seed, t0 }; save();
      broadcast({ t: 'meta', meta: state.meta }, newWorld ? null : ws);
    }
  });
  ws.on('close', () => { if (clients.delete(ws)) broadcast({ t: 'left', id: c.id }); });
});

server.listen(PORT, () => console.log('Cubix escuchando en el puerto ' + PORT));
