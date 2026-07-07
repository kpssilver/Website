# KPS Silver

Marketing landing page for **KPS Silver** — pure silver articles, Nagarthpet, Bengaluru · since 1996.

The original single-file `KPS SILVER.html` has been broken into small, clearly
separated modules and wired up with [Vite](https://vitejs.dev) so you can run it
locally with **instant hot-reload**. The visual design (UI/UX) is unchanged — the
markup, styles and animations are the same, just organised into sections.

---

## Getting started (local dev with hot-reload)

Requires [Node.js](https://nodejs.org) 18+ (tested on Node 22).

```bash
npm install     # install dependencies (first time only)
npm run dev     # start the dev server; opens the browser automatically
```

Vite prints a local URL (e.g. `http://localhost:5173/`). Edit any file under
`src/` and the browser updates instantly — no manual refresh.

Other commands:

```bash
npm run build     # production build into dist/
npm run preview   # preview the production build locally
```

---

## Project structure

```
.
├── index.html                 # HTML shell — mounts the app into #app
├── package.json               # scripts & dependencies
├── vite.config.js             # dev server / build config
├── legacy/
│   └── original.html          # the original single-file version (reference)
└── src/
    ├── main.js                # entry: loads styles, renders sections, inits motion
    │
    ├── config/
    │   └── site.js            # ⭐ business details: phone, WhatsApp, Maps link
    │
    ├── data/                  # editable content (no markup needed)
    │   ├── collections.js     #   category cards
    │   ├── occasions.js       #   occasions list
    │   ├── promise.js         #   "the promise" items
    │   └── content.js         #   ticker items + heritage counters
    │
    ├── sections/              # one file per visual section (returns HTML)
    │   ├── index.js           #   ⭐ page render order lives here
    │   ├── atmosphere.js      #   background layers, cursor glow, progress bar
    │   ├── nav.js             #   top navigation
    │   ├── hero.js            #   hero + gleaming brand logo
    │   ├── ticker.js          #   scrolling category marquee
    │   ├── signature.js       #   gleaming Balaji + flanking lit deepams
    │   ├── collections.js     #   "The Collections" grid
    │   ├── heritage.js        #   "Since 1996" story
    │   ├── occasions.js       #   "Occasions" list
    │   ├── promise.js         #   "The KPS Promise"
    │   ├── visit.js           #   address, hours, contact, WhatsApp CTA
    │   └── footer.js          #   footer
    │
    ├── styles/                # CSS split per section (imported in index.css)
    │   ├── index.css          #   ⭐ import order (cascade)
    │   ├── variables.css      #   colour tokens & fonts
    │   ├── base.css           #   reset / base
    │   ├── atmosphere.css · metal.css · nav.css · buttons.css
    │   ├── hero.css · ticker.css · sections.css
    │   ├── collections.css · heritage.css · occasions.css
    │   ├── promise.css · visit.css · footer.css
    │   └── responsive.css     #   media queries (kept last)
    │
    └── interactions/
        └── animations.js      # all GSAP + Lenis motion (call after render)
```

### Where to edit common things

| I want to change…                 | Edit…                                    |
| --------------------------------- | ---------------------------------------- |
| Phone / WhatsApp number / message | `src/config/site.js`                     |
| Google Maps "Get directions" link | `src/config/site.js` (`mapsDirectionsUrl`) |
| Address / opening hours           | `src/config/site.js`                     |
| Category cards                    | `src/data/collections.js`                |
| Occasions / promise / ticker copy | `src/data/*.js`                          |
| A section's layout / markup       | `src/sections/<section>.js`              |
| A section's styling               | `src/styles/<section>.css`               |
| Animations / scroll behaviour     | `src/interactions/animations.js`         |
| Order of sections on the page     | `src/sections/index.js`                  |

### Contact links (already wired)

- **Get directions** → opens the KPS Silver store route in Google Maps.
- **Message the Store** → opens WhatsApp chat to **+91 86607 84494** with a
  pre-filled message.

Both are defined once in `src/config/site.js`.

---

## Future scope — becoming an eCommerce storefront

The structure is intentionally set up so the landing page can grow into a full
store without a rewrite:

- **Data-driven content** — `src/data/collections.js` already models categories
  as data. Extend each entry with `slug`, `price`, `images`, `products[]`,
  `inStock`, etc., and the same card component can render live products.
- **Section registry** — `src/sections/index.js` controls what renders. Drop in
  a `<Products/>`, `<ProductDetail/>` or `<Cart/>` section the same way.
- **Central config** — `src/config/site.js` is ready to hold API base URLs,
  payment keys and shipping settings.
- **Routing** — add a router (e.g. `vite-plugin-pages`, or a framework like
  React/Vue/Svelte via a Vite plugin) to serve `/collections`, `/product/:slug`
  and `/cart` as real pages.
- **Backend / commerce engine** — connect a headless commerce backend (Shopify
  Storefront API, Medusa, or a Supabase/Node API) for catalog, cart and
  checkout. `vite.config.js` is where you'd add an API proxy.
- **Build output** — `npm run build` already produces an optimised static
  bundle in `dist/` ready to deploy to any host (Netlify, Vercel, Cloudflare
  Pages, etc.).
