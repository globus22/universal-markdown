/* [MD] Текстовые форматы: DOCX, ODT, PPTX, EPUB, RTF, HTML, TXT/MD. */
(() => {
  'use strict';
  const { util: U, formats } = window.UMD;

  const pad3 = n => String(n).padStart(3, '0');
  const xml = text => new DOMParser().parseFromString(text, 'application/xml');
  const needZip = () => { if (!window.JSZip) throw new Error('JSZip не загружен'); };

  /** Нормализует путь внутри архива: "OEBPS/text/../images/a.png" → "OEBPS/images/a.png". */
  function resolvePath(base, rel) {
    if (/^[a-z]+:/i.test(rel)) return rel;
    const parts = (base.includes('/') ? base.replace(/[^/]*$/, '') : '').concat(decodeURIComponent(rel.split('#')[0])).split('/');
    const out = [];
    for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
    return out.join('/');
  }

  /* ---------- DOCX ---------- */
  async function extractDocx(file) {
    if (!window.mammoth) throw new Error('Mammoth.js не загружен');
    const assets = []; let imageNo = 0; const folder = U.safeFileName(U.baseName(file.name));
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer }, {
      styleMap: [
        "p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Heading 1'] => h1:fresh", "p[style-name='Heading 2'] => h2:fresh", "p[style-name='Heading 3'] => h3:fresh"
      ],
      convertImage: mammoth.images.imgElement(async image => {
        const base64 = await image.read('base64'), ext = U.extFromContentType(image.contentType);
        const path = `assets/${folder}/image_${pad3(++imageNo)}.${ext}`;
        assets.push({ path, base64, contentType: image.contentType || U.contentTypeFromExt(ext) });
        return { src: path };
      })
    });
    let md = U.htmlToMarkdown(result.value);
    if (!md.trim()) md = (await mammoth.extractRawText({ arrayBuffer })).value;
    return { markdown: md, assets, meta: { engine: 'Mammoth + Turndown', images: assets.length, warnings: result.messages?.map(m => m.message).filter(Boolean) || [] } };
  }

  /* ---------- ODT (OpenDocument / LibreOffice) ---------- */
  async function extractOdt(file) {
    needZip();
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const content = zip.file('content.xml'); if (!content) throw new Error('В ODT не найден content.xml');
    const doc = xml(await content.async('string'));
    const folder = U.safeFileName(U.baseName(file.name)), assets = [], assetByPath = new Map();

    // Автоматические стили: какие из них жирные / курсивные.
    const bold = new Set(), italic = new Set();
    for (const st of doc.getElementsByTagName('style:style')) {
      const tp = st.getElementsByTagName('style:text-properties')[0]; if (!tp) continue;
      const name = st.getAttribute('style:name');
      if (tp.getAttribute('fo:font-weight') === 'bold') bold.add(name);
      if (tp.getAttribute('fo:font-style') === 'italic') italic.add(name);
    }

    const html = document.implementation.createHTMLDocument('');
    async function convert(node, parent) {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) { parent.append(child.textContent); continue; }
        if (child.nodeType !== 1) continue;
        const tag = child.nodeName; let el = null;
        if (tag === 'text:h') el = html.createElement('h' + Math.min(6, Number(child.getAttribute('text:outline-level')) || 2));
        else if (tag === 'text:p') el = html.createElement('p');
        else if (tag === 'text:list') el = html.createElement('ul');
        else if (tag === 'text:list-item') el = html.createElement('li');
        else if (tag === 'table:table') el = html.createElement('table');
        else if (tag === 'table:table-row') el = html.createElement('tr');
        else if (tag === 'table:table-cell') el = html.createElement('td');
        else if (tag === 'text:a') { el = html.createElement('a'); el.href = child.getAttribute('xlink:href') || ''; }
        else if (tag === 'text:line-break') { parent.append(html.createElement('br')); continue; }
        else if (tag === 'text:s') { parent.append(' '.repeat(Number(child.getAttribute('text:c')) || 1)); continue; }
        else if (tag === 'text:tab') { parent.append('\t'); continue; }
        else if (tag === 'text:note' || tag === 'office:annotation' || tag === 'text:tracked-changes') continue;
        else if (tag === 'draw:image') {
          const href = child.getAttribute('xlink:href') || '';
          const entry = zip.file(href);
          if (entry) {
            if (!assetByPath.has(href)) {
              const ext = U.extOf(href);
              const path = `assets/${folder}/image_${pad3(assets.length + 1)}.${ext}`;
              assets.push({ path, base64: await entry.async('base64'), contentType: U.contentTypeFromExt(ext) });
              assetByPath.set(href, path);
            }
            const img = html.createElement('img'); img.src = assetByPath.get(href); img.alt = ''; parent.append(img);
          }
          continue;
        } else if (tag === 'text:span') {
          const style = child.getAttribute('text:style-name');
          el = bold.has(style) ? html.createElement('strong') : italic.has(style) ? html.createElement('em') : html.createElement('span');
        } else el = html.createElement('span');
        if (el.tagName === 'P' && bold.has(child.getAttribute('text:style-name'))) { const b = html.createElement('strong'); el.append(b); await convert(child, b); }
        else await convert(child, el);
        parent.append(el);
      }
    }
    const body = doc.getElementsByTagName('office:text')[0] || doc.documentElement;
    await convert(body, html.body);
    return { markdown: U.htmlToMarkdown(html.body), assets, meta: { engine: 'JSZip + ODF', images: assets.length } };
  }

  /* ---------- PPTX ---------- */
  const textOf = el => [...el.getElementsByTagName('a:t')].map(n => n.textContent || '').filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const pptxTable = tbl => U.matrixToMarkdown([...tbl.getElementsByTagName('a:tr')].map(tr => [...tr.getElementsByTagName('a:tc')].map(textOf)));
  const shapePos = sp => { const off = sp.getElementsByTagName('a:off')[0]; return { x: Number(off?.getAttribute('x') || 0), y: Number(off?.getAttribute('y') || 0) }; };

  async function extractPptx(file) {
    needZip();
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slideNum = n => Number(n.match(/slide(\d+)/)[1]);
    const slideNames = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => slideNum(a) - slideNum(b));
    if (!slideNames.length) throw new Error('В PPTX не найдены слайды');
    const parts = [];
    for (let idx = 0; idx < slideNames.length; idx++) {
      const doc = xml(await zip.file(slideNames[idx]).async('string'));
      const slide = [`## Slide ${idx + 1}`], seen = new Set();
      const shapes = [...doc.getElementsByTagName('p:sp')].map(sp => ({ sp, ...shapePos(sp) })).sort((a, b) => a.y - b.y || a.x - b.x);
      for (const { sp } of shapes) {
        const text = textOf(sp); if (!text || seen.has(text)) continue; seen.add(text);
        const type = sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') || '';
        slide.push(type === 'title' || type === 'ctrTitle' ? `### ${text}` : text);
      }
      for (const tbl of doc.getElementsByTagName('a:tbl')) { const md = pptxTable(tbl); if (md.trim()) slide.push(md); }
      const noteFile = zip.file(`ppt/notesSlides/notesSlide${idx + 1}.xml`);
      if (noteFile) {
        const ndoc = xml(await noteFile.async('string'));
        const note = [...ndoc.getElementsByTagName('a:t')].map(n => n.textContent?.trim()).filter(t => t && !/^\d+$/.test(t)).join(' ').replace(/\s+/g, ' ').trim();
        if (note) slide.push(`#### Notes\n\n${note}`);
      }
      parts.push(slide.join('\n\n'));
    }
    const assets = [], folder = U.safeFileName(U.baseName(file.name));
    const media = Object.keys(zip.files).filter(n => /^ppt\/media\//.test(n) && !zip.files[n].dir).sort();
    for (let i = 0; i < media.length; i++) {
      const ext = U.extOf(media[i]);
      assets.push({ path: `assets/${folder}/ppt_image_${pad3(i + 1)}.${ext}`, base64: await zip.file(media[i]).async('base64'), contentType: U.contentTypeFromExt(ext) });
    }
    if (assets.length) parts.push('## Извлечённые изображения\n\n' + assets.map((a, i) => `![Изображение ${i + 1}](${a.path})`).join('\n\n'));
    return { markdown: parts.join('\n\n---\n\n'), assets, meta: { engine: 'JSZip + OOXML', slides: slideNames.length, images: assets.length } };
  }

  /* ---------- EPUB ---------- */
  async function extractEpub(file, ctx) {
    needZip();
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const container = zip.file('META-INF/container.xml'); if (!container) throw new Error('Это не EPUB: нет META-INF/container.xml');
    const opfPath = xml(await container.async('string')).getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
    const opfFile = opfPath && zip.file(opfPath); if (!opfFile) throw new Error('В EPUB не найден файл описания книги (OPF)');
    const opf = xml(await opfFile.async('string'));
    const manifest = new Map([...opf.getElementsByTagName('item')].map(i => [i.getAttribute('id'), { href: i.getAttribute('href'), type: i.getAttribute('media-type') }]));
    const spine = [...opf.getElementsByTagName('itemref')].map(r => manifest.get(r.getAttribute('idref'))).filter(i => i && /html/.test(i.type));
    const title = opf.getElementsByTagName('dc:title')[0]?.textContent?.trim() || '';
    const author = opf.getElementsByTagName('dc:creator')[0]?.textContent?.trim() || '';

    const folder = U.safeFileName(U.baseName(file.name)), assets = [], assetByPath = new Map(), parts = [];
    if (title) parts.push(`# ${title}` + (author ? `\n\n_${author}_` : ''));
    for (let i = 0; i < spine.length; i++) {
      ctx.setProgress(i / spine.length, `Глава ${i + 1} из ${spine.length}…`);
      const path = resolvePath(opfPath, spine[i].href), entry = zip.file(path); if (!entry) continue;
      const source = await entry.async('string');
      let doc = new DOMParser().parseFromString(source, 'application/xhtml+xml');
      if (doc.getElementsByTagName('parsererror').length) doc = new DOMParser().parseFromString(source, 'text/html');
      const body = doc.body || doc.getElementsByTagName('body')[0]; if (!body) continue;
      for (const img of [...body.querySelectorAll('img, image')]) {
        const attr = img.hasAttribute('src') ? 'src' : img.hasAttribute('href') ? 'href' : 'xlink:href';
        const src = resolvePath(path, img.getAttribute(attr) || ''), imgEntry = zip.file(src);
        if (!imgEntry) { img.remove(); continue; }
        if (!assetByPath.has(src)) {
          const ext = U.extOf(src), assetPath = `assets/${folder}/image_${pad3(assets.length + 1)}.${ext}`;
          assets.push({ path: assetPath, base64: await imgEntry.async('base64'), contentType: U.contentTypeFromExt(ext) });
          assetByPath.set(src, assetPath);
        }
        const out = doc.createElement('img'); out.setAttribute('src', assetByPath.get(src)); out.setAttribute('alt', img.getAttribute('alt') || '');
        img.replaceWith(out);
      }
      const md = U.htmlToMarkdown(new XMLSerializer().serializeToString(body).replace(/^<body[^>]*>|<\/body>$/g, '')).trim();
      if (md) parts.push(md);
    }
    if (parts.length <= (title ? 1 : 0)) throw new Error('В EPUB не найден текст (возможно, книга защищена DRM)');
    return { markdown: parts.join('\n\n---\n\n'), assets, meta: { engine: 'JSZip + EPUB', chapters: spine.length, images: assets.length, title } };
  }

  /* ---------- RTF ---------- */
  const RTF_SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr',
    'themedata', 'datastore', 'latentstyles', 'rsidtbl', 'listtable', 'listoverridetable', 'generator', 'xmlnstbl', 'mmathPr', 'filetbl', 'revtbl', 'pgdsctbl', 'fldinst']);

  function rtfToText(src) {
    let codepage = 1252, uc = 1, out = '', skipChars = 0, byteBuf = [];
    const stack = [{ skip: false }];
    const decoder = cp => { try { return new TextDecoder('windows-' + cp); } catch { return new TextDecoder('windows-1252'); } };
    let dec = decoder(codepage);
    const flushBytes = () => { if (byteBuf.length) { out += dec.decode(new Uint8Array(byteBuf)); byteBuf = []; } };
    const emit = s => { if (!stack.at(-1).skip) { flushBytes(); out += s; } };
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') { stack.push({ skip: stack.at(-1).skip }); continue; }
      if (ch === '}') { flushBytes(); stack.pop(); if (!stack.length) break; continue; }
      if (ch === '\r' || ch === '\n') continue;
      if (ch !== '\\') { if (skipChars) { skipChars--; continue; } emit(ch); continue; }
      const next = src[i + 1];
      if (next === '\\' || next === '{' || next === '}') { i++; if (skipChars) { skipChars--; continue; } emit(next); continue; }
      if (next === '*') { stack.at(-1).skip = true; i++; continue; }
      if (next === "'") {
        const hex = src.substr(i + 2, 2); i += 3;
        if (skipChars) { skipChars--; continue; }
        if (!stack.at(-1).skip) byteBuf.push(parseInt(hex, 16));
        continue;
      }
      if (next === '~') { i++; emit(' '); continue; }
      if (next === '-' || next === '_') { i++; continue; }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i + 1, i + 40));
      if (!m) { i++; continue; }
      i += m[0].length;
      const word = m[1], arg = m[2] !== undefined ? Number(m[2]) : null;
      if (RTF_SKIP.has(word)) { stack.at(-1).skip = true; continue; }
      if (word === 'ansicpg' && arg) { codepage = arg; dec = decoder(codepage); continue; }
      if (word === 'uc') { uc = arg ?? 1; continue; }
      if (word === 'u') { emit(String.fromCharCode(arg < 0 ? arg + 65536 : arg)); skipChars = uc; continue; }
      if (word === 'par' || word === 'line' || word === 'sect' || word === 'page') { emit('\n'); continue; }
      if (word === 'tab') { emit('\t'); continue; }
      if (word === 'cell') { emit(' | '); continue; }
      if (word === 'row') { emit('\n'); continue; }
      if (word === 'bullet') { emit('•'); continue; }
      if (word === 'emdash') { emit('—'); continue; }
      if (word === 'endash') { emit('–'); continue; }
      if (word === 'lquote' || word === 'rquote') { emit("'"); continue; }
      if (word === 'ldblquote' || word === 'rdblquote') { emit('"'); continue; }
    }
    flushBytes();
    return out;
  }

  async function extractRtf(file) {
    const raw = await file.text();
    if (!raw.trimStart().startsWith('{\\rtf')) throw new Error('Файл не похож на RTF');
    const text = rtfToText(raw)
      .split('\n').map(l => l.replace(/[ \t]+$/g, '').replace(/^\s*•\s*/, '- '))
      .map(l => /\|/.test(l) && !/^\s*\|/.test(l) ? '| ' + l.replace(/\s*\|\s*$/, '') + ' |' : l)
      .join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
    return { markdown: text, assets: [], meta: { engine: 'RTF parser' } };
  }

  /* ---------- HTML / текст ---------- */
  const extractHtml = async file => ({ markdown: U.htmlToMarkdown(await file.text()), assets: [], meta: { engine: 'Turndown' } });
  const extractText = async file => ({ markdown: await file.text(), assets: [], meta: { engine: 'Text' } });

  formats.register({ exts: ['docx'], label: 'DOCX', extract: extractDocx });
  formats.register({ exts: ['odt'], label: 'ODT', extract: extractOdt });
  formats.register({ exts: ['pptx'], label: 'PPTX', extract: extractPptx });
  formats.register({ exts: ['epub'], label: 'EPUB', extract: extractEpub });
  formats.register({ exts: ['rtf'], label: 'RTF', extract: extractRtf });
  formats.register({ exts: ['html', 'htm'], label: 'HTML', extract: extractHtml });
  formats.register({ exts: ['txt', 'md', 'markdown'], label: 'TXT/MD', extract: extractText });
})();
