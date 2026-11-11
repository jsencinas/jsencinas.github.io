# Jorge Sánchez Encinas · portfolio

Single-page portfolio. Plain HTML, CSS and vanilla JavaScript, no build step. Served by GitHub Pages from the repository root.

## Structure

- `index.html`: the page.
- `assets/css/site.css`: all styles. Design tokens are the custom properties at the top.
- `assets/js/main.js`: intro, phone menu, caption resolve, footer clock, console greeting.
- `assets/js/page.js`: fade-up on scroll, terminal typing and cursor, statement reveal, video playback rules.
- `assets/js/sphere.js`: the hero dot sphere (2D canvas). Visual constants are in the block at the top.
- `assets/fonts/`: self-hosted WOFF2 subsets of Archivo (variable, weights 400 to 500) and Geist Mono (400).
- `assets/video/`: sample videos and their WebP posters (see below).
- `.well-known/security.txt`: RFC 9116 contact file.

## Video slots

The current files are abstract **samples** rendered for layout. To use real footage, replace the files at the same paths (same names, same formats). No code changes are needed.

| Slot | Files | Used in | Recommended specs |
|---|---|---|---|
| Wide panel | `assets/video/sample-panel.mp4`, `.webm`, poster `sample-panel.webp` | The "Software that has to keep up" card between Projects and About. Plays only while visible. Text sits on top with a dim layer, so keep it calm and dark. | 1280 × 720, about 6 s, seamless loop |
| Synthia | `assets/video/sample-synthia.mp4`, `.webm`, poster `sample-synthia.webp` | Synthia project card. On screens 1200 to 1380 px wide the card crops up to about 15% of the video's width (left and right), so keep the subject centered. | 960 × 540, about 4 s, seamless loop |
| FIRST 7102 | `assets/video/sample-robotics.mp4`, `.webm`, poster `sample-robotics.webp` | FIRST Robotics 7102 project card | 960 × 540, about 4 s, seamless loop |
| 6-DOF arm | `assets/video/sample-arm.mp4`, `.webm`, poster `sample-arm.webp` | Robotic arm project card | 960 × 540, about 4 s, seamless loop |

Specs for every file:
- No audio track. 16:9.
- MP4: H.264, `yuv420p`, `+faststart`. WebM: VP9. Keep each file under about 600 KB, all videos together under 3 MB.
- Poster: WebP of the **first frame**, same size as the video, so the crossfade from poster to video doesn't jump.

Example with ffmpeg (input `in.mov`, 960 × 540, 4 s):

```sh
ffmpeg -i in.mov -t 4 -an -vf scale=960:540 -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart sample-synthia.mp4
ffmpeg -i in.mov -t 4 -an -vf scale=960:540 -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 sample-synthia.webm
ffmpeg -i in.mov -frames:v 1 -vf scale=960:540 -c:v libwebp -quality 82 sample-synthia.webp
```

Playback rules (in `page.js`): muted, inline, looped, `preload="none"`, and at most one video plays at a time. The wide panel plays while on screen. Project cards play on mouse hover or keyboard focus, and show only the poster on touch devices. With reduced motion or Save-Data, only posters are shown.

## Maintenance

- **Renew `security.txt` before 2027-11-01.** The `Expires` field in `.well-known/security.txt` must stay in the future, so update it (to about a year ahead) before that date.
- **The inline script in `<head>` is pinned by a hash** in the Content-Security-Policy meta tag. If you change that script, recompute the hash (`sha256` of the exact script text, base64) and update the `script-src` value, or the browser will block it.
