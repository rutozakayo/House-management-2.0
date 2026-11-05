# ReXnote — Cyberpunk Entry Gate

A premium, fully animated landing gate for **DARKNOTE L2**, branded **ReXnote**
by *peter mtech*, powered by *jimmy tech*.

The first screen is an immersive "digital system" entry point. Pressing
**ENTER SYSTEM** runs a boot transition (glitch slices, flash, uplink counter)
and reveals the main site — no page reload, no static images, no video.

---

## Files

```
darknote/
├─ index.html            # gate + main site markup
├─ styles.css            # design system, neon layers, responsive rules
├─ app.js                # canvas FX, boot transition, terminal, PWA install
├─ sw.js                 # service worker — offline app shell
├─ manifest.webmanifest  # installable app manifest
├─ favicon.svg           # hex "R" mark
├─ icons/                # 192 / 512 / maskable / apple-touch PNGs
└─ README.md
```

No build step, no dependencies. Everything is hand-written HTML/CSS/JS.

---

## Install as an app (PWA)

The gate is installable. An **INSTALL APP** control sits in the top HUD (and a
compact `INSTALL` button in the site nav) and only appears when the browser
actually offers installation — no dead button.

- `manifest.webmanifest`: standalone display, `#030408` theme, 192/512 icons
  plus a dedicated maskable icon.
- `sw.js`: precaches the shell (HTML, CSS, JS, icons, manifest), serves
  navigations network-first with an offline fallback, and refreshes other
  assets cache-first in the background. Bump `CACHE` when shipping changes.
- Chrome / Edge / Android: native install prompt via `beforeinstallprompt`.
- iOS Safari: no prompt API, so the same button opens a short
  "Share → Add to Home Screen" sheet.
- Already installed (standalone display mode): both buttons stay hidden.

Service workers need `https://` or `localhost` — opening `index.html` from the
filesystem will still render everything, it just won't be installable.

---

## Run it

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8080
# → http://localhost:8080/
```

The main site is also reachable directly at `index.html#system`.

---

## What is animated (all real, all continuous)

**Gate**
- Canvas particle field with drifting nodes and proximity links
- Digital rain (katakana/hex columns) on a separate cadence
- Three sweeping laser beams in blue / purple / red
- Perspective grid floor, scanline overlay, travelling scan bar, film grain
- Rotating holographic rings and a conic sweep behind the logo
- Glitch bursts on the wordmark (RGB split + clip-path slices)
- Rotating conic neon border on the ENTER SYSTEM button
- Cursor-follow glow and subtle ring parallax (desktop)
- Live Singapore clock

**Main site**
- Telemetry meters that re-settle every 2.6s
- Self-typing terminal session that loops
- Marquee ticker, scroll reveals, scroll-reactive nav
- Animated holographic orb

---

## Design tokens

Edit the `:root` block in `styles.css`:

| Token | Value | Role |
|---|---|---|
| `--bg` | `#030408` | deep black base |
| `--blue` | `#00C8FF` | primary neon |
| `--purple` | `#8B5CF6` | secondary neon |
| `--red` | `#FF1744` | accent |
| `--display` | Orbitron | sci-fi display type |
| `--ui` | Chakra Petch | body / UI |
| `--mono` | Share Tech Mono | HUD, terminal |

Fonts load from Google Fonts with system fallbacks.

---

## Behaviour notes

- Hash `#system` opens the main site directly (shareable deep link).
- `RETURN TO GATE` fades the site out and returns to the entry screen.
- `Enter` on the keyboard triggers the same transition as the button.
- `prefers-reduced-motion: reduce` disables the canvas loop, glitch, beams
  and all long animations; the transition becomes an instant swap.
- Canvas is capped at 2× DPR, thins its particle count on small screens,
  and pauses when the tab is hidden.
- Layout is fluid from 320px phones to ultrawide; the gate fits one
  viewport (`dvh`-safe, no scroll) and the site reflows to a single column
  under 720px.

---

## Deploying

Static hosting — GitHub Pages, Netlify, Vercel or any bucket. If publishing
from this repository, point Pages at the branch and open the `/darknote/`
path (the repository root serves the Rental House Manager app).
