# ZoomiOS — zoomi.co

The homepage for **Zoomi, LLC**, built as a spatial "operating system" that
showcases the company's four businesses. Informative only — no forms, no CTA.

The four businesses:

| Business | Domain | What it is |
| --- | --- | --- |
| Zoomi Audit | [audit.zoomi.co](https://audit.zoomi.co) | Digital marketing & SEO |
| Zoomi Government | [gov.zoomi.co](https://gov.zoomi.co) | Government contracting (SAM active · CAGE 217B9 · UEI WC51DCJCFW17) |
| Margin | [margin.zoomi.co](https://margin.zoomi.co) | A Bible app |
| Zoomi Rentals | [rent.zoomi.co](https://rent.zoomi.co) | Washer & dryer rentals |

## Experience

- **Desktop** — an interactive 3D space (three.js): a glowing "Z" core with four
  orbiting business "satellites" you can hover and click, an OS menu bar, a dock,
  and draggable app windows. Mouse parallax drives a gentle look-around.
- **Mobile** — a phone-OS home screen: status bar, app tiles, and full-screen
  app sheets that slide up, over a lightweight 3D wallpaper.
- **Boot sequence** — a short "ZoomiOS" boot animation on load.

## Tech

- **three.js** (`r0.179`, loaded via CDN import map) — the WebGL scene.
- **GSAP** (`3.12`, CDN) — boot timeline, window/sheet transitions, reveals.
- **Vanilla JS, no build step.** Plain static files served as-is (GitHub Pages).

## Files

```
index.html   # shell: GTM, meta, import map, boot/OS/phone markup, SEO fallback
os.css       # all styling (desktop chrome, phone OS, boot, fallback)
os.js        # three.js scene + GSAP + UI construction and interactions
```

`cursor.js`, `marketing.*`, `team.html`, `styles.css`, `input.css`, and the
Tailwind tooling are retained from the previous site but are not used by the
current homepage.

## Run locally

```bash
npx http-server -c-1        # or: npm start
```

Then open the served URL. No dependencies need to be installed for the page to
run — three.js and GSAP load from CDN.

## Accessibility & resilience

- Semantic `.fallback` content (the four businesses + links) is in the DOM for
  crawlers and is shown automatically if the 3D module fails to load.
- `prefers-reduced-motion` is respected — animation and parallax are disabled.
- The boot cover is dismissed on a timer (not the animation frame loop), so a
  background-tab load can never leave it stuck.
- Dock icons, app tiles, windows, and sheets are keyboard reachable; `Esc`
  closes the top window/sheet.

## Deploy

Static hosting (GitHub Pages). `CNAME` points to `zoomi.co`; `robots.txt` and
`sitemap.xml` are served from the repo root.
