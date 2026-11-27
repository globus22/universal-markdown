/* [PDF] PDF-инструменты: страницы из PDF и картинок, порядок, поворот, сборка, разделение, экспорт, сжатие.
   pdf.js рисует миниатюры и растрирует страницы, pdf-lib собирает итоговые файлы без перекодирования. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { PDFDocument, degrees } = window.PDFLib || {};
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.js', document.baseURI).href;

  const sources = new Map();   // id → { id, name, kind: 'pdf'|'image', bytes, pdfjs, lib, img: { bytes, mime, w, h } }
  let pages = [];              // [{ id, src, index, rot, selected, thumb }]
  let seq = 0;
  const uid = () => 'p' + (++seq);
  const human = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  const base = name => name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_') || 'document';

  let noticeTimer;
  function notice(text, type = 'info', ms = 5000) {
    const n = $('notice'); n.textContent = text; n.className = 'notice show ' + type;
    clearTimeout(noticeTimer); if (ms) noticeTimer = setTimeout(() => n.className = 'notice', ms);
  }

  /* ---------- Загрузка ---------- */
  async function imageToPng(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0); bmp.close();
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/png', w: c.width, h: c.height };
  }

  /** EXIF Orientation из JPEG (1 — без поворота). */
  function jpegOrientation(b) {
    if (b[0] !== 0xFF || b[1] !== 0xD8) return 1;
    for (let i = 2; i < Math.min(b.length, 65536);) {
      if (b[i] !== 0xFF) return 1;
      const marker = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (marker === 0xE1 && String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]) === 'Exif') {
        const t = i + 10, le = b[t] === 0x49, u16 = o => le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1];
        const u32 = o => le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
        const ifd = t + u32(t + 4), n = u16(ifd);
        for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (u16(e) === 0x0112) return u16(e + 8); }
        return 1;
      }
      if (marker === 0xDA) return 1;
      i += 2 + len;
    }
    return 1;
  }

  async function addFiles(list) {
    const files = [...list];
    if (!files.length) return;
    if (!window.pdfjsLib || !PDFDocument) { notice('Библиотеки PDF не загрузились. Перезагрузите страницу.', 'error', 0); return; }
    let added = 0;
    for (const file of files) {
      try {
        const id = uid();
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          notice(`Открываю ${file.name}…`, 'info', 0);
          const bytes = new Uint8Array(await file.arrayBuffer());
          const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
          sources.set(id, { id, name: file.name, kind: 'pdf', bytes, pdfjs: doc, lib: null });
          for (let i = 0; i < doc.numPages; i++) pages.push({ id: uid(), src: id, index: i, rot: 0, selected: false, thumb: null });
          added += doc.numPages;
        } else if (file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)) {
          let img;
          if (file.type === 'image/jpeg' || file.type === 'image/png') {
            const bytes = new Uint8Array(await file.arrayBuffer());
            // JPEG с EXIF-поворотом перекодируем, чтобы в PDF фото стояло правильно; остальные встраиваем как есть.
            if (file.type === 'image/jpeg' && jpegOrientation(bytes) > 1) img = await imageToPng(file);
            else { const bmp = await createImageBitmap(file); img = { bytes, mime: file.type, w: bmp.width, h: bmp.height }; bmp.close(); }
          } else img = await imageToPng(file);
          sources.set(id, { id, name: file.name, kind: 'image', img });
          pages.push({ id: uid(), src: id, index: 0, rot: 0, selected: false, thumb: null });
          added++;
        } else notice('Пропущен файл неподдерживаемого типа: ' + file.name, 'warning');
      } catch (e) {
        const msg = /password/i.test(e?.name + e?.message) ? 'файл защищён паролем' : (e?.message || e);
        notice(`Не удалось открыть ${file.name}: ${msg}`, 'error', 8000);
      }
    }
    if (added) notice(`Добавлено страниц: ${added}. Файлы не покидают браузер.`, 'info', 3000);
    render();
    renderThumbs();
  }

  /* ---------- Миниатюры ---------- */
  let thumbBusy = false;
  async function renderThumbs() {
    if (thumbBusy) return; thumbBusy = true;
    try {
      for (const p of pages) {
        if (p.thumb) continue;
        const s = sources.get(p.src); if (!s) continue;
        if (s.kind === 'image') p.thumb = URL.createObjectURL(new Blob([s.img.bytes], { type: s.img.mime }));
        else {
          const page = await s.pdfjs.getPage(p.index + 1), vp0 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: 220 / Math.max(vp0.width, vp0.height) });
          const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          p.thumb = c.toDataURL('image/jpeg', .8);
        }
        const img = document.querySelector(`[data-id="${p.id}"] img`); if (img) { img.src = p.thumb; img.parentElement.classList.remove('loading'); }
      }
    } finally { thumbBusy = false; }
    if (pages.some(p => !p.thumb && sources.has(p.src))) renderThumbs();
  }

  /* ---------- Сетка страниц ---------- */
  function render() {
    $('work').classList.toggle('hidden', !pages.length);
    $('count').textContent = pages.length;
    const sel = pages.filter(p => p.selected).length;
    $('selInfo').textContent = sel ? `выбрано: ${sel}` : '';
    const multi = new Set(pages.map(p => p.src)).size > 1;
    $('pages').innerHTML = pages.map((p, i) => {
      const s = sources.get(p.src);
      return `<div class="page${p.selected ? ' selected' : ''}" role="listitem" draggable="true" data-id="${p.id}">
        <div class="thumb${p.thumb ? '' : ' loading'}"><img alt="" src="${p.thumb || 'data:,'}" style="transform:rotate(${p.rot}deg)${p.rot % 180 ? ' scale(.74)' : ''}"></div>
        <div class="page-foot"><b>${i + 1}</b>${multi ? `<span title="${s.name.replace(/"/g, '&quot;')}">${s.name}</span>` : ''}</div>
        <div class="page-tools"><button type="button" data-act="rot" title="Повернуть на 90°">↻</button><button type="button" data-act="del" title="Удалить страницу">✕</button></div>
        <span class="tick" aria-hidden="true">✓</span>
      </div>`;
    }).join('');
  }

  $('pages').addEventListener('click', e => {
    const tile = e.target.closest('.page'); if (!tile) return;
    const p = pages.find(x => x.id === tile.dataset.id); if (!p) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'rot') p.rot = (p.rot + 90) % 360;
    else if (act === 'del') pages = pages.filter(x => x !== p);
    else p.selected = !p.selected;
    render();
  });

  // Перетаскивание для смены порядка.
  let dragId = null;
  $('pages').addEventListener('dragstart', e => { const t = e.target.closest('.page'); if (!t) return; dragId = t.dataset.id; t.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
  $('pages').addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.page.dragging, .page.drop-before, .page.drop-after').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after')); });
  $('pages').addEventListener('dragover', e => {
    if (!dragId) return; e.preventDefault();
    const t = e.target.closest('.page'); document.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    if (!t || t.dataset.id === dragId) return;
    const r = t.getBoundingClientRect(); t.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
  });
  $('pages').addEventListener('drop', e => {
    if (!dragId) return; e.preventDefault();
    const t = e.target.closest('.page'); if (!t || t.dataset.id === dragId) return;
    const after = t.classList.contains('drop-after');
    const moving = pages.find(p => p.id === dragId);
    pages = pages.filter(p => p !== moving);
    const idx = pages.findIndex(p => p.id === t.dataset.id) + (after ? 1 : 0);
    pages.splice(idx, 0, moving); render();
  });

  const targets = () => { const s = pages.filter(p => p.selected); return s.length ? s : pages; };
  $('selAll').onclick = () => { pages.forEach(p => p.selected = true); render(); };
  $('selNone').onclick = () => { pages.forEach(p => p.selected = false); render(); };
  $('rotSel').onclick = () => { targets().forEach(p => p.rot = (p.rot + 90) % 360); render(); };
  $('delSel').onclick = () => { const n = pages.filter(p => p.selected).length; if (!n) return notice('Сначала выберите страницы кликом.', 'warning'); pages = pages.filter(p => !p.selected); render(); };
  $('reverse').onclick = () => { pages.reverse(); render(); };
  $('clearAll').onclick = () => { pages.forEach(p => p.thumb?.startsWith('blob:') && URL.revokeObjectURL(p.thumb)); pages = []; sources.clear(); render(); };

  /* ---------- Сборка PDF ---------- */
  async function libDoc(s) {
    if (!s.lib) s.lib = await PDFDocument.load(s.bytes, { ignoreEncryption: true, updateMetadata: false });
    return s.lib;
  }
  const A4 = [595.28, 841.89];

  async function addImagePage(out, s, rot) {
    const img = s.img.mime === 'image/jpeg' ? await out.embedJpg(s.img.bytes) : await out.embedPng(s.img.bytes);
    let w = s.img.w * .75, h = s.img.h * .75, pw = w, ph = h, x = 0, y = 0;
    if ($('imgFit').value === 'a4') {
      [pw, ph] = w > h ? [A4[1], A4[0]] : A4;
      const m = 28.35, k = Math.min((pw - 2 * m) / w, (ph - 2 * m) / h, 1.6);
      w *= k; h *= k; x = (pw - w) / 2; y = (ph - h) / 2;
    }
    const page = out.addPage([pw, ph]);
    page.drawImage(img, { x, y, width: w, height: h });
    if (rot) page.setRotation(degrees(rot));
  }

  async function buildPdf(list, progress) {
    const out = await PDFDocument.create();
    for (let i = 0; i < list.length; i++) {
      const p = list[i], s = sources.get(p.src);
      progress?.(i, list.length);
      if (s.kind === 'image') { await addImagePage(out, s, p.rot); continue; }
      const [cp] = await out.copyPages(await libDoc(s), [p.index]);
      if (p.rot) cp.setRotation(degrees((cp.getRotation().angle + p.rot) % 360));
      out.addPage(cp);
    }
    out.setProducer('Universal Tools'); out.setCreator('Universal Tools · PDF');
    return out.save();
  }

  /* ---------- Растрирование страницы ---------- */
  async function rasterPage(p, dpi, mime, quality) {
    const s = sources.get(p.src);
    let canvas;
    if (s.kind === 'image') {
      const bmp = await createImageBitmap(new Blob([s.img.bytes], { type: s.img.mime }));
      const swap = p.rot % 180 !== 0;
      canvas = document.createElement('canvas'); canvas.width = swap ? bmp.height : bmp.width; canvas.height = swap ? bmp.width : bmp.height;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(p.rot * Math.PI / 180); ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2); bmp.close();
    } else {
      const page = await s.pdfjs.getPage(p.index + 1);
      const vp = page.getViewport({ scale: dpi / 72, rotation: (page.rotate + p.rot) % 360 });
      canvas = document.createElement('canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    }
    const blob = await new Promise(r => canvas.toBlob(r, mime, quality));
    const size = [canvas.width, canvas.height]; canvas.width = canvas.height = 1;
    return { blob, size };
  }

  /* ---------- Действия ---------- */
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }
  const outName = suffix => {
    const names = [...new Set(pages.map(p => sources.get(p.src).name))];
    return (names.length === 1 ? base(names[0]) : 'объединённый') + suffix;
  };
  async function busy(btn, work) {
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Обработка…';
    try { await work(); } catch (e) { console.error(e); notice('Ошибка: ' + (e?.message || e), 'error', 9000); }
    finally { btn.disabled = false; btn.textContent = label; }
  }
  const progress = (what) => (i, n) => notice(`${what}: ${i + 1} из ${n}…`, 'info', 0);

  $('saveAll').onclick = () => busy($('saveAll'), async () => {
    const bytes = await buildPdf(pages, progress('Собираю'));
    download(new Blob([bytes], { type: 'application/pdf' }), outName('.pdf'));
    notice(`Готово: ${pages.length} стр., ${human(bytes.length)}.`);
  });
  $('saveSel').onclick = () => busy($('saveSel'), async () => {
    const sel = pages.filter(p => p.selected); if (!sel.length) return notice('Выберите страницы кликом по ним.', 'warning');
    const bytes = await buildPdf(sel, progress('Собираю'));
    download(new Blob([bytes], { type: 'application/pdf' }), outName(`_стр_${sel.length}.pdf`));
    notice(`Готово: ${sel.length} стр., ${human(bytes.length)}.`);
  });

  function parseRanges(text, n) {
    const parts = text.split(/[,;]+/).map(s => s.trim()).filter(Boolean), out = [];
    for (const part of parts) {
      const m = part.match(/^(\d+)\s*(?:[-–—]\s*(\d+|конец|end))?$/i);
      if (!m) throw new Error(`Не понял диапазон «${part}». Пример: 1-3, 4, 5-9`);
      const a = +m[1], b = m[2] ? (/^\d+$/.test(m[2]) ? +m[2] : n) : a;
      if (a < 1 || b > n || a > b) throw new Error(`Диапазон «${part}» вне документа (страниц: ${n}).`);
      out.push([a, b]);
    }
    return out;
  }
  $('splitBtn').onclick = () => busy($('splitBtn'), async () => {
    const text = $('ranges').value.trim();
    const groups = text ? parseRanges(text, pages.length).map(([a, b]) => ({ list: pages.slice(a - 1, b), label: a === b ? `стр_${a}` : `стр_${a}-${b}` }))
      : pages.map((p, i) => ({ list: [p], label: `стр_${String(i + 1).padStart(3, '0')}` }));
    const zip = new JSZip();
    for (let i = 0; i < groups.length; i++) {
      notice(`Разделяю: часть ${i + 1} из ${groups.length}…`, 'info', 0);
      zip.file(`${outName('')}_${groups[i].label}.pdf`, await buildPdf(groups[i].list));
    }
    download(await zip.generateAsync({ type: 'blob' }), outName('_части.zip'));
    notice(`Готово: ${groups.length} файл(ов) в архиве.`);
  });

  $('toImg').onclick = () => busy($('toImg'), async () => {
    const list = targets(), dpi = +$('imgDpi').value, mime = $('imgFmt').value, ext = mime === 'image/png' ? 'png' : 'jpg';
    if (list.length === 1) {
      const { blob } = await rasterPage(list[0], dpi, mime, .9);
      return download(blob, `${outName('')}_стр_${pages.indexOf(list[0]) + 1}.${ext}`);
    }
    const zip = new JSZip();
    for (let i = 0; i < list.length; i++) {
      notice(`Рисую страницы: ${i + 1} из ${list.length}…`, 'info', 0);
      const { blob } = await rasterPage(list[i], dpi, mime, .9);
      zip.file(`${outName('')}_стр_${String(pages.indexOf(list[i]) + 1).padStart(3, '0')}.${ext}`, blob);
    }
    download(await zip.generateAsync({ type: 'blob' }), outName(`_${ext}.zip`));
    notice(`Готово: ${list.length} картинок.`);
  });

  const LEVELS = { strong: [100, .55], medium: [150, .68], light: [200, .8] };
  $('compressBtn').onclick = () => busy($('compressBtn'), async () => {
    const [dpi, q] = LEVELS[$('compLevel').value];
    const before = (await buildPdf(pages)).length;
    const out = await PDFDocument.create();
    for (let i = 0; i < pages.length; i++) {
      notice(`Сжимаю: страница ${i + 1} из ${pages.length}…`, 'info', 0);
      const { blob, size } = await rasterPage(pages[i], dpi, 'image/jpeg', q);
      const jpg = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const w = size[0] * 72 / dpi, h = size[1] * 72 / dpi;
      out.addPage([w, h]).drawImage(jpg, { x: 0, y: 0, width: w, height: h });
    }
    out.setProducer('Universal Tools');
    const bytes = await out.save();
    if (bytes.length >= before) {
      notice(`Сжатие не помогло: было ${human(before)}, получилось ${human(bytes.length)}. Файл уже оптимален — скачивать не стал.`, 'warning', 10000);
      return;
    }
    download(new Blob([bytes], { type: 'application/pdf' }), outName('_сжатый.pdf'));
    notice(`Готово: ${human(before)} → ${human(bytes.length)} (−${Math.round((1 - bytes.length / before) * 100)}%).`, 'info', 10000);
  });

  /* ---------- Загрузка файлов ---------- */
  $('fileInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  const drop = $('dropZone');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { if (dragId) return; e.preventDefault(); drop.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('dragging'); }));
  drop.addEventListener('drop', e => { if (!dragId) addFiles(e.dataTransfer.files); });
  document.addEventListener('paste', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const files = [...(e.clipboardData?.files || [])]; if (!files.length) return;
    e.preventDefault(); addFiles(files);
  });
  render();
})();
