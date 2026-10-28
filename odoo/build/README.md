# Rent It.BB on Odoo: how to run the build

`rentit-build.js` builds the Rent It.BB demo inside a new Odoo Online trial. It does what we did by hand on an earlier Odoo demo, but as one script with resumable steps. It runs in your **logged-in** Odoo tab and calls Odoo's own JSON-RPC (`/web/dataset/call_kw`) with the session cookie. It uses no API keys or passwords. It only downloads files from the kit at `https://technovabb.com/rentit-demo/odoo/` and talks to the Odoo site itself.

Background notes on each call (field names, Odoo 20 changes, pitfalls) are kept privately by Tech Nova.

## Before you start (Juwan, by hand)

1. Push the kit so `https://technovabb.com/rentit-demo/odoo/catalogue.json` loads in a browser. The script cannot run without it.
2. Create the trial (for example `rentitbb.odoo.com`). Choose **Barbados** as the country so the currency is BBD. Tick **Rental**, **eCommerce** and **Inventory**. When the website configurator appears, choose **Skip** and do not let it generate AI pages.
3. Open the backend `https://<db>.odoo.com/odoo` in the same browser the tool drives, logged in as yourself.

## Load the script (each time the tab is reloaded)

Either paste the whole of `rentit-build.js` into the run-JavaScript tool (it returns `"RIB 1.0.0 ... ready"`), or run:

```js
const s = document.createElement('script');
s.src = 'https://technovabb.com/rentit-demo/odoo/build/rentit-build.js?v=' + Date.now();
document.head.appendChild(s);
await new Promise(r => s.onload = r); RIB.VERSION
```

Loading only defines `window.RIB`. Settings and the id map (`RIB.cfg`, `RIB.map`) are kept in this site's localStorage, so a reload loses nothing. To point at another copy of the kit, set `window.RIB_BASE = '.../'` before loading.

Every call below goes in its own tool call and returns a small JSON report: `{step, ok, ms, report | error}`. Keep each call under about 60 seconds. Chunked steps return `report.next` (the next offset, or `null` when finished).

## Run order

| # | Tool call | What it does | Time |
|---|---|---|---|
| 1 | `await RIB.run('introspect')` | Reads the version, modules, website, currency and field names. It picks the code paths (for example the Odoo 20 `rent_periodicity` model or the 17-19 `product.pricing` model) and lists them under `chosen`. Read `warnings`. | 10-20 s |
| 2 | `await RIB.run('installApps')`, **repeat** until `report.done` is true | Installs one missing module per call: Rental, eCommerce, Inventory, sale_stock, delivery, payment_demo, payment_custom, plus any `*renting*` bridge that exists. It never installs Click & Collect. If it says `still running`, wait a minute and call it again. | 20-90 s each |
| 3 | `await RIB.run('introspect')` | Run it again now that the apps are in. Check that `chosen.pricingModel` is not `none` and that `startField` is set. | 15 s |
| 4 | `await RIB.run('company')` | Sets the company name, address (Lower Estate, St. George), phone, email, BBD shown as `$` before the amount, the Barbados timezone and the warehouse name. | 5 s |
| 5 | `await RIB.run('tax')` | Rent It's site lists prices "+17.5% VAT". This finds or copies a 17.5% sale tax that is added on top of the price. Set `RIB.cfg.vat = false` first to skip it. | 3 s |
| 6 | `await RIB.run('settings')` | Turns on product variants, needed for the cutlery sets. | 5-15 s |
| 7 | `await RIB.run('deposit')` | Sets a 50% online prepayment on quotes, with no signature needed. | 2 s |
| 8 | `await RIB.run('website')` | Sets the site name, logo, favicon, cookie bar, 24 per page, sort order, and "price on request" for 0-price items, with the contact link set to WhatsApp. | 5 s |
| 9 | `await RIB.run('categories')` | Creates 21 shop categories with their photos. | 20-40 s |
| 10 | `await RIB.loop('products', 0, 40)`, then repeat with `from = report.next` until `done` | Creates 334 rental products, with no images yet. The 6 cutlery sets become one product each, with a "Piece" option. | about 3 calls |
| 11 | `await RIB.run('rentalPricing')` | On Odoo 20, one write sets the 24-hour periodicity, because the Sales Price is the daily rate. On 17-19, use `RIB.loop('rentalPricing', 0, 60)`. | 5 s (20) |
| 11b | `await RIB.run('packageOptions')` | Adds Rent It's paid package upgrades as options with extra prices: the chair upgrade on Ceremony 100/150/200, and the tabletop add-on and clear-top tent on Reception 50-200. Check one package on /shop afterwards. | 10 s |
| 12 | `await RIB.loop('images', 0, 10)`, repeat from `next` | Uploads the 334 product photos. It skips products that already have one; pass `RIB.loop('images', 0, 10, 50000, true)` to force. | 6-10 calls |
| 13 | `await RIB.loop('stock', 0, 120)` | Sets on-hand stock from `demo_stock`. These are **made-up sample numbers**. | 1-2 calls |
| 14 | `await RIB.run('delivery')` | Creates one published method, "Delivery, set-up & collection", at $0, and says the parish fee is confirmed in the quote. It unpublishes the other methods and lists them. | 3 s |
| 15 | `await RIB.run('payments')` | Publishes the Demo card (test, no real charge) and the wire-transfer provider renamed "Book now, pay later by bank transfer". It unpublishes Pay on Invoice. | 3 s |
| 16 | `await RIB.loop('gallery', 0, 12)` | Uploads 32 event photos and the white logo as public images for the pages. | 2-3 calls |
| 17 | `await RIB.run('theme')` | Optional. Sets the brand palette and fonts in Odoo's SCSS. The first page load afterwards is slow. Undo with `RIB.run('theme', {reset:true})`. | 5 s |
| 18 | `await RIB.run('customCode')` | Brand CSS and fonts (head). Demo bar and WhatsApp preview (footer code). Our footer goes into the footer template. | 5 s |
| 19 | `await RIB.run('pages')` | Homepage, How it works, About us and FAQs from `pages/*.xml`, with tokens replaced. To redo one page: `RIB.run('pages', 'about')`. | 10 s |
| 20 | `await RIB.run('menus')` | Main menu: Shop, How it works, About us, FAQs, Contact. It removes only the default "Home" item and duplicates, and lists anything else it kept. | 3 s |
| 21 | `await RIB.run('shopWording')` | Checkout labels ("Your booking", "Continue", "Send booking request"), hides "Buy now", and turns on "Add to cart" on shop cards (phones included). | 3 s |
| 22 | `await RIB.run('placeholders')` | Replaces Odoo's sample contact details (555 numbers, yourcompany.example.com) with Rent It's real ones. | 5 s |
| 23 | `await RIB.run('sampleOrders', 0, 4)`, then `(4, 4)`, then `(8, 4)` | Creates 11 sample customers ("Kerry-Ann B. (sample)", `@example.com`, 555 numbers) and 11 rental orders: 2 returned, 1 late, 1 out now, 3 reserved, 2 quotes sent (with portal link), 1 draft, 1 cancelled. | 20-40 s each |
| 24 | `await RIB.run('verify')` | Reports counts, published products, images, page status codes (as a logged-out visitor), the menu, a rental product's page hints, and orders by rental status. | 10-20 s |

Useful extras: `RIB.status()` (what is built so far), `RIB.help()`, `RIB.log` (console log of this session), `RIB.cfg` (choices from introspect).

## Resuming and re-running

- Every step is idempotent. Run it again and it updates what exists, creating only what is missing.
- Records the script creates are tagged so they can be found again: products `RI-<id>` (cutlery variants `RI-<id>-<PIECE>`), page views `website.rentit_<key>`, attachments `rentit_*`, sample partners `... (sample)` with ref `RI-SAMPLE`, sample orders with customer ref `RI-SAMPLE-01` to `-11`, and the delivery product `RI-DELIVERY`. The script never deletes anything else. It only edits other records: it unpublishes other delivery methods and Pay on Invoice, and moves a default page that sits on one of our URLs to `<url>-odoo-default` (unpublished).
- If the tab reloads, load the script again. `RIB.cfg` and `RIB.map` come back from localStorage. If localStorage was cleared, run `introspect`, then `categories` and `products` again. They find the existing records by code and rebuild the map without duplicating anything.
- `sampleOrders` skips any order whose `RI-SAMPLE-nn` ref already exists.
- On a fresh trial (for example after the 15-day trial ends), call `RIB.forget()` and start from step 1.

## Things to check by hand after the build

1. A product page shows a price per day and a date picker. Booking more than the stock for dates that overlap a Reserved sample order should be blocked.
2. The cart and checkout flow works up to the payment step. Do not submit a real payment. The demo card is test-only.
3. The `portalUrl` of a sent sample quote (from step 23) shows "Pay 50%".
4. The four 40×80 and 40×100 frame tents show "price on request" instead of Add to cart.
5. If `sampleOrders` reports `extraLines` on the returned orders, Odoo added delay-fee lines because those returns were recorded after their (past) return dates. Remove those lines in the order if they look odd.

Everything shown as a booking, customer or stock count is sample data for the demo. Products, prices and photos are Rent It's own, from rentit.bb.
