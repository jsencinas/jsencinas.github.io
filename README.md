# Jorge Sánchez Encinas · portfolio

Single-page portfolio. Plain HTML, CSS and vanilla JavaScript, no build step. Served by GitHub Pages from the repository root.

## Structure

- `index.html`: the page.
- `assets/css/site.css`: all styles. Design tokens are the custom properties at the top.
- `assets/js/main.js`: intro, phone menu, caption resolve, footer clock, console greeting.
- `assets/js/sphere.js`: the hero dot sphere (2D canvas). Visual constants are in the block at the top.
- `assets/fonts/`: self-hosted WOFF2 subsets of Archivo (variable, weights 400 to 500) and Geist Mono (400).
- `.well-known/security.txt`: RFC 9116 contact file.

## Maintenance

- **Renew `security.txt` before 2027-11-01.** The `Expires` field in `.well-known/security.txt` must stay in the future, so update it (to about a year ahead) before that date.
- **The inline script in `<head>` is pinned by a hash** in the Content-Security-Policy meta tag. If you change that script, recompute the hash (`sha256` of the exact script text, base64) and update the `script-src` value, or the browser will block it.
