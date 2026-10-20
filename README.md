# Zoomi — zoomi.co

The homepage for **Zoomi, LLC**. It leads with **Zoomi Marketing**, a
design-led marketing studio (brand identity, websites, campaigns, strategy),
with Zoomi Audit positioned as the SEO software upsell. The other ventures sit
lower on the page:

| Venture | Domain | Focus |
| --- | --- | --- |
| Zoomi Audit | [audit.zoomi.co](https://audit.zoomi.co) | Digital strategy, SEO, and analytics |
| Zoomi Government | [gov.zoomi.co](https://gov.zoomi.co) | Government contracting and vendor fulfillment |
| Margin | [margin.zoomi.co](https://margin.zoomi.co) | A calm, thoughtful Bible-reading app |
| Zoomi Rentals | [rent.zoomi.co](https://rent.zoomi.co) | Delivered and serviced washer/dryer rentals |

## Experience

- Editorial, European talent-agency-inspired art direction
- Oversized typography, high-contrast color, and asymmetric layouts
- A venture "roster" with interactive identity cards for each business
- Studio manifesto, operating principles, and abstract venture artwork
- Responsive full-screen navigation and layouts designed specifically for mobile
- Lightweight entrance, ticker, scan, and pointer-parallax motion
- Reduced-motion accessibility support

## Tech

The homepage is a static site with no application framework:

```text
index.html   semantic page structure, metadata, and schema
os.css       complete responsive visual system and motion
os.js        menu, reveal, scroll-progress, and pointer interactions
```

Google Fonts supplies the typefaces, and Google Tag Manager remains connected.
The old Three.js/ZoomiOS interface has been removed from the homepage.

## Run locally

```bash
npm start -- -p 4173
```

Then open `http://127.0.0.1:4173`.

## Deploy

The site is served as static files through GitHub Pages. `CNAME` points to
`zoomi.co`; `robots.txt` and `sitemap.xml` are served from the repository root.

## SEO and GEO

- Canonical host is `https://zoomi.co/` (www.zoomi.co currently returns a 522).
- `index.html` carries the title, description, canonical, Open Graph/Twitter
  tags with `og-image.png`, and a JSON-LD graph (Organization +
  ProfessionalService, Zoomi Audit SoftwareApplication, WebSite, FAQPage).
- The visible FAQ mirrors the FAQPage schema; keep them in sync.
- `robots.txt` explicitly allows AI search crawlers; `llms.txt` gives answer
  engines a plain-text summary; `sitemap.xml` lists only canonical URLs.
