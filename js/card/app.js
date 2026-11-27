/* [VCF] Интерфейс генератора визиток и подписей. */
(() => {
  'use strict';
  const { card: CARD, signature: SIG, qr: QR } = window.UT;
  const $ = id => document.getElementById(id);
  const STORE = 'ut-card-v1';

  const BRAND_FIELDS = ['company', 'site', 'accent', 'nameColor', 'textColor', 'qrTop', 'qrBottom', 'font'];
  const CONTACT_FIELDS = ['mobile', 'email', 'work', 'ext', 'telegram', 'wechat', 'waUser', 'waPhone'];
  const OTHER_FIELDS = ['qrMode', 'printMode', 'copies', 'printSide', 'logoUrl'];

  let logo = null;          // { src, w, h } — для визитки
  let logoPng = null;       // base64 PNG 280 px — для подписи
  let current = null;       // последняя сборка
  let sigList = [];
  let client = 'outlook-win';

  /* ---------- Уведомления ---------- */
  let noticeTimer;
  function notice(text, type = 'info', ms = 4000) {
    const n = $('notice'); n.textContent = text; n.className = 'notice show ' + type;
    clearTimeout(noticeTimer); if (ms) noticeTimer = setTimeout(() => n.className = 'notice', ms);
  }

  /* ---------- Телефоны: аккуратный формат для российских номеров, остальные — как ввели ---------- */
  function formatPhone(v) {
    const raw = String(v || '').trim(); let d = raw.replace(/\D/g, '');
    if (d.length === 10 && d[0] === '9') d = '7' + d;
    if (d.length === 11 && (d[0] === '7' || d[0] === '8') && !/^\+(?!7)/.test(raw)) {
      d = '7' + d.slice(1);
      return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
    }
    return raw;
  }

  /* ---------- Элементы управления из описаний ---------- */
  function buildControls() {
    $('showBox').innerHTML = CARD.SHOW_FIELDS.map(f => `<label class="check"><input type="checkbox" data-show="${f.key}"${f.def ? ' checked' : ''}> ${f.label}</label>`).join('');
    $('designBox').innerHTML = Object.entries(CARD.DESIGN).map(([k, c]) =>
      `<label class="range-label" for="ds_${k}"><span>${c.label}</span><output id="val_${k}"></output></label><input type="range" id="ds_${k}" data-design="${k}" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.def}">`).join('');
  }
  const readDesign = () => CARD.clampDesign(Object.fromEntries([...document.querySelectorAll('[data-design]')].map(el => [el.dataset.design, parseFloat(el.value)])));
  const readShow = () => ({ ...CARD.defaultShow(), ...Object.fromEntries([...document.querySelectorAll('[data-show]')].map(el => [el.dataset.show, el.checked])) });
  function writeDesign(ds) { for (const k in ds) { const el = document.querySelector(`[data-design="${k}"]`); if (el) el.value = ds[k]; } updateDesignLabels(); }
  function writeShow(sh) { for (const el of document.querySelectorAll('[data-show]')) if (sh[el.dataset.show] !== undefined) el.checked = !!sh[el.dataset.show]; }
  function updateDesignLabels() { const ds = readDesign(); for (const k in CARD.DESIGN) $('val_' + k).textContent = (Math.round(ds[k] * 10) / 10) + ' ' + CARD.DESIGN[k].unit; }

  /* ---------- Сбор данных ---------- */
  function readSide(i) {
    const box = document.querySelector(`[data-side="${i}"]`), get = k => box.querySelector(`[data-f="${k}"]`);
    return { lang: get('lang').value, company: get('company').value.trim(), name: get('name').value.trim(), title: get('title').value.trim(), address: get('address').value.trim(), enabled: i === 0 ? true : get('enabled').checked };
  }
  function writeSide(i, s) {
    const box = document.querySelector(`[data-side="${i}"]`);
    for (const k of ['lang', 'company', 'name', 'title', 'address']) if (s?.[k] !== undefined) box.querySelector(`[data-f="${k}"]`).value = s[k];
    if (i === 1 && s?.enabled !== undefined) box.querySelector('[data-f="enabled"]').checked = !!s.enabled;
  }

  function collect() {
    const v = id => $(id).value.trim();
    const d = {
      brand: { company: v('company'), accent: $('accent').value, nameColor: $('nameColor').value, textColor: $('textColor').value, qrTop: $('qrTop').value, qrBottom: $('qrBottom').value, font: $('font').value, logo, paper: '#FFFFFF' },
      site: v('site'), qrMode: $('qrMode').value, ecc: 'L',
      sides: [readSide(0), readSide(1)], design: readDesign(), show: readShow()
    };
    for (const k of CONTACT_FIELDS) d[k] = v(k);
    return d;
  }

  /* ---------- Хранение (только в браузере) ---------- */
  function save(d) {
    const data = { ...Object.fromEntries([...BRAND_FIELDS, ...CONTACT_FIELDS, ...OTHER_FIELDS].map(k => [k, $(k).value])), sides: d.sides, design: d.design, show: d.show, logo };
    try { localStorage.setItem(STORE, JSON.stringify(data)); }
    catch { try { localStorage.setItem(STORE, JSON.stringify({ ...data, logo: null })); } catch {} }
  }
  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch {}
    if (!data) return;
    for (const k of [...BRAND_FIELDS, ...CONTACT_FIELDS, ...OTHER_FIELDS]) if (data[k] !== undefined && $(k)) $(k).value = data[k];
    (data.sides || []).forEach((s, i) => writeSide(i, s));
    if (data.design) writeDesign(CARD.clampDesign(data.design));
    if (data.show) writeShow(data.show);
    if (data.logo?.src) setLogo(data.logo, false);
  }

  /* ---------- Логотип ---------- */
  function setLogo(l, rerender = true) {
    logo = l; logoPng = null;
    $('logoBox').innerHTML = l ? `<img src="${l.src}" alt="Логотип">` : '<span>Логотип</span>';
    $('logoBox').classList.toggle('has', !!l);
    if (l) rasterLogo(l).then(b64 => { logoPng = b64; renderSignature(); });
    if (rerender) schedule();
  }

  /** PNG 280 px в ширину (для подписи: показывается 140 px, чётко на Retina). */
  function rasterLogo(l) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const w = 280, h = Math.max(1, Math.round(w * l.h / l.w));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/png').split(',')[1]);
      };
      img.onerror = () => resolve(null);
      img.src = l.src;
    });
  }

  $('logoInput').addEventListener('change', e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { notice('Логотип больше 2 МБ. Сожмите его или используйте SVG.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth || 400, h = img.naturalHeight || 100;
        if (file.type === 'image/svg+xml' && (!img.naturalWidth || !img.naturalHeight)) { w = 400; h = 100; }
        setLogo({ src: reader.result, w, h });
        notice('Логотип добавлен.');
      };
      img.onerror = () => notice('Не удалось открыть изображение логотипа.', 'error');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  $('logoRemove').addEventListener('click', () => setLogo(null));

  /* ---------- Отрисовка ---------- */
  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(render, 120); };

  async function render() {
    const d = collect();
    document.querySelector('.side2-fields').classList.toggle('hidden', !d.sides[1].enabled);
    $('printSide').querySelector('[value="1"]').disabled = !d.sides[1].enabled;
    save(d);
    updateDesignLabels();
    await CARD.useFont(d.brand.font);
    let res;
    try { res = CARD.buildSides(d); } catch (err) { console.error(err); notice('Не удалось собрать визитку: ' + err.message, 'error'); return; }
    current = { d, res };
    $('cardsBox').innerHTML = res.idx.map((i, n) => `
      <div class="side-card">
        <div class="cap">${i === 0 ? 'Лицевая сторона' : 'Оборотная сторона'} · ${CARD.LANG[d.sides[i].lang]?.label || ''}</div>
        <div class="paper">${res.cards[n].svg}</div>
        <div class="row-btns"><button type="button" class="btn line sm" data-png="${i}">PNG 1200 dpi</button><button type="button" class="btn line sm" data-svg="${i}">SVG</button></div>
      </div>`).join('');
    const note = $('fitNote');
    note.classList.toggle('hidden', !res.tight);
    if (res.tight) note.textContent = `Данных много: текст уменьшен на ${Math.round((1 - res.scale) * 100)}%, чтобы всё поместилось. Сократите должность или адрес либо отключите часть строк в разделе 05.`;
    renderSignature();
    renderClients();
  }

  /* ---------- Подписи ---------- */
  function sigContext(forCopy) {
    const d = current.d, f = CARD.FONTS[d.brand.font] || CARD.FONTS.montserrat;
    const url = $('logoUrl').value.trim();
    const src = forCopy && url ? url : logoPng ? 'data:image/png;base64,' + logoPng : url || null;
    return { ctx: { font: f.css, accent: d.brand.accent, logoWidth: 140 }, logo: src ? { src, width: 140 } : null };
  }

  function renderSignature() {
    if (!current) return;
    const { ctx, logo: lg } = sigContext(true);
    sigList = SIG.buildAll(current.d, ctx, () => lg);
    const pick = $('sigPick'), prev = pick.value;
    pick.innerHTML = sigList.map((s, i) => `<option value="${i}">${CARD.LANG[s.lang]?.label || s.lang} — ${s.label}</option>`).join('');
    if (prev && +prev < sigList.length) pick.value = prev;
    const s = sigList[+pick.value || 0];
    $('sigPreview').innerHTML = s ? s.body : '';
  }

  const CLIENTS = {
    'outlook-win': {
      label: 'Outlook для Windows',
      html: () => `<ol><li>Скачайте архив и распакуйте его.</li><li>Запустите файл <b>Install_…_Signatures.cmd</b> — он установит все варианты подписи сразу.</li><li>Перезапустите Outlook: <i>Файл → Параметры → Почта → Подписи</i> и выберите подпись.</li></ol>
        <div class="row-btns"><button type="button" class="btn solid sm" data-act="zip">Скачать установщик (ZIP)</button><button type="button" class="btn line sm" data-act="ps1">Только .ps1</button><button type="button" class="btn line sm" data-act="cmd">Только .cmd</button><button type="button" class="btn line sm" data-act="readme">Инструкция</button></div>
        <p class="helper">Если антивирус блокирует .cmd: скачайте только .ps1 в «Загрузки», откройте PowerShell и выполните <code>powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\\Downloads\\${SIG.fileStem(current.d)}_Signatures.ps1"</code></p>`
    },
    'outlook-new': {
      label: 'Новый Outlook и Outlook в браузере',
      html: () => `<ol><li>Нажмите «Скопировать подпись».</li><li>Откройте <i>Параметры → Учётные записи → Подписи</i> (в браузере: шестерёнка → <i>Почта → Создание и ответ</i>).</li><li>Создайте подпись, вставьте <kbd>Ctrl</kbd>+<kbd>V</kbd> и сохраните.</li></ol>${copyButtons()}`
    },
    'outlook-mac': {
      label: 'Outlook для Mac',
      html: () => `<ol><li>Нажмите «Скопировать подпись».</li><li>В Outlook: <i>Outlook → Настройки → Подписи</i>, нажмите «+».</li><li>Вставьте <kbd>⌘</kbd>+<kbd>V</kbd>, задайте имя и закройте окно — подпись сохранится.</li></ol>${copyButtons()}`
    },
    gmail: {
      label: 'Gmail',
      html: () => `<ol><li>Укажите ниже ссылку на логотип в интернете — Gmail не сохраняет вставленные картинки.</li><li>Нажмите «Скопировать подпись».</li><li>Gmail: шестерёнка → <i>Все настройки → Общие → Подпись</i> → «Создать», вставьте <kbd>Ctrl</kbd>+<kbd>V</kbd>, внизу «Сохранить изменения».</li></ol>${copyButtons()}`
    },
    yandex: {
      label: 'Яндекс Почта',
      html: () => `<ol><li>Укажите ссылку на логотип в интернете (иначе он не сохранится).</li><li>Нажмите «Скопировать подпись».</li><li>Яндекс Почта: шестерёнка → <i>Все настройки → Личные данные, подпись, портрет</i> → «Добавить подпись», вставьте и сохраните.</li></ol>${copyButtons()}`
    },
    mailru: {
      label: 'Mail.ru',
      html: () => `<ol><li>Укажите ссылку на логотип в интернете.</li><li>Нажмите «Скопировать подпись».</li><li>Mail.ru: <i>Настройки → Имя отправителя и подпись</i>, вставьте подпись и сохраните.</li></ol>${copyButtons()}`
    },
    apple: {
      label: 'Apple Mail (Mac, iPhone)',
      html: () => `<ol><li>Нажмите «Скопировать подпись».</li><li>Mac: <i>Почта → Настройки → Подписи</i>, «+», снимите «Всегда использовать мой шрифт по умолчанию» и вставьте <kbd>⌘</kbd>+<kbd>V</kbd>.</li><li>iPhone: подписи iOS не поддерживают оформление — используйте компактный вариант как обычный текст: <i>Настройки → Почта → Подпись</i>.</li></ol>${copyButtons(true)}`
    },
    thunderbird: {
      label: 'Thunderbird',
      html: () => `<ol><li>Скачайте файл подписи .htm.</li><li>Thunderbird: <i>Настройки учётной записи</i> → отметьте «Вставлять подпись из файла» и выберите скачанный файл.</li><li>Либо отметьте «Использовать HTML», скопируйте подпись и вставьте код.</li></ol><div class="row-btns"><button type="button" class="btn solid sm" data-act="htm">Скачать .htm</button><button type="button" class="btn line sm" data-act="copy">Скопировать подпись</button></div>`
    }
  };
  const copyButtons = (text) => `<div class="row-btns"><button type="button" class="btn solid sm" data-act="copy">Скопировать подпись</button>${text ? '<button type="button" class="btn line sm" data-act="copyText">Скопировать текстом</button>' : ''}<button type="button" class="btn line sm" data-act="htm">Скачать .htm</button></div>`;

  function renderClients() {
    $('clientTabs').innerHTML = Object.entries(CLIENTS).map(([k, c]) => `<button type="button" role="tab" class="client-tab${k === client ? ' on' : ''}" data-client="${k}" aria-selected="${k === client}">${c.label}</button>`).join('');
    $('clientBody').innerHTML = current ? CLIENTS[client].html() : '';
  }
  $('clientTabs').addEventListener('click', e => { const b = e.target.closest('[data-client]'); if (!b) return; client = b.dataset.client; renderClients(); });

  /* ---------- Файлы ---------- */
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  const textBlob = (text, bom) => new Blob([bom ? '﻿' : '', text], { type: 'text/plain;charset=utf-8' });
  const who = () => (current.d.sides[0].name || current.d.sides[1].name || current.d.brand.company || 'Подпись').trim();

  function outlookFiles() {
    const { ctx } = sigContext(false);
    return SIG.outlookPackage(current.d, ctx, logoPng, who());
  }
  async function copySignature(plain) {
    const s = sigList[+$('sigPick').value || 0]; if (!s) return;
    const text = s.text.join('\n');
    try {
      if (plain) await navigator.clipboard.writeText(text);
      else await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([s.body], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    } catch {
      // Запасной путь: выделяем превью и копируем как есть.
      const range = document.createRange(); range.selectNodeContents($('sigPreview'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); document.execCommand('copy'); sel.removeAllRanges();
    }
    notice(plain ? 'Подпись скопирована текстом.' : 'Подпись скопирована. Вставьте её в настройках почты.');
  }

  $('clientBody').addEventListener('click', async e => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act || !current) return;
    if (act === 'copy') return copySignature(false);
    if (act === 'copyText') return copySignature(true);
    if (act === 'htm') {
      const s = sigList[+$('sigPick').value || 0];
      const { ctx, logo: lg } = sigContext(false);
      const sig = SIG.buildAll(current.d, ctx, () => lg).find(x => x.name === s.name) || s;
      return download(new Blob([sig.html], { type: 'text/html;charset=utf-8' }), sig.name + '.htm');
    }
    const files = outlookFiles();
    if (act === 'zip') {
      const d = current.d;
      if (!d.sides[0].name) notice('Имя на лицевой стороне не заполнено — подпись получится без имени.', 'warning');
      const zip = new JSZip();
      for (const f of files) zip.file(f.name, (f.bom ? '﻿' : '') + f.text);
      const blob = await zip.generateAsync({ type: 'blob' });
      return download(blob, `${SIG.fileStem(d)}_подписи_Outlook.zip`);
    }
    const f = act === 'ps1' ? files[0] : act === 'cmd' ? files[1] : files[2];
    download(textBlob(f.text, f.bom), f.name);
  });

  /* ---------- Экспорт визитки ---------- */
  const fontCache = new Map();
  async function fontFaceCss(key) {
    if (fontCache.has(key)) return fontCache.get(key);
    const f = CARD.FONTS[key] || CARD.FONTS.montserrat;
    const parts = [];
    for (const w of [400, 700]) for (const sub of ['latin', 'cyrillic']) {
      try {
        const buf = await (await fetch(`./vendor/fonts/${f.files}-${sub}-${w}-normal.woff2`)).arrayBuffer();
        let bin = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
        parts.push(`@font-face{font-family:'${f.family}';font-weight:${w};src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2')}`);
      } catch {}
    }
    const css = parts.join('');
    fontCache.set(key, css);
    return css;
  }
  async function withFonts(svg) {
    const css = await fontFaceCss(current.d.brand.font);
    return svg.replace('<defs>', `<defs><style type="text/css"><![CDATA[${css}]]></style>`);
  }
  const lockedCard = (i, bleed) => CARD.buildCard(current.d, i, { bleed, ...current.res.lock });
  const stemFor = i => {
    const s = current.d.sides[i];
    return ((s.name || current.d.brand.company || 'card').trim().replace(/[^A-Za-zА-Яа-яЁё0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'card') + '_' + s.lang.toUpperCase();
  };

  async function exportSVG(i) {
    const card = lockedCard(i, $('bleed').checked);
    download(new Blob([await withFonts(card.svg)], { type: 'image/svg+xml;charset=utf-8' }), stemFor(i) + '.svg');
  }
  async function exportPNG(i, dpi = 1200) {
    const card = lockedCard(i, $('bleed').checked);
    const wpx = Math.round(card.W / 25.4 * dpi), hpx = Math.round(card.H / 25.4 * dpi);
    const url = URL.createObjectURL(new Blob([await withFonts(card.svg)], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = wpx; cv.height = hpx;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, wpx, hpx); ctx.drawImage(img, 0, 0, wpx, hpx);
      URL.revokeObjectURL(url);
      cv.toBlob(b => download(b, `${stemFor(i)}_${dpi}dpi.png`), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); notice('Не удалось растрировать визитку. Попробуйте SVG или печать в PDF.', 'error'); };
    img.src = url;
  }
  $('cardsBox').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !current) return;
    if (b.dataset.png !== undefined) exportPNG(+b.dataset.png);
    if (b.dataset.svg !== undefined) exportSVG(+b.dataset.svg);
  });

  $('vcfBtn').addEventListener('click', () => {
    if (!current) return;
    const d = current.d, text = d.sides.filter((s, i) => i === 0 || s.enabled).slice(0, 1).map(s => CARD.vcardFor(d, s)).join('\n');
    download(new Blob([text.replace(/\n/g, '\r\n') + '\r\n'], { type: 'text/vcard;charset=utf-8' }), stemFor(0) + '.vcf');
  });
  $('qrPngBtn').addEventListener('click', () => {
    if (!current) return;
    const d = current.d, payload = d.qrMode === 'url' ? QR.payload.url(d.site) : CARD.vcardFor(d, d.sides[0], d.qrMode === 'short' ? 'short' : 'vcard');
    const m = QR.matrix(payload, 'M'), size = 1200;
    const parts = QR.svgParts(m, { size, quiet: 4, color: d.brand.qrTop, color2: d.brand.qrBottom, bg: '#ffffff', id: 'qrx' });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs>${parts.defs}</defs>${parts.body}</svg>`;
    const img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = size; c.getContext('2d').drawImage(img, 0, 0); URL.revokeObjectURL(url); c.toBlob(b => download(b, stemFor(0) + '_QR.png'), 'image/png'); };
    img.src = url;
  });

  /* ---------- Печать ---------- */
  function sheetA4(i, copies) {
    const card = lockedCard(i, false), cw = 90, ch = 50, cols = 2, rows = Math.min(5, Math.ceil(copies / cols));
    const gw = cols * cw, gh = rows * ch, ox = (210 - gw) / 2, oy = (297 - gh) / 2;
    let body = '', marks = '', n = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols && n < copies; c++, n++) body += `<use href="#card${i}" xlink:href="#card${i}" x="${ox + c * cw}" y="${oy + r * ch}"/>`;
    for (let c = 0; c <= cols; c++) { const x = ox + c * cw; marks += `<path d="M${x} ${oy - 5}v3.5M${x} ${oy + gh + 1.5}v3.5"/>`; }
    for (let r = 0; r <= rows; r++) { const y = oy + r * ch; marks += `<path d="M${ox - 5} ${y}h3.5M${ox + gw + 1.5} ${y}h3.5"/>`; }
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="210mm" height="297mm" viewBox="0 0 210 297"><defs>${card.defs}<g id="card${i}">${card.inner}</g></defs><rect width="210" height="297" fill="#fff"/>${body}<g stroke="#000" stroke-width="0.12" fill="none">${marks}</g></svg>`;
  }
  $('printBtn').addEventListener('click', () => {
    if (!current) return;
    const side = $('printSide').value, list = side === 'both' ? current.res.idx : [+side].filter(i => current.res.idx.includes(i));
    let pages = [], pw = 90, ph = 50;
    if ($('printMode').value === 'a4') { pages = list.map(i => sheetA4(i, +$('copies').value || 10)); pw = 210; ph = 297; }
    else pages = list.map(i => { const c = lockedCard(i, $('bleed').checked); pw = c.W; ph = c.H; return c.svg; });
    $('printArea').innerHTML = pages.map(p => `<div class="print-page" style="width:${pw}mm;height:${ph}mm">${p}</div>`).join('');
    $('pageStyle').textContent = `@page { size: ${pw}mm ${ph}mm; margin: 0 }`;
    setTimeout(() => window.print(), 150);
  });
  $('printMode').addEventListener('change', () => { $('copiesWrap').hidden = $('printMode').value !== 'a4'; });

  /* ---------- События ---------- */
  $('form').addEventListener('input', schedule);
  $('form').addEventListener('change', schedule);
  for (const el of document.querySelectorAll('.phone')) el.addEventListener('blur', () => { el.value = formatPhone(el.value); schedule(); });
  $('designReset').addEventListener('click', () => { writeDesign(CARD.defaultDesign()); schedule(); });
  $('resetAll').addEventListener('click', () => {
    if (!confirm('Очистить все поля и логотип?')) return;
    try { localStorage.removeItem(STORE); } catch {}
    location.reload();
  });
  $('sigPick').addEventListener('change', renderSignature);
  $('logoUrl').addEventListener('input', () => { save(collect()); renderSignature(); });
  window.addEventListener('beforeprint', () => document.body.classList.add('printing'));
  window.addEventListener('afterprint', () => document.body.classList.remove('printing'));

  buildControls();
  load();
  updateDesignLabels();
  $('copiesWrap').hidden = $('printMode').value !== 'a4';
  render();
})();
