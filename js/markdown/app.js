/* [MD] Интерфейс конвертера: список файлов, редактор, превью, экспорт, вставка из буфера. */
(() => {
  'use strict';
  const { util: U, formats, transform: T, ocr } = window.UMD;

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const state = { files: [], activeId: null, mode: 'standard' };

  const els = {
    fileInput: $('#fileInput'), dropZone: $('#dropZone'), workspace: $('#workspace'), fileList: $('#fileList'),
    editor: $('#markdownEditor'), preview: $('#preview'), info: $('#info'), activeName: $('#activeName'), stats: $('#stats'),
    copyBtn: $('#copyBtn'), downloadBtn: $('#downloadBtn'), bundleBtn: $('#bundleBtn'), zipBtn: $('#zipBtn'), clearAll: $('#clearAll'),
    notice: $('#notice'), chunkSize: $('#chunkSize'), ocrMode: $('#ocrMode'), ocrLang: $('#ocrLang'),
    progressLine: $('#progressLine'), progressBar: $('#progressBar'), chunkBar: $('#chunkBar')
  };

  const required = [
    ['Mammoth', window.mammoth], ['Turndown', window.TurndownService], ['SheetJS', window.XLSX],
    ['PDF.js', window.pdfjsLib], ['JSZip', window.JSZip], ['Marked', window.marked], ['DOMPurify', window.DOMPurify]
  ];
  const missing = required.filter(([, v]) => !v).map(([n]) => n);
  if (missing.length) showNotice('Не удалось загрузить библиотеки: ' + missing.join(', ') + '. Перезагрузите страницу.', 'error');

  // Список форматов строится из реестра, поэтому новый формат достаточно зарегистрировать в его модуле.
  els.fileInput.accept = formats.extensions.map(e => '.' + e).join(',');

  function showNotice(text, type = 'info', timeout = 0) {
    els.notice.textContent = text;
    els.notice.className = 'notice show ' + type;
    if (timeout) setTimeout(() => { if (els.notice.textContent === text) els.notice.className = 'notice'; }, timeout);
  }

  const activeItem = () => state.files.find(f => f.id === state.activeId) || null;
  const chunkTarget = () => state.mode === 'llm' ? Number(els.chunkSize.value) : 0;
  const chunksOf = item => T.split(item.displayMarkdown, chunkTarget());
  const fmt = n => n.toLocaleString('ru-RU');
  const shortTokens = n => n >= 1000 ? Math.round(n / 1000) + 'K' : String(n);

  /* ---------- Предпросмотр: подставляем извлечённые картинки как data-URL ---------- */
  function markdownForPreview(md, assets = []) {
    let out = md || '';
    for (const a of assets) {
      if (!a?.base64 || !a.contentType?.startsWith('image/') || /emf|wmf/.test(a.contentType)) continue;
      const escaped = a.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`(!\\[[^\\]]*\\]\\()${escaped}(\\))`, 'g'), `$1data:${a.contentType};base64,${a.base64}$2`);
    }
    return out;
  }

  /* ---------- Конвертация ---------- */
  function setProgress(item, value, text) {
    item.progress = Math.max(0, Math.min(1, value || 0)); item.progressText = text || '';
    if (item.id === state.activeId) renderActive(); else renderFileList();
  }

  async function convert(item) {
    const format = formats.find(item.file.name);
    if (!format) throw new Error('Формат .' + U.extOf(item.file.name) + ' пока не поддерживается');
    const ctx = {
      ocrMode: els.ocrMode.value,
      setProgress: (v, t) => setProgress(item, v, t),
      ocr: (input, label) => {
        if (label) item.progressText = label;
        return ocr.recognize(input, { lang: els.ocrLang.value, progress: (v, t) => setProgress(item, v, t) });
      }
    };
    return format.extract(item.file, ctx);
  }

  async function addFiles(fileList) {
    const files = [...fileList];
    const accepted = files.filter(f => formats.find(f.name));
    if (!accepted.length) {
      showNotice('Поддерживаются: ' + formats.all.map(f => f.label).join(', ') + '.', 'error', 6000);
      return;
    }
    for (const file of accepted) {
      const id = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random();
      state.files.push({ id, file, status: 'busy', rawMarkdown: '', displayMarkdown: '', assets: [], meta: {}, error: '', progress: 0, progressText: 'В очереди…' });
      if (!state.activeId) state.activeId = id;
    }
    render();
    for (const item of state.files.filter(x => x.status === 'busy')) {
      try {
        setProgress(item, .01, 'Чтение файла…');
        const result = await convert(item);
        item.rawMarkdown = result.markdown || ''; item.assets = result.assets || []; item.meta = result.meta || {};
        item.displayMarkdown = T.apply(state.mode, item.rawMarkdown, item.file.name);
        item.status = 'ok'; item.progress = 1; item.progressText = 'Готово';
      } catch (err) { item.status = 'error'; item.error = err?.message || String(err); item.progressText = 'Ошибка'; }
      render();
    }
    const errors = state.files.filter(x => x.status === 'error');
    const skipped = files.length - accepted.length;
    if (errors.length) showNotice(`${errors.length} файл(а) не удалось обработать. Откройте файл слева, чтобы увидеть причину.`, 'error');
    else showNotice('Готово. Все документы обработаны локально в браузере.' + (skipped ? ` Пропущено неподдерживаемых: ${skipped}.` : ''), 'info', 3500);
  }

  /* ---------- Отрисовка ---------- */
  function renderFileList() {
    els.fileList.innerHTML = '';
    for (const item of state.files) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'file-item' + (item.id === state.activeId ? ' active' : '');
      const status = item.status === 'ok' ? 'Готово' : item.status === 'busy' ? (item.progressText || 'Обработка…') : 'Ошибка';
      btn.innerHTML = `<div class="file-name"></div><div class="file-meta"><span class="dot ${item.status}"></span><span class="file-status"></span><span>·</span><span>${U.humanSize(item.file.size)}</span></div>${item.status === 'busy' ? `<div class="mini-progress"><span style="width:${Math.round((item.progress || 0) * 100)}%"></span></div>` : ''}`;
      btn.querySelector('.file-name').textContent = item.file.name; btn.querySelector('.file-status').textContent = status;
      btn.addEventListener('click', () => { state.activeId = item.id; render(); });
      els.fileList.appendChild(btn);
    }
  }

  function renderInfo(item) {
    if (!item) { els.info.innerHTML = ''; return; }
    const s = T.stats(item.displayMarkdown || '', item.assets), m = item.meta || {};
    const cards = [
      ['Формат', U.extOf(item.file.name).toUpperCase()], ['Движок', m.engine || '—'], ['Размер', U.humanSize(item.file.size)], ['Примерно токенов', fmt(s.tokens)],
      ['Страниц / слайдов / глав', m.pages || m.slides || m.chapters || '—'], ['OCR-страниц', m.ocrPages ?? '—'], ['Таблиц', s.tables], ['Изображений', item.assets.length]
    ];
    let html = `<div class="info-grid">${cards.map(([a, b]) => `<div class="info-card"><small>${U.escapeHtml(a)}</small><b>${U.escapeHtml(String(b))}</b></div>`).join('')}</div>`;
    if (item.assets.length) html += `<div class="info-section"><h3>Assets</h3><div class="asset-list">${item.assets.map(a => U.escapeHtml(a.path)).join('<br>')}</div></div>`;
    if (m.warnings?.length) html += `<div class="info-section"><h3>Предупреждения конвертера</h3><div class="asset-list">${m.warnings.map(U.escapeHtml).join('<br>')}</div></div>`;
    els.info.innerHTML = html;
  }

  function renderChunks(item) {
    const chunks = item?.status === 'ok' && state.mode === 'llm' ? chunksOf(item) : [];
    els.chunkBar.classList.toggle('hidden', chunks.length < 2);
    if (chunks.length < 2) { els.chunkBar.replaceChildren(); return; }
    const label = document.createElement('span'); label.className = 'chunk-label'; label.textContent = `Частей: ${chunks.length} · копировать`;
    const buttons = chunks.map((chunk, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn line sm chunk-btn';
      b.textContent = `${i + 1} · ≈${shortTokens(T.estimateTokens(chunk))}`;
      b.title = `Скопировать часть ${i + 1} из ${chunks.length}`;
      b.addEventListener('click', async () => {
        await copyText(chunk);
        b.classList.add('done'); b.textContent = `✓ ${i + 1}`;
        showNotice(`Часть ${i + 1} из ${chunks.length} скопирована. Вставьте её в чат и переходите к следующей.`, 'info', 3000);
      });
      return b;
    });
    els.chunkBar.replaceChildren(label, ...buttons);
  }

  function renderActive() {
    const item = activeItem(), ready = item?.status === 'ok';
    els.copyBtn.disabled = !ready; els.downloadBtn.disabled = !ready; els.bundleBtn.disabled = !ready;
    els.zipBtn.disabled = !state.files.some(f => f.status === 'ok');
    if (!item) {
      els.activeName.textContent = '—'; els.stats.textContent = '—'; els.editor.value = '';
      els.progressLine.classList.add('hidden'); renderPreview('', []); renderInfo(null); renderChunks(null); return;
    }
    els.activeName.textContent = item.file.name;
    if (item.status === 'error') {
      els.stats.textContent = item.error; els.editor.value = `Ошибка обработки:\n\n${item.error}`;
      els.progressLine.classList.add('hidden'); renderPreview('', []); renderInfo(item); renderChunks(null); return;
    }
    if (item.status === 'busy') {
      els.stats.textContent = item.progressText || 'Обработка файла…'; els.editor.value = '';
      els.progressLine.classList.remove('hidden'); els.progressBar.style.width = `${Math.round((item.progress || 0) * 100)}%`;
      renderPreview('', []); renderInfo(item); renderChunks(null); return;
    }
    els.progressLine.classList.add('hidden');
    if (els.editor.value !== item.displayMarkdown) els.editor.value = item.displayMarkdown;
    renderStats(item);
    renderPreview(item.displayMarkdown, item.assets); renderInfo(item); renderChunks(item);
  }

  function renderStats(item) {
    const s = T.stats(item.displayMarkdown, item.assets), chunks = state.mode === 'llm' ? chunksOf(item).length : 1;
    els.stats.textContent = `${fmt(s.words)} слов · ${fmt(s.chars)} символов · ≈ ${fmt(s.tokens)} токенов`
      + (s.tables ? ` · ${s.tables} табл.` : '') + (s.assets ? ` · ${s.assets} изобр.` : '') + (chunks > 1 ? ` · ${chunks} частей` : '');
  }

  function renderPreview(md, assets) {
    try {
      const source = markdownForPreview(md || '', assets || []);
      const rendered = window.marked ? marked.parse(source, { gfm: true, breaks: false }) : `<pre>${U.escapeHtml(source)}</pre>`;
      els.preview.innerHTML = window.DOMPurify ? DOMPurify.sanitize(rendered, { ADD_ATTR: ['target'] }) : rendered;
    } catch { els.preview.textContent = md || ''; }
  }

  function render() { els.workspace.classList.toggle('visible', state.files.length > 0); renderFileList(); renderActive(); }

  /* ---------- Экспорт ---------- */
  function saveBlob(blob, filename) {
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
  }

  async function copyActive() {
    const item = activeItem(); if (!item || item.status !== 'ok') return;
    await copyText(item.displayMarkdown); showNotice('Markdown скопирован в буфер обмена.', 'info', 2200);
  }

  function downloadActive() {
    const item = activeItem(); if (!item || item.status !== 'ok') return;
    saveBlob(new Blob([item.displayMarkdown], { type: 'text/markdown;charset=utf-8' }), U.safeFileName(U.baseName(item.file.name)) + '.md');
    if (item.assets.length) showNotice('У документа есть извлечённые изображения. Для рабочего Markdown с assets лучше скачать Bundle ZIP.', 'warning', 6000);
  }

  function putItemInZip(zip, item, folderPrefix = '') {
    const base = U.safeFileName(U.baseName(item.file.name)), chunks = chunksOf(item);
    const root = folderPrefix ? zip.folder(folderPrefix) : zip;
    if (chunks.length === 1) root.file(`${base}.md`, chunks[0]);
    else chunks.forEach((chunk, i) => root.file(`${base}_part_${String(i + 1).padStart(2, '0')}.md`, chunk));
    for (const asset of item.assets || []) root.file(asset.path, U.base64ToUint8(asset.base64));
  }

  async function saveZip(zip, filename) {
    saveBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }), filename);
  }

  async function downloadBundle() {
    const item = activeItem(); if (!item || item.status !== 'ok') return;
    const zip = new JSZip(); putItemInZip(zip, item);
    await saveZip(zip, U.safeFileName(U.baseName(item.file.name)) + '_markdown_bundle.zip');
  }

  async function downloadZip() {
    const ready = state.files.filter(f => f.status === 'ok'); if (!ready.length) return;
    const zip = new JSZip();
    for (const item of ready) putItemInZip(zip, item, ready.length > 1 ? U.safeFileName(U.baseName(item.file.name)) : '');
    await saveZip(zip, ready.length === 1 ? U.safeFileName(U.baseName(ready[0].file.name)) + '_markdown.zip' : 'markdown_export.zip');
  }

  function retransformAll() {
    for (const item of state.files.filter(f => f.status === 'ok')) item.displayMarkdown = T.apply(state.mode, item.rawMarkdown, item.file.name);
    renderActive();
  }

  /* ---------- Вставка из буфера обмена (Ctrl/Cmd+V) ---------- */
  function stamp() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`; }

  document.addEventListener('paste', e => {
    const t = e.target;
    if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement || t?.isContentEditable) return; // обычная вставка в поля
    const cd = e.clipboardData; if (!cd) return;
    let files = [...cd.files].map(f => /^image\./.test(f.name) || !f.name ? new File([f], `вставка-${stamp()}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }) : f);
    if (!files.length) {
      const html = cd.getData('text/html'), text = cd.getData('text/plain');
      if (html.trim()) files = [new File([html], `вставка-${stamp()}.html`, { type: 'text/html' })];
      else if (text.trim()) files = [new File([text], `вставка-${stamp()}.md`, { type: 'text/markdown' })];
    }
    if (!files.length) return;
    e.preventDefault();
    addFiles(files);
  });

  /* ---------- События ---------- */
  els.fileInput.addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(type => els.dropZone.addEventListener(type, e => { e.preventDefault(); els.dropZone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(type => els.dropZone.addEventListener(type, e => { e.preventDefault(); els.dropZone.classList.remove('dragging'); }));
  els.dropZone.addEventListener('drop', e => addFiles(e.dataTransfer.files));

  $$('.mode-btn').forEach(btn => btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    $$('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
    els.chunkSize.disabled = state.mode !== 'llm';
    retransformAll();
  }));
  els.chunkSize.disabled = true;
  els.chunkSize.addEventListener('change', renderActive);
  els.ocrLang.addEventListener('change', () => ocr.terminate());

  els.editor.addEventListener('input', () => {
    const item = activeItem(); if (!item || item.status !== 'ok') return;
    item.displayMarkdown = els.editor.value;
    renderPreview(item.displayMarkdown, item.assets); renderInfo(item); renderStats(item); renderChunks(item);
  });

  $$('.tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
    ['markdown', 'preview', 'info'].forEach(name => $('#' + name + 'Pane').classList.toggle('active', tab.dataset.tab === name));
  }));

  els.copyBtn.addEventListener('click', copyActive);
  els.downloadBtn.addEventListener('click', downloadActive);
  els.bundleBtn.addEventListener('click', downloadBundle);
  els.zipBtn.addEventListener('click', downloadZip);
  els.clearAll.addEventListener('click', () => {
    state.files = []; state.activeId = null; els.editor.value = ''; render(); els.notice.className = 'notice'; ocr.terminate();
  });

  window.addEventListener('pagehide', () => ocr.terminate());
  render();
})();
