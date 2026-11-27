/* [IMG] Photo Studio: загрузка, предпросмотр, кадрирование, фильтры, пресеты, экспорт с лимитом размера. */
(() => {
  'use strict';
  const { metadata: META } = window.PS;
  const $ = id => document.getElementById(id);

  const state = { items: [], active: null, drag: null, compare: false, split: .5 };

  const defaults = () => ({
    rotate: 0, flipX: false, flipY: false, crop: null, ratio: 'none', width: null, height: null, lock: true,
    format: 'image/jpeg', quality: 90, matte: '#ffffff', maxKB: 0,
    brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, blur: 0,
    watermark: '', watermarkPosition: 'br', watermarkSize: 3, watermarkOpacity: 65
  });

  /* Пресеты: пропорция кадра (центрированная обрезка), целевой размер, формат и при необходимости лимит веса. */
  const PRESETS = {
    avatar:   { ratio: '1',          w: 800,  h: 800,  format: 'image/jpeg', quality: 88 },
    post:     { ratio: '0.8',        w: 1080, h: 1350, format: 'image/jpeg', quality: 90 },
    story:    { ratio: '0.5625',     w: 1080, h: 1920, format: 'image/jpeg', quality: 90 },
    cover:    { ratio: '1.77777778', w: 1920, h: 1080, format: 'image/jpeg', quality: 88 },
    telegram: { long: 2560, format: 'image/jpeg', quality: 90 },
    web:      { long: 1600, format: 'image/webp', quality: 82 },
    email:    { long: 1280, format: 'image/jpeg', quality: 82, maxKB: 500 },
    docs:     { long: 1600, format: 'image/jpeg', quality: 85, maxKB: 1024 }
  };

  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
  const LOSSY = new Set(['image/jpeg', 'image/webp', 'image/avif']);
  const human = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  const nameOnly = name => name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

  let noticeTimer;
  function notice(message, error = false) {
    const node = $('status');
    node.textContent = message;
    node.className = 'notice show ' + (error ? 'error' : 'info');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => node.className = 'notice', 9000);
  }

  const item = () => state.items.find(x => x.id === state.active);

  /* ---------- Геометрия ---------- */
  const bounds = x => x.s.rotate % 180 === 0 ? [x.bitmap.width, x.bitmap.height] : [x.bitmap.height, x.bitmap.width];
  const cropRect = x => x.s.crop || { x: 0, y: 0, w: 1, h: 1 };
  const clampPx = v => Math.max(1, Math.min(12000, Math.round(v)));

  function cropPixels(x) {
    const [w, h] = bounds(x), c = cropRect(x);
    return [Math.max(1, Math.round(w * c.w)), Math.max(1, Math.round(h * c.h))];
  }
  function outputDims(x) {
    const [cw, ch] = cropPixels(x);
    return [clampPx(x.s.width || cw), clampPx(x.s.height || ch)];
  }
  function resetDimensions(x) { [x.s.width, x.s.height] = cropPixels(x); }

  /** Центрированная обрезка под пропорцию ratio (ширина/высота) в долях изображения. */
  function centeredCrop(x, ratio) {
    const [rw, rh] = bounds(x), real = Number(ratio);
    if (!real) return null;
    if (rw / rh > real) { const w = rh * real / rw; return { x: (1 - w) / 2, y: 0, w, h: 1 }; }
    const h = rw / real / rh; return { x: 0, y: (1 - h) / 2, w: 1, h };
  }

  /* ---------- Отрисовка ---------- */
  const filterOf = s => `brightness(${s.brightness}%) contrast(${s.contrast}%) saturate(${s.saturate}%) grayscale(${s.grayscale}%) sepia(${s.sepia}%) blur(${s.blur}px)`;

  function drawPhoto(x, ctx, w, h, applyFilters = true) {
    const src = x.bitmap, s = x.s, [rw, rh] = bounds(x);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(s.rotate * Math.PI / 180);
    ctx.scale(s.flipX ? -1 : 1, s.flipY ? -1 : 1);
    // При повороте на 90/270° оси исходника меняются местами.
    const sx = s.rotate % 180 === 0 ? w / rw : h / rh, sy = s.rotate % 180 === 0 ? h / rh : w / rw;
    ctx.filter = applyFilters ? filterOf(s) : 'none';
    ctx.drawImage(src, -src.width * sx / 2, -src.height * sy / 2, src.width * sx, src.height * sy);
    ctx.restore();
    ctx.filter = 'none';
  }

  function drawWatermark(ctx, w, h, s) {
    const text = s.watermark.trim(); if (!text) return;
    ctx.save();
    ctx.globalAlpha = s.watermarkOpacity / 100;
    const fontSize = Math.max(10, Math.round(w * s.watermarkSize / 100)), pad = Math.max(8, Math.round(fontSize * .7));
    ctx.font = `700 ${fontSize}px sans-serif`; ctx.textBaseline = 'middle';
    const measured = ctx.measureText(text).width;
    let xx = w - pad - measured, yy = h - pad - fontSize / 2;
    if (s.watermarkPosition === 'bl') xx = pad;
    if (s.watermarkPosition === 'tr') yy = pad + fontSize / 2;
    if (s.watermarkPosition === 'tl') { xx = pad; yy = pad + fontSize / 2; }
    if (s.watermarkPosition === 'center') { xx = (w - measured) / 2; yy = h / 2; }
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(2, fontSize / 8);
    ctx.strokeText(text, xx, yy, Math.max(1, w - pad * 2));
    ctx.fillStyle = '#fff'; ctx.fillText(text, xx, yy, Math.max(1, w - pad * 2));
    ctx.restore();
  }

  /** Финальное изображение: поворот → фильтры → обрезка → масштаб → водяной знак. */
  function composite(x, dims = outputDims(x)) {
    const [rw, rh] = bounds(x), c = cropRect(x), [ow, oh] = dims, s = x.s;
    const canvas = document.createElement('canvas'); canvas.width = ow; canvas.height = oh;
    const ctx = canvas.getContext('2d'); if (!ctx) throw Error('Canvas недоступен');
    if (s.format === 'image/jpeg') { ctx.fillStyle = s.matte; ctx.fillRect(0, 0, ow, oh); }
    const temp = document.createElement('canvas'); temp.width = rw; temp.height = rh;
    drawPhoto(x, temp.getContext('2d'), rw, rh, true);
    ctx.drawImage(temp, Math.max(0, c.x * rw), Math.max(0, c.y * rh), rw * c.w, rh * c.h, 0, 0, ow, oh);
    temp.width = temp.height = 1;
    drawWatermark(ctx, ow, oh, s);
    return canvas;
  }

  const toBlob = (canvas, mime, quality) => new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(Error('Браузер не смог экспортировать изображение')), mime, quality / 100));

  /** Экспорт. Если задан лимит веса: подбираем качество, а если не хватает — уменьшаем размер. */
  async function exported(x, override = null) {
    const mime = override || x.s.format, limit = override ? 0 : x.s.maxKB * 1024;
    let dims = outputDims(x), canvas = composite(x, dims), quality = x.s.quality;
    let blob = await toBlob(canvas, mime, quality);
    if (blob.type !== mime) throw Error('Этот браузер не поддерживает экспорт ' + mime + '. Выберите PNG, JPG или WebP.');
    if (!limit || blob.size <= limit) return { blob, quality, dims };

    for (let attempt = 0; attempt < 6; attempt++) {
      if (LOSSY.has(mime)) {
        let lo = 30, hi = quality, best = null;
        for (let i = 0; i < 7 && lo <= hi; i++) {
          const q = Math.round((lo + hi) / 2), b = await toBlob(canvas, mime, q);
          if (b.size <= limit) { best = { blob: b, quality: q }; lo = q + 1; } else hi = q - 1;
        }
        if (best) return { ...best, dims };
        quality = Math.min(quality, 75);
      }
      const k = Math.max(.5, Math.sqrt(limit / blob.size) * .92);
      dims = dims.map(v => Math.max(1, Math.round(v * k)));
      canvas.width = canvas.height = 1;
      canvas = composite(x, dims);
      blob = await toBlob(canvas, mime, quality);
      if (blob.size <= limit) return { blob, quality, dims };
    }
    throw Error(`Не получилось уложиться в ${x.s.maxKB} КБ. Увеличьте лимит или выберите JPG / WebP.`);
  }

  /* ---------- Загрузка ---------- */
  let heicLoading = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(Error('Не удалось загрузить ' + src));
      document.head.append(s);
    });
  }
  const isHeic = file => /image\/hei[cf]/.test(file.type) || /\.(heic|heif)$/i.test(file.name);

  async function decode(file) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (err) {
      if (!isHeic(file)) throw err;
      // Браузер не умеет HEIC (обычно все, кроме Safari) — декодируем через WASM.
      heicLoading ||= loadScript('./vendor/heic2any.min.js');
      await heicLoading;
      const converted = await heic2any({ blob: file, toType: 'image/png' });
      return createImageBitmap(Array.isArray(converted) ? converted[0] : converted);
    }
  }

  async function addFiles(files) {
    let accepted = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/') && !/\.(heic|heif|avif)$/i.test(file.name)) { notice('Пропущен неподдерживаемый файл: ' + file.name, true); continue; }
      try {
        if (isHeic(file)) notice('Открываю HEIC: ' + file.name + '…');
        const bitmap = await decode(file);
        if (bitmap.width * bitmap.height > 110000000) { bitmap.close(); throw Error('Слишком большое изображение'); }
        const bytes = await file.slice(0, Math.min(file.size, 3 * 1024 * 1024)).arrayBuffer();
        const x = {
          id: Math.random().toString(36).slice(2), file, bitmap, url: URL.createObjectURL(file),
          blocks: META.detectBlocks(bytes, file.type), details: null, s: defaults()
        };
        resetDimensions(x); state.items.push(x); accepted++;
        if (!state.active) state.active = x.id;
        META.parse(file).then(d => { x.details = d; if (x.id === state.active) renderMetadata(x); });
      } catch (e) { notice('Не удалось открыть ' + file.name + ': ' + e.message, true); }
    }
    if (accepted) { renderStrip(); activate(state.active); notice('Добавлено фотографий: ' + accepted + '. Файлы не покидают браузер.'); }
  }

  /* ---------- Интерфейс ---------- */
  function renderStrip() {
    const strip = $('fileStrip'); strip.replaceChildren();
    for (const x of state.items) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'photo-thumb' + (x.id === state.active ? ' selected' : ''); b.setAttribute('role', 'listitem'); b.title = x.file.name;
      const img = document.createElement('img'); img.alt = '';
      if (isHeic(x.file)) { const c = document.createElement('canvas'), k = 110 / Math.max(x.bitmap.width, x.bitmap.height); c.width = x.bitmap.width * k; c.height = x.bitmap.height * k; c.getContext('2d').drawImage(x.bitmap, 0, 0, c.width, c.height); img.src = c.toDataURL(); }
      else img.src = x.url;
      const label = document.createElement('span'); label.textContent = x.file.name;
      b.append(img, label); b.onclick = () => activate(x.id); strip.append(b);
    }
    $('workspace').classList.toggle('hidden', !state.items.length);
    $('filesCount').textContent = state.items.length + ' фото';
  }

  function renderMetadata(x) {
    const d = x.details, box = $('metaDetails');
    const blocks = x.blocks.length ? x.blocks.join(', ') : 'Не обнаружены';
    $('metadataInfo').textContent = d?.gps ? blocks + ' · есть GPS!' : blocks;
    $('metadataInfo').classList.toggle('warn', !!d?.gps);
    if (!d || (!d.fields.length && !d.gps)) {
      box.innerHTML = `<p class="meta-empty">${d ? 'Читаемых полей EXIF / XMP / IPTC не найдено.' : 'Подробный разбор метаданных недоступен для этого файла.'} Экспорт в любом случае сохраняет изображение без исходных метаданных.</p>`;
      return;
    }
    let html = '';
    if (d.gps) {
      const map = `https://www.openstreetmap.org/?mlat=${d.gps.lat}&mlon=${d.gps.lon}#map=16/${d.gps.lat}/${d.gps.lon}`;
      html += `<div class="gps-alert"><b>В фото записано место съёмки</b><span>${d.gps.lat}, ${d.gps.lon}${d.gps.alt !== null ? ` · высота ${d.gps.alt} м` : ''}</span><a href="${map}" target="_blank" rel="noopener noreferrer">Посмотреть на карте ↗</a></div>`;
    }
    html += '<dl class="meta-list">' + d.fields.map(f => `<div class="risk-${f.risk}"><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd></div>`).join('') + '</dl>';
    if (d.all.length) html += `<details class="meta-all"><summary>Все поля (${d.all.length})</summary><dl>${d.all.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl></details>`;
    html += '<p class="meta-note">Всё это не попадёт в экспортированный файл — изображение перекодируется заново.</p>';
    box.innerHTML = html;
  }

  function renderExportInfo(x, result = null) {
    const dims = result?.dims || outputDims(x), fmt = (EXT[x.s.format] || '—').toUpperCase();
    let text = dims.join(' × ') + ' px · ' + fmt;
    if (result) text += ' · ' + human(result.blob.size) + (LOSSY.has(x.s.format) ? ` · качество ${result.quality}%` : '');
    else if (x.s.maxKB) text += ` · до ${x.s.maxKB} КБ`;
    $('exportInfo').textContent = text;
  }

  function activate(id) {
    state.active = id; const x = item(); if (!x) return;
    renderStrip(); syncControls(x);
    $('activeName').textContent = x.file.name;
    $('activeSub').textContent = x.bitmap.width + ' × ' + x.bitmap.height + ' px · ' + human(x.file.size);
    $('originalInfo').textContent = (x.file.type.replace('image/', '') || x.file.name.split('.').pop()).toUpperCase() + ' · ' + human(x.file.size);
    renderMetadata(x); renderExportInfo(x); renderPreview();
  }

  const fields = ['cropRatio', 'outWidth', 'outHeight', 'lockRatio', 'outFormat', 'quality', 'matteColor', 'maxKB', 'brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'blur', 'watermark', 'watermarkPosition', 'watermarkSize', 'watermarkOpacity'];
  const keyOf = { cropRatio: 'ratio', outWidth: 'width', outHeight: 'height', lockRatio: 'lock', outFormat: 'format', matteColor: 'matte' };
  const numeric = new Set(['outWidth', 'outHeight', 'quality', 'maxKB', 'brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'blur', 'watermarkSize', 'watermarkOpacity']);
  const ranges = ['quality', 'brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'blur', 'watermarkOpacity'];

  function syncRangeLabels() { for (const id of ranges) $(id + 'Value').textContent = $(id).value + (id === 'blur' ? ' px' : '%'); }
  function syncControls(x) {
    for (const id of fields) {
      const v = x.s[keyOf[id] || id];
      if ($(id).type === 'checkbox') $(id).checked = !!v;
      else $(id).value = id === 'maxKB' && !v ? '' : v ?? '';
    }
    $('sizePreset').value = 'original';
    syncRangeLabels();
  }

  let renderQueued = false;
  function renderPreview() {
    if (renderQueued) return; renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false; const x = item(); if (!x) return;
      const canvas = $('previewCanvas'), stage = $('previewStage'), [w, h] = bounds(x);
      const k = Math.min(Math.max(250, stage.clientWidth - 48) / w, 490 / h, 1.5);
      canvas.width = Math.max(1, Math.round(w * k)); canvas.height = Math.max(1, Math.round(h * k));
      const ctx = canvas.getContext('2d');
      drawPhoto(x, ctx, canvas.width, canvas.height);

      if (state.compare) {
        // Слева «до» (без цветокоррекции), справа «после».
        const sx = Math.round(canvas.width * state.split);
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, sx, canvas.height); ctx.clip();
        drawPhoto(x, ctx, canvas.width, canvas.height, false);
        ctx.restore();
        ctx.fillStyle = '#fff'; ctx.fillRect(sx - 1, 0, 2, canvas.height);
        ctx.font = '700 11px sans-serif'; ctx.textBaseline = 'top';
        const tag = (t, tx) => { const tw = ctx.measureText(t).width + 14; ctx.fillStyle = 'rgba(10,22,15,.62)'; ctx.fillRect(tx, 10, tw, 21); ctx.fillStyle = '#fff'; ctx.fillText(t, tx + 7, 15); return tw; };
        if (sx > 60) tag('ДО', 10);
        if (canvas.width - sx > 80) { const t = 'ПОСЛЕ'; tag(t, canvas.width - ctx.measureText(t).width - 24); }
      }

      const c = cropRect(x);
      if (x.s.crop || x.s.ratio !== 'none') {
        ctx.fillStyle = 'rgba(10,22,15,.42)';
        const xx = c.x * canvas.width, yy = c.y * canvas.height, ww = c.w * canvas.width, hh = c.h * canvas.height;
        ctx.fillRect(0, 0, canvas.width, yy); ctx.fillRect(0, yy, xx, hh); ctx.fillRect(xx + ww, yy, canvas.width - xx - ww, hh); ctx.fillRect(0, yy + hh, canvas.width, canvas.height - yy - hh);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.strokeRect(xx, yy, ww, hh); ctx.setLineDash([]);
      }
      $('emptyPreview').classList.add('hidden');
      renderExportInfo(x);
    });
  }

  /* ---------- Поля настроек ---------- */
  for (const id of fields) {
    const el = $(id);
    el.addEventListener(id === 'watermark' ? 'input' : 'change', () => {
      const x = item(); if (!x) return;
      let val = el.type === 'checkbox' ? el.checked : el.value;
      if (numeric.has(id)) val = Number(val) || 0;
      const key = keyOf[id] || id;
      if (id === 'cropRatio') { x.s.ratio = val; x.s.crop = val === 'none' || val === 'free' ? null : centeredCrop(x, val); resetDimensions(x); }
      else if (id === 'outWidth' || id === 'outHeight') {
        if (val < 1 || val > 12000) { syncControls(x); notice('Размер должен быть от 1 до 12000 px.', true); return; }
        const [ow, oh] = outputDims(x); x.s[key] = val;
        if (x.s.lock) { const ratio = ow / oh; if (id === 'outWidth') x.s.height = clampPx(val / ratio); else x.s.width = clampPx(val * ratio); }
      } else if (id === 'maxKB') x.s.maxKB = Math.max(0, Math.min(51200, val));
      else x.s[key] = val;
      syncControls(x); syncRangeLabels(); renderPreview();
    });
    if (el.type === 'range') el.addEventListener('input', () => { const x = item(); if (x) { x.s[keyOf[id] || id] = Number(el.value); syncRangeLabels(); renderPreview(); } });
  }

  $('sizePreset').onchange = () => {
    const x = item(); if (!x) return; resetDimensions(x);
    if ($('sizePreset').value !== 'original') {
      const max = Number($('sizePreset').value), long = Math.max(x.s.width, x.s.height);
      if (long > max) { const k = max / long; x.s.width = clampPx(x.s.width * k); x.s.height = clampPx(x.s.height * k); }
    }
    const v = $('sizePreset').value; syncControls(x); $('sizePreset').value = v; renderPreview();
  };

  $('preset').onchange = () => {
    const x = item(), p = PRESETS[$('preset').value]; if (!x || !p) return;
    if (p.ratio) { x.s.ratio = p.ratio; x.s.crop = centeredCrop(x, p.ratio); }
    resetDimensions(x);
    const [cw, ch] = cropPixels(x);
    if (p.w) { const k = Math.min(1, p.w / cw); x.s.width = clampPx(cw * k); x.s.height = clampPx(ch * k); }
    if (p.long) { const k = Math.min(1, p.long / Math.max(cw, ch)); x.s.width = clampPx(cw * k); x.s.height = clampPx(ch * k); }
    x.s.format = p.format; x.s.quality = p.quality; x.s.maxKB = p.maxKB || 0;
    syncControls(x); renderPreview();
    notice('Пресет «' + $('preset').selectedOptions[0].textContent + '» применён. Рамку обрезки можно сдвинуть, выделив область на фото.');
    $('preset').value = '';
  };

  function transformPhoto(fn) { const x = item(); if (!x) return; fn(x.s); resetDimensions(x); syncControls(x); renderPreview(); }
  $('rotateLeft').onclick = () => transformPhoto(s => { s.rotate = (s.rotate + 270) % 360; s.crop = null; });
  $('rotateRight').onclick = () => transformPhoto(s => { s.rotate = (s.rotate + 90) % 360; s.crop = null; });
  $('flipX').onclick = () => transformPhoto(s => s.flipX = !s.flipX);
  $('flipY').onclick = () => transformPhoto(s => s.flipY = !s.flipY);
  $('resetCrop').onclick = () => transformPhoto(s => { s.crop = null; s.ratio = 'none'; });
  $('resetBtn').onclick = () => { const x = item(); if (!x) return; x.s = defaults(); resetDimensions(x); activate(x.id); };

  /* ---------- До / после ---------- */
  $('compareBtn').onclick = () => {
    state.compare = !state.compare;
    $('compareBtn').classList.toggle('is-on', state.compare);
    $('compareBtn').setAttribute('aria-pressed', String(state.compare));
    $('compareRow').classList.toggle('hidden', !state.compare);
    renderPreview();
  };
  $('compareSplit').addEventListener('input', e => { state.split = Number(e.target.value) / 100; renderPreview(); });

  /* ---------- Кадрирование мышью / пальцем ---------- */
  const canvas = $('previewCanvas');
  function coord(e) {
    const r = canvas.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }
  function selection(a, b, ratio, rw, rh) {
    let x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
    if (ratio && ratio !== 'free' && ratio !== 'none') {
      const real = Number(ratio) * rh / rw;
      if (w / h > real) w = h * real; else h = w / real;
      x = b.x >= a.x ? a.x : a.x - w; y = b.y >= a.y ? a.y : a.y - h;
    }
    return { x: Math.max(0, Math.min(1 - w, x)), y: Math.max(0, Math.min(1 - h, y)), w, h };
  }
  canvas.addEventListener('pointerdown', e => {
    const x = item(); if (!x) return;
    if (x.s.ratio === 'none') { x.s.ratio = 'free'; $('cropRatio').value = 'free'; }
    state.drag = { id: e.pointerId, start: coord(e) }; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    const x = item(); if (!x || !state.drag || state.drag.id !== e.pointerId) return;
    const [rw, rh] = bounds(x), c = selection(state.drag.start, coord(e), x.s.ratio, rw, rh);
    if (c.w < .005 || c.h < .005) return; x.s.crop = c; renderPreview();
  });
  canvas.addEventListener('pointerup', () => {
    const x = item(); if (!x || !state.drag) return; state.drag = null;
    if (x.s.crop) { resetDimensions(x); syncControls(x); renderPreview(); }
  });
  canvas.addEventListener('pointercancel', () => state.drag = null);

  /* ---------- Загрузка: кнопка, перетаскивание, вставка ---------- */
  $('fileInput').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  const drop = $('dropZone');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('dragging'); addFiles([...e.dataTransfer.files]); });

  document.addEventListener('paste', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const images = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (!images.length) return;
    e.preventDefault();
    const d = new Date(), p = n => String(n).padStart(2, '0'), stamp = `${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
    addFiles(images.map((f, i) => new File([f], `вставка-${stamp}${i ? '-' + i : ''}.${EXT[f.type] || 'png'}`, { type: f.type })));
  });

  $('clearBtn').onclick = () => {
    for (const x of state.items) { URL.revokeObjectURL(x.url); x.bitmap.close(); }
    state.items = []; state.active = null; renderStrip(); $('emptyPreview').classList.remove('hidden'); notice('Список очищен.');
  };

  /* ---------- Экспорт ---------- */
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
  const filename = (x, blob) => nameOnly(x.file.name) + '_clean.' + (EXT[blob.type] || 'png');

  async function busy(btn, work) {
    const before = btn.textContent; btn.disabled = true; btn.textContent = 'Обработка…';
    try { await work(); } catch (e) { notice(e.message, true); } finally { btn.disabled = false; btn.textContent = before; }
  }

  $('downloadBtn').onclick = () => busy($('downloadBtn'), async () => {
    const x = item(); if (!x) return;
    const result = await exported(x); saveBlob(result.blob, filename(x, result.blob)); renderExportInfo(x, result);
    notice(`Готово: ${human(result.blob.size)}. Файл создан без исходных метаданных.`);
  });
  $('copyBtn').onclick = () => busy($('copyBtn'), async () => {
    const x = item(); if (!x) return;
    if (!navigator.clipboard?.write) throw Error('Копирование не поддерживается в этом браузере');
    const { blob } = await exported(x, 'image/png');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    notice('PNG скопирован в буфер обмена.');
  });
  $('downloadAll').onclick = () => busy($('downloadAll'), async () => {
    if (!state.items.length) return;
    if (!window.JSZip) throw Error('Библиотека ZIP не загрузилась. Перезагрузите страницу.');
    const zip = new JSZip(), used = new Set();
    for (let i = 0; i < state.items.length; i++) {
      const x = state.items[i], { blob } = await exported(x);
      let name = filename(x, blob), n = 2;
      while (used.has(name)) name = nameOnly(x.file.name) + '_clean_' + n++ + '.' + EXT[blob.type];
      used.add(name); zip.file(name, blob); notice('Экспорт ' + (i + 1) + ' из ' + state.items.length + '…');
    }
    saveBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } }), 'photo-studio-clean.zip');
    notice('ZIP готов: ' + state.items.length + ' фотографий.');
  });
  $('applyAll').onclick = () => {
    const x = item(); if (!x) return;
    for (const target of state.items) if (target !== x)
      for (const key of ['format', 'quality', 'matte', 'maxKB', 'brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'blur', 'watermark', 'watermarkPosition', 'watermarkSize', 'watermarkOpacity']) target.s[key] = x.s[key];
    notice('Цветокоррекция и настройки экспорта применены ко всем. Кадрирование и размеры оставлены индивидуальными.');
  };

  window.addEventListener('resize', renderPreview);
  window.addEventListener('themechange', renderPreview);
})();
