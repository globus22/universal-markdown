/* Universal Tools — QR-коды: матрица (qrcode-generator) и отрисовка в SVG/Canvas со стилями.
   Используется в QR Studio и в генераторе визиток. */
(() => {
  'use strict';
  const UT = (window.UT = window.UT || {});

  /** Матрица QR: массив строк из boolean. ecc: L / M / Q / H. */
  function matrix(text, ecc = 'M') {
    if (!window.qrcode) throw new Error('Библиотека QR не загружена');
    const q = qrcode(0, ecc);
    q.addData(String(text || ' '));
    q.make();
    const n = q.getModuleCount(), m = [];
    for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(q.isDark(r, c)); m.push(row); }
    return m;
  }

  const r3 = v => Math.round(v * 1000) / 1000;
  const isFinder = (n, r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  /**
   * SVG-фрагмент QR.
   * opt: { x, y, size, quiet (модулей отступа внутри size), style: square|dots|rounded, eye: square|rounded|circle,
   *        color, color2 (градиент сверху вниз), bg (null = прозрачный), id, hole: {w,h} — свободное место под логотип (доли) }
   */
  function svgParts(m, opt = {}) {
    const n = m.length, quiet = opt.quiet ?? 0, size = opt.size ?? (n + quiet * 2);
    const cell = size / (n + quiet * 2), ox = (opt.x ?? 0) + quiet * cell, oy = (opt.y ?? 0) + quiet * cell;
    const style = opt.style || 'square', eye = opt.eye || 'square', id = opt.id || 'qr' + Math.random().toString(36).slice(2, 8);
    const fill = opt.color2 && opt.color2 !== opt.color ? `url(#${id})` : (opt.color || '#000');
    let hole = null;
    if (opt.hole) {
      const hw = Math.ceil(n * opt.hole.w / 2) * 2 + (n % 2), hh = Math.ceil(n * opt.hole.h / 2) * 2 + (n % 2);
      hole = { c0: (n - hw) / 2, c1: (n + hw) / 2, r0: (n - hh) / 2, r1: (n + hh) / 2 };
    }
    const inHole = (r, c) => hole && r >= hole.r0 && r < hole.r1 && c >= hole.c0 && c < hole.c1;
    let d = '';
    for (let r = 0; r < n; r++) {
      if (style === 'square') {
        let run = 0;
        for (let c = 0; c <= n; c++) {
          const on = c < n && m[r][c] && !isFinder(n, r, c) && !inHole(r, c);
          if (on) { run++; continue; }
          if (run) { d += `M${r3(ox + (c - run) * cell)} ${r3(oy + r * cell)}h${r3(run * cell)}v${r3(cell)}h${r3(-run * cell)}z`; run = 0; }
        }
      } else {
        for (let c = 0; c < n; c++) {
          if (!m[r][c] || isFinder(n, r, c) || inHole(r, c)) continue;
          const x = ox + c * cell, y = oy + r * cell;
          if (style === 'dots') { const rr = cell * .45; d += `M${r3(x + cell / 2 - rr)} ${r3(y + cell / 2)}a${r3(rr)} ${r3(rr)} 0 1 0 ${r3(rr * 2)} 0a${r3(rr)} ${r3(rr)} 0 1 0 ${r3(-rr * 2)} 0z`; }
          else { const k = cell * .24; d += `M${r3(x + k)} ${r3(y)}h${r3(cell - 2 * k)}a${r3(k)} ${r3(k)} 0 0 1 ${r3(k)} ${r3(k)}v${r3(cell - 2 * k)}a${r3(k)} ${r3(k)} 0 0 1 ${r3(-k)} ${r3(k)}h${r3(-(cell - 2 * k))}a${r3(k)} ${r3(k)} 0 0 1 ${r3(-k)} ${r3(-k)}v${r3(-(cell - 2 * k))}a${r3(k)} ${r3(k)} 0 0 1 ${r3(k)} ${r3(-k)}z`; }
        }
      }
    }
    // «Глазки»: внешняя рамка 7×7 и центр 3×3.
    const eyes = [[0, 0], [0, n - 7], [n - 7, 0]];
    for (const [er, ec] of eyes) {
      const x = ox + ec * cell, y = oy + er * cell, s7 = 7 * cell, s5 = 5 * cell, s3 = 3 * cell;
      if (eye === 'circle') {
        const R = s7 / 2, R2 = s5 / 2, R3 = s3 / 2, cx = x + R, cy = y + R;
        d += `M${r3(cx - R)} ${r3(cy)}a${r3(R)} ${r3(R)} 0 1 0 ${r3(2 * R)} 0a${r3(R)} ${r3(R)} 0 1 0 ${r3(-2 * R)} 0z`;
        d += `M${r3(cx - R2)} ${r3(cy)}a${r3(R2)} ${r3(R2)} 0 1 1 ${r3(2 * R2)} 0a${r3(R2)} ${r3(R2)} 0 1 1 ${r3(-2 * R2)} 0z`;
        d += `M${r3(cx - R3)} ${r3(cy)}a${r3(R3)} ${r3(R3)} 0 1 0 ${r3(2 * R3)} 0a${r3(R3)} ${r3(R3)} 0 1 0 ${r3(-2 * R3)} 0z`;
      } else {
        const k = eye === 'rounded' ? cell * 1.8 : 0, k2 = eye === 'rounded' ? cell * 1.1 : 0, k3 = eye === 'rounded' ? cell * .9 : 0;
        d += roundRect(x, y, s7, s7, k, false) + roundRect(x + cell, y + cell, s5, s5, k2, true) + roundRect(x + 2 * cell, y + 2 * cell, s3, s3, k3, false);
      }
    }
    const defs = fill.startsWith('url(')
      ? `<linearGradient id="${id}" x1="0" y1="${r3(oy)}" x2="0" y2="${r3(oy + n * cell)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${opt.color}"/><stop offset="1" stop-color="${opt.color2}"/></linearGradient>`
      : '';
    const bg = opt.bg ? `<rect x="${r3(opt.x ?? 0)}" y="${r3(opt.y ?? 0)}" width="${r3(size)}" height="${r3(size)}" fill="${opt.bg}"/>` : '';
    return { defs, body: bg + `<path d="${d}" fill="${fill}" fill-rule="evenodd"${style === 'square' ? ' shape-rendering="crispEdges"' : ''}/>`, cell, modules: n, origin: [ox, oy] };
  }

  // Прямоугольник со скруглением; reverse — против часовой (для «дырки» с evenodd не обязательно, но аккуратнее).
  function roundRect(x, y, w, h, r, reverse) {
    if (!r) return reverse ? `M${r3(x)} ${r3(y)}v${r3(h)}h${r3(w)}v${r3(-h)}z` : `M${r3(x)} ${r3(y)}h${r3(w)}v${r3(h)}h${r3(-w)}z`;
    if (reverse) return `M${r3(x + r)} ${r3(y)}a${r3(r)} ${r3(r)} 0 0 0 ${r3(-r)} ${r3(r)}v${r3(h - 2 * r)}a${r3(r)} ${r3(r)} 0 0 0 ${r3(r)} ${r3(r)}h${r3(w - 2 * r)}a${r3(r)} ${r3(r)} 0 0 0 ${r3(r)} ${r3(-r)}v${r3(-(h - 2 * r))}a${r3(r)} ${r3(r)} 0 0 0 ${r3(-r)} ${r3(-r)}z`;
    return `M${r3(x + r)} ${r3(y)}h${r3(w - 2 * r)}a${r3(r)} ${r3(r)} 0 0 1 ${r3(r)} ${r3(r)}v${r3(h - 2 * r)}a${r3(r)} ${r3(r)} 0 0 1 ${r3(-r)} ${r3(r)}h${r3(-(w - 2 * r))}a${r3(r)} ${r3(r)} 0 0 1 ${r3(-r)} ${r3(-r)}v${r3(-(h - 2 * r))}a${r3(r)} ${r3(r)} 0 0 1 ${r3(r)} ${r3(-r)}z`;
  }

  /* ---------- Полезные данные для разных типов QR ---------- */
  const escWifi = s => String(s || '').replace(/([\\;,:"])/g, '\\$1');
  const escV = v => String(v ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,').trim();
  const digits = v => String(v || '').replace(/[^\d+]/g, '');

  function normalizePhone(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
    if (d.length === 10 && /^9/.test(d)) d = '7' + d;
    return '+' + d;
  }

  /**
   * vCard 3.0. c: { firstName, lastName, middleName, fullName, org, title, phones:[{type,value}], email, url, address, note,
   *                 telegram, whatsapp, extras:[{label, value}] }
   */
  function vcard(c) {
    const fn = c.fullName || [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ');
    const out = ['BEGIN:VCARD', 'VERSION:3.0', `N:${escV(c.lastName)};${escV(c.firstName)};${escV(c.middleName)};;`, `FN:${escV(fn)}`];
    if (c.org) out.push('ORG:' + escV(c.org));
    if (c.title) out.push('TITLE:' + escV(c.title));
    for (const p of c.phones || []) if (p.value) out.push(`TEL;TYPE=${p.type || 'CELL'}:${normalizePhone(p.value) + (p.ext ? ';ext=' + String(p.ext).replace(/\D/g, '') : '')}`);
    if (c.email) out.push('EMAIL;TYPE=INTERNET:' + escV(c.email));
    if (c.url) out.push('URL:' + String(c.url).trim());
    if (c.address) out.push('ADR;TYPE=WORK:;;' + escV(c.address) + ';;;;');
    let item = 1;
    if (c.telegram) { out.push(`item${item}.URL:${telegramUrl(c.telegram)}`, `item${item}.X-ABLabel:Telegram`); item++; }
    if (c.whatsapp) { out.push(`item${item}.URL:https://wa.me/${normalizePhone(c.whatsapp).slice(1)}`, `item${item}.X-ABLabel:WhatsApp`); item++; }
    for (const x of c.extras || []) if (x.value) { out.push(`item${item}.X-ABRELATEDNAMES:${escV(x.value)}`, `item${item}.X-ABLabel:${escV(x.label)}`); item++; }
    if (c.note) out.push('NOTE:' + escV(c.note));
    out.push('END:VCARD');
    return out.join('\n');
  }

  function telegramUrl(v) {
    const s = String(v || '').trim(); if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return 'https://t.me/' + s.replace(/^@/, '').replace(/^t\.me\//i, '');
  }

  const payload = {
    url: v => { const s = String(v || '').trim(); return !s || /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s; },
    text: v => String(v || ''),
    wifi: ({ ssid, password, security = 'WPA', hidden }) => `WIFI:T:${security === 'nopass' ? 'nopass' : security};S:${escWifi(ssid)};${security === 'nopass' ? '' : `P:${escWifi(password)};`}${hidden ? 'H:true;' : ''};`,
    email: ({ to, subject, body }) => {
      const q = [subject && 'subject=' + encodeURIComponent(subject), body && 'body=' + encodeURIComponent(body)].filter(Boolean).join('&');
      return 'mailto:' + String(to || '').trim() + (q ? '?' + q : '');
    },
    tel: v => 'tel:' + normalizePhone(v),
    sms: ({ phone, text }) => `SMSTO:${normalizePhone(phone)}:${text || ''}`,
    geo: ({ lat, lon }) => `geo:${Number(lat) || 0},${Number(lon) || 0}`,
    telegram: v => telegramUrl(v),
    whatsapp: ({ phone, text }) => `https://wa.me/${normalizePhone(phone).slice(1)}${text ? '?text=' + encodeURIComponent(text) : ''}`
  };

  UT.qr = { matrix, svgParts, vcard, payload, normalizePhone, telegramUrl, digits };
})();
