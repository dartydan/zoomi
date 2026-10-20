# Zoomi — zoomi.co

The homepage for **Zoomi, LLC**, presented as a marketing company: brand
identity, websites, campaigns, and search, with **Zoomi Audit** (SEO software)
as the add-on product. Zoomi's other companies are listed in a small section
near the footer:

| Company | Domain | Focus |
| --- | --- | --- |
| Zoomi Audit | [audit.zoomi.co](https://audit.zoomi.co) | SEO software |
| Zoomi Government | [gov.zoomi.co](https://gov.zoomi.co) | Government contracting and vendor fulfillment |
| Margin | [margin.zoomi.co](https://margin.zoomi.co) | Bible-reading app |
| Zoomi Rentals | [rent.zoomi.co](https://rent.zoomi.co) | Delivered and serviced washer/dryer rentals |

## Tech

The homepage is a static site with no application framework:

```text
index.html   semantic page structure, metadata, and schema
os.css       responsive styles
os.js        mobile menu and footer year
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
