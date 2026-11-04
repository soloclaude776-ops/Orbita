# Órbita

Plataforma con todos nuestros juegos para jugar en el navegador (compu, celular y consola).

- **Página principal:** la plataforma, con el juego destacado, buscador y filtros.
- **Cada juego tiene su dirección:** `/marte`, `/isla`, `/farol`, `/eco`, `/comarca`, `/eter`, `/cubix`.

## Cómo sumar un juego nuevo

1. Poner el juego en `cubix-web/public/nombre.html`. Con eso ya aparece en la plataforma y se juega en `/nombre`.
2. Opcional: anotarlo en `cubix-web/public/juegos.json` (título, descripción, etiquetas) y poner su portada en `cubix-web/public/portadas/nombre.jpg`.

El nombre de la plataforma también se cambia en `juegos.json` (campo `"nombre"`).

## Servidor

`cubix-web/server.js` entrega las páginas, el mundo compartido de Cubix, las colonias de JEZERO (`marte.js`) y la IA de los personajes (`ai.js`). En Render, cada `git push` publica la versión nueva sola.
