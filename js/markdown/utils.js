/* [MD] Общие утилиты конвертера и реестр форматов.
   Все модули конвертера живут в пространстве имён window.UMD и подключаются обычными <script>,
   поэтому сайт работает и с локального диска (file://), и на GitHub Pages. */
(() => {
  'use strict';
  const UMD = (window.UMD = window.UMD || {});

  const extOf = name => (String(name).split('.').pop() || '').toLowerCase();
  const baseName = name => String(name).replace(/\.[^.]+$/, '') || 'document';
  const safeFileName = name => String(name).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'document';
  const humanSize = bytes => bytes < 1024 ? bytes + ' B' : bytes < 1024 ** 2 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 ** 2).toFixed(1) + ' MB';
  const escapeCell = v => String(v ?? '').replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|').trim();
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

  const MIME_BY_EXT = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    svg: 'image/svg+xml', emf: 'image/emf', wmf: 'image/wmf', tif: 'image/tiff', tiff: 'image/tiff'
  };
  const EXT_BY_MIME = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
    'image/svg+xml': 'svg', 'image/tiff': 'tiff'
  };
  const contentTypeFromExt = ext => MIME_BY_EXT[ext] || 'application/octet-stream';
  const extFromContentType = type => EXT_BY_MIME[type] || 'bin';

  function base64ToUint8(base64) {
    const bin = atob(base64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function median(nums) {
    if (!nums.length) return 0;
    const a = [...nums].sort((x, y) => x - y), m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function makeTurndown() {
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**' });
    if (window.turndownPluginGfm?.gfm) td.use(window.turndownPluginGfm.gfm);
    td.addRule('removeEmptyLinks', { filter: node => node.nodeName === 'A' && !node.textContent.trim() && !node.querySelector('img'), replacement: () => '' });
    return td;
  }

  /** Готовит таблицы к Markdown: абзацы внутри ячеек → строки через <br>,
      первая строка → заголовок (иначе GFM-плагин оставляет таблицу как HTML). */
  function normalizeTables(root) {
    const doc = root.ownerDocument;
    for (const table of root.querySelectorAll('table')) {
      for (const cell of table.querySelectorAll('td, th')) {
        const blocks = [...cell.querySelectorAll(':scope > p, :scope > div')];
        if (!blocks.length) continue;
        blocks.forEach((b, i) => { if (i) b.before(doc.createElement('br')); b.replaceWith(...b.childNodes); });
      }
      if (table.querySelector('th')) continue;
      const first = table.querySelector('tr'); if (!first) continue;
      for (const td of [...first.children]) { const th = doc.createElement('th'); th.append(...td.childNodes); td.replaceWith(th); }
      const thead = doc.createElement('thead'); first.parentNode.insertBefore(thead, first); thead.append(first);
      table.prepend(thead);
    }
  }

  /** HTML-строка или элемент → Markdown. */
  function htmlToMarkdown(html) {
    if (!window.TurndownService) throw new Error('Turndown не загружен');
    const doc = typeof html === 'string' ? new DOMParser().parseFromString(html, 'text/html') : null;
    const root = doc ? doc.body : html;
    root.querySelectorAll('script,style,noscript,iframe,object').forEach(n => n.remove());
    normalizeTables(root);
    return makeTurndown().turndown(root.innerHTML);
  }

  /** Двумерный массив → Markdown-таблица. */
  function matrixToMarkdown(rows) {
    rows = rows.map(r => Array.isArray(r) ? r : [r]);
    while (rows.length && rows[0].every(v => String(v ?? '').trim() === '')) rows.shift();
    while (rows.length && rows.at(-1).every(v => String(v ?? '').trim() === '')) rows.pop();
    if (!rows.length) return '_Пустой лист_';
    let maxCols = Math.max(...rows.map(r => r.length));
    while (maxCols > 1 && rows.every(r => String(r[maxCols - 1] ?? '').trim() === '')) maxCols--;
    const normalized = rows.map(r => Array.from({ length: maxCols }, (_, i) => escapeCell(r[i])));
    const header = normalized[0].map((v, i) => v || `Column ${i + 1}`);
    const out = ['| ' + header.join(' | ') + ' |', '| ' + header.map(() => '---').join(' | ') + ' |'];
    for (const row of normalized.slice(1)) out.push('| ' + row.join(' | ') + ' |');
    return out.join('\n');
  }

  /* ---------- Реестр форматов ----------
     Каждый модуль формата вызывает UMD.formats.register({ exts, label, extract }).
     extract(file, ctx) → { markdown, assets: [{ path, base64, contentType }], meta }.
     ctx: { setProgress(value 0..1, text), ocrMode: 'auto'|'always'|'off', ocr(input) → Promise<string> } */
  const registry = [];
  const formats = {
    register(format) { registry.push(format); },
    find(fileName) { const ext = extOf(fileName); return registry.find(f => f.exts.includes(ext)) || null; },
    get all() { return [...registry]; },
    get extensions() { return registry.flatMap(f => f.exts); }
  };

  UMD.util = {
    extOf, baseName, safeFileName, humanSize, escapeCell, escapeHtml, contentTypeFromExt, extFromContentType,
    base64ToUint8, median, htmlToMarkdown, matrixToMarkdown
  };
  UMD.formats = formats;
})();
