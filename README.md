# Rent It.BB on Odoo: demo build kit

A demo of Rent It.BB Events Inc. (https://rentit.bb, Barbados event rentals) running on Odoo: website, online rental booking by date, rental stock and the owner's back office. Made by Tech Nova.

This repo holds only the build kit. The demo itself runs in an Odoo Online database.

| Path | What it is |
|---|---|
| `odoo/catalogue.json` | 334 items, 21 categories, prices in BBD per 24-hour rental (before 17.5% VAT), from Rent It.BB's public shop on 28 Oct 2026. `demo_stock` quantities are made up. |
| `odoo/images/` | One photo per item (Rent It.BB's own product photos, re-encoded). |
| `odoo/gallery/` | Rent It.BB's own event photos. |
| `odoo/brand/` | Logo files. |
| `odoo/pages/` | Website pages (Odoo QWeb content) and `pages.json`. |
| `odoo/theme/` | Fonts, brand styles, demo bar and the WhatsApp preview button. |
| `odoo/build/` | `rentit-build.js` (runs in a logged-in Odoo tab) and `README.md` (run order). |

Files are served from https://technovabb.com/rentit-demo/odoo/ so the Odoo tab can fetch them.

Photos, product names and prices belong to Rent It.BB Events Inc. Sample bookings and customers in the demo are made up.
