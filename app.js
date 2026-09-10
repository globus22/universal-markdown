(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const state = { files: [], activeId: null, mode: 'standard', ocrWorker: null, ocrWorkerLang: null, installPrompt: null };

  const els = {
    fileInput: $('#fileInput'), dropZone: $('#dropZone'), workspace: $('#workspace'), fileList: $('#fileList'),
    editor: $('#markdownEditor'), preview: $('#preview'), info: $('#info'), activeName: $('#activeName'), stats: $('#stats'),
    copyBtn: $('#copyBtn'), downloadBtn: $('#downloadBtn'), bundleBtn: $('#bundleBtn'), zipBtn: $('#zipBtn'), clearAll: $('#clearAll'),
    notice: $('#notice'), llmSetting: $('#llmSetting'), chunkSize: $('#chunkSize'), ocrMode: $('#ocrMode'), ocrLang: $('#ocrLang'),
    progressLine: $('#progressLine'), progressBar: $('#progressBar'), installBtn: $('#installBtn')
  };

  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const required = [
    ['Mammoth', window.mammoth], ['Turndown', window.TurndownService], ['SheetJS', window.XLSX],
    ['PDF.js', window.pdfjsLib], ['JSZip', window.JSZip], ['Marked', window.marked], ['DOMPurify', window.DOMPurify]
  ];
  const missing = required.filter(([, v]) => !v).map(([n]) => n);
  if (missing.length) showNotice('Не удалось загрузить библиотеки: ' + missing.join(', ') + '. Проверьте интернет и перезагрузите страницу.', 'error');

  function showNotice(text, type = 'info', timeout = 0) {
    els.notice.textContent = text;
    els.notice.className = 'notice show ' + type;
    if (timeout) setTimeout(() => { if (els.notice.textContent === text) els.notice.className = 'notice'; }, timeout);
  }

  const extOf = name => (name.split('.').pop() || '').toLowerCase();
  const baseName = name => name.replace(/\.[^.]+$/, '') || 'document';
  const safeFileName = name => name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'document';
  const humanSize = bytes => bytes < 1024 ? bytes + ' B' : bytes < 1024 ** 2 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 ** 2).toFixed(1) + ' MB';
  const escapeCell = v => String(v ?? '').replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|').trim();
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const contentTypeFromExt = ext => ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp',svg:'image/svg+xml',emf:'image/emf',wmf:'image/wmf',tif:'image/tiff',tiff:'image/tiff'}[ext] || 'application/octet-stream');
  const extFromContentType = type => ({'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/bmp':'bmp','image/svg+xml':'svg','image/tiff':'tiff'}[type] || 'bin');

  function makeTurndown() {
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**' });
    if (window.turndownPluginGfm?.gfm) td.use(window.turndownPluginGfm.gfm);
    td.addRule('removeEmptyLinks', { filter: node => node.nodeName === 'A' && !node.textContent.trim() && !node.querySelector('img'), replacement: () => '' });
    return td;
  }

  function htmlToMarkdown(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript,iframe,object').forEach(n => n.remove());
    return makeTurndown().turndown(doc.body.innerHTML);
  }

  function base64ToUint8(base64) {
    const bin = atob(base64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function assetPreviewUrl(asset) {
    if (!asset?.base64 || !asset.contentType?.startsWith('image/')) return '';
    if (/emf|wmf/.test(asset.contentType)) return '';
    return `data:${asset.contentType};base64,${asset.base64}`;
  }

  function markdownForPreview(md, assets = []) {
    let out = md || '';
    for (const asset of assets) {
      const data = assetPreviewUrl(asset); if (!data) continue;
      const escaped = asset.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`(!\\[[^\\]]*\\]\\()${escaped}(\\))`, 'g'), `$1${data}$2`);
    }
    return out;
  }

  async function extractDocx(file) {
    if (!window.mammoth) throw new Error('Mammoth.js не загружен');
    const assets = []; let imageNo = 0; const folder = safeFileName(baseName(file.name));
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer }, {
      styleMap: [
        "p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Heading 1'] => h1:fresh", "p[style-name='Heading 2'] => h2:fresh", "p[style-name='Heading 3'] => h3:fresh"
      ],
      convertImage: mammoth.images.imgElement(async image => {
        const base64 = await image.read('base64'); const ext = extFromContentType(image.contentType);
        const path = `assets/${folder}/image_${String(++imageNo).padStart(3, '0')}.${ext}`;
        assets.push({ path, base64, contentType: image.contentType || contentTypeFromExt(ext) });
        return { src: path };
      })
    });
    let md = htmlToMarkdown(result.value);
    if (!md.trim()) md = (await mammoth.extractRawText({ arrayBuffer })).value;
    return { markdown: md, assets, meta: { engine: 'Mammoth + Turndown', images: assets.length, warnings: result.messages?.map(m => m.message).filter(Boolean) || [] } };
  }

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

  function workbookToMarkdown(wb) {
    return wb.SheetNames.map(name => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false });
      return `## ${name}\n\n${matrixToMarkdown(rows)}`;
    }).join('\n\n---\n\n');
  }

  async function extractSpreadsheet(file) {
    if (!window.XLSX) throw new Error('SheetJS не загружен');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    return { markdown: workbookToMarkdown(wb), assets: [], meta: { engine: 'SheetJS', sheets: wb.SheetNames.length } };
  }

  async function extractCsv(file) {
    const text = await file.text();
    if (!window.XLSX) return { markdown: text, assets: [], meta: { engine: 'Text' } };
    const wb = XLSX.read(text, { type: 'string' });
    return { markdown: workbookToMarkdown(wb), assets: [], meta: { engine: 'SheetJS' } };
  }

  function median(nums) {
    if (!nums.length) return 0;
    const a = [...nums].sort((x, y) => x - y), m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function pageItemsToMarkdown(items) {
    const useful = items.filter(i => typeof i.str === 'string' && i.str.trim());
    if (!useful.length) return '';
    const sizes = useful.map(i => Math.abs(i.height || i.transform?.[3] || 0)).filter(Boolean), bodySize = median(sizes) || 10;
    const lines = [];
    for (const item of useful) {
      const x = item.transform?.[4] ?? 0, y = item.transform?.[5] ?? 0, size = Math.abs(item.height || item.transform?.[3] || bodySize);
      let line = lines.find(l => Math.abs(l.y - y) <= Math.max(2.2, size * .22));
      if (!line) { line = { y, parts: [], maxSize: size }; lines.push(line); }
      line.parts.push({ x, text: item.str.trim() }); line.maxSize = Math.max(line.maxSize, size);
    }
    lines.sort((a, b) => b.y - a.y);
    const textLines = lines.map(l => ({ text: l.parts.sort((a, b) => a.x - b.x).map(p => p.text).join(' ').replace(/\s+/g, ' ').trim(), size: l.maxSize })).filter(l => l.text);
    return textLines.map(line => {
      if (line.text.length <= 130 && line.size >= bodySize * 1.55) return '### ' + line.text;
      if (line.text.length <= 150 && line.size >= bodySize * 1.30) return '#### ' + line.text;
      return line.text;
    }).join('\n\n');
  }

  function normalizeOcrText(text) {
    let t = String(text || '').replace(/\r\n?/g, '\n').replace(/\u00ad/g, '');
    t = t.replace(/([A-Za-zА-Яа-яЁё])-\s*\n\s*([a-zа-яё])/g, '$1$2');
    const lines = t.split('\n').map(x => x.replace(/[ \t]+/g, ' ').trim());
    const out = []; let paragraph = '';
    const flush = () => { if (paragraph.trim()) out.push(paragraph.trim()); paragraph = ''; };
    for (const line of lines) {
      if (!line) { flush(); continue; }
      if (/^(?:[-•▪◦]|\d+[.)])\s+/.test(line)) { flush(); out.push(line.replace(/^•\s*/, '- ')); continue; }
      if (/^[A-ZА-ЯЁ0-9][A-ZА-ЯЁ0-9\s.,:;()\-–—]{3,80}$/.test(line) && line.length < 90) { flush(); out.push('### ' + line.replace(/\s+/g, ' ')); continue; }
      if (paragraph && !/[.!?:;…]$/.test(paragraph) && /^[a-zа-яё]/.test(line)) paragraph += ' ' + line;
      else { flush(); paragraph = line; }
    }
    flush();
    return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function ensureOcrWorker(item) {
    if (!window.Tesseract) throw new Error('Tesseract.js не загружен. OCR сейчас недоступен.');
    const lang = els.ocrLang.value;
    const langSpec = lang.includes('+') ? lang.split('+') : lang;
    if (state.ocrWorker && state.ocrWorkerLang === lang) return state.ocrWorker;
    if (state.ocrWorker) { try { await state.ocrWorker.terminate(); } catch {} state.ocrWorker = null; }
    setProgress(item, 0.02, 'Загрузка OCR-модели…');
    state.ocrWorker = await Tesseract.createWorker(langSpec, 1, {
      logger: m => {
        if (!item || item.status !== 'busy') return;
        if (typeof m.progress === 'number') {
          const p = Math.min(.98, Math.max(.02, m.progress));
          setProgress(item, p, m.status ? `OCR: ${translateOcrStatus(m.status)} ${Math.round(m.progress * 100)}%` : 'OCR…');
        }
      }
    });
    state.ocrWorkerLang = lang;
    return state.ocrWorker;
  }

  function translateOcrStatus(s) {
    return ({'loading tesseract core':'ядро','initializing tesseract':'инициализация','loading language traineddata':'язык','initializing api':'подготовка','recognizing text':'распознавание'}[s] || s);
  }

  async function ocrCanvas(canvas, item, pageNo = null) {
    const worker = await ensureOcrWorker(item);
    if (pageNo) item.progressText = `OCR страницы ${pageNo}…`;
    const result = await worker.recognize(canvas);
    return normalizeOcrText(result?.data?.text || '');
  }

  async function renderPdfPageForOcr(page) {
    const base = page.getViewport({ scale: 1 });
    const targetWidth = Math.min(2400, Math.max(1500, base.width * 2.2));
    const scale = targetWidth / base.width, viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }

  async function extractPdf(file, item) {
    if (!window.pdfjsLib) throw new Error('PDF.js не загружен');
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const meta = await pdf.getMetadata().catch(() => null), title = meta?.info?.Title?.trim();
    const parts = title ? [`# ${title}`] : [];
    let ocrPages = 0, textPages = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      setProgress(item, (i - 1) / pdf.numPages, `Страница ${i} из ${pdf.numPages}…`);
      const page = await pdf.getPage(i), content = await page.getTextContent();
      const rawText = content.items.map(x => x.str || '').join(' ').replace(/\s+/g, ' ').trim();
      const shouldOcr = els.ocrMode.value === 'always' || (els.ocrMode.value === 'auto' && rawText.length < 80);
      let body = '';
      if (shouldOcr) {
        const canvas = await renderPdfPageForOcr(page);
        body = await ocrCanvas(canvas, item, i); ocrPages++;
        canvas.width = canvas.height = 1;
      } else { body = pageItemsToMarkdown(content.items); textPages++; }
      parts.push(`<!-- page:${i} -->\n\n${body}`);
      setProgress(item, i / pdf.numPages, `Страница ${i} из ${pdf.numPages} готова`);
    }
    return { markdown: parts.join('\n\n'), assets: [], meta: { engine: ocrPages ? 'PDF.js + Tesseract.js' : 'PDF.js', pages: pdf.numPages, ocrPages, textPages, title: title || '' } };
  }

  function textFromElement(el) {
    return [...el.getElementsByTagName('a:t')].map(n => n.textContent || '').filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function pptxTableToMarkdown(tbl) {
    return matrixToMarkdown([...tbl.getElementsByTagName('a:tr')].map(tr => [...tr.getElementsByTagName('a:tc')].map(tc => textFromElement(tc))));
  }

  function shapePosition(sp) {
    const off = sp.getElementsByTagName('a:off')[0];
    return { x: Number(off?.getAttribute('x') || 0), y: Number(off?.getAttribute('y') || 0) };
  }

  async function extractPptx(file) {
    if (!window.JSZip) throw new Error('JSZip не загружен');
    const zip = await JSZip.loadAsync(await file.arrayBuffer()), parser = new DOMParser();
    const slideNames = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
    if (!slideNames.length) throw new Error('В PPTX не найдены слайды');
    const parts = [];
    for (let idx = 0; idx < slideNames.length; idx++) {
      const doc = parser.parseFromString(await zip.file(slideNames[idx]).async('string'), 'application/xml');
      const slide = [`## Slide ${idx + 1}`], seen = new Set();
      const shapes = [...doc.getElementsByTagName('p:sp')].map(sp => ({ sp, ...shapePosition(sp) })).sort((a,b) => a.y - b.y || a.x - b.x);
      for (const { sp } of shapes) {
        const text = textFromElement(sp); if (!text || seen.has(text)) continue; seen.add(text);
        const type = sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') || '';
        slide.push(type === 'title' || type === 'ctrTitle' ? `### ${text}` : text);
      }
      for (const tbl of [...doc.getElementsByTagName('a:tbl')]) { const md = pptxTableToMarkdown(tbl); if (md.trim()) slide.push(md); }
      const noteName = `ppt/notesSlides/notesSlide${idx + 1}.xml`;
      if (zip.file(noteName)) {
        const ndoc = parser.parseFromString(await zip.file(noteName).async('string'), 'application/xml');
        const noteTexts = [...ndoc.getElementsByTagName('a:t')].map(n => n.textContent?.trim()).filter(Boolean).filter(t => !/^\d+$/.test(t));
        const note = noteTexts.join(' ').replace(/\s+/g, ' ').trim();
        if (note) slide.push(`#### Notes\n\n${note}`);
      }
      parts.push(slide.join('\n\n'));
    }
    const assets = [], folder = safeFileName(baseName(file.name));
    const media = Object.keys(zip.files).filter(n => /^ppt\/media\//.test(n) && !zip.files[n].dir).sort();
    for (let i = 0; i < media.length; i++) {
      const ext = extOf(media[i]), base64 = await zip.file(media[i]).async('base64');
      assets.push({ path: `assets/${folder}/ppt_image_${String(i + 1).padStart(3, '0')}.${ext}`, base64, contentType: contentTypeFromExt(ext) });
    }
    if (assets.length) parts.push('## Извлечённые изображения\n\n' + assets.map((a,i) => `![Изображение ${i+1}](${a.path})`).join('\n\n'));
    return { markdown: parts.join('\n\n---\n\n'), assets, meta: { engine: 'JSZip + OOXML', slides: slideNames.length, images: assets.length } };
  }

  async function extractImage(file, item) {
    if (els.ocrMode.value === 'off') throw new Error('Для изображения включите OCR (Auto или Всегда).');
    const worker = await ensureOcrWorker(item);
    setProgress(item, .08, 'OCR изображения…');
    const result = await worker.recognize(file);
    const text = normalizeOcrText(result?.data?.text || '');
    if (!text) throw new Error('OCR не смог распознать текст на изображении.');
    setProgress(item, 1, 'Готово');
    return { markdown: text, assets: [], meta: { engine: 'Tesseract.js', ocrPages: 1, pages: 1 } };
  }

  async function extractHtml(file) { return { markdown: htmlToMarkdown(await file.text()), assets: [], meta: { engine: 'Turndown' } }; }

  async function convertFile(file, item) {
    const ext = extOf(file.name);
    if (ext === 'docx') return extractDocx(file);
    if (ext === 'xlsx' || ext === 'xls') return extractSpreadsheet(file);
    if (ext === 'csv') return extractCsv(file);
    if (ext === 'pdf') return extractPdf(file, item);
    if (ext === 'pptx') return extractPptx(file);
    if (ext === 'html' || ext === 'htm') return extractHtml(file);
    if (['png','jpg','jpeg','webp','bmp'].includes(ext)) return extractImage(file, item);
    if (['txt','md','markdown'].includes(ext)) return { markdown: await file.text(), assets: [], meta: { engine: 'Text' } };
    throw new Error('Формат .' + ext + ' пока не поддерживается');
  }

  function parsePdfPages(md) {
    const matches = [...String(md).matchAll(/<!--\s*page:(\d+)\s*-->\s*\n*([\s\S]*?)(?=<!--\s*page:\d+\s*-->|$)/g)];
    return matches.map(m => ({ number: Number(m[1]), body: m[2].trim() }));
  }

  function edgeSignature(s) {
    return String(s || '').replace(/^#{1,6}\s+/, '').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function stripPdfHeadersFooters(md) {
    const pages = parsePdfPages(md); if (pages.length < 3) return md.replace(/<!--\s*page:\d+\s*-->/g, '');
    const count = new Map();
    const pageBlocks = pages.map(p => p.body.split(/\n{2,}/).map(x => x.trim()).filter(Boolean));
    for (const blocks of pageBlocks) {
      const edges = [...blocks.slice(0,2), ...blocks.slice(-2)];
      for (const b of new Set(edges.map(edgeSignature).filter(s => s.length >= 2 && s.length <= 130))) count.set(b, (count.get(b) || 0) + 1);
    }
    const threshold = Math.max(3, Math.ceil(pages.length * .5));
    const repeated = new Set([...count].filter(([,c]) => c >= threshold).map(([s]) => s));
    const cleaned = pageBlocks.map(blocks => blocks.filter((b,i) => {
      const edge = i < 2 || i >= blocks.length - 2, sig = edgeSignature(b);
      if (edge && repeated.has(sig)) return false;
      if (edge && /^(?:page\s*)?\d+(?:\s*(?:of|из|\/|-)\s*\d+)?$/i.test(b.replace(/^#{1,6}\s+/, '').trim())) return false;
      return true;
    }).join('\n\n')).join('\n\n');
    return cleaned;
  }

  function cleanMarkdown(md) {
    let text = String(md || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\u00ad/g, '');
    if (/<!--\s*page:\d+\s*-->/.test(text)) text = stripPdfHeadersFooters(text);
    text = text.replace(/([A-Za-zА-Яа-яЁё])-\s*\n\s*\n?\s*([a-zа-яё])/g, '$1$2');
    let lines = text.split('\n').map(l => l.replace(/[ \t]+$/g, ''));
    const counts = new Map();
    for (const raw of lines) {
      const s = raw.trim();
      if (s && s.length <= 100 && !/^#{1,6}\s/.test(s) && !/^[-*+]\s/.test(s) && !/^\|/.test(s)) counts.set(s, (counts.get(s) || 0) + 1);
    }
    const repeated = new Set([...counts].filter(([,c]) => c >= 4).map(([s]) => s));
    lines = lines.filter(l => !repeated.has(l.trim()));
    text = lines.join('\n')
      .replace(/^\s*#{1,6}\s*$/gm, '')
      .replace(/^(#{1,6})\s*/gm, '$1 ')
      .replace(/^[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return text;
  }

  function llmReady(md, name) {
    let text = cleanMarkdown(md);
    text = text.replace(/^---\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    if (!/^#\s+/m.test(text)) text = `# ${baseName(name)}\n\n` + text;
    return text;
  }

  function transform(item) {
    if (!item?.rawMarkdown) return '';
    if (state.mode === 'clean') return cleanMarkdown(item.rawMarkdown);
    if (state.mode === 'llm') return llmReady(item.rawMarkdown, item.file.name);
    return item.rawMarkdown.trim();
  }

  function estimateTokens(text) {
    const s = String(text || ''), cyr = (s.match(/[А-Яа-яЁё]/g) || []).length, latin = (s.match(/[A-Za-z0-9]/g) || []).length, other = Math.max(0, s.length - cyr - latin);
    return Math.max(0, Math.ceil(cyr / 2.5 + latin / 4 + other / 5));
  }

  function getStats(text, item) {
    const chars = text.length, words = (text.trim().match(/\S+/g) || []).length, tokens = estimateTokens(text);
    const tables = (text.match(/^\|(?:\s*:?-+:?\s*\|)+$/gm) || []).length;
    const headings = (text.match(/^#{1,6}\s+/gm) || []).length;
    return { chars, words, tokens, tables, headings, assets: item?.assets?.length || 0 };
  }

  function splitMarkdown(md, maxTokens) {
    if (!maxTokens || estimateTokens(md) <= maxTokens) return [md];
    const maxChars = Math.max(2000, Math.round(maxTokens * 3.1));
    const sections = md.split(/(?=^#{1,3}\s+)/m).filter(Boolean), chunks = []; let current = '';
    const flush = () => { if (current.trim()) chunks.push(current.trim()); current = ''; };
    for (const section of sections.length ? sections : [md]) {
      if (section.length > maxChars) {
        flush(); const paras = section.split(/\n\n+/); let sub = '';
        for (const p of paras) {
          if (sub && sub.length + p.length + 2 > maxChars) { chunks.push(sub.trim()); sub = ''; }
          if (p.length > maxChars) {
            if (sub.trim()) { chunks.push(sub.trim()); sub = ''; }
            const sentences = p.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [p]; let piece = '';
            for (const sentence of sentences) {
              if (piece && piece.length + sentence.length > maxChars) { chunks.push(piece.trim()); piece = ''; }
              piece += sentence;
            }
            if (piece.trim()) chunks.push(piece.trim());
          } else sub += (sub ? '\n\n' : '') + p;
        }
        if (sub.trim()) chunks.push(sub.trim());
      } else if (current && current.length + section.length > maxChars) { flush(); current = section; }
      else current += section;
    }
    flush(); return chunks;
  }

  function setProgress(item, value, text) {
    if (!item) return;
    item.progress = Math.max(0, Math.min(1, value || 0)); item.progressText = text || '';
    if (item.id === state.activeId) renderActive(); else renderFileList();
  }

  async function addFiles(fileList) {
    const accepted = [...fileList].filter(f => /\.(docx|pdf|pptx|xlsx|xls|html?|csv|txt|md|markdown|png|jpe?g|webp|bmp)$/i.test(f.name));
    if (!accepted.length) { showNotice('Поддерживаются DOCX, PDF, PPTX, XLSX/XLS, HTML, CSV, TXT/MD и PNG/JPG/WEBP/BMP.', 'error', 5000); return; }
    for (const file of accepted) {
      const id = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random();
      state.files.push({ id, file, status: 'busy', rawMarkdown: '', displayMarkdown: '', assets: [], meta: {}, error: '', progress: 0, progressText: 'В очереди…' });
      if (!state.activeId) state.activeId = id;
    }
    render();
    for (const item of state.files.filter(x => x.status === 'busy')) {
      try {
        setProgress(item, .01, 'Чтение файла…');
        const result = await convertFile(item.file, item);
        item.rawMarkdown = result.markdown || ''; item.assets = result.assets || []; item.meta = result.meta || {};
        item.displayMarkdown = transform(item); item.status = 'ok'; item.progress = 1; item.progressText = 'Готово';
      } catch (err) { item.status = 'error'; item.error = err?.message || String(err); item.progressText = 'Ошибка'; }
      render();
    }
    const errors = state.files.filter(x => x.status === 'error');
    if (errors.length) showNotice(`${errors.length} файл(а) не удалось обработать. Откройте файл слева, чтобы увидеть причину.`, 'error');
    else showNotice('Готово. Все документы обработаны локально в браузере.', 'info', 3500);
  }

  const activeItem = () => state.files.find(f => f.id === state.activeId) || null;

  function renderFileList() {
    els.fileList.innerHTML = '';
    for (const item of state.files) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'file-item' + (item.id === state.activeId ? ' active' : '');
      const status = item.status === 'ok' ? 'Готово' : item.status === 'busy' ? (item.progressText || 'Обработка…') : 'Ошибка';
      btn.innerHTML = `<div class="file-name"></div><div class="file-meta"><span class="dot ${item.status}"></span><span class="file-status"></span><span>·</span><span>${humanSize(item.file.size)}</span></div>${item.status === 'busy' ? `<div class="mini-progress"><span style="width:${Math.round((item.progress||0)*100)}%"></span></div>` : ''}`;
      btn.querySelector('.file-name').textContent = item.file.name; btn.querySelector('.file-status').textContent = status;
      btn.addEventListener('click', () => { state.activeId = item.id; render(); }); els.fileList.appendChild(btn);
    }
  }

  function renderInfo(item) {
    if (!item) { els.info.innerHTML = ''; return; }
    const text = item.displayMarkdown || '', s = getStats(text, item), m = item.meta || {};
    const cards = [
      ['Формат', extOf(item.file.name).toUpperCase()], ['Движок', m.engine || '—'], ['Размер', humanSize(item.file.size)], ['Примерно токенов', s.tokens.toLocaleString('ru-RU')],
      ['Страниц / слайдов', m.pages || m.slides || '—'], ['OCR-страниц', m.ocrPages ?? '—'], ['Таблиц', s.tables], ['Изображений', item.assets.length]
    ];
    let html = `<div class="info-grid">${cards.map(([a,b]) => `<div class="info-card"><small>${escapeHtml(a)}</small><b>${escapeHtml(String(b))}</b></div>`).join('')}</div>`;
    if (item.assets.length) html += `<div class="info-section"><h3>Assets</h3><div class="asset-list">${item.assets.map(a => escapeHtml(a.path)).join('<br>')}</div></div>`;
    if (m.warnings?.length) html += `<div class="info-section"><h3>Предупреждения конвертера</h3><div class="asset-list">${m.warnings.map(escapeHtml).join('<br>')}</div></div>`;
    els.info.innerHTML = html;
  }

  function renderActive() {
    const item = activeItem(), ready = item?.status === 'ok';
    els.copyBtn.disabled = !ready; els.downloadBtn.disabled = !ready; els.bundleBtn.disabled = !ready; els.zipBtn.disabled = !state.files.some(f => f.status === 'ok');
    if (!item) { els.activeName.textContent = '—'; els.stats.textContent = '—'; els.editor.value = ''; els.progressLine.classList.add('hidden'); renderPreview('', []); renderInfo(null); return; }
    els.activeName.textContent = item.file.name;
    if (item.status === 'error') { els.stats.textContent = item.error; els.editor.value = `Ошибка обработки:\n\n${item.error}`; els.progressLine.classList.add('hidden'); renderPreview('', []); renderInfo(item); return; }
    if (item.status === 'busy') {
      els.stats.textContent = item.progressText || 'Обработка файла…'; els.editor.value = ''; els.progressLine.classList.remove('hidden'); els.progressBar.style.width = `${Math.round((item.progress || 0) * 100)}%`; renderPreview('', []); renderInfo(item); return;
    }
    els.progressLine.classList.add('hidden');
    const text = item.displayMarkdown ?? transform(item); if (els.editor.value !== text) els.editor.value = text;
    const s = getStats(text, item), chunkCount = state.mode === 'llm' ? splitMarkdown(text, Number(els.chunkSize.value)).length : 1;
    els.stats.textContent = `${s.words.toLocaleString('ru-RU')} слов · ${s.chars.toLocaleString('ru-RU')} символов · ≈ ${s.tokens.toLocaleString('ru-RU')} токенов${s.tables ? ' · ' + s.tables + ' табл.' : ''}${s.assets ? ' · ' + s.assets + ' изобр.' : ''}${chunkCount > 1 ? ' · ' + chunkCount + ' частей' : ''}`;
    renderPreview(text, item.assets); renderInfo(item);
  }

  function renderPreview(md, assets) {
    try {
      const source = markdownForPreview(md || '', assets || []), rendered = window.marked ? marked.parse(source, { gfm: true, breaks: false }) : `<pre>${escapeHtml(source)}</pre>`;
      els.preview.innerHTML = window.DOMPurify ? DOMPurify.sanitize(rendered, { ADD_ATTR: ['target'] }) : rendered;
    } catch { els.preview.textContent = md || ''; }
  }

  function render() { els.workspace.classList.toggle('visible', state.files.length > 0); renderFileList(); renderActive(); }

  function blobDownload(content, filename, type = 'text/markdown;charset=utf-8') {
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([content], { type }));
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copyActive() {
    const item = activeItem(); if (!item || item.status !== 'ok') return;
    try { await navigator.clipboard.writeText(item.displayMarkdown); showNotice('Markdown скопирован в буфер обмена.', 'info', 2200); }
    catch { els.editor.focus(); els.editor.select(); document.execCommand('copy'); showNotice('Markdown скопирован.', 'info', 2200); }
  }

  function downloadActive() {
    const item = activeItem(); if (!item || item.status !== 'ok') return;
    blobDownload(item.displayMarkdown, safeFileName(baseName(item.file.name)) + '.md');
    if (item.assets.length) showNotice('У документа есть извлечённые изображения. Для рабочего Markdown с assets лучше скачать Bundle ZIP.', 'warning', 6000);
  }

  async function putItemInZip(zip, item, folderPrefix = '') {
    const base = safeFileName(baseName(item.file.name)), chunkTarget = state.mode === 'llm' ? Number(els.chunkSize.value) : 0, chunks = splitMarkdown(item.displayMarkdown, chunkTarget);
    const root = folderPrefix ? zip.folder(folderPrefix) : zip;
    if (chunks.length === 1) root.file(`${base}.md`, chunks[0]);
    else chunks.forEach((chunk,i) => root.file(`${base}_part_${String(i+1).padStart(2,'0')}.md`, chunk));
    for (const asset of item.assets || []) root.file(asset.path, base64ToUint8(asset.base64));
  }

  async function saveZip(zip, filename) {
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const a = document.createElement('a'), url = URL.createObjectURL(blob); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function downloadBundle() {
    const item = activeItem(); if (!item || item.status !== 'ok') return;
    const zip = new JSZip(); await putItemInZip(zip, item); await saveZip(zip, safeFileName(baseName(item.file.name)) + '_markdown_bundle.zip');
  }

  async function downloadZip() {
    const ready = state.files.filter(f => f.status === 'ok'); if (!ready.length) return;
    const zip = new JSZip(); for (const item of ready) await putItemInZip(zip, item, ready.length > 1 ? safeFileName(baseName(item.file.name)) : '');
    await saveZip(zip, ready.length === 1 ? safeFileName(baseName(ready[0].file.name)) + '_markdown.zip' : 'markdown_export.zip');
  }

  function retransformAll() { for (const item of state.files.filter(f => f.status === 'ok')) item.displayMarkdown = transform(item); renderActive(); }

  els.fileInput.addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  ['dragenter','dragover'].forEach(type => els.dropZone.addEventListener(type, e => { e.preventDefault(); els.dropZone.classList.add('dragging'); }));
  ['dragleave','drop'].forEach(type => els.dropZone.addEventListener(type, e => { e.preventDefault(); els.dropZone.classList.remove('dragging'); }));
  els.dropZone.addEventListener('drop', e => addFiles(e.dataTransfer.files));

  $$('.mode-btn').forEach(btn => btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode; $$('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
    els.llmSetting.classList.toggle('hidden', state.mode !== 'llm'); retransformAll();
  }));
  els.chunkSize.addEventListener('change', renderActive);
  els.ocrLang.addEventListener('change', async () => { if (state.ocrWorker) { try { await state.ocrWorker.terminate(); } catch {} state.ocrWorker = null; state.ocrWorkerLang = null; } });

  els.editor.addEventListener('input', () => {
    const item = activeItem(); if (!item || item.status !== 'ok') return;
    item.displayMarkdown = els.editor.value; renderPreview(item.displayMarkdown, item.assets); renderInfo(item);
    const s = getStats(item.displayMarkdown, item), chunks = state.mode === 'llm' ? splitMarkdown(item.displayMarkdown, Number(els.chunkSize.value)).length : 1;
    els.stats.textContent = `${s.words.toLocaleString('ru-RU')} слов · ${s.chars.toLocaleString('ru-RU')} символов · ≈ ${s.tokens.toLocaleString('ru-RU')} токенов${s.tables ? ' · ' + s.tables + ' табл.' : ''}${s.assets ? ' · ' + s.assets + ' изобр.' : ''}${chunks > 1 ? ' · ' + chunks + ' частей' : ''}`;
  });

  $$('.tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
    ['markdown','preview','info'].forEach(name => $('#' + name + 'Pane').classList.toggle('active', tab.dataset.tab === name));
    if (tab.dataset.tab === 'preview') renderPreview(activeItem()?.displayMarkdown || '', activeItem()?.assets || []);
    if (tab.dataset.tab === 'info') renderInfo(activeItem());
  }));

  els.copyBtn.addEventListener('click', copyActive); els.downloadBtn.addEventListener('click', downloadActive); els.bundleBtn.addEventListener('click', downloadBundle); els.zipBtn.addEventListener('click', downloadZip);
  els.clearAll.addEventListener('click', async () => {
    state.files = []; state.activeId = null; els.editor.value = ''; render(); els.notice.className = 'notice';
    if (state.ocrWorker) { try { await state.ocrWorker.terminate(); } catch {} state.ocrWorker = null; state.ocrWorkerLang = null; }
  });

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.installPrompt = e; els.installBtn.classList.remove('hidden'); });
  els.installBtn.addEventListener('click', async () => {
    if (!state.installPrompt) return; state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; els.installBtn.classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => { els.installBtn.classList.add('hidden'); showNotice('[MD] установлен как приложение.', 'info', 3000); });

  window.addEventListener('pagehide', () => { if (state.ocrWorker) { try { state.ocrWorker.terminate(); } catch {} } });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  render();
})();
