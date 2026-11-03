# Cubix

Juego de bloques multijugador que corre en el navegador. Un servidor en Node entrega el juego y sincroniza el mundo y los jugadores por WebSocket.

## Archivos

- `server.js`: el servidor (página + multijugador).
- `public/index.html`: el juego completo.
- `package.json`: dependencias (solo `ws`).

## Probarlo en tu compu

```bash
npm install
npm start
```

Abrí http://localhost:3000. Para probar el multijugador, abrilo en dos pestañas.

## Subirlo a Render

1. Creá un repositorio nuevo en GitHub (por ejemplo `cubix`) y subí esta carpeta:
   ```bash
   git init
   git add .
   git commit -m "Cubix"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/cubix.git
   git push -u origin main
   ```
2. En Render: **New → Web Service** → elegí el repo `cubix`.
3. Configuración:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. En **Environment** agregá la variable `ADMIN_KEY` con una clave tuya (por ejemplo `mi-clave-secreta`).
5. **Create Web Service**. Cuando termine, te da un link tipo `https://cubix-xxxx.onrender.com`.

## Usarlo

- Pasale el link a tus amigos. La primera vez les pide un nombre.
- Para poder usar **"Mundo nuevo"** entrá con tu clave: `https://cubix-xxxx.onrender.com/?admin=mi-clave-secreta`. Sin la clave, nadie puede borrar el mundo.

## Ojo con el plan gratis

- Si nadie entra por 15 minutos el servidor se duerme. La siguiente entrada tarda unos 30 a 50 segundos.
- El plan gratis **no guarda archivos para siempre**: cuando Render reinicia o vuelve a desplegar, **el mundo se reinicia**. Para que dure, agregá un **Disk** (es pago) montado en `/data` y poné la variable `DATA_FILE=/data/world.json`.
