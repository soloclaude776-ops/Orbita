// JEZERO: colonias compartidas en Marte. Cada código de colonia es una sala; la compu del primero que entra lleva la simulación.
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');

const FILE = process.env.MARTE_FILE || path.join(__dirname, 'marte.json');
let rooms = {};
try { rooms = JSON.parse(fs.readFileSync(FILE, 'utf8')).rooms || {}; } catch (e) { /* sin colonias guardadas */ }
let timer = null;
function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const keys = Object.keys(rooms);
    if (keys.length > 300) keys.sort((a, b) => rooms[a].at - rooms[b].at).slice(0, keys.length - 300).forEach(k => delete rooms[k]);
    fs.writeFile(FILE, JSON.stringify({ rooms }), () => {});
  }, 3000);
}

const live = new Map(); // código -> { clients: Map(ws -> jugador), host: ws }
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
let nextId = 1;
const ok = c => c && typeof c === 'object' && Array.isArray(c.b) && JSON.stringify(c).length < 900000;
function send(ws, m) { if (ws.readyState === 1) ws.send(JSON.stringify(m)); }
function bc(L, m, except) { const s = JSON.stringify(m); for (const w of L.clients.keys()) if (w !== except && w.readyState === 1) w.send(s); }

wss.on('connection', ws => {
  let room = null;
  const me = { id: 'm' + nextId++, name: 'Astronauta', p: null };
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'hello' && !room) {
      room = String(m.room || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || 'jezero';
      me.name = String(m.name || 'Astronauta').slice(0, 16);
      let L = live.get(room);
      if (!L) { L = { clients: new Map(), host: null }; live.set(room, L); }
      L.clients.set(ws, me);
      const host = !L.host || L.host.readyState !== 1;
      if (host) L.host = ws;
      if (!rooms[room] && ok(m.colony)) { rooms[room] = { colony: m.colony, at: Date.now() }; persist(); }
      const peers = [...L.clients.entries()].filter(([w, c]) => w !== ws && c.p).map(([, c]) => ({ id: c.id, name: c.name, p: c.p }));
      send(ws, { t: 'init', you: me.id, host, colony: rooms[room] ? rooms[room].colony : null, peers });
      return;
    }
    if (!room) return;
    const L = live.get(room); if (!L) return;
    if (m.t === 'pres' && m.p && typeof m.p === 'object') { me.p = m.p; bc(L, { t: 'peer', id: me.id, name: me.name, p: m.p }, ws); }
    else if (m.t === 'state' && ws === L.host && ok(m.colony)) { rooms[room] = { colony: m.colony, at: Date.now() }; persist(); bc(L, { t: 'state', colony: m.colony }, ws); }
    else if (m.t === 'act' && ws !== L.host && L.host && m.a && typeof m.a === 'object') send(L.host, { t: 'act', a: m.a, from: me.id });
  });
  ws.on('close', () => {
    if (!room) return;
    const L = live.get(room); if (!L) return;
    L.clients.delete(ws); bc(L, { t: 'left', id: me.id });
    if (L.host === ws) { const next = L.clients.keys().next().value; L.host = next || null; if (next) send(next, { t: 'host' }); }
    if (!L.clients.size) live.delete(room);
  });
});

module.exports = {
  handleUpgrade(req, socket, head) { wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)); }
};
