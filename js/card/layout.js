/* [VCF] Вёрстка визитки 90×50 мм в SVG.
   Основано на генераторе визиток VR Trade: те же геометрия, подбор размеров и иконки,
   но логотип, цвета, шрифт и языки сторон задаёт пользователь. */
(() => {
  'use strict';
  const UT = (window.UT = window.UT || {});

  const FONTS = {
    montserrat: { family: 'UTF Montserrat', css: "'Montserrat',Arial,Helvetica,sans-serif", files: 'montserrat', label: 'Montserrat' },
    inter: { family: 'UTF Inter', css: "'Inter',Arial,Helvetica,sans-serif", files: 'inter', label: 'Inter' },
    'pt-serif': { family: 'UTF PT Serif', css: "'PT Serif',Georgia,'Times New Roman',serif", files: 'pt-serif', label: 'PT Serif' }
  };

  const LANG = {
    ru: { ext: 'доб.', greeting: 'С уважением,', label: 'Русский' },
    en: { ext: 'ext.', greeting: 'Best regards,', label: 'English' }
  };

  /* ---------- Настройки дизайна: диапазоны и значения по умолчанию ---------- */
  const PT = 25.4 / 72;
  const DESIGN = {
    namePt:    { min: 11,  max: 16,  step: 0.5,  def: 13.5, unit: 'pt', label: 'Имя' },
    titlePt:   { min: 5.5, max: 9.5, step: 0.25, def: 7,    unit: 'pt', label: 'Должность' },
    contactPt: { min: 6.5, max: 9,   step: 0.25, def: 7.5,  unit: 'pt', label: 'Контакты' },
    qrMM:      { min: 22,  max: 34,  step: 0.5,  def: 31,   unit: 'мм', label: 'QR-код / логотип' },
    iconMM:    { min: 3.4, max: 5.4, step: 0.1,  def: 4.4,  unit: 'мм', label: 'Иконки' }
  };
  const defaultDesign = () => Object.fromEntries(Object.entries(DESIGN).map(([k, v]) => [k, v.def]));
  function clampDesign(ds) {
    const o = defaultDesign();
    for (const k in DESIGN) { const v = parseFloat(ds?.[k]); if (isFinite(v)) o[k] = Math.min(DESIGN[k].max, Math.max(DESIGN[k].min, v)); }
    return o;
  }

  const SHOW_FIELDS = [
    { key: 'address', icon: 'pin', label: 'Адрес', def: true },
    { key: 'mobile', icon: 'phone', label: 'Мобильный', def: true },
    { key: 'work', icon: 'deskphone', label: 'Рабочий телефон', def: true },
    { key: 'telegram', icon: 'telegram', label: 'Telegram', def: false },
    { key: 'wechat', icon: 'wechat', label: 'WeChat', def: false },
    { key: 'whatsapp', icon: 'whatsapp', label: 'WhatsApp', def: false },
    { key: 'email', icon: 'mail', label: 'E-mail', def: true },
    { key: 'site', icon: 'globe', label: 'Сайт', def: true }
  ];
  const defaultShow = () => ({ ...Object.fromEntries(SHOW_FIELDS.map(f => [f.key, f.def])), side2Wechat: false, nameTwoLines: false, underline: true });

  /* ---------- Геометрия, мм ---------- */
  const G = {
    W: 90, H: 50, padL: 5.9, padR: 3.8, padT: 3.4, padB: 3.4,
    logoQrGap: 3.4, logoQrGapMin: 2.2, logoMaxH: 13,
    qrToDiv: 3.0, divMinX: 33, divMaxX: 42.5, divW: 0.35,
    divToCol: 4.4, iconGapK: 0.55,
    nameLead: 1.05, gapNameTitle: 0.5, titleLead: 1.15, gapTitleRows: 2.4,
    contactLead: 1.22, rowPadV: 0.45, ruleColor: '#E2E2E2', ruleW: 0.13
  };

  /* ---------- Иконки 24×24 (обводка) ---------- */
  const ICONS = {
    pin: { s: ['M12 21.2s7-6.4 7-11.6a7 7 0 1 0-14 0c0 5.2 7 11.6 7 11.6Z', 'M12 12.4a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z'], bb: [4.97, 2.58, 19.0, 21.2] },
    phone: { s: ['M7.6 2.4h8.8a2 2 0 0 1 2 2v15.2a2 2 0 0 1-2 2H7.6a2 2 0 0 1-2-2V4.4a2 2 0 0 1 2-2Z', 'M10.4 19h3.2'], bb: [5.58, 2.38, 18.4, 21.6] },
    deskphone: { s: ['M21.6 16.9v2.9a2 2 0 0 1-2.2 2 19.6 19.6 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.6 19.6 0 0 1 1.7 4.1 2 2 0 0 1 3.7 2h2.9a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.4 2.1L7.5 9.8a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2Z'], bb: [1.65, 1.98, 21.6, 21.82] },
    mail: { s: ['M3.6 5.4h16.8a1.6 1.6 0 0 1 1.6 1.6v10a1.6 1.6 0 0 1-1.6 1.6H3.6A1.6 1.6 0 0 1 2 17V7a1.6 1.6 0 0 1 1.6-1.6Z', 'M2.7 6.5 12 13.1l9.3-6.6'], bb: [1.98, 5.38, 22.0, 18.6] },
    globe: { s: ['M12 21.4a9.4 9.4 0 1 0 0-18.8 9.4 9.4 0 0 0 0 18.8Z', 'M2.6 12h18.8', 'M12 2.6c2.4 2.6 3.7 5.9 3.7 9.4S14.4 18.8 12 21.4C9.6 18.8 8.3 15.5 8.3 12S9.6 5.2 12 2.6Z'], bb: [2.55, 2.55, 21.42, 21.42] },
    telegram: { s: ['M21.9 3.4 2.7 10.7c-.7.3-.7 1.2 0 1.4l4.7 1.5 1.8 5.5c.2.7 1.1.9 1.5.3l2.5-2.8 4.7 3.4c.5.4 1.3.1 1.4-.6l3-15.2c.1-.6-.5-1.1-1.1-.9Z', 'm7.4 13.6 12-8.3-9.2 9.5-.3 4.3'], bb: [2.15, 3.22, 22.32, 20.2] },
    wechat: { s: ['M9 3.5C5.1 3.5 2 6.2 2 9.5c0 1.9 1 3.6 2.7 4.7l-.8 2.5 2.9-1.4c.7.2 1.4.3 2.2.3 3.9 0 7-2.7 7-6S12.9 3.5 9 3.5Z', 'M16.7 9.7c-3.1 0-5.7 2.2-5.7 4.9s2.6 4.9 5.7 4.9c.7 0 1.4-.1 2-.3l2.4 1.1-.7-2c1.3-.9 2-2.2 2-3.7 0-2.7-2.5-4.9-5.7-4.9Z'], d: [[6.7, 8.2], [10.7, 8.2], [14.8, 14.2], [18.4, 14.2]], fillBg: '#FFFFFF', bb: [1.98, 3.48, 22.4, 20.3] },
    whatsapp: { s: ['M3.6 20.4 4.9 16A8.5 8.5 0 1 1 8.1 19.2l-4.5 1.2Z', 'M9.1 8.7c.2 0 .4.1.5.3l.7 1.6c.1.2 0 .4-.1.5l-.5.6c-.1.2-.2.3-.1.5.4.8 1.5 1.9 2.4 2.3.2.1.4.1.5-.1l.6-.6c.1-.2.3-.2.5-.1l1.6.7c.2.1.3.3.3.5 0 .8-.7 1.4-1.5 1.4-2.6 0-5.5-2.9-5.5-5.5 0-.8.7-1.5 1.5-1.5Z'], bb: [3.58, 3.28, 20.8, 20.4] }
  };

  /* ---------- Измерение текста (Canvas, по реальному шрифту) ---------- */
  const measureCtx = document.createElement('canvas').getContext('2d');
  const widthCache = new Map();
  let family = FONTS.montserrat.family;
  function widthOf(str, size, weight) {
    const key = family + weight + '|' + str;
    let w = widthCache.get(key);
    if (w === undefined) {
      measureCtx.font = `${weight} 100px "${family}"`;
      w = measureCtx.measureText(str).width / 100;
      if (widthCache.size > 20000) widthCache.clear();
      widthCache.set(key, w);
    }
    return w * size;
  }

  /** Дожидается загрузки нужного шрифта (обе кодировки, оба начертания). */
  async function useFont(key) {
    const f = FONTS[key] || FONTS.montserrat;
    await Promise.all([400, 700].map(w => document.fonts.load(`${w} 16px "${f.family}"`, 'AaЯя')));
    if (family !== f.family) { family = f.family; widthCache.clear(); }
    return f;
  }

  function nameLinesFor(name, twoLines, maxW, size, weight) {
    const str = String(name ?? '').replace(/\s+/g, ' ').trim();
    if (!str) return [];
    const sp = str.indexOf(' ');
    if (!twoLines || sp < 0) return wrapBalanced(str, maxW, size, weight);
    return [str.slice(0, sp), str.slice(sp + 1)].flatMap(p => wrapBalanced(p, maxW, size, weight));
  }

  /** Перенос с выравниванием длины строк (без «рваного» последнего слова). */
  function wrapBalanced(str, maxW, size, weight) {
    const lines = wrap(str, maxW, size, weight);
    if (lines.length < 2) return lines;
    const target = lines.length;
    let maxWord = 0;
    for (const seg of String(str).split(/[\r\n]+/)) for (const w of seg.replace(/\s+/g, ' ').trim().split(' ')) maxWord = Math.max(maxWord, widthOf(w, size, weight));
    let lo = Math.min(maxW, maxWord), hi = maxW;
    if (lo >= hi) return lines;
    if (wrap(str, lo, size, weight).length <= target) return wrap(str, lo, size, weight);
    for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2; if (wrap(str, mid, size, weight).length <= target) hi = mid; else lo = mid; }
    const out = wrap(str, hi, size, weight);
    return out.length === target ? out : lines;
  }

  function wrap(str, maxW, size, weight) {
    str = String(str ?? '');
    if (/[\r\n]/.test(str)) return str.split(/[\r\n]+/).flatMap(p => wrap(p, maxW, size, weight));
    str = str.replace(/\s+/g, ' ').trim();
    if (!str) return [];
    const words = str.split(' '), lines = []; let cur = '';
    for (const word of words) {
      const probe = cur ? cur + ' ' + word : word;
      if (widthOf(probe, size, weight) <= maxW || !cur) {
        if (widthOf(probe, size, weight) > maxW && !cur) {
          let chunk = '';
          for (const ch of word) { if (widthOf(chunk + ch, size, weight) > maxW && chunk) { lines.push(chunk); chunk = ''; } chunk += ch; }
          cur = chunk;
        } else cur = probe;
      } else { lines.push(cur); cur = word; }
    }
    if (cur) lines.push(cur);
    if (lines.length > 1) {
      const last = lines.at(-1), prev = lines.at(-2);
      if (!last.includes(' ') && widthOf(last, size, weight) < maxW * 0.3) {
        const pw = prev.split(' ');
        if (pw.length > 1) {
          const moved = pw.at(-1) + ' ' + last;
          if (widthOf(moved, size, weight) <= maxW) { lines[lines.length - 2] = pw.slice(0, -1).join(' '); lines[lines.length - 1] = moved; }
        }
      }
    }
    return lines;
  }

  /* ---------- Данные ---------- */
  const xml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const f = n => Math.round(n * 1000) / 1000;
  const extDigits = v => String(v || '').replace(/\D/g, '');

  function splitName(full, lang) {
    const p = String(full || '').trim().split(/\s+/).filter(Boolean);
    if (lang === 'ru') {
      if (p.length >= 3) return { lastName: p[0], firstName: p[1], middleName: p.slice(2).join(' ') };
      return { lastName: p[0] || '', firstName: p[1] || '', middleName: '' };
    }
    if (p.length >= 2) return { firstName: p[0], middleName: p.slice(1, -1).join(' '), lastName: p.at(-1) };
    return { firstName: p[0] || '', middleName: '', lastName: '' };
  }

  /** vCard для стороны. mode: vcard (полная) | short (без адреса). */
  function vcardFor(d, side, mode = 'vcard') {
    const ext = extDigits(d.ext);
    return UT.qr.vcard({
      ...splitName(side.name, side.lang), fullName: side.name, org: side.company || d.brand.company, title: side.title,
      phones: [{ type: 'CELL', value: d.mobile }, { type: 'WORK,VOICE', value: d.work, ext }],
      email: d.email, url: d.site, address: mode === 'short' ? '' : side.address,
      telegram: d.telegram, whatsapp: d.waPhone,
      extras: [ext && { label: side.lang === 'ru' ? 'Добавочный' : 'Extension', value: ext }, d.wechat && { label: 'WeChat', value: d.wechat }, d.waUser && { label: 'WhatsApp', value: d.waUser }].filter(Boolean)
    });
  }

  function rowsFor(d, side, index) {
    const show = d.show || defaultShow(), r = [], L = LANG[side.lang] || LANG.en;
    const on = k => show[k] !== false;
    if (side.address && on('address')) r.push({ icon: 'pin', text: side.address, addr: true });
    if (d.mobile && on('mobile')) r.push({ icon: 'phone', text: d.mobile });
    const swap = index === 1 && show.side2Wechat && d.wechat;
    if (swap) r.push({ icon: 'wechat', text: d.wechat, link: true });
    else if (d.work && on('work')) r.push({ icon: 'deskphone', text: d.work + (extDigits(d.ext) ? ` ${L.ext} ${extDigits(d.ext)}` : '') });
    if (d.telegram && on('telegram')) r.push({ icon: 'telegram', text: String(d.telegram).replace(/^https?:\/\/t\.me\//i, '@').replace(/^(?!@)/, '@'), link: true });
    if (d.wechat && on('wechat') && !swap) r.push({ icon: 'wechat', text: d.wechat, link: true });
    if ((d.waUser || d.waPhone) && on('whatsapp')) r.push({ icon: 'whatsapp', text: d.waUser || d.waPhone, link: !!d.waUser });
    if (d.email && on('email')) r.push({ icon: 'mail', text: d.email });
    if (d.site && on('site')) r.push({ icon: 'globe', text: String(d.site).replace(/^https?:\/\//i, '').replace(/\/$/, '') });
    return r;
  }

  /* ---------- Части SVG ---------- */
  function iconSVG(name, cx, cy, dd, color) {
    const r = dd / 2, ringW = Math.max(0.13, dd * 0.042);
    let out = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r - ringW / 2)}" fill="#FFFFFF" stroke="${color}" stroke-width="${f(ringW)}"/>`;
    const ic = ICONS[name]; if (!ic) return out;
    const bb = ic.bb, g = Math.max(bb[2] - bb[0], bb[3] - bb[1]), strokeMM = dd * 0.056;
    const sc = (dd * 0.575 - strokeMM) / g, tx = cx - (bb[0] + bb[2]) / 2 * sc, ty = cy - (bb[1] + bb[3]) / 2 * sc;
    out += `<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(sc)})" fill="${ic.fillBg || 'none'}" stroke="${color}" stroke-width="${f(strokeMM / sc)}" stroke-linecap="round" stroke-linejoin="round">${ic.s.map(p => `<path d="${p}"/>`).join('')}</g>`;
    if (ic.d) out += `<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(sc)})" fill="${color}">${ic.d.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.95"/>`).join('')}</g>`;
    return out;
  }

  /** Логотип (картинка) или словесный знак из названия компании. Возвращает { svg, h } или null. */
  function brandMark(d, side, x, y, maxW) {
    const logo = d.brand.logo;
    if (logo?.src && logo.w && logo.h) {
      let w = maxW, h = w * logo.h / logo.w;
      if (h > G.logoMaxH) { h = G.logoMaxH; w = h * logo.w / logo.h; }
      return { w, h, svg: (yy) => `<image href="${logo.src}" x="${f(x)}" y="${f(yy)}" width="${f(w)}" height="${f(h)}" preserveAspectRatio="xMinYMid meet"/>` };
    }
    const name = (side.company || d.brand.company || '').trim();
    if (!name) return null;
    const size = Math.min(4.6, maxW / Math.max(1e-6, widthOf(name, 1, 700)));
    return { w: widthOf(name, size, 700), h: size * 0.82, svg: (yy) => `<text x="${f(x)}" y="${f(yy + size * 0.76)}" font-family="${family}" font-weight="700" font-size="${f(size)}" fill="${d.brand.accent}" style="font-kerning:none">${xml(name)}</text>` };
  }

  /* ---------- Сборка карточки ---------- */
  function buildCard(d, index, opt = {}) {
    const side = d.sides[index];
    const C = { accent: d.brand.accent, name: d.brand.nameColor, text: d.brand.textColor };
    const ds = clampDesign(d.design);
    const uid = 's' + index + '_' + Math.floor(Math.random() * 1e6);
    const bleed = opt.bleed ? 3 : 0, W = G.W + bleed * 2, H = G.H + bleed * 2;
    const availV = G.H - G.padT - G.padB;
    const hasQR = d.qrMode !== 'none';

    /* --- левая колонка: логотип и QR --- */
    const qrS = ds.qrMM;
    const mark = brandMark(d, side, G.padL, 0, qrS);
    const hasLeft = hasQR || !!mark;
    let logoY = 0, qrY = 0;
    if (hasLeft) {
      if (hasQR) {
        const logoH = mark ? mark.h : 0;
        let gap = mark ? G.logoQrGap : 0;
        if (logoH + gap + qrS > availV) gap = Math.max(G.logoQrGapMin, availV - logoH - qrS);
        const leftH = logoH + gap + qrS, top = G.padT + Math.max(0, availV - leftH) * 0.45;
        logoY = top; qrY = top + logoH + gap;
      } else logoY = G.padT + (availV - mark.h) / 2;
    }
    const leftW = hasQR ? qrS : (mark ? mark.w : 0);
    const divX = hasLeft ? Math.min(G.divMaxX, Math.max(G.divMinX, G.padL + leftW + G.qrToDiv)) : 0;
    const colX = hasLeft ? divX + G.divToCol : G.padL;
    const textRight = G.W - G.padR, headW = textRight - colX;

    /* --- правая колонка: подбор масштаба, чтобы всё поместилось --- */
    const rows = rowsFor(d, side, index);
    const twoLineName = !!d.show?.nameTwoLines;
    const ADDR_MAX_LINES = 2, ADDR_MIN = 0.7, SHORT_MIN = 0.85;
    const kMin = Math.max(0.55, Math.min(1, Math.max(3.5 / (ds.namePt * PT), 1.9 / (ds.titlePt * PT), 2.0 / (ds.contactPt * PT))));
    let lay = null, k = 1, t = 1, overflow = false, addrScale = 1, shortScale = 1;
    const tStart = opt.forceT ?? 1;
    for (let step = Math.round(tStart * 50); step >= 0; step--) {
      t = step / 50;
      const mix = (a, b) => b + (a - b) * t;
      k = mix(1, kMin);
      const iconDt = Math.max(3.0, mix(ds.iconMM, Math.max(3.0, ds.iconMM * 0.62)));
      const textXt = colX + iconDt + iconDt * G.iconGapK, textWt = textRight - textXt;
      const padVt = mix(G.rowPadV, 0.15), gapNT = mix(G.gapNameTitle, 0.3), gapTR = mix(G.gapTitleRows, 1.4);
      const leadN = mix(G.nameLead, 1.0), leadT = mix(G.titleLead, 1.08), leadC = mix(G.contactLead, 1.14);
      const nameSize = ds.namePt * PT * k, titleSize = ds.titlePt * PT * k, rowText = Math.max(2.0, ds.contactPt * PT * k);
      const nameLines = nameLinesFor(side.name, twoLineName, headW, nameSize, 700);
      const titleLines = wrapBalanced(side.title, headW, titleSize, 700);
      let h = nameLines.length * nameSize * leadN;
      if (titleLines.length) h += gapNT + titleLines.length * titleSize * leadT;
      let sShort = opt.forceShort ?? 1;
      if (opt.forceShort === undefined) for (const row of rows) {
        if (row.addr) continue;
        const ww = widthOf(row.text, rowText, 400);
        if (ww > textWt) sShort = Math.min(sShort, Math.max(SHORT_MIN, textWt / ww));
      }
      shortScale = sShort;
      const rowLines = [], rowHs = [], rowSizes = []; let rowsH = 0;
      for (const row of rows) {
        let fsz, lines;
        if (row.addr) {
          const aMin = opt.forceAddr ?? ADDR_MIN, aStart = opt.forceAddr ?? 1;
          for (let a = Math.round(aStart * 100); a >= Math.round(aMin * 100); a--) {
            fsz = rowText * (a / 100); lines = wrapBalanced(row.text, textWt, fsz, 400);
            if (lines.length <= ADDR_MAX_LINES || a === Math.round(aMin * 100)) break;
          }
          addrScale = fsz / rowText;
        } else { fsz = rowText * sShort; lines = wrapBalanced(row.text, textWt, fsz, 400); }
        const rh = Math.max(iconDt, lines.length * fsz * leadC) + 2 * padVt;
        rowLines.push(lines); rowHs.push(rh); rowSizes.push(fsz); rowsH += rh;
      }
      if (rows.length) h += gapTR + rowsH;
      const fits = h <= availV;
      if (fits || step === 0 || opt.forceT !== undefined) {
        overflow = !fits;
        lay = { nameSize, titleSize, nameLines, titleLines, rowLines, rowHs, rowSizes, h, iconD: iconDt, textX: textXt, gapNT, gapTR, leadN, leadT, leadC };
        break;
      }
    }

    let body = '', defs = '';
    if (mark) body += mark.svg(logoY);
    let vcardText = '';
    if (hasQR) {
      const payload = d.qrMode === 'url' ? UT.qr.payload.url(d.site) || ' ' : (vcardText = vcardFor(d, side, d.qrMode));
      const q = UT.qr.svgParts(UT.qr.matrix(payload, d.ecc || 'L'), { x: G.padL, y: qrY, size: qrS, color: d.brand.qrTop, color2: d.brand.qrBottom, id: 'qg_' + uid });
      defs += q.defs; body += q.body;
    }
    if (hasLeft) body += `<rect x="${f(divX)}" y="${f(G.padT + 1.2)}" width="${f(G.divW)}" height="${f(availV - 2.4)}" fill="${C.accent}"/>`;

    let y = G.padT + Math.max(0, availV - lay.h) * 0.30;
    const txt = (x, yy, size, weight, color, s) => `<text x="${f(x)}" y="${f(yy)}" font-family="${family}" font-weight="${weight}" font-size="${f(size)}" fill="${color}" style="font-kerning:none">${xml(s)}</text>`;
    lay.nameLines.forEach((line, i) => { body += txt(colX, y + lay.nameSize * lay.leadN * i + lay.nameSize * 0.76, lay.nameSize, 700, C.name, line); });
    y += lay.nameLines.length * lay.nameSize * lay.leadN;
    if (lay.titleLines.length) {
      y += lay.gapNT;
      lay.titleLines.forEach((line, i) => { body += txt(colX, y + lay.titleSize * lay.leadT * i + lay.titleSize * 0.78, lay.titleSize, 700, C.text, line); });
      y += lay.titleLines.length * lay.titleSize * lay.leadT;
    }
    if (rows.length) {
      y += lay.gapTR;
      rows.forEach((row, ri) => {
        const lines = lay.rowLines[ri], rh = lay.rowHs[ri], fsz = lay.rowSizes[ri];
        body += iconSVG(row.icon, colX + lay.iconD / 2, y + rh / 2, lay.iconD, C.accent);
        const blockTop = y + (rh - lines.length * fsz * lay.leadC) / 2;
        lines.forEach((line, li) => {
          const bl = blockTop + fsz * lay.leadC * (li + 0.5) + fsz * 0.35;
          body += txt(lay.textX, bl, fsz, 400, C.text, line);
          if (row.link && d.show?.underline !== false) body += `<rect x="${f(lay.textX)}" y="${f(bl + fsz * 0.19)}" width="${f(widthOf(line, fsz, 400))}" height="${f(fsz * 0.06)}" fill="${C.text}"/>`;
        });
        y += rh;
        if (ri < rows.length - 1) body += `<rect x="${f(lay.textX)}" y="${f(y - G.ruleW / 2)}" width="${f(textRight - lay.textX)}" height="${f(G.ruleW)}" fill="${G.ruleColor}"/>`;
      });
    }

    const inner = `<g transform="translate(${bleed} ${bleed})">${body}</g>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" viewBox="0 0 ${f(W)} ${f(H)}"><defs>${defs}</defs><rect width="${f(W)}" height="${f(H)}" fill="${d.brand.paper || '#FFFFFF'}"/>${inner}</svg>`;
    return { svg, inner, defs, W, H, scale: k, t, vcard: vcardText, overflow, tight: t < 0.999, addrScale, shortScale };
  }

  /** Все включённые стороны с общим масштабом, чтобы они выглядели одинаково. */
  function buildSides(d, opt = {}) {
    const idx = d.sides.map((s, i) => i).filter(i => i === 0 || d.sides[i].enabled);
    let cards = idx.map(i => buildCard(d, i, opt));
    const t = Math.min(...cards.map(c => c.t)), ad = Math.min(...cards.map(c => c.addrScale)), sh = Math.min(...cards.map(c => c.shortScale));
    if (cards.length > 1 && cards.some(c => Math.abs(c.t - t) > 1e-4 || Math.abs(c.addrScale - ad) > 1e-4 || Math.abs(c.shortScale - sh) > 1e-4))
      cards = idx.map(i => buildCard(d, i, { ...opt, forceT: t, forceAddr: ad, forceShort: sh }));
    return { cards, idx, scale: Math.min(...cards.map(c => c.scale)), tight: t < 0.999, overflow: cards.some(c => c.overflow), lock: { forceT: t, forceAddr: ad, forceShort: sh } };
  }

  UT.card = { FONTS, LANG, DESIGN, SHOW_FIELDS, defaultDesign, defaultShow, clampDesign, useFont, buildCard, buildSides, vcardFor, splitName, widthOf };
})();
