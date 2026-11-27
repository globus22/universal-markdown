/* [MD] PDF (текстовый слой + OCR для сканов) и изображения (OCR). */
(() => {
  'use strict';
  const { util: U, formats } = window.UMD;

  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.js', document.baseURI).href;

  /** Собирает строки страницы по координатам и угадывает заголовки по размеру шрифта. */
  function pageItemsToMarkdown(items) {
    const useful = items.filter(i => typeof i.str === 'string' && i.str.trim());
    if (!useful.length) return '';
    const sizes = useful.map(i => Math.abs(i.height || i.transform?.[3] || 0)).filter(Boolean), bodySize = U.median(sizes) || 10;
    const lines = [];
    for (const item of useful) {
      const x = item.transform?.[4] ?? 0, y = item.transform?.[5] ?? 0, size = Math.abs(item.height || item.transform?.[3] || bodySize);
      let line = lines.find(l => Math.abs(l.y - y) <= Math.max(2.2, size * .22));
      if (!line) { line = { y, parts: [], maxSize: size }; lines.push(line); }
      line.parts.push({ x, text: item.str.trim() }); line.maxSize = Math.max(line.maxSize, size);
    }
    lines.sort((a, b) => b.y - a.y);
    return lines
      .map(l => ({ text: l.parts.sort((a, b) => a.x - b.x).map(p => p.text).join(' ').replace(/\s+/g, ' ').trim(), size: l.maxSize }))
      .filter(l => l.text)
      .map(line => {
        if (line.text.length <= 130 && line.size >= bodySize * 1.55) return '### ' + line.text;
        if (line.text.length <= 150 && line.size >= bodySize * 1.30) return '#### ' + line.text;
        return line.text;
      }).join('\n\n');
  }

  async function renderPageForOcr(page) {
    const base = page.getViewport({ scale: 1 });
    const targetWidth = Math.min(2400, Math.max(1500, base.width * 2.2));
    const viewport = page.getViewport({ scale: targetWidth / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d', { willReadFrequently: true }), viewport }).promise;
    return canvas;
  }

  async function extractPdf(file, ctx) {
    if (!window.pdfjsLib) throw new Error('PDF.js не загружен');
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const meta = await pdf.getMetadata().catch(() => null), title = meta?.info?.Title?.trim();
    const parts = title ? [`# ${title}`] : [];
    let ocrPages = 0, textPages = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      ctx.setProgress((i - 1) / pdf.numPages, `Страница ${i} из ${pdf.numPages}…`);
      const page = await pdf.getPage(i), content = await page.getTextContent();
      const rawText = content.items.map(x => x.str || '').join(' ').replace(/\s+/g, ' ').trim();
      const shouldOcr = ctx.ocrMode === 'always' || (ctx.ocrMode === 'auto' && rawText.length < 80);
      let body;
      if (shouldOcr) {
        const canvas = await renderPageForOcr(page);
        body = await ctx.ocr(canvas, `OCR страницы ${i}…`); ocrPages++;
        canvas.width = canvas.height = 1;
      } else { body = pageItemsToMarkdown(content.items); textPages++; }
      parts.push(`<!-- page:${i} -->\n\n${body}`);
      ctx.setProgress(i / pdf.numPages, `Страница ${i} из ${pdf.numPages} готова`);
    }
    return { markdown: parts.join('\n\n'), assets: [], meta: { engine: ocrPages ? 'PDF.js + Tesseract.js' : 'PDF.js', pages: pdf.numPages, ocrPages, textPages, title: title || '' } };
  }

  async function extractImage(file, ctx) {
    if (ctx.ocrMode === 'off') throw new Error('Для изображения включите OCR (Auto или Всегда).');
    ctx.setProgress(.08, 'OCR изображения…');
    const text = await ctx.ocr(file, 'OCR изображения…');
    if (!text) throw new Error('OCR не смог распознать текст на изображении.');
    ctx.setProgress(1, 'Готово');
    return { markdown: text, assets: [], meta: { engine: 'Tesseract.js', ocrPages: 1, pages: 1 } };
  }

  formats.register({ exts: ['pdf'], label: 'PDF', extract: extractPdf });
  formats.register({ exts: ['png', 'jpg', 'jpeg', 'webp', 'bmp'], label: 'PNG/JPG/WEBP', extract: extractImage });
})();
