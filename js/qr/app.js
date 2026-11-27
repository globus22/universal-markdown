/* [QR] QR Studio: данные по типам, дизайн, логотип, подпись, экспорт. */
(() => {
  'use strict';
  const { qr: QR } = window.UT;
  const $ = id => document.getElementById(id);
  const STORE = 'ut-qr-v1';

  /* Типы и их поля. build(values) → строка, которую кодируем. */
  const TYPES = {
    url: { label: 'Ссылка', fields: [['url', 'Адрес страницы', 'text', 'https://example.ru']], build: v => QR.payload.url(v.url) },
    text: { label: 'Текст', fields: [['text', 'Текст', 'textarea', 'Любой текст до ~1000 символов']], build: v => v.text },
    wifi: {
      label: 'Wi-Fi', fields: [['ssid', 'Название сети', 'text', 'MyWiFi'], ['password', 'Пароль', 'text', ''], ['security', 'Защита', 'select', [['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP'], ['nopass', 'Без пароля']]], ['hidden', 'Скрытая сеть', 'check']],
      build: v => QR.payload.wifi(v), hint: 'Наведите камеру — телефон предложит подключиться без ввода пароля.'
    },
    vcard: {
      label: 'Контакт', fields: [['lastName', 'Фамилия', 'text', ''], ['firstName', 'Имя', 'text', ''], ['org', 'Компания', 'text', ''], ['title', 'Должность', 'text', ''], ['phone', 'Телефон', 'tel', '+7 900 000-00-00'], ['email', 'E-mail', 'text', ''], ['url', 'Сайт', 'text', ''], ['address', 'Адрес', 'text', '']],
      build: v => QR.vcard({ ...v, phones: [{ type: 'CELL', value: v.phone }], fullName: [v.firstName, v.lastName].filter(Boolean).join(' ') }),
      hint: 'Для печатной визитки с QR-контактом есть <a href="./card.html">генератор визиток</a>.'
    },
    email: { label: 'Почта', fields: [['to', 'Кому', 'text', 'name@example.ru'], ['subject', 'Тема', 'text', ''], ['body', 'Текст письма', 'textarea', '']], build: v => QR.payload.email(v) },
    tel: { label: 'Звонок', fields: [['phone', 'Номер телефона', 'tel', '+7 900 000-00-00']], build: v => QR.payload.tel(v.phone) },
    sms: { label: 'SMS', fields: [['phone', 'Номер', 'tel', '+7 900 000-00-00'], ['text', 'Текст сообщения', 'textarea', '']], build: v => QR.payload.sms(v) },
    geo: { label: 'Геоточка', fields: [['lat', 'Широта', 'text', '55.7539'], ['lon', 'Долгота', 'text', '37.6208']], build: v => QR.payload.geo(v), hint: 'Координаты можно скопировать из Яндекс Карт или Google Maps (правый клик по точке).' },
    telegram: { label: 'Telegram', fields: [['user', 'Ник, канал или ссылка', 'text', '@username']], build: v => QR.payload.telegram(v.user) },
    whatsapp: { label: 'WhatsApp', fields: [['phone', 'Номер', 'tel', '+7 900 000-00-00'], ['text', 'Готовое сообщение', 'text', 'Здравствуйте!']], build: v => QR.payload.whatsapp(v) }
  };

  const PRESETS = [
    ['#132018', '#132018', '#ffffff'], ['#174f36', '#2eaa69', '#ffffff'], ['#000000', '#2e8b57', '#ffffff'],
    ['#1b3a8a', '#4f7cff', '#ffffff'], ['#5b1a8b', '#d63384', '#ffffff'], ['#ffffff', '#ffffff', '#132018']
  ];

  let type = 'url', values = {}, logo = null, lastSvg = '', lastSize = 0;

  /* ---------- Форма ---------- */
  function renderTabs() {
    $('typeTabs').innerHTML = Object.entries(TYPES).map(([k, t]) => `<button type="button" role="tab" class="type-tab${k === type ? ' on' : ''}" data-type="${k}" aria-selected="${k === type}">${t.label}</button>`).join('');
  }
  function renderFields() {
    const t = TYPES[type], v = values[type] || {};
    $('dataForm').innerHTML = t.fields.map(([key, label, kind, extra]) => {
      const val = v[key] ?? '';
      if (kind === 'textarea') return `<label class="field">${label}<textarea data-k="${key}" rows="3" placeholder="${extra || ''}">${escapeHtml(val)}</textarea></label>`;
      if (kind === 'select') return `<label class="field">${label}<select data-k="${key}">${extra.map(([o, l]) => `<option value="${o}"${val === o ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
      if (kind === 'check') return `<label class="check"><input type="checkbox" data-k="${key}"${val ? ' checked' : ''}> ${label}</label>`;
      return `<label class="field">${label}<input type="text" data-k="${key}" value="${escapeHtml(val)}" placeholder="${extra || ''}"${kind === 'tel' ? ' inputmode="tel"' : ''}></label>`;
    }).join('') + (t.hint ? `<p class="helper">${t.hint}</p>` : '');
  }
  const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function readFields() {
    const v = {};
    for (const el of $('dataForm').querySelectorAll('[data-k]')) v[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
    values[type] = v;
    return v;
  }

  $('typeTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-type]'); if (!b) return;
    readFields(); type = b.dataset.type; renderTabs(); renderFields(); render();
  });
  $('presets').innerHTML = PRESETS.map((p, i) => `<button type="button" class="preset" data-p="${i}" title="Сочетание ${i + 1}" style="background:linear-gradient(135deg,${p[0]} 0 50%,${p[1]} 50% 100%);box-shadow:inset 0 0 0 3px ${p[2]}"></button>`).join('');
  $('presets').addEventListener('click', e => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    const [c1, c2, bg] = PRESETS[+b.dataset.p];
    $('color').value = c1; $('color2').value = c2; $('bg').value = bg; $('useGradient').checked = c1 !== c2; render();
  });

  /* ---------- Логотип ---------- */
  $('logoInput').addEventListener('change', e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => { logo = { src: r.result, w: img.naturalWidth || 100, h: img.naturalHeight || 100 }; showLogo(); render(); }; img.src = r.result; };
    r.readAsDataURL(file);
  });
  $('logoRemove').addEventListener('click', () => { logo = null; showLogo(); render(); });
  function showLogo() { $('logoBox').innerHTML = logo ? `<img src="${logo.src}" alt="">` : '<span>Логотип</span>'; $('logoBox').classList.toggle('has', !!logo); }

  /* ---------- Контраст ---------- */
  function lum(hex) {
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  }
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };

  /* ---------- Сборка SVG ---------- */
  function build() {
    const v = readFields();
    const data = TYPES[type].build(v) || '';
    const empty = !String(data).replace(/^https:\/\/$/, '').trim() || /^(tel:|mailto:)$/.test(data);
    const eccSel = $('ecc').value, ecc = eccSel === 'auto' ? (logo ? 'H' : 'M') : eccSel;
    let m;
    try { m = QR.matrix(empty ? 'https://' : data, ecc); }
    catch { return { error: 'Слишком много данных для одного QR-кода. Сократите текст.' }; }
    const n = m.length, quiet = +$('quiet').value, unit = 10, size = (n + quiet * 2) * unit;
    const caption = $('caption').value.trim(), capH = caption ? Math.round(size * .14) : 0;
    const transparent = $('transparent').checked, bg = $('bg').value;
    // Логотип: площадь ≈ logoK² от кода (широкий логотип — шире, но ниже), вокруг — свободное поле в 1 модуль.
    const logoK = +$('logoSize').value / 100, inner = n * unit;
    let lw = 0, lh = 0;
    if (logo) {
      const ar = Math.min(4, Math.max(.25, logo.w / logo.h)), area = (inner * logoK) ** 2;
      lw = Math.min(inner * .42, Math.sqrt(area * ar)); lh = Math.min(inner * .42, lw / ar); lw = lh * ar;
    }
    const parts = QR.svgParts(m, {
      size, quiet, style: $('style').value, eye: $('eye').value, color: $('color').value,
      color2: $('useGradient').checked ? $('color2').value : null, id: 'g',
      hole: logo ? { w: (lw + unit * 2) / inner, h: (lh + unit * 2) / inner } : null
    });
    let body = parts.body, H = size + capH;
    if (logo) {
      const x = (size - lw) / 2, y = (size - lh) / 2;
      body += `<image href="${logo.src}" x="${x}" y="${y}" width="${lw}" height="${lh}" preserveAspectRatio="xMidYMid meet"/>`;
    }
    if (caption) {
      const fs = capH * .5;
      body += `<text x="${size / 2}" y="${size + capH * .45}" text-anchor="middle" font-family="Inter,Arial,Helvetica,sans-serif" font-weight="700" font-size="${fs}" fill="${$('color').value}">${escapeHtml(caption)}</text>`;
    }
    const bgRect = transparent ? '' : `<rect width="${size}" height="${H}" fill="${bg}"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${H}" viewBox="0 0 ${size} ${H}"><defs>${parts.defs}</defs>${bgRect}${body}</svg>`;
    return { svg, size, H, n, ecc, data, empty, bytes: new TextEncoder().encode(data).length };
  }

  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(render, 80); };

  function render() {
    const r = build(), warn = $('warn');
    $('logoSizeVal').textContent = $('logoSize').value + '%';
    $('quietVal').textContent = $('quiet').value + ' ' + (+$('quiet').value === 1 ? 'модуль' : +$('quiet').value < 5 && +$('quiet').value > 0 ? 'модуля' : 'модулей');
    $('color2').disabled = !$('useGradient').checked;
    if (r.error) { warn.textContent = r.error; warn.className = 'notice show error'; return; }
    lastSvg = r.svg; lastSize = [r.size, r.H];
    $('qrOut').innerHTML = r.svg;
    $('stage').classList.toggle('empty', r.empty);
    $('stage').classList.toggle('checker', $('transparent').checked);
    $('meta').innerHTML = r.empty ? 'Заполните поля слева' : `<span>${r.n}×${r.n} модулей</span><span>коррекция ${r.ecc}</span><span>${r.bytes} байт</span>`;
    const issues = [];
    const fg = $('color').value, bg = $('transparent').checked ? '#ffffff' : $('bg').value;
    const c = Math.min(contrast(fg, bg), $('useGradient').checked ? contrast($('color2').value, bg) : 99);
    if (c < 3) issues.push('Цвета кода и фона слишком близки — камера может не прочитать код.');
    if (lum(fg) > lum(bg)) issues.push('Светлый код на тёмном фоне читают не все сканеры. Надёжнее тёмный код на светлом.');
    if (logo && +$('logoSize').value > 26 && r.ecc !== 'H') issues.push('Крупный логотип лучше использовать с коррекцией H.');
    if (+$('quiet').value < 2) issues.push('Без белого поля вокруг код хуже читается — оставьте хотя бы 2–4 модуля.');
    if (r.n > 77) issues.push('Код очень плотный. Для печати мелким размером сократите данные.');
    warn.textContent = issues.join(' ');
    warn.className = issues.length ? 'notice show warning' : 'notice';
    try { localStorage.setItem(STORE, JSON.stringify({ type, values, design: Object.fromEntries(DESIGN_IDS.map(id => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value])) })); } catch {}
  }

  /* ---------- Экспорт ---------- */
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  const fileName = ext => `qr-${type}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  function raster(mime, fillBg) {
    return new Promise((resolve, reject) => {
      const target = +$('pngSize').value, k = target / lastSize[0];
      const w = Math.round(lastSize[0] * k), h = Math.round(lastSize[1] * k);
      const img = new Image(), url = URL.createObjectURL(new Blob([lastSvg], { type: 'image/svg+xml' }));
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (fillBg) { ctx.fillStyle = $('transparent').checked ? '#ffffff' : $('bg').value; ctx.fillRect(0, 0, w, h); }
        ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url); c.toBlob(b => b ? resolve(b) : reject(new Error('Не удалось создать картинку')), mime, .95);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось отрисовать код')); };
      img.src = url;
    });
  }
  $('pngBtn').addEventListener('click', async () => download(await raster('image/png', false), fileName('png')));
  $('jpgBtn').addEventListener('click', async () => download(await raster('image/jpeg', true), fileName('jpg')));
  $('svgBtn').addEventListener('click', () => download(new Blob([lastSvg], { type: 'image/svg+xml' }), fileName('svg')));
  $('copyBtn').addEventListener('click', async () => {
    const btn = $('copyBtn');
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': raster('image/png', false) })]); btn.textContent = 'Скопировано ✓'; }
    catch { btn.textContent = 'Не поддерживается'; }
    setTimeout(() => btn.textContent = 'Копировать', 1600);
  });

  /* ---------- Состояние ---------- */
  const DESIGN_IDS = ['style', 'eye', 'color', 'color2', 'bg', 'useGradient', 'transparent', 'logoSize', 'caption', 'ecc', 'quiet', 'pngSize'];
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s) {
      if (TYPES[s.type]) type = s.type;
      values = s.values || {};
      for (const id of DESIGN_IDS) if (s.design?.[id] !== undefined) { if ($(id).type === 'checkbox') $(id).checked = s.design[id]; else $(id).value = s.design[id]; }
    }
  } catch {}

  document.querySelector('.qr-form').addEventListener('input', schedule);
  document.querySelector('.qr-form').addEventListener('change', schedule);
  $('pngSize').addEventListener('change', () => { try { const s = JSON.parse(localStorage.getItem(STORE)); s.design.pngSize = $('pngSize').value; localStorage.setItem(STORE, JSON.stringify(s)); } catch {} });
  renderTabs(); renderFields(); showLogo(); render();
})();
