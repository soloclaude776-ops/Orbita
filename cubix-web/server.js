// Servidor de Cubix: entrega el juego y sincroniza el mundo y los jugadores por WebSocket.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const handleAi = require('./ai'); // los personajes de Éter piensan con IA
const marte = require('./marte'); // JEZERO: colonias en Marte compartidas
const handleSubir = require('./subir'); // página /subir: cargar juegos nuevos con contraseña
const handleEstudio = require('./estudio'); // chat con Claude dentro de /subir para crear juegos

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';           // clave para poder hacer "Mundo nuevo"
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'world.json');

// Estado del mundo: semilla + hora de inicio del día, y los bloques cambiados por chunk
let state = { meta: { seed: (Math.random() * 1e9) | 0, t0: Date.now() }, chunks: {} };
try { state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { /* mundo nuevo */ }
state.docs = state.docs || {}; // contenido de los cofres
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(DATA_FILE, JSON.stringify(state), () => {}), 2000);
}

// dist/ tiene las páginas traducidas para navegadores viejos como el de la Play (las arma build.js); si no está, se usan las originales
const PUB = fs.existsSync(path.join(__dirname, 'dist', 'cubix.html')) ? 'dist' : 'public';
// La página principal es la plataforma con todos los juegos.
// Cada juego vive en su dirección (/cubix, /eter, /marte...): alcanza con poner nombre.html en public/ y aparece solo.
const html = fs.readFileSync(path.join(__dirname, PUB, 'index.html'));
const PAGES = {};
for (const f of fs.readdirSync(path.join(__dirname, PUB))) { const m = /^([a-z0-9]+)\.html$/.exec(f); if (m && m[1] !== 'index') PAGES[m[1]] = fs.readFileSync(path.join(__dirname, PUB, f)); }
for (const id of Object.keys(PAGES)) PAGES[id] = withIcon(String(PAGES[id]), fs.existsSync(path.join(__dirname, 'public', 'logos', id + '.svg')) ? id : 'orbita');
PAGES.test = fs.readFileSync(path.join(__dirname, 'public', 'test.html'));
function withIcon(h, id) {
  if (h.indexOf('rel="icon"') >= 0) return h;
  const tag = '<link rel="icon" type="image/svg+xml" href="/logos/' + id + '.svg">';
  const i = h.toLowerCase().indexOf('<head>');
  if (i >= 0) return h.slice(0, i + 6) + tag + h.slice(i + 6);
  const d = h.toLowerCase().indexOf('<!doctype html>');
  if (d >= 0) return h.slice(0, d + 15) + tag + h.slice(d + 15);
  return tag + h;
}
// Lista para la plataforma: los datos de juegos.json más cualquier juego nuevo que todavía no esté anotado
function gameList() {
  let meta = { juegos: [] };
  try { meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'juegos.json'), 'utf8')); } catch (e) { /* sin datos extra */ }
  const known = new Set(meta.juegos.map(j => j.id));
  for (const id of Object.keys(PAGES)) if (id !== 'test' && !known.has(id)) {
    const t = (/<title>([^<]*)/.exec(String(PAGES[id])) || [])[1] || id;
    meta.juegos.unshift({ id, titulo: t.trim(), desc: 'Juego nuevo.', tags: [], nuevo: true });
  }
  meta.juegos = meta.juegos.filter(j => PAGES[j.id]);
  for (const j of meta.juegos) j.logo = fs.existsSync(path.join(__dirname, 'public', 'logos', j.id + '.svg')) ? '/logos/' + j.id + '.svg' : null;
  for (const j of meta.juegos) j.portada = fs.existsSync(path.join(__dirname, 'public', 'portadas', j.id + '.jpg')) ? '/portadas/' + j.id + '.jpg' : null;
  return meta;
}
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.end('ok'); return; }
  if (handleAi(req, res)) return;
  if (handleEstudio(req, res, { okPass: handleSubir.okPass, readBody: handleSubir.readBody, send: handleSubir.send })) return;
  if (handleSubir(req, res, { PAGES, withIcon })) return;
  if (req.url.split('?')[0] === '/api/juegos') { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' }); res.end(JSON.stringify(gameList())); return; }
  const pf = /^\/portadas\/([a-z0-9]+)\.jpg$/.exec(req.url.split('?')[0]);
  const lf = req.url.split('?')[0].split('/');
  if (lf.length === 3 && lf[1] === 'logos' && /^[a-z0-9]+.svg$/.test(lf[2])) { const f = path.join(__dirname, 'public', 'logos', lf[2]); if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' }); fs.createReadStream(f).pipe(res); return; } }
  if (pf) { const f = path.join(__dirname, 'public', 'portadas', pf[1] + '.jpg'); if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' }); fs.createReadStream(f).pipe(res); return; } }
  // terreno real y texturas de JEZERO
  const mf = /^\/marte\/((?:tex\/|modelos\/)?[a-z0-9_]+\.(?:jpg|txt))$/.exec(req.url.split('?')[0]);
  if (mf) { const f = path.join(__dirname, 'public', 'marte', mf[1]); if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': f.endsWith('.jpg') ? 'image/jpeg' : 'text/plain', 'cache-control': 'public, max-age=86400' }); fs.createReadStream(f).pipe(res); return; } }
  const page = (/^\/([a-z0-9]+)\/?(\?.*)?$/i.exec(req.url) || [])[1];
  if (page && PAGES[page.toLowerCase()]) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); res.end(PAGES[page.toLowerCase()]); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
  res.end(html);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/marte-ws')) marte.handleUpgrade(req, socket, head);
  else wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
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
      ws.send(JSON.stringify({ t: 'init', you: c.id, meta: state.meta, chunks: state.chunks, docs: state.docs, peers }));
      return;
    }
    if (!clients.has(ws)) return;
    if (m.t === 'pres' && m.p && typeof m.p === 'object') {
      c.p = m.p; broadcast({ t: 'peer', id: c.id, name: c.name, p: m.p }, ws);
    } else if (m.t === 'chunk' && /^c_\d+_\d+$/.test(m.ck) && m.b && typeof m.b === 'object') {
      state.chunks[m.ck] = m.b; save(); broadcast({ t: 'chunk', ck: m.ck, b: m.b }, ws);
    } else if (m.t === 'chunkdel' && c.admin && /^c_\d+_\d+$/.test(m.ck)) {
      delete state.chunks[m.ck]; save(); broadcast({ t: 'chunkdel', ck: m.ck }, ws);
    } else if (m.t === 'doc' && /^chests\/c_\d+_\d+_\d+$/.test(m.path) && m.data && typeof m.data === 'object' && JSON.stringify(m.data).length < 20000) {
      state.docs[m.path] = m.data; save(); broadcast({ t: 'doc', path: m.path, data: m.data }, ws);
    } else if (m.t === 'meta' && m.meta) {
      const seed = Number(m.meta.seed) | 0, t0 = Number(m.meta.t0) || Date.now();
      const newWorld = seed !== state.meta.seed;
      if (newWorld && !c.admin) return; // solo el admin puede borrar el mundo
      if (newWorld) { state.chunks = {}; state.docs = {}; }
      state.meta = { seed, t0 }; save();
      broadcast({ t: 'meta', meta: state.meta }, newWorld ? null : ws);
    }
  });
  ws.on('close', () => { if (clients.delete(ws)) broadcast({ t: 'left', id: c.id }); });
});

server.listen(PORT, () => console.log('Cubix escuchando en el puerto ' + PORT));
