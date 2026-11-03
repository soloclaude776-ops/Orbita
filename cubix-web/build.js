// Prepara las páginas para navegadores viejos (como el de la Play): traduce el JavaScript moderno a uno más simple
// y agrega un aviso que muestra en pantalla cualquier error. Corre solo después de "npm install" y deja todo en dist/.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild-wasm');

const SRC = path.join(__dirname, 'public');
const OUT = path.join(__dirname, 'dist');
const CATCH = '<script>(function(){function show(m){var d=document.getElementById("errbox");if(!d){d=document.createElement("div");d.id="errbox";'
  + 'd.style.cssText="position:fixed;left:8px;right:8px;top:8px;z-index:99;background:#5a1010;color:#fff;font:14px sans-serif;padding:10px;border-radius:8px";'
  + '(document.body||document.documentElement).appendChild(d);}d.textContent="Algo falló en este navegador: "+m;}'
  + 'window.addEventListener("error",function(e){if(window.__noWebGL)return;show((e.message||"error")+" (línea "+(e.lineno||"?")+")");});'
  + 'window.addEventListener("unhandledrejection",function(e){if(window.__noWebGL)return;show(String(e.reason&&e.reason.message||e.reason));});})();</script>\n';

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(SRC, f), 'utf8');
    const parts = html.split(/(<script>[\s\S]*?<\/script>)/);
    for (let i = 1; i < parts.length; i += 2) {
      const code = parts[i].slice(8, -9);
      parts[i] = '<script>' + (await esbuild.transform(code, { target: 'es2017', loader: 'js' })).code + '</script>';
    }
    let out = parts.join('');
    const at = out.indexOf('<script');
    out = out.slice(0, at) + CATCH + out.slice(at);
    fs.writeFileSync(path.join(OUT, f), out);
    console.log('Listo para navegadores viejos:', f);
  }
}
main().catch(e => { console.error('No se pudo preparar dist/:', e.message); process.exit(0); });
