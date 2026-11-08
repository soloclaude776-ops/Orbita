// Estudio de Órbita: un chat con Claude dentro de /subir para crear y cambiar juegos.
// Necesita la variable ANTHROPIC_API_KEY en Render (se paga por uso en console.anthropic.com).
// Solo entran quienes saben la contraseña de /subir. La conversación la guarda el navegador y la manda entera en cada pedido.
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.ESTUDIO_MODEL || 'claude-opus-5-5';
const PER_DAY = +process.env.ESTUDIO_POR_DIA || 60; // tope de pedidos por día para cuidar la plata
let client = null;
if (process.env.ANTHROPIC_API_KEY) client = new Anthropic();
let day = new Date().toDateString(), today = 0;

const SYSTEM = `Sos el estudio de juegos de Órbita, la plataforma de juegos de Bruno y Mauro (Uruguay). Hablás en español rioplatense, claro y directo, como un compañero que programa juegos.
Tu trabajo es crear juegos nuevos y mejorar los que te traigan, para jugar en el navegador de la compu y del celular.
Reglas del código:
- Cada juego es UN solo archivo HTML completo y autocontenido: CSS y JavaScript adentro. Si necesitás 3D, podés cargar three.js desde https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js (y sus ejemplos de esa misma versión). Nada de otras dependencias externas, imágenes ni sonidos de afuera: dibujá con canvas, SVG o formas, y generá los sonidos con Web Audio.
- Controles con teclado y mouse, y también táctiles para el celular. Textos del juego en español rioplatense.
- Que se vea lindo y que sea divertido de verdad: desafío, ritmo, sensación de progreso. Guardá el avance en localStorage si tiene sentido.
- Cuando entregues un juego o un cambio, mandá SIEMPRE el archivo completo en un solo bloque \`\`\`html … \`\`\`, nunca pedazos sueltos. Antes del bloque, explicá en 2 o 3 frases qué hiciste. Después, si hace falta, una línea con qué probar.
- Juegos originales: no copies nombres, personajes, mapas, música ni el aspecto de juegos existentes, aunque te lo pidan; ofrecé algo propio con un estilo parecido.
- Si te piden algo que no es un juego o que no se puede hacer en un solo archivo, decilo y proponé lo más cercano.`;

function line(res, obj) { res.write(JSON.stringify(obj) + '\n'); }

module.exports = function handleEstudio(req, res, ctx) {
  if (req.method !== 'POST' || req.url.split('?')[0] !== '/api/estudio') return false;
  ctx.readBody(req, 6 * 1024 * 1024).then(async raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return ctx.send(res, 400, { error: 'Datos inválidos.' }); }
    if (!ctx.okPass(m.clave, req)) return ctx.send(res, 401, { error: 'Contraseña incorrecta.' });
    if (!client) return ctx.send(res, 503, { error: 'Falta conectar Claude: hay que poner ANTHROPIC_API_KEY en Render.' });
    const d = new Date().toDateString(); if (d !== day) { day = d; today = 0; }
    if (today >= PER_DAY) return ctx.send(res, 429, { error: 'Llegamos al tope de pedidos de hoy. Mañana se renueva.' });
    const messages = Array.isArray(m.messages) ? m.messages : [];
    if (!messages.length || messages[messages.length - 1].role !== 'user') return ctx.send(res, 400, { error: 'Falta tu mensaje.' });
    today++;
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
    let closed = false; req.on('close', () => { closed = true; });
    try {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        system: SYSTEM,
        messages,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default'
      });
      for await (const event of stream) {
        if (closed) { stream.abort(); return; }
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') line(res, { t: 'texto', d: event.delta.text });
        else if (event.type === 'content_block_start' && event.content_block.type === 'thinking') line(res, { t: 'pensando' });
      }
      const fin = await stream.finalMessage();
      // el navegador guarda el turno tal cual (con sus bloques de razonamiento) y lo devuelve sin tocar en el próximo pedido
      line(res, { t: 'fin', content: fin.content, stop: fin.stop_reason, uso: fin.usage });
    } catch (e) {
      const msg = e && e.status === 429 ? 'Claude está saturado, probá en un minuto.' : e && e.status === 401 ? 'La clave de Claude no es válida.' : e && e.status === 400 ? 'Claude no aceptó el pedido (' + (e.message || '') .slice(0, 160) + ').' : 'Falló la conexión con Claude.';
      if (!closed) line(res, { t: 'error', d: msg });
    }
    if (!closed) res.end();
  }).catch(e => ctx.send(res, 413, { error: e.message }));
  return true;
};
