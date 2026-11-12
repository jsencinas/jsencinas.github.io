# Jorge Sánchez Encinas · portfolio

Single-page portfolio. Plain HTML, CSS and vanilla JavaScript, no build step. Served by GitHub Pages from the repository root.

## Structure

- `index.html`: the page.
- `assets/css/site.css`: all styles. Design tokens are the custom properties at the top.
- `assets/js/main.js`: intro, phone menu, caption resolve, footer clock, console greeting. The intro plays on every load (not with reduced motion, and not when the URL has a `#section` link); any key, click, wheel or touch skips it. Its timings are the `--intro-*` properties in `site.css`.
- `assets/js/page.js`: fade-up on scroll, title decrypt, terminal typing and cursor, statement reveal, video playback rules.
- `assets/js/decrypt.js`: the decrypt effect (random characters that lock into the real text), used by the hero name and every title.
- `assets/js/ghost.js`: the ASCII ghost in the small terminal next to the statement (an original design). It moves on springs and plays short scenes (boo, wink, sleepy, vanish, dash, plus calm ones). Add `?ghost=<scene>` to the page URL to watch one scene. Loaded only when the statement comes near the screen. Visual constants and scene weights are in the block at the top.
- `assets/js/sphere.js`: the hero dot sphere (2D canvas). Every 5 s it crumbles into dust and rebuilds with a different texture: a lit rock, fuzzy dust, terrain patches, turbulent bands and the even dot lattice, then the rock again. `figures` sets the order, each texture has its own entry, `holdMs` and the `burst*` values set the timing. Visual constants are in the block at the top.
- `assets/fonts/`: self-hosted WOFF2 subsets of Archivo (variable, weights 400 to 500) and Geist Mono (400).
- `assets/video/`: the card and panel videos (see below).
- `assets/images/`: project and volunteering photos as WebP, each at two widths for `srcset` (see "Photos" below).
- `media-src/` (gitignored, never published): full-size originals of the photos and footage. They can carry camera and GPS metadata, so only the processed copies in `assets/` go online.
- `.well-known/security.txt`: RFC 9116 contact file.
- `robots.txt`: allows all crawlers. Lighthouse reports it as "unable to download" because the page's CSP sets `connect-src 'none'`, which blocks Lighthouse's in-page fetch; real crawlers request the file directly and are not affected.

## Video slots

Files named `sample-*` are abstract **samples** rendered for layout. To use real footage, replace the files at the same paths (same names, same formats). No code changes are needed.

| Slot | Files | Used in | Recommended specs |
|---|---|---|---|
| Wide panel | `assets/video/sample-panel.mp4`, `.webm`, poster `sample-panel.webp` (sample) | The "Software that has to keep up" card between Projects and About. Plays only while visible. Text sits on top with a dim layer, so keep it calm and dark. | 1280 × 720, about 6 s, seamless loop |
| FIRST 7102 | `assets/video/frc-7102.mp4`, `.webm` (real: autonomous run on the practice field, 21 s, about 1.6 MB each). Poster: `assets/images/first-960.webp` / `-1600.webp`, a competition photo | FIRST Robotics 7102 project card. Touch devices only ever see the poster. | 960 × 540, 24 fps |
| 6-DOF arm | `assets/video/sample-arm.mp4`, `.webm`, poster `sample-arm.webp` (sample) | Robotic arm project card | 960 × 540, about 4 s, seamless loop |

The Synthia and Autexa cards show a still photo, not a video (see "Photos").

Specs for every file:
- No audio track. 16:9.
- MP4: H.264, `yuv420p`, `+faststart`. WebM: VP9. Short loops should stay under about 600 KB; real footage under about 2 MB per file. Videos load only when they play.
- Strip metadata (`-map_metadata -1`): phone footage carries GPS coordinates.
- Poster: WebP of the **first frame**, same size as the video, so the crossfade from poster to video doesn't jump (the FIRST card uses a photo instead, on purpose).

Example with ffmpeg (input `in.mov`, 960 × 540, 4 s):

```sh
ffmpeg -i in.mov -t 4 -an -vf scale=960:540 -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart sample-synthia.mp4
ffmpeg -i in.mov -t 4 -an -vf scale=960:540 -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 sample-synthia.webm
ffmpeg -i in.mov -frames:v 1 -vf scale=960:540 -c:v libwebp -quality 82 sample-synthia.webp
```

Playback rules (in `page.js`): muted, inline, looped, `preload="none"`, and at most one video plays at a time. The wide panel plays while on screen. Project cards play on mouse hover or keyboard focus, and show only the poster on touch devices. With reduced motion or Save-Data, only posters are shown.

## Photos

All in `assets/images/`, WebP, two widths each, lazy-loaded, with metadata stripped (`magick ... -strip`).

| File | Used in | Crop |
|---|---|---|
| `synthia-960.webp`, `-1600.webp` | Synthia card (HackMTY 2026 team photo) | 16:9. Above 1200 px the box can crop the sides; `object-position` keeps the team in view. |
| `autexa-960.webp`, `-1600.webp` | Autexa card (admin settings screenshot) | 16:9 from the top of the page; anchored top left. |
| `first-960.webp`, `-1600.webp` | FIRST 7102 card, poster over the video | 16:9 |
| `techo-1-480.webp`, `-800.webp`, `techo-2-*` | Techo row in Leadership, side by side | 4:5 |

Example (16:9 crop, two widths):

```sh
magick in.jpg -auto-orient -crop 4800x2700+700+1000 +repage -strip c.png
magick c.png -resize 960x  -quality 80 -define webp:method=6 name-960.webp
magick c.png -resize 1600x -quality 80 -define webp:method=6 name-1600.webp
```

## Maintenance

- **Renew `security.txt` before 2027-11-01.** The `Expires` field in `.well-known/security.txt` must stay in the future, so update it (to about a year ahead) before that date.
- **Bump the version tag when you change CSS or JS.** Every stylesheet and module URL ends in `?v=` plus the same tag (in `index.html`, and in the `import` lines of `main.js` and `page.js`). Change it everywhere at once, to any new value, so browsers fetch the new files instead of a cached copy. Use the same tag in every file, or a module loads twice.
- **The inline script in `<head>` is pinned by a hash** in the Content-Security-Policy meta tag. If you change that script, recompute the hash (`sha256` of the exact script text, base64) and update the `script-src` value, or the browser will block it.
