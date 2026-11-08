// Estudio de Órbita con "puente": en /subir se dejan pedidos de juegos para Claude.
// Los pedidos se guardan en GitHub, en el archivo estudio/pedidos.json de la rama "estudio"
// (otra rama para que guardar un pedido no reinicie el sitio). Dos veces por día una tarea de Claude
// los lee, hace los juegos, los publica en la rama main y anota la respuesta en ese mismo archivo.
// Usa la misma variable GITHUB_TOKEN que /subir.
const REPO = process.env.GITHUB_REPO || 'soloclaude776-ops/Orbita';
const BRANCH = process.env.ESTUDIO_BRANCH || 'estudio';
const FILE = 'estudio/pedidos.json';
const TOKEN = process.env.GITHUB_TOKEN || '';
const API = 'https://api.github.com/repos/' + REPO + '/contents/' + FILE;
const head = () => ({ authorization: 'Bearer ' + TOKEN, accept: 'application/vnd.github+json', 'user-agent': 'orbita-estudio' });

async function leer() {
  const r = await fetch(API + '?ref=' + BRANCH, { headers: head() });
  if (!r.ok) throw new Error('GitHub respondió ' + r.status);
  const j = await r.json();
  return { sha: j.sha, data: JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')) };
}
async function guardar(data, sha, msg) {
  const r = await fetch(API, { method: 'PUT', headers: head(), body: JSON.stringify({ message: msg, branch: BRANCH, sha, content: Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64') }) });
  if (r.status === 409) return false; // alguien lo cambió recién: se reintenta
  if (!r.ok) throw new Error('GitHub respondió ' + r.status);
  return true;
}

module.exports = function handleEstudio(req, res, ctx) {
  const url = req.url.split('?')[0];
  if (req.method !== 'POST' || (url !== '/api/puente/pedidos' && url !== '/api/puente/pedir')) return false;
  ctx.readBody(req, 200 * 1024).then(async raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return ctx.send(res, 400, { error: 'Datos inválidos.' }); }
    if (!ctx.okPass(m.clave, req)) return ctx.send(res, 401, { error: 'Contraseña incorrecta.' });
    if (!TOKEN) return ctx.send(res, 503, { error: 'Falta conectar GitHub (GITHUB_TOKEN) en Render.' });
    try {
      if (url === '/api/puente/pedidos') {
        const { data } = await leer();
        return ctx.send(res, 200, { pedidos: (data.pedidos || []).slice(-40).reverse() });
      }
      const texto = String(m.texto || '').trim().slice(0, 4000);
      if (texto.length < 5) return ctx.send(res, 400, { error: 'Contá un poco más qué querés.' });
      const juego = /^[a-z0-9]{2,20}$/.test(String(m.juego || '')) ? String(m.juego) : '';
      const pedido = { id: 'p' + Date.now().toString(36), fecha: new Date().toISOString(), juego, texto, estado: 'pendiente', respuesta: '', url: '' };
      for (let i = 0; i < 3; i++) {
        const { sha, data } = await leer();
        data.pedidos = (data.pedidos || []).concat(pedido);
        if (await guardar(data, sha, 'Pedido nuevo para el estudio: ' + texto.slice(0, 50))) return ctx.send(res, 200, { ok: true, pedido });
      }
      ctx.send(res, 409, { error: 'No se pudo guardar el pedido, probá de nuevo.' });
    } catch (e) { ctx.send(res, 502, { error: 'No se pudo hablar con GitHub (' + e.message + ').' }); }
  }).catch(e => ctx.send(res, 413, { error: e.message }));
  return true;
};
