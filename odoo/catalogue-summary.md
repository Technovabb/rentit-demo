# Rent It.BB catalogue kit (Odoo demo)

Source: rentit.bb public shop data (WooCommerce Store API), fetched 28 Oct 2026. 334 products in 21 categories.
Prices are BBD per 24-hour rental, exactly as listed on rentit.bb. Every listing there shows "+17.5% VAT", so these prices are **before VAT**.
`demo_stock` quantities are **made up for the demo**. They are not Rent It's real stock counts.

## Products per category

| Seq | Category | Key | Products | Price range (BBD) | Category photo |
|---:|---|---|---:|---|---|
| 10 | Packages | packages | 12 | 250.00 – 14000.00 | images/4353.jpg (Reception Package for 200) |
| 20 | Tents | tents | 18 | 90.00 – 5000.00 | images/3616.jpg (40×40 High Peak Tent – White Top) |
| 30 | Tent Accessories (under Tents) | tent-accessories | 17 | 15.00 – 2500.00 | images/4210.jpg (Tent Pole Drape – Frame) |
| 40 | Chairs | chairs | 31 | 4.00 – 150.00 | images/4206.jpg (White Chiavari Chair) |
| 50 | Tables | tables | 31 | 15.00 – 250.00 | images/3712.jpg (6ft Farm Table – Brown) |
| 60 | Linens | linens | 50 | 15.00 – 30.00 | images/2815.jpg (120″ Round Sequins – Gold) |
| 70 | Napkins | napkins | 14 | 2.00 – 2.00 | images/3251.jpg (Napkins (Dusty Rose)) |
| 80 | Charger Plates | charger-plate | 9 | 2.50 – 7.50 | images/3720.jpg (Gold Reef Glass) |
| 90 | Crockery | crockery | 4 | 1.00 – 30.00 | images/2779.jpg (Dinner Plate) |
| 100 | Cutlery | cutlery | 7 | 1.50 – 5.75 | images/2659.jpg (Set (Gold)) |
| 110 | Glassware | glassware | 8 | 1.25 – 1.50 | images/2794.jpg (Champagne Flute) |
| 120 | Centrepieces & Vases | centerpieces-vases | 23 | 1.00 – 40.00 | images/2628.jpg (Reversible Trumpet Vase) |
| 130 | Cakes & Treats | cakes-treats | 23 | 10.00 – 60.00 | images/2565.jpg (Mini Ferris Wheel Cupcake Stand – White) |
| 140 | Bars | bars | 11 | 15.00 – 450.00 | images/4357.jpg (Bar Package B) |
| 150 | Lounge Furniture | lounge-furniture | 10 | 50.00 – 175.00 | images/3827.jpg (Two-Seater Sofa) |
| 160 | Luxe Picnic | luxe-picnic | 25 | 0.50 – 95.00 | images/2840.jpg (Straw Round Mat) |
| 170 | Arches | arches | 5 | 100.00 – 150.00 | images/2466.jpg (Round Metal Arch – Gold) |
| 180 | Props | props | 18 | 10.00 – 200.00 | images/2874.jpg (White Antique Lantern) |
| 190 | Signage | signage | 18 | 5.00 – 65.00 | images/2852.jpg (Lets Party LED Sign) |
| 200 | Lighting | lighting | 1 | 40.00 – 40.00 | images/2868.jpg (String Lights – 24ft) |
| 210 | Umbrellas | umbrella | 1 | 60.00 – 60.00 | images/3263.jpg (9ft Umbrella) |

Counts add up to more than 334 because 2 products sit in two categories: Bar Package A (packages + bars), Bar Package B (packages + bars).
"New Arrivals" is not a category here. It is the `is_new` flag instead: 14 products.

## Price on request (their price is 0)

- RI-3584 40×80 Frame Tent – Clear Top
- RI-3613 40×80 Frame Tent – White Top
- RI-3585 40×100 Frame Tent – Clear Top
- RI-3614 40×100 Frame Tent – White Top

## Cutlery sets with options

The product price is the full-set price. The single pieces are options (variants).

- RI-3223 Set (Black): Set (Black) 5.75, Dinner Knife 1.25, Dinner Fork 1.25, Dessert Fork 1.00, Dessert Spoon 1.25, Teaspoon 1.00
- RI-2659 Set (Gold): Set (Gold) 5.75, Dinner Knife 1.25, Dinner Fork 1.25, Dessert Fork 1.00, Dessert Spoon 1.25, Teaspoon 1.00
- RI-2789 Set (Pink & Gold): Set (Pink & Gold) 5.00, Dinner Knife 1.50, Dinner Fork 1.50, Dessert Fork 0.50, Teaspoon 0.50
- RI-3226 Set (Rose Gold): Set (Rose Gold) 5.75, Dinner Knife 1.25, Dinner Fork 1.25, Dessert Fork 1.00, Dessert Spoon 1.25, Teaspoon 1.00
- RI-3245 Set (Silver): Set (Silver) 5.75, Dinner Knife 1.25, Dinner Fork 1.25, Dessert Fork 1.00, Dessert Spoon 1.25, Teaspoon 1.00
- RI-2784 Set (White & Gold): Set (White & Gold) 5.00, Dinner Knife 1.50, Dinner Fork 1.50, Dessert Spoon 1.50, Teaspoon 0.50

## Descriptions

24 products have description text from rentit.bb (plain text, one line per paragraph or list item). The rest are blank on their site too.
- RI-4206 White Chiavari Chair: left blank. On rentit.bb it has the same text as 3711 White Chiavari Bar Stool.
- RI-4370 Silver Sweetheart Table: left blank. On rentit.bb it has the same text as 3722 Luxury Serpentine Table.

## Product photos

334 JPEGs in images/, 25.6 MB total (average 75 KB). These are Rent It's own photos from rentit.bb, the largest uncropped size up to about 1200 px. They are flattened onto white, fitted inside 1000×1000 and never enlarged.
16 photos are under 600 px on the long side because rentit.bb only has them that small: RI-4337 (593×594), RI-4338 (593×594), RI-4346 (593×594), RI-4347 (593×594), RI-4354 (387×516), RI-4355 (387×516), RI-4232 (386×386), RI-4222 (386×386), RI-4231 (386×386), RI-4224 (386×386), RI-4230 (386×386), RI-4226 (386×386), RI-4225 (386×386), RI-4374 (321×428), RI-4333 (474×474), RI-3468 (400×400).

## Gallery (their portfolio photos)

These are full-size originals from rentit.bb, not the square crops. They mix portrait and landscape, so use `object-fit: cover` where a fixed shape is needed.

| Photo | pf-n.jpg (fit 1600) | pf-n-sm.jpg (fit 700) |
|---|---|---|
| pf-12 | 1440×1080, 195 KB | 700×525, 63 KB |
| pf-13 | 1200×1600, 214 KB | 525×700, 58 KB |
| pf-14 | 1200×1600, 268 KB | 525×700, 64 KB |
| pf-16 | 1200×1600, 174 KB | 525×700, 49 KB |
| pf-21 | 1600×1066, 212 KB | 700×466, 54 KB |
| pf-24 | 1600×1066, 258 KB | 700×466, 62 KB |
| pf-34 | 1200×1600, 283 KB | 525×700, 61 KB |
| pf-35 | 1600×1200, 199 KB | 700×525, 50 KB |
| pf-39 | 1600×1066, 136 KB | 700×467, 35 KB |
| pf-40 | 1280×1600, 172 KB | 560×700, 48 KB |
| pf-53 | 1065×1600, 76 KB | 466×700, 23 KB |
| pf-56 | 1065×1600, 96 KB | 466×700, 28 KB |
| pf-61 | 860×1290, 210 KB | 467×700, 72 KB |
| pf-63 | 860×1290, 272 KB | 467×700, 79 KB |
| pf-73 | 768×1024, 127 KB | 525×700, 61 KB |
| pf-75 | 1024×768, 155 KB | 700×525, 71 KB |

## Brand

| File | Size | Bytes |
|---|---|---|
| brand/logo.png | 900×556 | 73 KB |
| brand/logo-white.png | 900×556 | 45 KB |
| brand/mark-512.png | 512×512 | 3 KB |

- logo.png is the full logo (mark, RENT IT.BB, tagline) in #4325EB on transparent. The white is removed with smooth edges, and the hole in the diamond is transparent.
- logo-white.png has the same shape in white, for dark backgrounds.
- mark-512.png is the diamond mark, redrawn from its measured shape (the 512 px source file was soft and had a white background).

## Kit size

| Part | Size |
|---|---|
| catalogue.json | 112 KB |
| images/ (334) | 25.6 MB |
| gallery/ (32) | 4.0 MB |
| brand/ (3 new PNGs) | 122 KB |
| **Total** | **29.9 MB** |
