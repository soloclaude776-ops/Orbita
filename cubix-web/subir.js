// Subir juegos nuevos a Órbita desde la página /subir, con contraseña.
// Las contraseñas válidas se guardan como "huella" (sha256), no en texto. Se pueden cambiar con la variable UPLOAD_PASSWORDS="una,otra".
// Si está GITHUB_TOKEN, cada juego subido también se guarda en el repositorio de GitHub y queda para siempre.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const HASHES = process.env.UPLOAD_PASSWORDS
  ? process.env.UPLOAD_PASSWORDS.split(',').map(s => sha(s.trim())).filter(Boolean)
  : ['ccc68482d9e0eee0789e64c7674421076738f8836857ea89bcd0afb832bf3fc3', '19e37c4dfe9a2e1570be1f4cbafca76f3ed757231c0865e02465c909d916b1d1'];
const REPO = process.env.GITHUB_REPO || 'soloclaude776-ops/Orbita';
const TOKEN = process.env.GITHUB_TOKEN || '';
const RESERVED = new Set(['index', 'test', 'api', 'subir', 'logos', 'portadas', 'health', 'marte', 'dist', 'public']);
const tries = new Map();

function okPass(p) {
  const h = Buffer.from(sha(String(p || '').trim().toLowerCase()), 'hex');
  return HASHES.some(x => { const b = Buffer.from(x, 'hex'); return b.length === h.length && crypto.timingSafeEqual(b, h); });
}
function limited(ip) {
  const now = Date.now(), t = (tries.get(ip) || []).filter(x => now - x < 10 * 60000);
  tries.set(ip, t); return t.length >= 10;
}
function fail(ip) { const t = tries.get(ip) || []; t.push(Date.now()); tries.set(ip, t); }
function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
function readBody(req, max) {
  return new Promise((ok, no) => {
    let n = 0; const parts = [];
    req.on('data', c => { n += c.length; if (n > max) { no(new Error('El archivo es muy grande (máximo 15 MB).')); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts).toString('utf8'))); req.on('error', no);
  });
}
async function gh(file, contentB64, msg) {
  const url = 'https://api.github.com/repos/' + REPO + '/contents/cubix-web/public/' + file;
  const head = { authorization: 'Bearer ' + TOKEN, accept: 'application/vnd.github+json', 'user-agent': 'orbita-subir' };
  let sha0;
  const g = await fetch(url, { headers: head }); if (g.ok) sha0 = (await g.json()).sha;
  const r = await fetch(url, { method: 'PUT', headers: head, body: JSON.stringify({ message: msg, content: contentB64, sha: sha0 }) });
  if (!r.ok) throw new Error('GitHub respondió ' + r.status);
}

module.exports = function handleSubir(req, res, ctx) {
  const url = req.url.split('?')[0];
  if (url === '/subir' || url === '/subir/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(fs.readFileSync(path.join(__dirname, 'public', 'subir.page'))); return true;
  }
  if (req.method !== 'POST' || (url !== '/api/entrar' && url !== '/api/subir')) return false;
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (limited(ip)) { send(res, 429, { error: 'Demasiados intentos. Probá de nuevo en 10 minutos.' }); return true; }
  readBody(req, 15 * 1024 * 1024).then(async raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return send(res, 400, { error: 'Datos inválidos.' }); }
    if (!okPass(m.clave)) { fail(ip); return send(res, 401, { error: 'Contraseña incorrecta.' }); }
    if (url === '/api/entrar') return send(res, 200, { ok: true, guardaEnGithub: !!TOKEN });
    // validar el juego
    const id = String(m.id || '').toLowerCase();
    if (!/^[a-z0-9]{2,20}$/.test(id) || RESERVED.has(id)) return send(res, 400, { error: 'La dirección tiene que ser de 2 a 20 letras o números, sin espacios, y no puede ser una reservada.' });
    const html = String(m.html || '');
    if (html.length < 50 || !/<(html|body|script|canvas|div)/i.test(html)) return send(res, 400, { error: 'Eso no parece el código de un juego (tiene que ser HTML).' });
    const titulo = String(m.titulo || id).slice(0, 40);
    const page = /<!doctype/i.test(html) ? html : '<!doctype html>\n<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + titulo.replace(/</g, '') + '</title></head><body>\n' + html + '\n</body></html>\n';
    const pub = path.join(__dirname, 'public');
    fs.writeFileSync(path.join(pub, id + '.html'), page);
    // datos para la tarjeta
    const jf = path.join(pub, 'juegos.json'); let meta = { juegos: [] }; try { meta = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) { /* nuevo */ }
    const entry = { id, titulo, sub: String(m.sub || '').slice(0, 60), desc: String(m.desc || 'Juego nuevo.').slice(0, 300), tags: (Array.isArray(m.tags) ? m.tags : []).map(t => String(t).slice(0, 20)).slice(0, 6), motor: m.motor === '3d' ? '3d' : '2d', nuevo: true, subidoPor: String(m.quien || '').slice(0, 20) };
    meta.juegos = meta.juegos.filter(j => j.id !== id); meta.juegos.unshift(entry);
    fs.writeFileSync(jf, JSON.stringify(meta, null, 2));
    let portadaB64 = null;
    if (typeof m.portada === 'string' && m.portada.startsWith('data:image/jpeg;base64,')) {
      portadaB64 = m.portada.slice(23); fs.mkdirSync(path.join(pub, 'portadas'), { recursive: true });
      fs.writeFileSync(path.join(pub, 'portadas', id + '.jpg'), Buffer.from(portadaB64, 'base64'));
    }
    ctx.PAGES[id] = ctx.withIcon(page, 'orbita');
    // guardarlo para siempre en GitHub
    let permanente = false, aviso = '';
    if (TOKEN) {
      try {
        if (portadaB64) await gh('portadas/' + id + '.jpg', portadaB64, 'Portada de ' + titulo);
        await gh(id + '.html', Buffer.from(page).toString('base64'), 'Sube el juego ' + titulo + ' desde Órbita');
        await gh('juegos.json', Buffer.from(JSON.stringify(meta, null, 2)).toString('base64'), 'Anota ' + titulo + ' en la plataforma');
        permanente = true;
      } catch (e) { aviso = 'Ya se puede jugar, pero no se pudo guardar en GitHub (' + e.message + ').'; }
    } else aviso = 'Ya se puede jugar, pero falta conectar GitHub: si el servidor se reinicia, este juego se borra.';
    send(res, 200, { ok: true, url: '/' + id, permanente, aviso });
  }).catch(e => send(res, 413, { error: e.message }));
  return true;
};
