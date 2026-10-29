/*
 * Rent It.BB on Odoo: browser build kit (Tech Nova, 28 Oct 2026)
 *
 * Runs inside a logged-in Odoo tab (e.g. https://rentitbb.odoo.com/odoo) and talks to
 * Odoo over JSON-RPC (/web/dataset/call_kw) with the session cookie. No API keys, no passwords.
 * Loading this file only defines window.RIB. Nothing runs until you call a step:
 *
 *   await RIB.run('introspect')            // always first (and again after installing apps)
 *   await RIB.run('products', 0, 40)        // chunked steps take (offset, limit) and return {next}
 *   await RIB.loop('images', 0, 10)         // repeat a chunked step until ~50 s are used
 *
 * Every step is idempotent. Records this script creates are tagged:
 *   products default_code 'RI-<id>' (cutlery variants 'RI-<id>-<PIECE>'), page views 'website.rentit_<key>',
 *   sample partners '... (sample)' with ref 'RI-SAMPLE', sample orders client_order_ref 'RI-SAMPLE-<n>',
 *   attachments named 'rentit_<file>'. Nothing else is ever deleted.
 * Outbound calls go only to RIB.BASE (the kit on technovabb.com) and to this Odoo site.
 * See README.md in this folder for the exact run order.
 */
(() => {
  'use strict';
  const W = window;
  const prev = W.RIB || {};
  const RIB = (W.RIB = {});
  RIB.VERSION = '1.0.0 (2026-10-28)';
  RIB.BASE = prev.BASE || W.RIB_BASE || 'https://technovabb.com/rentit-demo/odoo/';

  // ------------------------------------------------------------------ storage
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: fine */ } },
  };
  RIB.cfg = Object.assign({ vat: true, scss: true }, LS.get('RIB.cfg', {}), prev.cfg || {});
  RIB.map = Object.assign(
    { cat: {}, catUrl: {}, prod: {}, pp: {}, var: {}, img: {}, pages: {}, menus: [], partners: {}, orders: {} },
    LS.get('RIB.map', {}), prev.map || {});
  const save = () => { LS.set('RIB.cfg', RIB.cfg); LS.set('RIB.map', RIB.map); };
  RIB.save = save;
  RIB.log = [];
  const log = (...a) => {
    const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
    RIB.log.push(s); console.log('[RIB]', s);
  };

  // ------------------------------------------------------------------ business facts (from rentit.bb only)
  const BIZ = {
    company: 'Rent It.BB Events Inc.', site: 'Rent It.BB', street: 'Lower Estate', city: 'St. George',
    phone: '+1 246 234 8230', email: 'contact@rentit.bb', web: 'https://rentit.bb',
    insta: 'https://www.instagram.com/rentit.bb/', wa: 'https://wa.me/12462348230',
  };
  RIB.text = Object.assign({
    priceOnRequest: 'Price on request: ask us on WhatsApp at 234-8230 and we will send you a price.',
    cutleryNote: 'Rent the full set, or single pieces.',
    carrierName: 'Delivery and collection',
    carrierDesc: 'We deliver and collect. The delivery fee for your parish is confirmed in your quote.',
    demoCard: 'Pay by card (demo, no real charge)',
    wireName: 'Book now, pay later by bank transfer',
    wirePending: '<p>Thank you. We will check your dates and send your quote. A 50% deposit secures your booking. The rest is due 5 days before your event.</p>',
    sampleNote: 'Sample booking for the demo',
    eventStep: 'Event details',
    eventTitle: 'About your event',
    eventIntro: 'Your answers help us plan the delivery and collection.',
  }, prev.text || {});

  // ------------------------------------------------------------------ helpers
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const textToHtml = (s) => String(s || '').split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('');
  const slugify = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^\w\s-]/g, '').trim().replace(/[-\s_]+/g, '-').replace(/^-+|-+$/g, '');
  const round2 = (n) => Math.round(n * 100) / 100;
  const idOf = (v) => (Array.isArray(v) ? v[0] : v) || false;
  const short = (e) => String((e && e.message) || e).slice(0, 300);
  Object.assign(RIB, { sleep, chunk, esc, slugify });

  let rpcSeq = 0;
  async function post(url, params) {
    const r = await fetch(url, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: ++rpcSeq, params }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
    const j = await r.json();
    if (j.error) {
      const d = j.error.data || {};
      const name = d.name ? d.name.split('.').pop() + ': ' : '';
      throw new Error((name + (d.message || j.error.message || JSON.stringify(j.error))).slice(0, 800));
    }
    return j.result;
  }
  async function rpc(model, method, args = [], kwargs = {}) {
    return post('/web/dataset/call_kw', { model, method, args, kwargs });
  }
  const kitUrl = (path) => RIB.BASE.replace(/\/?$/, '/') + String(path).replace(/^\/+/, '');
  async function kitFetch(path) {
    const r = await fetch(kitUrl(path) + (path.includes('?') ? '&' : '?') + 'v=' + Date.now(), { credentials: 'omit', cache: 'no-store' });
    if (!r.ok) throw new Error(`Kit file ${path}: HTTP ${r.status}`);
    return r;
  }
  const fetchJSON = async (path) => (await kitFetch(path)).json();
  const fetchText = async (path) => (await kitFetch(path)).text();
  async function fetchB64(path) {
    const blob = await (await kitFetch(path)).blob();
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1]);
      fr.onerror = () => rej(new Error('FileReader failed for ' + path));
      fr.readAsDataURL(blob);
    });
  }
  Object.assign(RIB, { rpc, post, fetchJSON, fetchText, fetchB64 });

  async function catalogue() {
    if (!RIB._catalogue) RIB._catalogue = await fetchJSON('catalogue.json');
    return RIB._catalogue;
  }
  async function pagesJson() {
    if (!RIB._pages) RIB._pages = await fetchJSON('pages/pages.json');
    return RIB._pages;
  }

  // field helpers driven by introspect()
  const F = (model) => (RIB.cfg.f && RIB.cfg.f[model]) || null;
  const has = (model, field) => !!(F(model) && F(model).includes(field));
  function pick(model, vals, skipped) {
    const out = {};
    for (const [k, v] of Object.entries(vals)) {
      if (has(model, k)) out[k] = v; else if (skipped) skipped.push(model + '.' + k);
    }
    return out;
  }
  function need() {
    if (!RIB.cfg.websiteId || !RIB.cfg.f) throw new Error('Run RIB.run("introspect") first.');
  }
  const wid = () => RIB.cfg.websiteId;
  const wctx = (extra) => Object.assign({ website_id: wid() }, extra || {});
  const QUIET = { tracking_disable: true, mail_create_nolog: true, mail_notrack: true, mail_auto_subscribe_no_notify: true };

  // write all values; if the combined write fails, retry field by field and report the failures
  async function writeSafe(model, ids, vals, ctx) {
    const kw = ctx ? { context: ctx } : {};
    try { await rpc(model, 'write', [ids, vals], kw); return []; } catch (e) {
      const errs = [];
      for (const [k, v] of Object.entries(vals)) {
        try { await rpc(model, 'write', [ids, { [k]: v }], kw); } catch (e2) { errs.push(`${k}: ${short(e2)}`); }
      }
      return errs;
    }
  }

  // Replace the children of the element with id=<id> inside a QWeb arch. Returns the new arch or null.
  function replaceById(arch, id, innerXml) {
    const doc = new DOMParser().parseFromString(arch, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Could not parse the existing view arch');
    const el = [...doc.getElementsByTagName('*')].find((e) => e.getAttribute('id') === id);
    if (!el) return null;
    const frag = new DOMParser().parseFromString('<rib-wrap>' + innerXml + '</rib-wrap>', 'text/xml');
    const perr = frag.getElementsByTagName('parsererror')[0];
    if (perr) throw new Error('Kit XML is not well-formed: ' + perr.textContent.slice(0, 240));
    while (el.firstChild) el.removeChild(el.firstChild);
    for (const n of [...frag.documentElement.childNodes]) el.appendChild(doc.importNode(n, true));
    return new XMLSerializer().serializeToString(doc);
  }
  function checkXml(innerXml, label) {
    const frag = new DOMParser().parseFromString('<rib-wrap>' + innerXml + '</rib-wrap>', 'text/xml');
    const perr = frag.getElementsByTagName('parsererror')[0];
    if (perr) throw new Error(`${label} is not well-formed XML: ` + perr.textContent.slice(0, 240));
  }

  // Barbados is UTC-4 all year. Local day offset from today + local hour -> 'YYYY-MM-DD HH:MM:SS' UTC
  function bbUtc(dayOffset, hourLocal) {
    const nowLocal = new Date(Date.now() - 4 * 3600e3);
    const d = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate() + dayOffset, hourLocal + 4, 0, 0));
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  // ------------------------------------------------------------------ introspect
  const WANT_MODS = ['sale_renting', 'website_sale', 'stock', 'sale_stock', 'website_sale_stock', 'delivery',
    'payment_demo', 'payment_custom', 'sale_stock_renting', 'website_sale_renting', 'website_sale_stock_renting'];
  const NEVER_INSTALL = ['website_sale_collect'];
  const INTROSPECT_MODELS = ['product.template', 'product.product', 'product.public.category', 'product.ribbon',
    'product.attribute', 'sale.order', 'sale.order.line', 'res.company', 'res.config.settings', 'website',
    'website.page', 'website.menu', 'website.checkout.step', 'payment.provider', 'payment.method',
    'delivery.carrier', 'ir.attachment', 'product.pricing', 'sale.temporal.recurrence',
    'product.pricelist.item', 'account.tax', 'res.partner', 'stock.quant'];

  RIB.introspect = async () => {
    const cfg = RIB.cfg;
    const vi = await post('/web/webclient/version_info', {});
    const svi = vi.server_version_info || [];
    let major = parseInt(String(svi[0]).replace(/^saas~/, ''), 10);
    if (isNaN(major)) major = parseInt(vi.server_version, 10);
    cfg.version = vi.server_version; cfg.major = major;

    const si = await post('/web/session/get_session_info', {}).catch(() => null);
    cfg.uid = (si && si.uid) || cfg.uid;
    if (!cfg.uid) throw new Error('Could not read the session user. Are you logged in on this tab?');
    cfg.companyId = idOf(si && si.user_companies && si.user_companies.current_company) ||
      idOf((await rpc('res.users', 'read', [[cfg.uid]], { fields: ['company_id'] }))[0].company_id);

    const mods = await rpc('ir.module.module', 'search_read',
      [['|', ['name', 'in', WANT_MODS.concat(NEVER_INSTALL)], ['name', 'ilike', 'renting']]], { fields: ['name', 'state'] });
    cfg.mods = Object.fromEntries(mods.map((m) => [m.name, m.state]));

    const sites = await rpc('website', 'search_read', [[]], { fields: ['name', 'domain', 'company_id'] });
    const host = location.host;
    const site = sites.find((s) => s.domain && s.domain.includes(host)) ||
      sites.find((s) => idOf(s.company_id) === cfg.companyId) || sites[0];
    if (!site) throw new Error('No website record. Install eCommerce first: RIB.run("installApps").');
    cfg.websiteId = site.id;

    const co = (await rpc('res.company', 'read', [[cfg.companyId]], { fields: ['name', 'currency_id', 'country_id', 'partner_id'] }))[0];
    cfg.currency = co.currency_id && co.currency_id[1];
    cfg.currencyId = idOf(co.currency_id);
    cfg.companyPartnerId = idOf(co.partner_id);

    cfg.f = {}; const sel = {}; const ro = {};
    for (const m of INTROSPECT_MODELS) {
      try {
        const fg = await rpc(m, 'fields_get', [], { attributes: ['type', 'selection', 'readonly'] });
        cfg.f[m] = Object.keys(fg);
        for (const k of ['rent_periodicity', 'rental_status', 'type', 'display_type', 'shop_default_sort', 'prevent_sale_for', 'position', 'style', 'assign', 'custom_mode', 'price_include_override']) {
          if (fg[k] && fg[k].selection) sel[m + '.' + k] = fg[k].selection.map((s) => s[0]);
        }
        for (const k of ['is_rental', 'is_rental_order', 'rental_start_date', 'rental_return_date', 'start_date', 'return_date']) {
          if (fg[k]) ro[m + '.' + k] = !!fg[k].readonly;
        }
      } catch (e) { cfg.f[m] = null; }
    }
    cfg.sel = sel; cfg.ro = ro;

    // decisions
    const T = 'product.template', SO = 'sale.order';
    cfg.productType = has(T, 'is_storable') ? 'consu+is_storable'
      : ((sel[T + '.type'] || []).includes('product') ? 'product' : 'consu');
    cfg.rentOk = has(T, 'rent_ok');
    cfg.pricingModel = has(T, 'rent_periodicity') ? 'periodicity'
      : (F('product.pricing') && F('sale.temporal.recurrence') ? 'pricing' : 'none');
    const per = sel[T + '.rent_periodicity'] || [];
    cfg.dayKey = per.find((v) => /^day/.test(v)) || per.find((v) => /day/.test(v)) || null;
    cfg.startField = ['rental_start_date', 'start_date'].find((k) => has(SO, k)) || null;
    cfg.returnField = ['rental_return_date', 'return_date', 'end_date'].find((k) => has(SO, k)) || null;
    cfg.descField = ['description_ecommerce', 'website_description', 'description_sale'].find((k) => has(T, k)) || null;
    cfg.descHtml = cfg.descField !== 'description_sale';
    cfg.catImg = ['image_1920', 'cover_image'].filter((k) => has('product.public.category', k));
    cfg.payMode = has('payment.provider', 'state') ? 'state' : 'published';
    cfg.prepay = has('res.company', 'prepayment_percent') ? 'company'
      : (has('res.config.settings', 'prepayment_percent') ? 'settings' : 'none');
    cfg.requirePayment = has(SO, 'require_payment');
    cfg.socialField = has('website', 'social_instagram');
    cfg.attachDatas = has('ir.attachment', 'datas');
    cfg.addDataRoute = major >= 18 ? '/html_editor/attachment/add_data' : '/web_editor/attachment/add_data';
    cfg.carrierPub = has('delivery.carrier', 'is_published') ? 'is_published' : 'website_published';
    cfg.ribbonName = has('product.ribbon', 'name') ? 'name' : 'html';

    cfg.soButtons = [];
    if (cfg.mods.sale_renting === 'installed') {
      const btnNames = (arch) => [...String(arch || '').matchAll(/<button\b[^>]*>/g)].map((m) => m[0])
        .filter((b) => /type=["']object["']/.test(b)).map((b) => (b.match(/name=["']([a-z_0-9]+)["']/) || [])[1]).filter(Boolean);
      let names = [];
      try {
        const fv = await rpc(SO, 'get_views', [[[false, 'form']]], { options: {}, context: { in_rental_app: true } });
        names = btnNames(fv.views && fv.views.form && fv.views.form.arch);
      } catch (e) { names.push('(get_views failed: ' + short(e) + ')'); }
      // The pickup/return buttons usually live in the Rental app's own primary form view, which the default
      // get_views(false) does not return. Scan every sale.order form view that mentions pickup/return as well.
      try {
        const rv = await rpc('ir.ui.view', 'search_read', [[['model', '=', SO], ['type', '=', 'form'],
          '|', ['arch_db', 'ilike', 'pickup'], ['arch_db', 'ilike', 'action_open_return']]], { fields: ['arch_db'], context: { active_test: false } });
        for (const v of rv) names.push(...btnNames(v.arch_db));
      } catch (e) { names.push('(view scan failed: ' + short(e) + ')'); }
      cfg.soButtons = [...new Set(names)].filter((n) => n.startsWith('(') || /pick|return|rental|confirm|sent|cancel/.test(n));
    }
    save();

    const warn = [];
    if (![17, 18, 19, 20].includes(major)) warn.push(`Untested Odoo version ${vi.server_version}.`);
    if (cfg.currency !== 'BBD') warn.push(`Company currency is ${cfg.currency}, not BBD. company() will try to switch it.`);
    if (cfg.mods.sale_renting !== 'installed') warn.push('Rental (sale_renting) is not installed yet: run installApps.');
    if (cfg.mods.website_sale_collect === 'installed') warn.push('Click & Collect is installed. Odoo disables it for rentals; consider uninstalling it by hand.');
    if (cfg.pricingModel === 'periodicity' && !cfg.dayKey) warn.push('rent_periodicity has no day value: ' + per.join(','));
    if (cfg.mods.sale_renting === 'installed' && !cfg.startField) warn.push('No rental start field found on sale.order.');
    const missing = INTROSPECT_MODELS.filter((m) => !cfg.f[m]);
    log('introspect', { version: cfg.version, pricing: cfg.pricingModel, type: cfg.productType });
    return {
      version: cfg.version, major, websiteId: cfg.websiteId, website: site.name, companyId: cfg.companyId, currency: cfg.currency,
      mods: cfg.mods,
      chosen: {
        productType: cfg.productType, rentOk: cfg.rentOk, pricingModel: cfg.pricingModel, dayKey: cfg.dayKey,
        startField: cfg.startField, returnField: cfg.returnField, descField: cfg.descField, catImg: cfg.catImg,
        payMode: cfg.payMode, prepay: cfg.prepay, requirePayment: cfg.requirePayment, socialField: cfg.socialField,
        attachDatas: cfg.attachDatas, addDataRoute: cfg.addDataRoute, rentalStatus: sel['sale.order.rental_status'] || null,
        soButtons: cfg.soButtons, isRentalLineReadonly: ro['sale.order.line.is_rental'],
      },
      missingModels: missing, warnings: warn,
    };
  };

  // ------------------------------------------------------------------ installApps (one module per call)
  RIB.installApps = async (name) => {
    if (RIB._installing) {
      const res = await Promise.race([RIB._installing.p, sleep(40000).then(() => 'still running')]);
      if (res === 'still running') return { module: RIB._installing.name, result: res, next: 'Call installApps again in a minute.' };
      const done = RIB._installing.name; RIB._installing = null;
      return { module: done, result: res, next: 'Call installApps again for the next module.' };
    }
    const mods = await rpc('ir.module.module', 'search_read',
      [['|', ['name', 'in', WANT_MODS], ['name', 'ilike', 'renting']]], { fields: ['name', 'state'] });
    const by = Object.fromEntries(mods.map((m) => [m.name, m.state]));
    // Extra '*renting*' modules count as bridges only when every module they depend on is already installed.
    // Otherwise (e.g. a renting+Sign or renting+CRM link) installing them would pull a whole extra paid app into the trial.
    const extras = mods.filter((m) => !WANT_MODS.includes(m.name) && m.state === 'uninstalled' && !NEVER_INSTALL.includes(m.name));
    const notBridge = new Set();
    if (extras.length) {
      try {
        const deps = await rpc('ir.module.module.dependency', 'search_read', [[['module_id', 'in', extras.map((m) => m.id)]]], { fields: ['module_id', 'name'] });
        const depNames = [...new Set(deps.map((d) => d.name))];
        const depState = Object.fromEntries((depNames.length ? await rpc('ir.module.module', 'search_read', [[['name', 'in', depNames]]], { fields: ['name', 'state'] }) : [])
          .map((m) => [m.name, m.state]));
        for (const d of deps) if (depState[d.name] !== 'installed') notBridge.add(idOf(d.module_id));
      } catch (e) { for (const m of extras) notBridge.add(m.id); }
    }
    const skippedExtras = extras.filter((m) => notBridge.has(m.id)).map((m) => m.name);
    const order = WANT_MODS.concat(mods.map((m) => m.name).filter((n) => !WANT_MODS.includes(n)))
      .filter((n) => n in by && !NEVER_INSTALL.includes(n))
      .filter((n) => WANT_MODS.includes(n) || !skippedExtras.includes(n));
    let target = name ? mods.find((m) => m.name === name)
      : order.map((n) => mods.find((m) => m.name === n)).find((m) => m.state === 'uninstalled');
    if (name && !target) {
      target = (await rpc('ir.module.module', 'search_read', [[['name', '=', name]]], { fields: ['name', 'state'] }))[0];
      if (!target) throw new Error('No module named ' + name + ' on this database.');
    }
    const notFound = WANT_MODS.filter((n) => !(n in by));
    if (!target) return { done: true, states: by, notOnThisVersion: notFound, skippedExtras, next: 'Run RIB.run("introspect") again.' };
    if (NEVER_INSTALL.includes(target.name)) throw new Error(target.name + ' must not be installed for rentals.');
    log('installing', target.name);
    const p = rpc('ir.module.module', 'button_immediate_install', [[target.id]]).then(() => 'installed', (e) => 'error: ' + short(e));
    RIB._installing = { name: target.name, p };
    const res = await Promise.race([p, sleep(45000).then(() => 'still running')]);
    if (res === 'still running') return { module: target.name, result: res, next: 'Wait a minute, then call installApps again (it re-attaches).' };
    RIB._installing = null;
    let state = null;
    try { state = (await rpc('ir.module.module', 'read', [[target.id]], { fields: ['state'] }))[0].state; } catch (e) { state = 'unknown (' + short(e) + ')'; }
    const remaining = order.filter((n) => by[n] === 'uninstalled' && n !== target.name);
    return { module: target.name, result: res, state, remaining, notOnThisVersion: notFound, skippedExtras,
      next: remaining.length ? 'Call installApps again.' : 'Run RIB.run("introspect") again.' };
  };

  // ------------------------------------------------------------------ company, currency, tax, settings
  RIB.company = async () => {
    need();
    const cfg = RIB.cfg, out = { notes: [] };
    const bb = (await rpc('res.country', 'search_read', [[['code', '=', 'BB']]], { fields: ['id'] }))[0];
    if (!bb) throw new Error('Country BB not found');
    cfg.countryBB = bb.id;
    // Odoo 20 ships no Barbados states: add the 11 parishes (ISO 3166-2:BB codes) so checkout gets a parish drop-down.
    const PARISHES = [['01', 'Christ Church'], ['02', 'Saint Andrew'], ['03', 'Saint George'], ['04', 'Saint James'], ['05', 'Saint John'], ['06', 'Saint Joseph'],
      ['07', 'Saint Lucy'], ['08', 'Saint Michael'], ['09', 'Saint Peter'], ['10', 'Saint Philip'], ['11', 'Saint Thomas']];
    const have = await rpc('res.country.state', 'search_read', [[['country_id', '=', bb.id]]], { fields: ['id', 'code', 'name'] });
    let added = 0;
    for (const [code, name] of PARISHES) {
      if (have.some((s) => s.code === code || s.name === name)) continue;
      try { await rpc('res.country.state', 'create', [{ country_id: bb.id, code, name }]); added++; } catch (e) { out.notes.push('parish ' + name + ': ' + short(e)); }
    }
    out.parishesAdded = added;
    const st = (await rpc('res.country.state', 'search_read', [[['country_id', '=', bb.id], ['name', 'ilike', 'George']]], { fields: ['id', 'name'] }))[0];
    out.partnerErrors = await writeSafe('res.partner', [cfg.companyPartnerId], {
      name: BIZ.company, street: BIZ.street, city: BIZ.city, state_id: st ? st.id : false, country_id: bb.id,
      phone: BIZ.phone, email: BIZ.email, website: BIZ.web,
    });
    await rpc('res.company', 'write', [[cfg.companyId], { name: BIZ.company }]);
    // currency
    if (cfg.currency !== 'BBD') {
      const bbd = (await rpc('res.currency', 'search_read', [[['name', '=', 'BBD']]], { fields: ['id'], context: { active_test: false } }))[0];
      if (!bbd) throw new Error('BBD currency not found');
      await rpc('res.currency', 'write', [[bbd.id], { active: true }]);
      try {
        await rpc('res.company', 'write', [[cfg.companyId], { currency_id: bbd.id }]);
        cfg.currency = 'BBD'; cfg.currencyId = bbd.id; out.notes.push('Company currency switched to BBD.');
      } catch (e) { throw new Error('Company currency is not BBD and Odoo refused the change: ' + short(e) + ' Create the trial with Barbados as the country.'); }
    }
    await rpc('res.currency', 'write', [[cfg.currencyId], { symbol: '$', position: 'before' }]);
    await rpc('res.users', 'write', [[cfg.uid], { tz: 'America/Barbados' }]).catch((e) => out.notes.push('tz: ' + short(e)));
    // warehouse
    try {
      const wh = (await rpc('stock.warehouse', 'search_read', [[['company_id', '=', cfg.companyId]]], { fields: ['id', 'lot_stock_id'], limit: 1 }))[0];
      if (wh) {
        await rpc('stock.warehouse', 'write', [[wh.id], { name: 'Rent It.BB, Lower Estate', partner_id: cfg.companyPartnerId }]);
        cfg.warehouseId = wh.id; cfg.stockLoc = idOf(wh.lot_stock_id);
      } else out.notes.push('No warehouse yet (Inventory not installed?)');
    } catch (e) { out.notes.push('warehouse: ' + short(e)); }
    out.currency = cfg.currency; out.state = st ? st.name : 'not found (left empty)';
    return out;
  };

  // Rent It's site lists every price as "+17.5% VAT" (prices exclude VAT). Set RIB.cfg.vat=false to skip.
  RIB.tax = async () => {
    need();
    const cfg = RIB.cfg;
    if (!cfg.vat) { cfg.taxId = null; return { skipped: 'RIB.cfg.vat is false: products get no tax.' }; }
    if (!F('account.tax')) return { skipped: 'account.tax not available' };
    const incField = has('account.tax', 'price_include_override') ? 'price_include_override' : 'price_include';
    const rows = await rpc('account.tax', 'search_read', [[['type_tax_use', '=', 'sale'], ['amount_type', '=', 'percent'],
      ['amount', '=', 17.5], ['company_id', '=', cfg.companyId]]], { fields: ['id', 'name', 'price_include'] });
    let t = rows.find((r) => !r.price_include), created = false;
    if (!t) {
      const co = (await rpc('res.company', 'read', [[cfg.companyId]], { fields: ['account_sale_tax_id'] }).catch(() => [{}]))[0] || {};
      let base = idOf(co.account_sale_tax_id);
      if (!base) base = (await rpc('account.tax', 'search', [[['type_tax_use', '=', 'sale'], ['amount_type', '=', 'percent'], ['company_id', '=', cfg.companyId]]], { limit: 1 }))[0];
      if (!base) { cfg.taxId = null; return { taxId: null, note: 'No sale tax to copy. Products left without tax.' }; }
      const def = { name: 'VAT 17.5% (RI)', amount: 17.5 };
      if (incField === 'price_include_override') def.price_include_override = 'tax_excluded'; else def.price_include = false;
      const r = await rpc('account.tax', 'copy', [[base]], { default: def });
      t = { id: idOf(r), name: def.name }; created = true;
    }
    cfg.taxId = t.id;
    // The copy keeps the 15% tax's group, and carts and quotes print the group's name ("Tax 15%").
    let group = idOf((await rpc('account.tax', 'read', [[t.id]], { fields: ['tax_group_id'] }))[0].tax_group_id);
    const TG = 'account.tax.group', groupName = 'VAT 17.5%';
    const named = (await rpc(TG, 'search_read', [[['name', '=', groupName], ['company_id', '=', cfg.companyId]]], { fields: ['id'] }))[0];
    if (!named || named.id !== group) {
      group = named ? named.id : idOf(await rpc(TG, 'copy', [[group]], { default: { name: groupName } }));
      await rpc('account.tax', 'write', [[t.id], { tax_group_id: group }]);
    }
    const fiscal = await fixFiscalPositions(t.id);
    return { taxId: t.id, name: t.name, created, taxLabel: groupName, fiscal, note: 'Prices are shown before VAT, as on rentit.bb ("+17.5% VAT").' };
  };

  // Odoo has no Barbados chart, so the trial gets the generic one, set up as if the company were in the United States:
  // "Domestic" is for US addresses, and every other address gets "Foreign Trade", which swaps VAT for 0% Exports.
  // Rent It charges 17.5% VAT on every booking (its events are all in Barbados), so Domestic becomes Barbados
  // and positions that would drop the VAT are no longer picked automatically.
  async function fixFiscalPositions(taxId) {
    const FP = 'account.fiscal.position', out = { changed: [], ordersFixed: [] };
    const bb = idOf((await rpc('res.country', 'search_read', [[['code', '=', 'BB']]], { fields: ['id'] }))[0].id);
    const fps = await rpc(FP, 'search_read', [[['company_id', '=', RIB.cfg.companyId]]],
      { fields: ['id', 'name', 'auto_apply', 'country_id', 'country_group_id', 'tax_map'] });
    const home = fps.find((f) => f.name === 'Domestic');
    if (home && idOf(home.country_id) !== bb) {
      await rpc(FP, 'write', [[home.id], { country_id: bb }]);
      out.changed.push(home.name + ': now Barbados');
    }
    const dropsVat = fps.filter((f) => f.auto_apply && !f.country_id && !f.country_group_id && f.tax_map && String(taxId) in f.tax_map);
    for (const f of dropsVat) {
      await rpc(FP, 'write', [[f.id], { auto_apply: false }]);
      out.changed.push(f.name + ': no longer automatic');
    }
    // Sample bookings made before this fix keep the old position: move them over and put the products' taxes back.
    const oldIds = dropsVat.map((f) => f.id);
    if (!oldIds.length) return out;
    const orders = await rpc('sale.order', 'search_read', [[['partner_id.name', '=like', '%(sample)'], ['state', '!=', 'cancel'],
      ['fiscal_position_id', 'in', oldIds]]], { fields: ['id', 'name'] });
    for (const o of orders) {
      try {
        await rpc('sale.order', 'write', [[o.id], { fiscal_position_id: home ? home.id : false }], { context: QUIET });
        const lines = await rpc('sale.order.line', 'search_read', [[['order_id', '=', o.id], ['display_type', '=', false], ['product_id', '!=', false]]],
          { fields: ['id', 'product_id'] });
        const prods = await rpc('product.product', 'read', [[...new Set(lines.map((l) => idOf(l.product_id)))]], { fields: ['taxes_id'] });
        const taxesOf = Object.fromEntries(prods.map((p) => [p.id, p.taxes_id]));
        for (const l of lines) await rpc('sale.order.line', 'write', [[l.id], { tax_ids: [[6, 0, taxesOf[idOf(l.product_id)]]] }], { context: QUIET });
        out.ordersFixed.push(o.name);
      } catch (e) { out.ordersFixed.push(o.name + ' skipped: ' + short(e)); }
    }
    return out;
  }

  RIB.settings = async () => {
    need();
    const out = {};
    if (has('res.config.settings', 'group_product_variant')) {
      try {
        const id = await rpc('res.config.settings', 'create', [{ group_product_variant: true }]);
        await rpc('res.config.settings', 'execute', [[idOf(id)]]);
        out.variants = 'on';
      } catch (e) { out.variants = 'error: ' + short(e); }
    } else out.variants = 'field missing';
    out.rentalTransfers = 'left as is (keep off)';
    return out;
  };

  RIB.deposit = async () => {
    need();
    const cfg = RIB.cfg;
    if (cfg.prepay === 'company') {
      const vals = pick('res.company', { portal_confirmation_pay: true, prepayment_percent: 0.5, portal_confirmation_sign: false });
      const errs = await writeSafe('res.company', [cfg.companyId], vals);
      return { mode: 'res.company', vals, errors: errs };
    }
    if (cfg.prepay === 'settings') {
      const vals = pick('res.config.settings', { portal_confirmation_pay: true, prepayment_percent: 0.5 });
      const id = await rpc('res.config.settings', 'create', [vals]);
      await rpc('res.config.settings', 'execute', [[idOf(id)]]);
      return { mode: 'res.config.settings', vals };
    }
    return { mode: 'none', note: 'No prepayment field on this version.' };
  };

  // ------------------------------------------------------------------ website record, theme, wording
  RIB.website = async () => {
    need();
    const cfg = RIB.cfg, skipped = [];
    const logo = await fetchB64('brand/logo-header.png'); // side-by-side lockup of their own logo pieces, readable at header size
    const fav = await fetchB64('brand/mark-512.png');
    const sorts = cfg.sel['website.shop_default_sort'] || [];
    const vals = pick('website', {
      name: BIZ.site, logo, favicon: fav, cookies_bar: true, configurator_done: true,
      shop_ppg: 24, shop_ppr: 4, account_on_checkout: 'optional', ecommerce_access: 'everyone',
      contact_us_link_url: BIZ.wa, prevent_sale: true, prevent_sale_for: 'zero_price',
      social_instagram: BIZ.insta, tz: 'America/Barbados',
    }, skipped);
    if (sorts.includes('website_sequence asc')) vals.shop_default_sort = 'website_sequence asc';
    if (vals.prevent_sale_for && !(cfg.sel['website.prevent_sale_for'] || ['zero_price']).includes('zero_price')) delete vals.prevent_sale_for;
    const errors = await writeSafe('website', [wid()], vals, wctx());
    return { written: Object.keys(vals), skipped, errors };
  };

  // website.assets in 18+; web_editor.assets (inherited by website) in 17
  const assetsModel = () => (RIB.cfg.major && RIB.cfg.major < 18 ? 'web_editor.assets' : 'website.assets');
  RIB.theme = async (opts = {}) => {
    need();
    const colors = '/website/static/src/scss/options/colors/user_color_palette.scss';
    const values = '/website/static/src/scss/options/user_values.scss';
    if (opts.reset) {
      const out = {};
      for (const u of [colors, values]) {
        try { await rpc(assetsModel(), 'reset_asset', [u, 'web.assets_frontend'], { context: wctx() }); out[u] = 'reset'; } catch (e) { out[u] = short(e); }
      }
      return out;
    }
    if (!RIB.cfg.scss) return { skipped: 'RIB.cfg.scss is false; brand CSS comes from custom_code_head only.' };
    const out = {};
    try {
      await rpc(assetsModel(), 'make_scss_customization', [colors,
        { 'o-color-1': '#0E7C86', 'o-color-2': '#0F2A44', 'o-color-3': '#F4F7FA', 'o-color-4': '#FFFFFF', 'o-color-5': '#0F2A44' }], { context: wctx() });
      out.palette = 'ok';
    } catch (e) { out.palette = 'skipped: ' + short(e); }
    try {
      await rpc(assetsModel(), 'make_scss_customization', [values,
        { font: "'Inter'", 'headings-font': "'Inter'", 'navbar-font': "'Inter'", 'buttons-font': "'Inter'",
          'google-fonts': "('Inter')", 'btn-border-radius': '10px' }], { context: wctx() });
      out.fonts = 'ok';
    } catch (e) { out.fonts = 'skipped: ' + short(e); }
    out.note = 'First page load after this recompiles CSS (10-20 s). Undo with RIB.run("theme", {reset:true}).';
    return out;
  };

  RIB.shopWording = async () => {
    need();
    const out = { steps: [], buyNow: null };
    if (F('website.checkout.step')) {
      const rows = await rpc('website.checkout.step', 'search_read', [[['website_id', '=', wid()]]], { fields: ['id', 'step_href', 'name'] });
      const plan = {
        '/shop/cart': { name: 'Your booking', main_button_label: 'Continue' },
        '/shop/checkout': { main_button_label: 'Continue' },
        '/shop/payment': { name: 'Confirm', main_button_label: 'Send booking request' },
      };
      for (const r of rows) {
        const v = plan[r.step_href]; if (!v) continue;
        const errs = await writeSafe('website.checkout.step', [r.id], pick('website.checkout.step', v), wctx());
        out.steps.push(r.step_href + (errs.length ? ' errors: ' + errs.join('; ') : ' ok'));
      }
    } else out.steps.push('website.checkout.step not on this version; wording left as is');
    try {
      await post('/website/theme_customize_data', { is_view_data: true, enable: [], disable: ['website_sale.product_buy_now', 'website_sale.product_buy_now_large'] });
      out.buyNow = 'hidden';
    } catch (e) { out.buyNow = 'skipped: ' + short(e); }
    // Show "Add to cart" on shop cards (phones included); separate call so an unknown key can't undo the buy-now change.
    try {
      await post('/website/theme_customize_data', { is_view_data: true, enable: ['website_sale.products_add_to_cart'], disable: [] });
      out.cardAddToCart = 'on';
    } catch (e) { out.cardAddToCart = 'skipped (turn on "Add to Cart" in the shop page options by hand): ' + short(e); }
    return out;
  };

  // Shop look: category pills on top, the rental date picker on /shop, product-page facts, day-first dates.
  const PRODUCT_FACTS = '<ul class="ri-pfacts">'
    + '<li><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><span><b>Priced per 24 hours</b>From delivery to pick-up, before 17.5% VAT</span></li>'
    + '<li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 6h11v10h-11zM13.5 9h4l3 3.2V16h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg><span><b>Delivered across Barbados</b>Delivery fee added to your quote</span></li>'
    + '<li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg><span><b>50% holds your date</b>Paid once you approve your quote</span></li>'
    + '</ul>';
  const viewState = async (key) => {
    const v = await rpc('ir.ui.view', 'search_read', [[['key', '=', key], ['website_id', 'in', [wid(), false]]]],
      { fields: ['active', 'website_id'], context: { active_test: false } });
    if (!v.length) return 'key not found';
    const r = v.find((x) => x.website_id) || v[0];
    return r.active ? 'on' : 'off';
  };
  RIB.shopLayout = async () => {
    need();
    const out = { options: [], hiddenFilters: [], dateFormat: null, productFacts: null };
    for (const key of ['website_sale.filmstrip_categories_pills', 'website_sale_renting.shop_rental_datepicker_opt']) {
      try { await post('/website/theme_customize_data', { is_view_data: true, enable: [key], disable: [] }); out.options.push(key + ' ' + await viewState(key)); }
      catch (e) { out.options.push(key + ' skipped: ' + short(e)); }
    }
    // The "Specifications" table only repeats the upgrade choices shown above it.
    try { await post('/website/theme_customize_data', { is_view_data: true, enable: [], disable: ['website_sale.product_attributes_body'] }); out.options.push('specifications table ' + await viewState('website_sale.product_attributes_body')); }
    catch (e) { out.options.push('specifications table skipped: ' + short(e)); }
    // Events happen at weekends. The trial's rental calendar is Mon-Fri, which pushes default bookings past the weekend.
    if (has('res.company', 'rental_resource_calendar_id')) {
      try {
        const RC = 'resource.calendar', name = 'Rent It: 7 days, 7am to 7pm';
        let calId = ((await rpc(RC, 'search_read', [[['name', '=', name]]], { fields: ['id'] }))[0] || {}).id;
        if (!calId) {
          const att = [];
          for (let d = 0; d < 7; d++) {
            att.push([0, 0, { dayofweek: String(d), hour_from: 7, hour_to: 12, day_period: 'morning' }]);
            att.push([0, 0, { dayofweek: String(d), hour_from: 12, hour_to: 19, day_period: 'afternoon' }]);
          }
          calId = idOf(await rpc(RC, 'create', [{ name, attendance_ids: att }]));
        }
        await rpc('res.company', 'write', [[RIB.cfg.companyId], { rental_resource_calendar_id: calId }]);
        out.rentalWeek = name;
      } catch (e) { out.rentalWeek = 'skipped: ' + short(e); }
    } else out.rentalWeek = 'skipped: res.company.rental_resource_calendar_id not on this version';
    // Upgrade and "Piece" options are choices on the product page, not useful as shop filters.
    if (has('product.attribute', 'visibility')) {
      // Templates with variants (the cutlery sets) carry the RI- code on their variants only.
      const lines = await rpc('product.template.attribute.line', 'search_read', [['|', ['product_tmpl_id.default_code', '=like', 'RI-%'],
        ['product_tmpl_id.product_variant_ids.default_code', '=like', 'RI-%']]], { fields: ['attribute_id'] });
      const aids = [...new Set(lines.map((l) => idOf(l.attribute_id)))];
      if (aids.length) {
        await rpc('product.attribute', 'write', [aids, { visibility: 'hidden' }]);
        out.hiddenFilters = (await rpc('product.attribute', 'read', [aids], { fields: ['name'] })).map((a) => a.name);
      }
    } else out.hiddenFilters = 'product.attribute.visibility not on this version';
    // Barbados writes dates day first.
    try {
      const langs = await rpc('res.lang', 'search_read', [[['code', '=', 'en_US']]], { fields: ['id', 'date_format'] });
      if (langs[0] && langs[0].date_format !== '%d/%m/%Y') await rpc('res.lang', 'write', [[langs[0].id], { date_format: '%d/%m/%Y' }]);
      out.dateFormat = langs[0] ? 'en_US: %d/%m/%Y' : 'en_US not found';
    } catch (e) { out.dateFormat = 'skipped: ' + short(e); }
    // Three facts under "Add to cart" on every product page (website-specific inherited view).
    try {
      const key = 'website.rentit_product_facts';
      // Odoo renders a website's own copy of the template when one exists, and only that copy's children.
      const roots = await rpc('ir.ui.view', 'search_read', [[['key', '=', 'website_sale.product'], ['website_id', 'in', [wid(), false]]]], { fields: ['id', 'website_id'] });
      const base = roots.find((x) => idOf(x.website_id) === wid()) || roots.find((x) => !x.website_id);
      if (!base) throw new Error('website_sale.product not found');
      const arch = `<data name="Rent It product facts"><xpath expr="//div[@id='o_wsale_product_cta_section']" position="after">${PRODUCT_FACTS}</xpath></data>`;
      const ex = (await rpc('ir.ui.view', 'search_read', [[['key', '=', key], ['website_id', '=', wid()]]], { fields: ['id'], context: { active_test: false } }))[0];
      if (ex) await rpc('ir.ui.view', 'write', [[ex.id], { arch_db: arch, active: true, inherit_id: base.id }], { context: wctx() });
      else await rpc('ir.ui.view', 'create', [{ name: 'Rent It product facts', type: 'qweb', key, inherit_id: base.id, mode: 'extension', priority: 90, website_id: wid(), arch_db: arch }], { context: wctx() });
      out.productFacts = ex ? 'updated' : 'created';
    } catch (e) { out.productFacts = 'skipped: ' + short(e); }
    return out;
  };

  // Rent It's event questions, on the checkout's extra step (between address and payment).
  // The event type goes into the booking's Customer Reference, the one order field website forms may write.
  // Every other answer is posted as a note on the booking, labelled with its `name`.
  // A follow-up (showIf) only shows, and is only required and sent, when the earlier answer matches.
  const EVENT_QUESTIONS = [
    { name: 'client_order_ref', label: 'What type of event is it?', type: 'char', required: true, placeholder: 'Wedding, birthday, christening, corporate...' },
    { name: 'Event date', label: 'Event date', type: 'date', required: true },
    { name: 'Indoors or outdoors', label: 'Is it indoors or outdoors?', type: 'radio', required: true, options: ['Indoors', 'Outdoors'] },
    { name: 'Floor and access', label: 'Which floor is it on?', type: 'radio', required: true, showIf: ['Indoors or outdoors', 'Indoors'],
      options: ['Ground floor', 'Upstairs, stairs only', 'Upstairs, with an elevator'] },
    { name: 'Ground', label: 'What is the ground like?', type: 'radio', required: true, showIf: ['Indoors or outdoors', 'Outdoors'],
      options: ['Grass', 'Cement', 'Sand'] },
    { name: 'Truck can pull up', label: 'Can our truck pull up to the area where the items will be used?', type: 'radio', required: true, options: ['Yes', 'No', 'Not sure'] },
    { name: 'Delivery', label: 'When should we deliver?', type: 'radio', required: true, options: ['The day before the event', 'On the day of the event'] },
    { name: 'Collection', label: 'When should we collect?', type: 'radio', required: true, options: ['On the day, after the event', 'The day after the event'] },
    { name: 'Heard about us', label: 'How did you hear about us?', type: 'select',
      options: ['Instagram', 'Facebook', 'Google', 'Word of mouth', 'Saw our truck', 'Other'] },
    { name: 'Notes', label: 'Anything else we should know?', type: 'text', placeholder: 'Event times, gate or parking details...' },
  ];
  const FORM_TYPES = { char: 'char', text: 'text', date: 'date', radio: 'selection', select: 'many2one' };
  function eventFormHtml() {
    const fields = EVENT_QUESTIONS.map((q, i) => {
      const id = `ri_ev${i}`, name = esc(q.name), req = q.required ? ' required="1"' : '';
      const ph = q.placeholder ? ` placeholder="${esc(q.placeholder)}"` : '';
      let input;
      if (q.type === 'char') input = `<input type="text" class="form-control s_website_form_input" name="${name}" id="${id}"${ph}${req}/>`;
      else if (q.type === 'text') input = `<textarea class="form-control s_website_form_input" name="${name}" id="${id}" rows="3"${ph}${req}></textarea>`;
      else if (q.type === 'date') {
        input = `<div class="s_website_form_date input-group date"><input type="text" class="form-control datetimepicker-input s_website_form_input" name="${name}" id="${id}"${req}/>`
          + '<div class="input-group-text o_input_group_date_icon"><i class="oi oi-filled" data-icon="calendar_today"></i></div></div>';
      } else if (q.type === 'select') {
        input = `<select class="form-select s_website_form_input" name="${name}" id="${id}"${req}><option value="">Choose one</option>`
          + q.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('') + '</select>';
      } else {
        // Short answers sit side by side; long ones get a line each so they don't wrap.
        const vertical = q.options.some((o) => o.length > 14);
        input = `<div class="row s_col_no_resize s_col_no_bgcolor s_website_form_multiple" data-name="${name}" data-display="${vertical ? 'vertical' : 'horizontal'}">`
          + q.options.map((o, j) => `<div class="radio col-12${vertical ? '' : ' col-lg-4 col-md-6'}"><div class="form-check"><input type="radio" class="s_website_form_input form-check-input" id="${id}_${j}" name="${name}" value="${esc(o)}"${req}/>`
            + `<label class="form-check-label s_website_form_check_label" for="${id}_${j}">${esc(o)}</label></div></div>`).join('') + '</div>';
      }
      const cls = ['s_website_form_field', 'mb-3', 'col-12'];
      if (q.name !== 'client_order_ref') cls.push('s_website_form_custom');
      if (q.required) cls.push('s_website_form_required');
      let vis = '';
      if (q.showIf) {
        cls.push('s_website_form_field_hidden_if', 'd-none');
        vis = ` data-visibility-dependency="${esc(q.showIf[0])}" data-visibility-comparator="selected" data-visibility-condition="${esc(q.showIf[1])}"`;
      }
      const forId = q.type === 'radio' ? '' : ` for="${id}"`;
      const mark = q.required ? '<span class="s_website_form_mark"> *</span>' : '';
      return `<div class="${cls.join(' ')}" data-type="${FORM_TYPES[q.type]}" data-name="Field"${vis}>`
        + `<label class="s_website_form_label d-block"${forId}><span class="s_website_form_label_content">${esc(q.label)}</span>${mark}</label>${input}</div>`;
    }).join('');
    // Same form attributes as Odoo's own extra-info form: it posts to the cart, then goes on to payment.
    return '<section class="s_website_form" data-vcss="001" data-snippet="s_website_form"><div class="container">'
      + '<form action="/website/form/" method="post" enctype="multipart/form-data" class="o_mark_required s_website_form_no_recaptcha" data-mark="*"'
      + ' data-force_action="shop.sale.order" data-model_name="sale.order" data-success-mode="redirect" data-success-page="/shop/payment" hide-change-model="true">'
      + `<div class="s_website_form_rows s_col_no_bgcolor row"><span id="s_website_form_result"></span>${fields}</div></form></div></section>`;
  }
  RIB.checkoutQuestions = async () => {
    need();
    const out = { extraStep: null, form: null, stepName: null, questions: EVENT_QUESTIONS.map((q) => q.name) };
    // The shop editor's "Extra Step" switch: activates the step's view (as this website's own copy) and publishes the step.
    await post('/shop/config/website', { extra_step: 'true' });
    out.extraStep = await viewState('website_sale.extra_info');
    const roots = await rpc('ir.ui.view', 'search_read', [[['key', '=', 'website_sale.extra_info'], ['website_id', 'in', [wid(), false]]]],
      { fields: ['id', 'website_id'], context: { active_test: false } });
    const base = roots.find((x) => idOf(x.website_id) === wid()) || roots.find((x) => !x.website_id);
    if (!base) throw new Error('website_sale.extra_info not found');
    const key = 'website.rentit_event_questions';
    const arch = '<data name="Rent It event questions">'
      + `<xpath expr="//h4[hasclass('mb-3')]" position="replace"><h4 class="mb-3">${esc(RIB.text.eventTitle)}</h4><p class="text-muted">${esc(RIB.text.eventIntro)}</p></xpath>`
      + `<xpath expr="//section[hasclass('s_website_form')]" position="replace">${eventFormHtml()}</xpath></data>`;
    const ex = (await rpc('ir.ui.view', 'search_read', [[['key', '=', key], ['website_id', '=', wid()]]], { fields: ['id'], context: { active_test: false } }))[0];
    if (ex) await rpc('ir.ui.view', 'write', [[ex.id], { arch_db: arch, active: true, inherit_id: base.id }], { context: wctx() });
    else await rpc('ir.ui.view', 'create', [{ name: 'Rent It event questions', type: 'qweb', key, inherit_id: base.id, mode: 'extension', priority: 90, website_id: wid(), arch_db: arch }], { context: wctx() });
    out.form = ex ? 'updated' : 'created';
    // The step's name in the checkout breadcrumb, and the button that leads to it.
    if (F('website.checkout.step')) {
      const step = (await rpc('website.checkout.step', 'search_read', [[['website_id', '=', wid()], ['step_href', '=', '/shop/extra_info']]], { fields: ['id', 'is_published'] }))[0];
      if (step) {
        const errs = await writeSafe('website.checkout.step', [step.id], pick('website.checkout.step', { name: RIB.text.eventStep, main_button_label: 'Continue' }), wctx());
        out.stepName = errs.length ? 'errors: ' + errs.join('; ') : RIB.text.eventStep + (step.is_published ? '' : ' (step not published)');
      } else out.stepName = 'no /shop/extra_info step for this website';
    }
    return out;
  };

  // ------------------------------------------------------------------ catalogue: categories, products, pricing, images, stock
  RIB.categories = async (force = false) => {
    need();
    const C = await catalogue(), M = RIB.map, PC = 'product.public.category';
    const cats = [...C.categories].sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0) || a.sequence - b.sequence);
    const fields = ['id', 'name', 'parent_id'].concat(has(PC, 'image_128') ? ['image_128'] : []);
    const existing = await rpc(PC, 'search_read', [[]], { fields });
    const byId = Object.fromEntries(existing.map((e) => [e.id, e]));
    const out = { created: [], updated: 0, images: 0, errors: [] };
    for (const c of cats) {
      const parentId = c.parent ? (M.cat[c.parent] || false) : false;
      let row = byId[M.cat[c.key]] || existing.find((e) => e.name === c.name && idOf(e.parent_id) === parentId);
      const vals = { name: c.name, parent_id: parentId, sequence: c.sequence };
      try {
        if (!row) {
          const id = idOf(await rpc(PC, 'create', [vals]));
          row = { id }; out.created.push(c.key);
        } else { await rpc(PC, 'write', [[row.id], vals]); out.updated++; }
        M.cat[c.key] = row.id;
        if (c.image && cfg_catImg().length && (force || !row.image_128)) {
          const b64 = await fetchB64(c.image);
          await rpc(PC, 'write', [[row.id], Object.fromEntries(cfg_catImg().map((k) => [k, b64]))]);
          out.images++;
        }
      } catch (e) { out.errors.push(c.key + ': ' + short(e)); }
    }
    // category URLs for page tokens
    const ids = Object.values(M.cat);
    const urlField = has(PC, 'website_url');
    const rows = await rpc(PC, 'read', [ids], { fields: ['id', 'name'].concat(urlField ? ['website_url'] : []) });
    const byKey = Object.fromEntries(Object.entries(M.cat).map(([k, id]) => [id, k]));
    for (const r of rows) M.catUrl[byKey[r.id]] = (urlField && r.website_url) || `/shop/category/${slugify(r.name)}-${r.id}`;
    save();
    return out;
  };
  const cfg_catImg = () => RIB.cfg.catImg || [];

  async function ensureRibbon() {
    if (RIB.map.ribbonId) return RIB.map.ribbonId;
    if (!F('product.ribbon')) return null;
    const nf = RIB.cfg.ribbonName;
    const ex = await rpc('product.ribbon', 'search_read', [[[nf, 'ilike', 'New']]], { fields: ['id', nf] });
    const hit = ex.find((r) => String(r[nf]).replace(/<[^>]*>/g, '').trim().toLowerCase() === 'new');
    if (hit) return (RIB.map.ribbonId = hit.id);
    const full = pick('product.ribbon', { [nf]: 'New', bg_color: '#4325EB', text_color: '#FFFFFF', position: 'left', style: 'ribbon', assign: 'manual' });
    for (const k of ['position', 'style', 'assign']) {
      const s = RIB.cfg.sel['product.ribbon.' + k]; if (k in full && s && !s.includes(full[k])) delete full[k];
    }
    let id;
    try { id = await rpc('product.ribbon', 'create', [full]); } catch (e) { id = await rpc('product.ribbon', 'create', [{ [nf]: 'New' }]); }
    return (RIB.map.ribbonId = idOf(id));
  }

  const pieceName = (n) => (/^set\b/i.test(n) ? 'Full set' : n);
  const varCode = (p, piece) => `${p.code}-${slugify(piece).toUpperCase()}`;
  const PIECES = ['Full set', 'Dinner Knife', 'Dinner Fork', 'Dessert Fork', 'Dessert Spoon', 'Teaspoon'];

  async function ensurePieceAttr() {
    if (RIB.map.attr && RIB.map.attr.id && Object.keys(RIB.map.attr.v || {}).length >= PIECES.length) return RIB.map.attr;
    let a = (await rpc('product.attribute', 'search_read', [[['name', '=', 'Piece']]], { fields: ['id'] }))[0];
    if (!a) {
      const dt = (RIB.cfg.sel['product.attribute.display_type'] || []).includes('pills') ? 'pills' : 'radio';
      a = { id: idOf(await rpc('product.attribute', 'create', [{ name: 'Piece', display_type: dt, create_variant: 'always' }])) };
    }
    const vals = await rpc('product.attribute.value', 'search_read', [[['attribute_id', '=', a.id]]], { fields: ['id', 'name'] });
    const v = Object.fromEntries(vals.map((x) => [x.name, x.id]));
    for (const [i, n] of PIECES.entries()) {
      if (!v[n]) v[n] = idOf(await rpc('product.attribute.value', 'create', [{ attribute_id: a.id, name: n, sequence: i + 1 }]));
    }
    RIB.map.attr = { id: a.id, v }; save();
    return RIB.map.attr;
  }

  function productVals(p, index) {
    const cfg = RIB.cfg, M = RIB.map, T = 'product.template';
    const prices = p.variants ? p.variants.map((x) => x.price) : null;
    let desc = p.description || '';
    if (p.price === null) desc = (desc ? desc + '\n' : '') + RIB.text.priceOnRequest;
    if (p.variants) desc = RIB.text.cutleryNote + (desc ? '\n' + desc : '');
    const v = {
      name: p.name, list_price: prices ? Math.min(...prices) : (p.price ?? 0),
      is_published: true, website_sequence: (index + 1) * 10,
      public_categ_ids: [[6, 0, p.categories.map((k) => M.cat[k]).filter(Boolean)]],
      allow_out_of_stock_order: false, show_availability: true, available_threshold: 5,
    };
    if (!p.variants) v.default_code = p.code;
    // Only touch taxes once the tax step has decided (taxId number = 17.5% VAT, null = no tax).
    // After a localStorage reset taxId is undefined: leave existing taxes alone instead of stripping VAT.
    if (cfg.taxId !== undefined) v.taxes_id = [[6, 0, cfg.taxId ? [cfg.taxId] : []]];
    if (cfg.productType === 'consu+is_storable') { v.type = 'consu'; v.is_storable = true; } else v.type = cfg.productType;
    if (cfg.rentOk) { v.rent_ok = true; v.sale_ok = false; } else v.sale_ok = true;
    if (cfg.descField) v[cfg.descField] = desc ? (cfg.descHtml ? textToHtml(desc) : desc) : false;
    if (has(T, 'website_ribbon_id')) v.website_ribbon_id = p.is_new && M.ribbonId ? M.ribbonId : false;
    return pick(T, v);
  }

  async function setupVariants(tmplId, p) {
    const A = await ensurePieceAttr();
    const rev = Object.fromEntries(Object.entries(A.v).map(([n, id]) => [id, n]));
    const price = Object.fromEntries(p.variants.map((x) => [pieceName(x.name), x.price]));
    const min = Math.min(...Object.values(price));
    const ptavs = await rpc('product.template.attribute.value', 'search_read',
      [[['product_tmpl_id', '=', tmplId], ['attribute_id', '=', A.id]]], { fields: ['id', 'product_attribute_value_id', 'price_extra'] });
    const ptavName = {};
    for (const t of ptavs) {
      const n = rev[idOf(t.product_attribute_value_id)]; ptavName[t.id] = n;
      if (n in price) {
        const extra = round2(price[n] - min);
        if (Math.abs((t.price_extra || 0) - extra) > 0.001) await rpc('product.template.attribute.value', 'write', [[t.id], { price_extra: extra }]);
      }
    }
    const vars = await rpc('product.product', 'search_read', [[['product_tmpl_id', '=', tmplId]]], { fields: ['id', 'default_code', 'product_template_attribute_value_ids'] });
    RIB.map.var[p.code] = {};
    for (const v of vars) {
      const n = (v.product_template_attribute_value_ids || []).map((i) => ptavName[i]).find(Boolean);
      if (!n) continue;
      const code = varCode(p, n);
      if (v.default_code !== code) await rpc('product.product', 'write', [[v.id], { default_code: code }]);
      RIB.map.var[p.code][n] = v.id;
    }
    RIB.map.pp[p.code] = RIB.map.var[p.code]['Full set'] || vars[0] && vars[0].id;
  }

  RIB.products = async (offset = 0, limit = 40) => {
    need();
    const C = await catalogue(), M = RIB.map;
    if (!Object.keys(M.cat).length) throw new Error('Run categories first.');
    // tax step not run in this browser (or localStorage was reset): find/copy the tax now (idempotent),
    // so new products do not silently get the company's default sale tax.
    if (RIB.cfg.taxId === undefined) await RIB.tax().catch((e) => log('tax', short(e)));
    if (C.products.some((p) => p.is_new)) await ensureRibbon().catch((e) => log('ribbon', short(e)));
    const list = C.products.slice(offset, offset + limit);
    const ctx = Object.assign({ active_test: false }, QUIET);
    // find existing templates (plain by default_code; cutlery by its variant codes)
    const codes = list.filter((p) => !p.variants).map((p) => p.code);
    const vcodes = list.filter((p) => p.variants).flatMap((p) => p.variants.map((x) => varCode(p, pieceName(x.name))));
    const found = {};
    if (codes.length) for (const r of await rpc('product.template', 'search_read', [[['default_code', 'in', codes]]], { fields: ['id', 'default_code'], context: ctx })) found[r.default_code] = r.id;
    if (vcodes.length) for (const r of await rpc('product.product', 'search_read', [[['default_code', 'in', vcodes]]], { fields: ['product_tmpl_id', 'default_code'], context: ctx })) found[(r.default_code.match(/^RI-\d+/) || [r.default_code])[0]] = idOf(r.product_tmpl_id);
    const out = { offset, count: list.length, created: 0, updated: 0, errors: [] };
    for (const [j, p] of list.entries()) {
      try {
        const vals = productVals(p, offset + j);
        let id = found[p.code] || null;
        if (!id && M.prod[p.code]) {
          const chk = await rpc('product.template', 'search', [[['id', '=', M.prod[p.code]]]], { context: ctx });
          if (chk.length) id = chk[0];
        }
        if (id) { await rpc('product.template', 'write', [[id], vals], { context: QUIET }); out.updated++; } else {
          if (p.variants) {
            const A = await ensurePieceAttr();
            const vals2 = Object.assign({}, vals, { attribute_line_ids: [[0, 0, { attribute_id: A.id,
              value_ids: [[6, 0, [...new Set(p.variants.map((x) => A.v[pieceName(x.name)]))]]] }]] });
            id = idOf(await rpc('product.template', 'create', [vals2], { context: QUIET }));
          } else id = idOf(await rpc('product.template', 'create', [vals], { context: QUIET }));
          out.created++;
        }
        M.prod[p.code] = id;
        if (p.variants) await setupVariants(id, p);
      } catch (e) { out.errors.push(p.code + ': ' + short(e)); }
    }
    const plain = list.filter((p) => !p.variants && M.prod[p.code]);
    if (plain.length) {
      for (const r of await rpc('product.template', 'read', [plain.map((p) => M.prod[p.code])], { fields: ['id', 'product_variant_id'] })) {
        const p = plain.find((x) => M.prod[x.code] === r.id); if (p) M.pp[p.code] = idOf(r.product_variant_id);
      }
    }
    save();
    out.next = offset + limit < C.products.length ? offset + limit : null;
    out.total = C.products.length;
    return out;
  };

  // Rent It's paid package upgrades (YITH add-ons on rentit.bb): one no_variant attribute per upgrade, price_extra per package.
  RIB.packageOptions = async () => {
    need();
    const C = await catalogue(), M = RIB.map;
    const out = { done: [], errors: [] };
    const attrs = {};
    for (const p of C.products.filter((x) => x.upgrades && M.prod[x.code])) {
      const tmpl = M.prod[p.code];
      try {
        for (const u of p.upgrades) {
          if (!attrs[u.name]) {
            let a = (await rpc('product.attribute', 'search_read', [[['name', '=', u.name]]], { fields: ['id'] }))[0];
            if (!a) a = { id: idOf(await rpc('product.attribute', 'create', [{ name: u.name, display_type: 'radio', create_variant: 'no_variant' }])) };
            attrs[u.name] = { id: a.id, v: {} };
            for (const x of await rpc('product.attribute.value', 'search_read', [[['attribute_id', '=', a.id]]], { fields: ['id', 'name'] })) attrs[u.name].v[x.name] = x.id;
          }
          const A = attrs[u.name];
          for (const [i, o] of u.options.entries()) {
            if (!A.v[o.name]) A.v[o.name] = idOf(await rpc('product.attribute.value', 'create', [{ attribute_id: A.id, name: o.name, sequence: i + 1 }]));
          }
          const want = u.options.map((o) => A.v[o.name]);
          const line = (await rpc('product.template.attribute.line', 'search_read', [[['product_tmpl_id', '=', tmpl], ['attribute_id', '=', A.id]]], { fields: ['id', 'value_ids'] }))[0];
          if (!line) await rpc('product.template', 'write', [[tmpl], { attribute_line_ids: [[0, 0, { attribute_id: A.id, value_ids: [[6, 0, want]] }]] }], { context: QUIET });
          else if (want.some((id) => !line.value_ids.includes(id))) await rpc('product.template.attribute.line', 'write', [[line.id], { value_ids: [[6, 0, want]] }]);
          const ptavs = await rpc('product.template.attribute.value', 'search_read', [[['product_tmpl_id', '=', tmpl], ['attribute_id', '=', A.id]]], { fields: ['id', 'product_attribute_value_id', 'price_extra'] });
          for (const t of ptavs) {
            const o = u.options.find((x) => A.v[x.name] === idOf(t.product_attribute_value_id));
            if (o && Math.abs((t.price_extra || 0) - o.extra) > 0.001) await rpc('product.template.attribute.value', 'write', [[t.id], { price_extra: o.extra }]);
          }
        }
        out.done.push(p.code);
      } catch (e) { out.errors.push(p.code + ': ' + short(e)); }
    }
    out.note = 'Check one package on /shop: the upgrade choice should change the price. If rental lines ignore price_extra on this version, say so in the demo.';
    return out;
  };

  async function ensureDayRecurrence() {
    const R = 'sale.temporal.recurrence';
    const ex = (await rpc(R, 'search_read', [[['duration', '=', 1], ['unit', '=', 'day']]], { fields: ['id'], limit: 1 }))[0];
    if (ex) return ex.id;
    return idOf(await rpc(R, 'create', [pick(R, { name: '1 day', duration: 1, unit: 'day' })]));
  }

  RIB.rentalPricing = async (offset = 0, limit) => {
    need();
    const cfg = RIB.cfg, C = await catalogue(), M = RIB.map;
    // one bulk write on 20; 1-3 RPCs per product on 17-19, so keep chunks small enough for one tool call
    if (!limit) limit = cfg.pricingModel === 'periodicity' ? 400 : 60;
    const list = C.products.slice(offset, offset + limit).filter((p) => M.prod[p.code]);
    const next = offset + limit < C.products.length ? offset + limit : null;
    if (cfg.pricingModel === 'periodicity') {
      if (!cfg.dayKey) throw new Error('No day value in rent_periodicity selection.');
      const vals = { rent_periodicity: cfg.dayKey };
      for (const ids of chunk(list.map((p) => M.prod[p.code]), 100)) await rpc('product.template', 'write', [ids, vals], { context: QUIET });
      return { model: 'Odoo 20: rent_periodicity=' + cfg.dayKey + ', Sales Price = 24-hour rate', products: list.length, next };
    }
    if (cfg.pricingModel === 'pricing') {
      const rec = await ensureDayRecurrence();
      const out = { model: 'product.pricing (1 day)', created: 0, updated: 0, skippedPriceOnRequest: 0, errors: [], next };
      for (const p of list) {
        if (p.price === null) { out.skippedPriceOnRequest++; continue; }
        const t = M.prod[p.code];
        try {
          const rows = await rpc('product.pricing', 'search_read', [[['product_template_id', '=', t], ['recurrence_id', '=', rec], ['pricelist_id', '=', false]]], { fields: ['id', 'price', 'product_variant_ids'] });
          const targets = p.variants
            ? p.variants.map((x) => ({ vid: (M.var[p.code] || {})[pieceName(x.name)], price: x.price })).filter((x) => x.vid)
            : [{ vid: null, price: p.price }];
          for (const tg of targets) {
            const row = rows.find((r) => (tg.vid ? (r.product_variant_ids || []).length === 1 && r.product_variant_ids[0] === tg.vid : !(r.product_variant_ids || []).length));
            const vals = { product_template_id: t, recurrence_id: rec, price: tg.price };
            if (tg.vid) vals.product_variant_ids = [[6, 0, [tg.vid]]];
            if (row) { if (Math.abs(row.price - tg.price) > 0.001) { await rpc('product.pricing', 'write', [[row.id], { price: tg.price }]); out.updated++; } }
            else { await rpc('product.pricing', 'create', [vals]); out.created++; }
          }
        } catch (e) { out.errors.push(p.code + ': ' + short(e)); }
      }
      return out;
    }
    throw new Error('No rental pricing model found. Is Rental installed? Re-run introspect.');
  };

  RIB.images = async (offset = 0, limit = 25, force = false) => {
    need();
    const C = await catalogue(), M = RIB.map;
    const list = C.products.slice(offset, offset + limit).filter((p) => M.prod[p.code] && p.image);
    const ids = list.map((p) => M.prod[p.code]);
    const cur = ids.length ? await rpc('product.template', 'read', [ids], { fields: ['id', 'image_128'] }) : [];
    const hasImg = Object.fromEntries(cur.map((r) => [r.id, !!r.image_128]));
    const out = { offset, written: 0, skipped: 0, errors: [] };
    for (const p of list) {
      const id = M.prod[p.code];
      if (hasImg[id] && !force) { out.skipped++; continue; }
      try {
        const b64 = await fetchB64(p.image);
        await rpc('product.template', 'write', [[id], { image_1920: b64 }], { context: QUIET });
        out.written++;
      } catch (e) { out.errors.push(p.code + ': ' + short(e)); }
    }
    out.next = offset + limit < C.products.length ? offset + limit : null;
    return out;
  };

  RIB.stock = async (offset = 0, limit = 120) => {
    need();
    const cfg = RIB.cfg, C = await catalogue(), M = RIB.map;
    if (!cfg.stockLoc) {
      const wh = (await rpc('stock.warehouse', 'search_read', [[['company_id', '=', cfg.companyId]]], { fields: ['lot_stock_id'], limit: 1 }))[0];
      if (!wh) throw new Error('No warehouse. Install Inventory first.');
      cfg.stockLoc = idOf(wh.lot_stock_id);
    }
    const list = C.products.slice(offset, offset + limit);
    const want = {}; // product.product id -> qty
    for (const p of list) {
      const q = Math.max(0, parseInt(p.demo_stock, 10) || 0);
      if (p.variants) for (const vid of Object.values(M.var[p.code] || {})) want[vid] = q;
      else if (M.pp[p.code]) want[M.pp[p.code]] = q;
    }
    const vids = Object.keys(want).map(Number);
    const out = { offset, products: list.length, set: 0, unchanged: 0, notStorable: 0, errors: [], note: 'Stock levels are made-up sample numbers for the demo.' };
    if (!vids.length) return Object.assign(out, { next: null, warning: 'No products mapped yet. Run products first.' });
    const flds = ['id'].concat(has('product.product', 'is_storable') ? ['is_storable'] : ['type'],
      has('product.product', 'qty_available') ? ['qty_available'] : []);
    const meta = await rpc('product.product', 'read', [vids], { fields: flds });
    const storable = new Set(meta.filter((m) => m.is_storable === true || m.type === 'product').map((m) => m.id));
    const total = Object.fromEntries(meta.map((m) => [m.id, m.qty_available]));
    const quants = await rpc('stock.quant', 'search_read', [[['product_id', 'in', vids], ['location_id', '=', cfg.stockLoc]]], { fields: ['product_id', 'quantity'] });
    const onHand = {};
    for (const q of quants) onHand[idOf(q.product_id)] = (onHand[idOf(q.product_id)] || 0) + q.quantity;
    const qids = [];
    for (const vid of vids) {
      if (!storable.has(vid)) { out.notStorable++; continue; }
      // Units out on (sample) rentals sit in Odoo's rental location. Count them as owned, so a re-run after
      // sampleOrders keeps the total owned at demo_stock instead of topping the shelf back up.
      const away = typeof total[vid] === 'number' ? Math.max(0, total[vid] - (onHand[vid] || 0)) : 0;
      const target = Math.max(0, want[vid] - away);
      if ((onHand[vid] || 0) === target) { out.unchanged++; continue; }
      try {
        qids.push(idOf(await rpc('stock.quant', 'create', [{ product_id: vid, location_id: cfg.stockLoc, inventory_quantity: target }], { context: { inventory_mode: true } })));
      } catch (e) { out.errors.push(vid + ': ' + short(e)); }
    }
    for (const ids of chunk(qids, 50)) {
      try {
        const r = await rpc('stock.quant', 'action_apply_inventory', [ids], { context: { inventory_mode: true } });
        if (r && r.res_model) out.errors.push('apply returned ' + r.res_model + ' (conflict); re-run stock for this range');
        else out.set += ids.length;
      } catch (e) { out.errors.push('apply: ' + short(e)); }
    }
    save();
    out.next = offset + limit < C.products.length ? offset + limit : null;
    return out;
  };

  // ------------------------------------------------------------------ delivery and payments
  RIB.delivery = async () => {
    need();
    const cfg = RIB.cfg, D = 'delivery.carrier', pub = cfg.carrierPub;
    if (!F(D)) return { skipped: 'delivery not installed' };
    let prod = (await rpc('product.template', 'search_read', [[['default_code', '=', 'RI-DELIVERY']]], { fields: ['id', 'product_variant_id'], context: { active_test: false } }))[0];
    if (!prod) {
      const id = idOf(await rpc('product.template', 'create', [pick('product.template', {
        name: RIB.text.carrierName, default_code: 'RI-DELIVERY', type: 'service', sale_ok: false, purchase_ok: false,
        list_price: 0, taxes_id: [[6, 0, []]], is_published: false })]));
      prod = (await rpc('product.template', 'read', [[id]], { fields: ['id', 'product_variant_id'] }))[0];
    } else await rpc('product.template', 'write', [[prod.id], { name: RIB.text.carrierName }]);
    const vals = pick(D, {
      name: RIB.text.carrierName, delivery_type: 'fixed', fixed_price: 0, product_id: idOf(prod.product_variant_id),
      [pub]: true, website_description: RIB.text.carrierDesc, carrier_description: RIB.text.carrierDesc,
      country_ids: cfg.countryBB ? [[6, 0, [cfg.countryBB]]] : undefined, sequence: 1,
    });
    if (vals.country_ids === undefined) delete vals.country_ids;
    const ours = (await rpc(D, 'search_read', [[['product_id', '=', idOf(prod.product_variant_id)]]], { fields: ['id'], context: { active_test: false } }))[0];
    let id, errors = [];
    if (ours) { id = ours.id; errors = await writeSafe(D, [id], Object.assign({ active: true }, vals)); }
    else id = idOf(await rpc(D, 'create', [vals]));
    const others = await rpc(D, 'search_read', [[['id', '!=', id], [pub, '=', true]]], { fields: ['id', 'name'] });
    if (others.length) await rpc(D, 'write', [others.map((o) => o.id), { [pub]: false }]);
    return { carrierId: id, name: RIB.text.carrierName, price: 0, unpublished: others.map((o) => o.name), errors,
      note: 'No fee is invented: staff add the real delivery fee when they confirm the quote.' };
  };

  RIB.payments = async () => {
    need();
    const cfg = RIB.cfg, P = 'payment.provider';
    if (!F(P)) return { skipped: 'payment not installed' };
    const out = { demo: null, wire: null, unpublished: [], methods: [] };
    const rows = await rpc(P, 'search_read', [[['code', 'in', ['demo', 'custom']]]], { fields: ['id', 'name', 'code'].concat(has(P, 'custom_mode') ? ['custom_mode'] : []), context: { active_test: false } });
    const demo = rows.find((r) => r.code === 'demo');
    const wire = rows.find((r) => r.code === 'custom' && (!('custom_mode' in r) || r.custom_mode === 'wire_transfer'));
    const poi = rows.filter((r) => r.code === 'custom' && r.custom_mode === 'pay_on_invoice');
    const enable = (live) => (cfg.payMode === 'state' ? { state: live ? 'enabled' : 'test', is_published: true } : { is_published: true, is_live: live });
    if (demo) {
      const errs = await writeSafe(P, [demo.id], pick(P, Object.assign({ name: RIB.text.demoCard, active: true, allow_express_checkout: false, allow_tokenization: false }, enable(false))));
      out.demo = { id: demo.id, errors: errs };
    } else out.demo = 'not found (install payment_demo)';
    if (wire) {
      // is_live/state for a manual provider just means "not test"; no money moves through Odoo.
      const errs = await writeSafe(P, [wire.id], pick(P, Object.assign({ name: RIB.text.wireName, active: true, pending_msg: RIB.text.wirePending }, enable(true))));
      out.wire = { id: wire.id, errors: errs };
      if (has(P, 'payment_method_ids')) {
        const pm = (await rpc(P, 'read', [[wire.id]], { fields: ['payment_method_ids'] }))[0].payment_method_ids || [];
        if (pm.length) { await rpc('payment.method', 'write', [pm, { name: RIB.text.wireName }]).catch((e) => out.methods.push(short(e))); out.methods.push('renamed ' + pm.length); }
      }
    } else out.wire = 'not found (install payment_custom)';
    for (const r of poi) {
      await writeSafe(P, [r.id], pick(P, cfg.payMode === 'state' ? { state: 'disabled' } : { is_published: false }));
      out.unpublished.push(r.name + ' (confirms orders without payment)');
    }
    return out;
  };

  // ------------------------------------------------------------------ gallery uploads, tokens, pages, menus, custom code
  const GALLERY = [12, 13, 14, 16, 21, 24, 34, 35, 39, 40, 53, 56, 61, 63, 73, 75];
  const galleryFiles = () => GALLERY.flatMap((n) => [`pf-${n}`, `pf-${n}-sm`]).map((k) => ({ key: k, path: `gallery/${k}.jpg`, name: `rentit_${k}.jpg` }))
    .concat([{ key: 'logo-white', path: 'brand/logo-white.png', name: 'rentit_logo-white.png' }]);

  async function addData(name, b64) {
    const params = { name, data: b64, is_image: true, res_model: 'ir.ui.view', res_id: 0 };
    let res;
    try { res = await post(RIB.cfg.addDataRoute, params); } catch (e) {
      const alt = RIB.cfg.addDataRoute.includes('html_editor') ? '/web_editor/attachment/add_data' : '/html_editor/attachment/add_data';
      res = await post(alt, params); RIB.cfg.addDataRoute = alt;
    }
    if (!res || res.error) throw new Error('add_data: ' + (res && res.error));
    return { id: res.id, url: res.image_src || res.local_url || '/web/image/' + res.id };
  }

  RIB.gallery = async (offset = 0, limit = 40, force = false) => {
    need();
    const all = galleryFiles(), list = all.slice(offset, offset + limit), M = RIB.map;
    const names = list.map((f) => f.name);
    const att = 'ir.attachment';
    const fields = ['id', 'name', 'public'].concat(has(att, 'image_src') ? ['image_src'] : [], has(att, 'local_url') ? ['local_url'] : []);
    const ex = await rpc(att, 'search_read', [[['name', 'in', names], ['res_model', '=', 'ir.ui.view']]], { fields });
    const out = { uploaded: 0, reused: 0, errors: [] };
    for (const f of list) {
      const hit = ex.find((a) => a.name === f.name && a.public);
      if (hit && !force) { M.img[f.key] = hit.image_src || hit.local_url || `/web/image/${hit.id}/${f.name}`; out.reused++; continue; }
      try { const r = await addData(f.name, await fetchB64(f.path)); M.img[f.key] = r.url; out.uploaded++; }
      catch (e) { out.errors.push(f.key + ': ' + short(e)); }
    }
    save();
    const probe = M.img['pf-14'];
    if (probe) { try { out.publicCheck = (await fetch(probe, { credentials: 'omit' })).status; } catch (e) { out.publicCheck = short(e); } }
    out.next = offset + limit < all.length ? offset + limit : null;
    return out;
  };

  // Replace __TOKENS__ in kit text. xml=true escapes & in the values.
  async function fill(str, { xml = true } = {}) {
    const M = RIB.map, pages = await pagesJson();
    const toks = [...new Set(str.match(/__[A-Z_]+(?::[A-Za-z0-9_-]+)?__/g) || [])];
    const prodIds = toks.filter((t) => t.startsWith('__PROD:')).map((t) => t.slice(7, -2));
    const purl = {};
    if (prodIds.length) {
      const tids = prodIds.map((i) => M.prod['RI-' + i]).filter(Boolean);
      if (tids.length) for (const r of await rpc('product.template', 'read', [tids], { fields: ['id', 'website_url'] })) purl[r.id] = r.website_url;
    }
    const missing = [];
    const val = (t) => {
      const [, kind, arg] = t.match(/^__([A-Z_]+)(?::([A-Za-z0-9_-]+))?__$/);
      switch (kind) {
        case 'IMG': return M.img[arg];
        case 'LOGO_WHITE': return M.img['logo-white'];
        case 'CAT': return M.catUrl[arg] || (M.cat[arg] ? '/shop/category/' + M.cat[arg] : null);
        case 'PROD': { const id = M.prod['RI-' + arg]; return id ? (purl[id] || `/shop/${id}`) : null; }
        case 'PIMG': { const id = M.prod['RI-' + arg]; return id ? `/web/image/product.template/${id}/image_512` : null; }
        case 'SHOP': return '/shop';
        case 'PAGE': { const pg = pages.find((x) => x.key === arg); return (M.pages[arg] && M.pages[arg].url) || (pg && pg.url) || null; }
        default: return null;
      }
    };
    let s = str;
    for (const t of toks) {
      let v = val(t);
      if (v == null) { missing.push(t); continue; }
      if (xml) v = String(v).replace(/&(?!amp;|#\d+;)/g, '&amp;').replace(/"/g, '&quot;');
      s = s.split(t).join(v);
    }
    return { s, missing };
  }
  RIB.fill = fill;

  RIB.pages = async (only) => {
    need();
    const pages = await pagesJson(), M = RIB.map, out = { done: [], missingTokens: [], conflicts: [], errors: [] };
    if (!Object.keys(M.img).length) throw new Error('Run gallery first (page images).');
    // final URLs first so __PAGE:x__ resolves
    for (const p of pages) M.pages[p.key] = Object.assign({}, M.pages[p.key], { url: p.url });
    for (const p of pages) {
      if (!p.file || (only && only !== p.key)) continue;
      try {
        const raw = await fetchText('pages/' + p.file);
        const { s, missing } = await fill(raw);
        if (missing.length) out.missingTokens.push(p.key + ': ' + missing.join(' '));
        checkXml(s, p.file);
        if (p.key === 'homepage' || p.url === '/') { out.done.push(await writeHomepage(s)); continue; }
        out.done.push(await upsertPage(p, s, out));
      } catch (e) { out.errors.push(p.key + ': ' + short(e)); }
    }
    save();
    return out;
  };

  async function writeHomepage(inner) {
    const site = (await rpc('website', 'read', [[wid()]], { fields: has('website', 'homepage_url') ? ['homepage_url'] : ['name'] }))[0];
    const views = await rpc('ir.ui.view', 'search_read', [[['key', '=', 'website.homepage'], ['website_id', 'in', [wid(), false]]]], { fields: ['id', 'website_id', 'arch_db'] });
    const v = views.find((x) => idOf(x.website_id) === wid()) || views.find((x) => !x.website_id);
    if (!v) throw new Error('website.homepage view not found');
    const arch = replaceById(v.arch_db, 'wrap', inner) ||
      `<t name="Homepage" t-name="website.homepage"><t t-call="website.layout" pageName.f="homepage"><div id="wrap" class="oe_structure oe_empty">${inner}</div></t></t>`;
    await rpc('ir.ui.view', 'write', [[v.id], { arch_db: arch }], { context: wctx() });
    RIB.map.pages.homepage = { url: '/', viewId: v.id };
    return { key: 'homepage', view: v.id, copyOnWrite: !v.website_id, homepage_url: site.homepage_url || null };
  }

  async function upsertPage(p, inner, out) {
    const key = 'website.rentit_' + p.key.replace(/[^a-z0-9_]/gi, '_');
    const arch = `<t t-name="${key}"><t t-call="website.layout"><div id="wrap" class="oe_structure oe_empty">${inner}</div></t></t>`;
    let view = (await rpc('ir.ui.view', 'search_read', [[['key', '=', key], ['website_id', '=', wid()]]], { fields: ['id'], context: { active_test: false } }))[0];
    if (view) await rpc('ir.ui.view', 'write', [[view.id], { arch_db: arch, name: p.name, active: true }], { context: wctx() });
    else view = { id: idOf(await rpc('ir.ui.view', 'create', [{ name: p.name, type: 'qweb', key, arch_db: arch, website_id: wid() }], { context: wctx() })) };
    // move aside any page that is not ours but sits on the same URL (unpublish + rename URL; never delete)
    const clash = await rpc('website.page', 'search_read', [[['url', '=', p.url], ['website_id', 'in', [wid(), false]], ['view_id', '!=', view.id]]], { fields: ['id', 'name', 'url'] });
    for (const c of clash) {
      await rpc('website.page', 'write', [[c.id], { url: p.url + '-odoo-default', is_published: false }], { context: wctx() });
      out.conflicts.push(`${c.name} moved from ${p.url} to ${p.url}-odoo-default (unpublished)`);
    }
    let page = (await rpc('website.page', 'search_read', [[['view_id', '=', view.id]]], { fields: ['id', 'url'] }))[0];
    const pvals = pick('website.page', { url: p.url, is_published: true, website_indexed: true, name: p.name, website_id: wid() });
    if (page) await rpc('website.page', 'write', [[page.id], pvals], { context: wctx() });
    else page = { id: idOf(await rpc('website.page', 'create', [Object.assign({ view_id: view.id }, pvals)], { context: wctx() })) };
    RIB.map.pages[p.key] = { url: p.url, viewId: view.id, pageId: page.id };
    return { key: p.key, url: p.url, view: view.id, page: page.id };
  }

  RIB.menus = async () => {
    need();
    const pages = await pagesJson(), M = RIB.map, WM = 'website.menu';
    const tops = await rpc(WM, 'search_read', [[['website_id', '=', wid()], ['parent_id', '=', false]]], { fields: ['id', 'name'] });
    let top = tops[0] && tops[0].id;
    if (has('website', 'menu_id')) top = idOf((await rpc('website', 'read', [[wid()]], { fields: ['menu_id'] }))[0].menu_id) || top;
    if (!top) throw new Error('No main menu for this website');
    const kids = await rpc(WM, 'search_read', [[['parent_id', '=', top]]], { fields: ['id', 'name', 'url', 'sequence'] });
    const norm = (u) => String(u || '').replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
    const desired = pages.filter((p) => p.menu).sort((a, b) => a.sequence - b.sequence)
      .map((p) => ({ name: p.name, url: (M.pages[p.key] && M.pages[p.key].url) || p.url, sequence: p.sequence }));
    const used = new Set(), out = { updated: [], created: [], removed: [], kept: [] };
    for (const d of desired) {
      const hit = kids.find((k) => !used.has(k.id) && norm(k.url) === norm(d.url)) ||
        kids.find((k) => !used.has(k.id) && k.name.trim().toLowerCase() === d.name.toLowerCase());
      if (hit) { used.add(hit.id); await rpc(WM, 'write', [[hit.id], { name: d.name, url: d.url, sequence: d.sequence }]); out.updated.push(d.name); }
      else {
        const id = idOf(await rpc(WM, 'create', [{ name: d.name, url: d.url, parent_id: top, website_id: wid(), sequence: d.sequence }]));
        used.add(id); if (!M.menus.includes(id)) M.menus.push(id); out.created.push(d.name);
      }
    }
    const desiredUrls = new Set(desired.map((d) => norm(d.url)));
    const remove = [];
    for (const k of kids.filter((k) => !used.has(k.id))) {
      const isHome = norm(k.url) === '/' && /^home$/i.test(k.name.trim());
      const isDup = desiredUrls.has(norm(k.url));
      const ours = M.menus.includes(k.id);
      // Trials add items for other apps they install (Appointments, Field Service); they have nothing to do with rentals.
      const isAppt = ['/appointment', '/service-requests'].includes(norm(k.url));
      if (isHome || isDup || ours || isAppt) { remove.push(k.id); out.removed.push(`${k.name} (${k.url})`); } else out.kept.push(`${k.name} (${k.url})`);
    }
    if (remove.length) await rpc(WM, 'unlink', [remove]);
    M.menus = M.menus.filter((id) => !remove.includes(id));
    save();
    if (out.kept.length) out.note = 'Kept menu items this script does not know. Remove them in Website > Menus if they should go.';
    return out;
  };

  RIB.customCode = async () => {
    need();
    const out = { head: null, footer: null, footerView: null, missingTokens: [] };
    const head = await fill(await fetchText('theme/custom_code_head.html'), { xml: false });
    const foot = await fill(await fetchText('theme/custom_code_footer.html'), { xml: false });
    out.missingTokens.push(...head.missing, ...foot.missing);
    const vals = pick('website', { custom_code_head: head.s, custom_code_footer: foot.s });
    const errs = await writeSafe('website', [wid()], vals, wctx());
    out.head = has('website', 'custom_code_head') ? (errs.length ? errs.join('; ') : 'ok ' + head.s.length + ' chars') : 'field missing';
    out.footer = has('website', 'custom_code_footer') ? 'ok ' + foot.s.length + ' chars' : 'field missing';
    // footer.xml into the footer template (website-specific copy)
    try {
      const fx = await fill(await fetchText('theme/footer.xml'));
      out.missingTokens.push(...fx.missing);
      checkXml(fx.s, 'footer.xml');
      const views = await rpc('ir.ui.view', 'search_read', [[['key', '=', 'website.footer_custom'], ['website_id', 'in', [wid(), false]]]], { fields: ['id', 'website_id', 'arch_db', 'active'], context: { active_test: false } });
      const v = views.find((x) => idOf(x.website_id) === wid()) || views.find((x) => !x.website_id);
      if (!v) out.footerView = 'skipped: website.footer_custom not found';
      else if (!v.active) out.footerView = 'skipped: another footer template is active; pick "Default" in the editor, then re-run';
      else {
        const arch = replaceById(v.arch_db, 'footer', fx.s);
        if (!arch) out.footerView = 'skipped: no element id="footer" in the footer view';
        else { await rpc('ir.ui.view', 'write', [[v.id], { arch_db: arch }], { context: wctx() }); out.footerView = 'ok (view ' + v.id + (v.website_id ? '' : ', copy-on-write') + ')'; }
      }
    } catch (e) { out.footerView = 'skipped: ' + short(e); }
    return out;
  };

  // Odoo's snippets ship placeholder contact details (555 numbers, yourcompany.example.com). Swap in Rent It's real ones.
  RIB.placeholders = async () => {
    need();
    const rx = [
      [/(\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?555[\s.-]?\d{4}/g, BIZ.phone],
      [/[\w.+-]+@(?:your|my)company\.(?:example\.)?com/gi, BIZ.email],
      [/250 Executive Park Blvd,? Suite 3400/g, BIZ.street],
      [/San Francisco,? CA 94134/g, 'St George'],
    ];
    const dom = [['type', '=', 'qweb'], ['website_id', 'in', [wid(), false]], ['key', 'not like', 'website.rentit_'],
      '|', '|', '|', ['arch_db', 'ilike', '555-'], ['arch_db', 'ilike', 'company.example.com'], ['arch_db', 'ilike', 'mycompany.com'], ['arch_db', 'ilike', 'Executive Park']];
    // Website templates only: never copy-on-write report, portal or mail templates of other apps.
    const views = (await rpc('ir.ui.view', 'search_read', [dom], { fields: ['id', 'key', 'website_id', 'arch_db'] }))
      .filter((v) => /^(website|theme_)/.test(v.key || ''));
    // Writing a generic view with website_id in the context lands on this website's own copy when one exists,
    // even if that copy has no placeholders (e.g. our footer). So skip every generic view that has a copy here.
    const genericKeys = [...new Set(views.filter((v) => !v.website_id).map((v) => v.key))];
    const specificKeys = new Set(genericKeys.length ? (await rpc('ir.ui.view', 'search_read',
      [[['key', 'in', genericKeys], ['website_id', '=', wid()]]], { fields: ['key'], context: { active_test: false } })).map((v) => v.key) : []);
    const out = { changed: [], errors: [] };
    for (const v of views) {
      if (!v.website_id && specificKeys.has(v.key)) continue;
      let a = v.arch_db; const hadAddr = /Executive Park/.test(a);
      for (const [r, s] of rx) a = a.replace(r, s);
      if (hadAddr) a = a.replace(/United States/g, 'Barbados');
      if (a === v.arch_db) continue;
      try { await rpc('ir.ui.view', 'write', [[v.id], { arch_db: a }], { context: wctx() }); out.changed.push(v.key); }
      catch (e) { out.errors.push(v.key + ': ' + short(e)); }
    }
    return out;
  };

  // ------------------------------------------------------------------ sample data (all labelled sample)
  const SAMPLE_PEOPLE = [
    ['Shontelle W.', 'St. Michael'], ['Marcus T.', 'Christ Church'], ['Andrea C.', 'St. James'], ['Kerry-Ann B.', 'St. Philip'],
    ['Dwayne H.', 'St. Peter'], ['Natalie G.', 'St. George'], ['Rochelle P.', 'St. Thomas'], ['Jamal K.', 'St. Lucy'],
    ['Simone A.', 'St. Andrew'], ['Kevin & Tricia M.', 'St. John'], ['Paula R.', 'St. Joseph'],
  ];
  // [person index, target, start day offset from today, days, event, [[catalogue id, qty], ...]]
  const SAMPLE_ORDERS = [
    [0, 'returned', -18, 1, '30th birthday lunch', [[2881, 4], [2635, 32], [2812, 4], [3251, 32], [3720, 32], [2794, 32]]],
    [1, 'returned', -11, 1, 'Office staff party', [[4204, 1], [2631, 60], [2877, 8], [2882, 4]]],
    [2, 'late', -4, 2, 'Backyard lime', [[4356, 1], [2882, 6], [2868, 2]]],
    [3, 'pickedup', -1, 2, 'Baby shower', [[2650, 2], [2897, 1], [2564, 1], [2880, 5], [4206, 40], [3250, 40]]],
    [4, 'reserved', 3, 1, 'Beach wedding', [[2635, 80], [2888, 6], [3253, 80], [2659, 80], [2798, 80], [3720, 80]]],
    [5, 'reserved', 5, 1, 'Family reunion', [[3199, 1], [2631, 30], [2877, 4]]],
    [10, 'cancel', 8, 1, 'Church fair', [[3198, 2], [2631, 20]]],
    [6, 'sent', 10, 1, 'Birthday dinner', [[3827, 2], [2466, 1], [2852, 1], [3713, 6]]],
    [7, 'draft', 12, 1, 'Graduation party', [[3530, 1], [2881, 10], [4206, 80], [2799, 10]]],
    [8, 'reserved', 17, 1, 'Luxe picnic proposal', [[2843, 1], [2841, 2], [2840, 4], [3263, 2], [2874, 4]]],
    [9, 'sent', 20, 1, 'Wedding ceremony', [[4338, 1], [2466, 1]]],
  ];

  async function ensureSamplePartners() {
    const M = RIB.map, cfg = RIB.cfg;
    for (const [i, [n, parish]] of SAMPLE_PEOPLE.entries()) {
      const name = `${n} (sample)`;
      if (M.partners[name]) {
        const ok = await rpc('res.partner', 'search', [[['id', '=', M.partners[name]]]]);
        if (ok.length) continue;
      }
      const ex = (await rpc('res.partner', 'search_read', [[['name', '=', name], ['ref', '=', 'RI-SAMPLE']]], { fields: ['id'] }))[0];
      const local = slugify(n).replace(/-/g, '.');
      M.partners[name] = ex ? ex.id : idOf(await rpc('res.partner', 'create', [pick('res.partner', {
        name, ref: 'RI-SAMPLE', email: `${local}.sample@example.com`, phone: `+1 246 555 01${String(i + 10).padStart(2, '0')}`,
        city: parish, country_id: cfg.countryBB || false, comment: '<p>Sample customer for the Odoo demo. Not a real person.</p>',
      })], { context: QUIET }));
    }
    save();
  }

  function buttonFor(kind) {
    const b = (RIB.cfg.soButtons || []).filter((n) => !n.startsWith('('));
    // Fall back to the 17/18 method names when no button was found in the views (an unknown name just errors and is reported).
    if (kind === 'pickup') return b.find((n) => n === 'action_open_pickup') || b.find((n) => /pick_?up/.test(n)) || 'action_open_pickup';
    return b.find((n) => n === 'action_open_return') || b.find((n) => /return/.test(n) && !/returned|update|price/.test(n)) || 'action_open_return';
  }

  async function runRentalAction(soId, kind, ctx) {
    const btn = buttonFor(kind);
    if (!btn) throw new Error(`No ${kind} button found on the rental form (soButtons: ${(RIB.cfg.soButtons || []).join(',')})`);
    const act = await rpc('sale.order', btn, [[soId]], { context: ctx });
    if (!act || !act.res_model) return btn + ' done';
    let actx = act.context;
    if (typeof actx === 'string') { try { actx = JSON.parse(actx.replace(/'/g, '"').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null')); } catch (e) { actx = {}; } }
    const c2 = Object.assign({}, ctx, actx || {});
    if (act.res_model === 'stock.picking') {
      const pids = act.res_id ? [act.res_id] : await rpc('stock.picking', 'search', [act.domain || [['sale_id', '=', soId], ['state', 'not in', ['done', 'cancel']]]]);
      for (const pid of pids) {
        const moves = await rpc('stock.move', 'search_read', [[['picking_id', '=', pid]]], { fields: ['id', 'product_uom_qty'] });
        for (const m of moves) await rpc('stock.move', 'write', [[m.id], { quantity: m.product_uom_qty, picked: true }]).catch(() => null);
        await rpc('stock.picking', 'button_validate', [[pid]], { context: Object.assign({ skip_backorder: true, skip_sms: true }, c2) });
      }
      return btn + ' via pickings ' + pids.join(',');
    }
    let wizId = act.res_id;
    if (!wizId) {
      // Odoo 17+ fills rental.order.wizard lines in an onchange, which a plain create() skips: pass the lines in.
      const vals = {};
      const wf = await rpc(act.res_model, 'fields_get', [], { attributes: ['type'] });
      if (wf.rental_wizard_line_ids) {
        const st = c2.default_status || (kind === 'pickup' ? 'pickup' : 'return');
        const hasIds = Array.isArray(c2.order_line_ids);
        if (hasIds && !c2.order_line_ids.length) return btn + ': nothing to process';
        const lids = hasIds ? c2.order_line_ids
          : await rpc('sale.order.line', 'search', [[['order_id', '=', soId], ['is_rental', '=', true]]]);
        const ol = await rpc('sale.order.line', 'read', [lids], { fields: ['product_id', 'product_uom_qty', 'qty_delivered', 'qty_returned'] });
        const wl = ol.map((l) => {
          const d = l.qty_delivered || 0, r = l.qty_returned || 0;
          return { order_line_id: l.id, product_id: idOf(l.product_id), qty_reserved: l.product_uom_qty,
            qty_delivered: kind === 'pickup' ? l.product_uom_qty - d : d, qty_returned: kind === 'pickup' ? r : d - r, status: st };
        }).filter((v) => (kind === 'pickup' ? v.qty_delivered : v.qty_returned) > 0);
        if (!wl.length) return btn + ': nothing to process';
        Object.assign(vals, { order_id: soId, status: st, rental_wizard_line_ids: wl.map((v) => [0, 0, v]) });
      }
      wizId = idOf(await rpc(act.res_model, 'create', [vals], { context: c2 }));
    }
    const fv = await rpc(act.res_model, 'get_views', [[[false, 'form']]], { options: {}, context: c2 });
    const arch = (fv.views && fv.views.form && fv.views.form.arch) || '';
    const names = [...arch.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]).filter((b) => /type="object"/.test(b))
      .map((b) => (b.match(/name="([a-z_0-9]+)"/) || [])[1]).filter((n) => n && !/cancel|discard/.test(n));
    if (!names.length) throw new Error('No confirm button in ' + act.res_model);
    await rpc(act.res_model, names[0], [[wizId]], { context: c2 });
    return `${btn} -> ${act.res_model}.${names[0]}`;
  }
  // For repairs by hand, e.g. await RIB.rentalAction(id, 'return')
  RIB.rentalAction = (soId, kind) => runRentalAction(soId, kind, Object.assign({ in_rental_app: true }, QUIET));

  RIB.sampleOrders = async (offset = 0, limit = 4) => {
    need();
    const cfg = RIB.cfg, M = RIB.map, SO = 'sale.order', SOL = 'sale.order.line';
    if (!cfg.startField || !cfg.returnField) throw new Error('No rental date fields on sale.order. Is Rental installed? Re-run introspect.');
    if (!Object.keys(M.pp).length) throw new Error('Run products first.');
    await ensureSamplePartners();
    const ctx = Object.assign({ in_rental_app: true, default_is_rental_order: true, disable_cancel_warning: true }, QUIET);
    const out = { offset, orders: [], next: offset + limit < SAMPLE_ORDERS.length ? offset + limit : null };
    for (const [j, o] of SAMPLE_ORDERS.slice(offset, offset + limit).entries()) {
      const n = offset + j + 1, ref = 'RI-SAMPLE-' + String(n).padStart(2, '0');
      const [pi, target, start, days, event, items] = o;
      const rep = { ref, target, steps: [] };
      try {
        const ex = (await rpc(SO, 'search_read', [[['client_order_ref', '=', ref]]], { fields: ['id', 'state'] }))[0];
        if (ex) { M.orders[ref] = ex.id; rep.steps.push('exists (' + ex.state + ')'); out.orders.push(rep); continue; }
        const partner = M.partners[`${SAMPLE_PEOPLE[pi][0]} (sample)`];
        const lines = items.map(([cid, qty]) => {
          const pid = M.pp['RI-' + cid]; if (!pid) throw new Error('product RI-' + cid + ' not built yet');
          return [0, 0, pick(SOL, { product_id: pid, product_uom_qty: qty, is_rental: true })];
        });
        const vals = pick(SO, {
          partner_id: partner, client_order_ref: ref, is_rental_order: true,
          [cfg.startField]: bbUtc(start, 10), [cfg.returnField]: bbUtc(start + days, 10),
          note: `<p>${RIB.text.sampleNote}: ${esc(event)}. Customer, items and dates are made up.</p>`,
          order_line: lines,
        });
        const id = idOf(await rpc(SO, 'create', [vals], { context: ctx }));
        M.orders[ref] = id; rep.id = id;
        if (target === 'sent') { await rpc(SO, 'action_quotation_sent', [[id]], { context: ctx }); rep.steps.push('marked sent'); }
        if (['reserved', 'pickedup', 'late', 'returned'].includes(target)) { await rpc(SO, 'action_confirm', [[id]], { context: ctx }); rep.steps.push('confirmed'); }
        if (['pickedup', 'late', 'returned'].includes(target)) rep.steps.push(await runRentalAction(id, 'pickup', ctx).catch((e) => 'pickup failed: ' + short(e)));
        if (target === 'returned') rep.steps.push(await runRentalAction(id, 'return', ctx).catch((e) => 'return failed: ' + short(e)));
        if (target === 'cancel') { await rpc(SO, 'action_cancel', [[id]], { context: ctx }); rep.steps.push('cancelled'); }
        const r = (await rpc(SO, 'read', [[id]], { fields: ['name', 'state', 'amount_total'].concat(has(SO, 'rental_status') ? ['rental_status'] : []) }))[0];
        Object.assign(rep, { name: r.name, state: r.state, rental_status: r.rental_status, total: r.amount_total });
        const ln = await rpc(SOL, 'search_read', [[['order_id', '=', id]]], { fields: ['product_id', 'product_uom_qty', 'price_unit'] });
        if (ln.length > items.length) rep.extraLines = ln.length - items.length + ' (e.g. delay fee lines added by Odoo; check them)';
        if (n === 1 || j === 0) rep.firstLines = ln.slice(0, 3).map((l) => `${l.product_id[1]} x${l.product_uom_qty} @ ${l.price_unit}`);
        if (target === 'sent') { try { rep.portalUrl = await rpc(SO, 'get_portal_url', [[id]]); } catch (e) { /* optional */ } }
      } catch (e) { rep.error = short(e); }
      out.orders.push(rep);
    }
    save();
    return out;
  };

  // ------------------------------------------------------------------ verify
  RIB.verify = async () => {
    need();
    const M = RIB.map, C = await catalogue(), pages = await pagesJson();
    const ids = Object.values(M.prod);
    const count = async (model, dom) => { try { return await rpc(model, 'search_count', [dom]); } catch (e) { return 'n/a: ' + short(e).slice(0, 80); } };
    const out = {
      products: { catalogue: C.products.length, mapped: ids.length,
        published: await count('product.template', [['id', 'in', ids], ['is_published', '=', true]]),
        withImage: await count('product.template', [['id', 'in', ids], ['image_1920', '!=', false]]) },
      categories: Object.keys(M.cat).length,
      variants: Object.keys(M.var).length,
      pages: {}, menus: null, rental: {}, orders: {},
    };
    for (const p of pages) {
      const url = (M.pages[p.key] && M.pages[p.key].url) || p.url;
      try { const r = await fetch(url, { credentials: 'omit' }); out.pages[url] = r.status; } catch (e) { out.pages[url] = short(e); }
    }
    const firstCat = Object.values(M.catUrl)[0];
    if (firstCat) { try { out.pages[firstCat] = (await fetch(firstCat, { credentials: 'omit' })).status; } catch (e) { out.pages[firstCat] = short(e); } }
    try {
      const menu = await rpc('website.menu', 'search_read', [[['website_id', '=', RIB.cfg.websiteId], ['parent_id', '!=', false]]], { fields: ['name', 'url', 'sequence'], order: 'sequence' });
      out.menus = menu.map((m) => `${m.name} ${m.url}`);
    } catch (e) { out.menus = short(e); }
    const probe = M.prod['RI-4206'] || ids[0];
    if (probe) {
      const T = 'product.template';
      const flds = ['name', 'list_price', 'website_url', 'is_published'].concat(['rent_ok', 'rent_periodicity', 'qty_available'].filter((k) => has(T, k)));
      const r = (await rpc(T, 'read', [[probe]], { fields: flds }))[0];
      out.rental.product = r;
      try {
        const html = await (await fetch(r.website_url, { credentials: 'omit' })).text();
        out.rental.pageHints = {
          datePicker: /daterange|o_rental|rental_start|renting|o_website_sale_rental/i.test(html),
          perDay: /\/\s*(day|24)/i.test(html), addToCart: /add_to_cart/.test(html), outOfStockMsg: /out of stock/i.test(html),
        };
      } catch (e) { out.rental.pageHints = short(e); }
    }
    const oids = Object.values(M.orders);
    if (oids.length && has('sale.order', 'rental_status')) {
      for (const r of await rpc('sale.order', 'read', [oids], { fields: ['rental_status'] })) out.orders[r.rental_status || 'none'] = (out.orders[r.rental_status || 'none'] || 0) + 1;
    } else out.orders.count = oids.length;
    return out;
  };

  // ------------------------------------------------------------------ runners
  RIB.run = async (step, ...args) => {
    const t0 = performance.now();
    if (typeof RIB[step] !== 'function' || ['run', 'loop', 'rpc', 'post', 'fill'].includes(step)) return { step, ok: false, error: 'Unknown step. See RIB.help().' };
    try {
      const report = await RIB[step](...args);
      save();
      return { step, ok: true, ms: Math.round(performance.now() - t0), report };
    } catch (e) {
      save();
      log(step, 'failed', short(e));
      return { step, ok: false, ms: Math.round(performance.now() - t0), error: String((e && e.message) || e).slice(0, 900) };
    }
  };

  // Repeat a chunked step (offset, limit, ...extra) until about budgetMs is used or it finishes.
  RIB.loop = async (step, from = 0, limit = 20, budgetMs = 50000, ...extra) => {
    const t0 = performance.now(); let offset = from, chunks = 0, last = 0; const errors = [];
    let tally = {};
    while (offset !== null && offset !== undefined) {
      const elapsed = performance.now() - t0;
      if (chunks && elapsed + last * 1.2 > budgetMs) break;
      const c0 = performance.now();
      const r = await RIB.run(step, offset, limit, ...extra);
      last = performance.now() - c0; chunks++;
      if (!r.ok) { errors.push(r.error); break; }
      for (const [k, v] of Object.entries(r.report)) if (typeof v === 'number' && !['offset', 'next', 'total'].includes(k)) tally[k] = (tally[k] || 0) + v;
      if (r.report.errors && r.report.errors.length) errors.push(...r.report.errors.slice(0, 5));
      offset = r.report.next;
    }
    return { step, from, next: offset ?? null, done: offset == null, chunks, ms: Math.round(performance.now() - t0), tally, errors: errors.slice(0, 15) };
  };

  RIB.status = () => ({
    version: RIB.VERSION, base: RIB.BASE, odoo: RIB.cfg.version, websiteId: RIB.cfg.websiteId,
    pricingModel: RIB.cfg.pricingModel, taxId: RIB.cfg.taxId || null,
    map: { categories: Object.keys(RIB.map.cat).length, products: Object.keys(RIB.map.prod).length, variants: Object.keys(RIB.map.var).length,
      images: Object.keys(RIB.map.img).length, pages: Object.keys(RIB.map.pages).length, partners: Object.keys(RIB.map.partners).length, orders: Object.keys(RIB.map.orders).length },
  });

  RIB.forget = () => { try { localStorage.removeItem('RIB.cfg'); localStorage.removeItem('RIB.map'); } catch (e) { /* ignore */ }
    RIB.cfg = { vat: true, scss: true }; RIB.map = { cat: {}, catUrl: {}, prod: {}, pp: {}, var: {}, img: {}, pages: {}, menus: [], partners: {}, orders: {} };
    return 'Local memory cleared (Odoo records untouched). Run introspect again.'; };

  RIB.help = () => [
    'introspect', 'installApps (repeat)', 'introspect', 'company', 'tax', 'settings', 'deposit', 'website',
    'categories', 'products(offset,limit) / loop', 'rentalPricing', 'packageOptions', 'images(offset,limit) / loop', 'stock(offset,limit)',
    'delivery', 'payments', 'gallery', 'theme', 'customCode', 'pages', 'menus', 'shopWording', 'shopLayout', 'checkoutQuestions', 'placeholders',
    'sampleOrders(offset,limit)', 'verify',
  ];

  return 'RIB ' + RIB.VERSION + ' ready. Next: await RIB.run("introspect")';
})();
