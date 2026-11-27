/* [MD] Обработка Markdown: режимы Clean и LLM Ready, оценка токенов, разбиение на части. */
(() => {
  'use strict';
  const UMD = (window.UMD = window.UMD || {});

  function parsePdfPages(md) {
    return [...String(md).matchAll(/<!--\s*page:(\d+)\s*-->\s*\n*([\s\S]*?)(?=<!--\s*page:\d+\s*-->|$)/g)]
      .map(m => ({ number: Number(m[1]), body: m[2].trim() }));
  }

  const edgeSignature = s => String(s || '').replace(/^#{1,6}\s+/, '').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();

  /** Убирает колонтитулы и номера страниц, которые повторяются на большинстве страниц PDF. */
  function stripPdfHeadersFooters(md) {
    const pages = parsePdfPages(md);
    if (pages.length < 3) return md.replace(/<!--\s*page:\d+\s*-->/g, '');
    const count = new Map();
    const pageBlocks = pages.map(p => p.body.split(/\n{2,}/).map(x => x.trim()).filter(Boolean));
    for (const blocks of pageBlocks) {
      const edges = [...blocks.slice(0, 2), ...blocks.slice(-2)];
      for (const b of new Set(edges.map(edgeSignature).filter(s => s.length >= 2 && s.length <= 130))) count.set(b, (count.get(b) || 0) + 1);
    }
    const threshold = Math.max(3, Math.ceil(pages.length * .5));
    const repeated = new Set([...count].filter(([, c]) => c >= threshold).map(([s]) => s));
    return pageBlocks.map(blocks => blocks.filter((b, i) => {
      const edge = i < 2 || i >= blocks.length - 2;
      if (edge && repeated.has(edgeSignature(b))) return false;
      if (edge && /^(?:page\s*)?\d+(?:\s*(?:of|из|\/|-)\s*\d+)?$/i.test(b.replace(/^#{1,6}\s+/, '').trim())) return false;
      return true;
    }).join('\n\n')).join('\n\n');
  }

  function clean(md) {
    let text = String(md || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/­/g, '');
    if (/<!--\s*page:\d+\s*-->/.test(text)) text = stripPdfHeadersFooters(text);
    text = text.replace(/([A-Za-zА-Яа-яЁё])-\s*\n\s*\n?\s*([a-zа-яё])/g, '$1$2');
    let lines = text.split('\n').map(l => l.replace(/[ \t]+$/g, ''));
    const counts = new Map();
    for (const raw of lines) {
      const s = raw.trim();
      if (s && s.length <= 100 && !/^#{1,6}\s/.test(s) && !/^[-*+]\s/.test(s) && !/^\|/.test(s)) counts.set(s, (counts.get(s) || 0) + 1);
    }
    const repeated = new Set([...counts].filter(([, c]) => c >= 4).map(([s]) => s));
    lines = lines.filter(l => !repeated.has(l.trim()));
    return lines.join('\n')
      .replace(/^\s*#{1,6}\s*$/gm, '')
      .replace(/^(#{1,6})\s*/gm, '$1 ')
      .replace(/^[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function llmReady(md, name) {
    let text = clean(md).replace(/^---\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    if (!/^#\s+/m.test(text)) text = `# ${UMD.util.baseName(name)}\n\n` + text;
    return text;
  }

  /** Грубая оценка токенов: кириллица «дороже» латиницы. */
  function estimateTokens(text) {
    const s = String(text || ''), cyr = (s.match(/[А-Яа-яЁё]/g) || []).length, latin = (s.match(/[A-Za-z0-9]/g) || []).length;
    const other = Math.max(0, s.length - cyr - latin);
    return Math.max(0, Math.ceil(cyr / 2.5 + latin / 4 + other / 5));
  }

  function stats(text, assets = []) {
    return {
      chars: text.length,
      words: (text.trim().match(/\S+/g) || []).length,
      tokens: estimateTokens(text),
      tables: (text.match(/^\|(?:\s*:?-+:?\s*\|)+$/gm) || []).length,
      headings: (text.match(/^#{1,6}\s+/gm) || []).length,
      assets: assets.length
    };
  }

  /** Режет Markdown на части по заголовкам, затем по абзацам и предложениям. */
  function split(md, maxTokens) {
    if (!maxTokens || estimateTokens(md) <= maxTokens) return [md];
    const maxChars = Math.max(2000, Math.round(maxTokens * 3.1));
    const sections = md.split(/(?=^#{1,3}\s+)/m).filter(Boolean), chunks = []; let current = '';
    const flush = () => { if (current.trim()) chunks.push(current.trim()); current = ''; };
    for (const section of sections.length ? sections : [md]) {
      if (section.length > maxChars) {
        flush(); let sub = '';
        for (const p of section.split(/\n\n+/)) {
          if (sub && sub.length + p.length + 2 > maxChars) { chunks.push(sub.trim()); sub = ''; }
          if (p.length > maxChars) {
            if (sub.trim()) { chunks.push(sub.trim()); sub = ''; }
            let piece = '';
            for (const sentence of p.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [p]) {
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
    flush();
    return chunks;
  }

  /** Превращает Markdown в выбранный режим: standard / clean / llm. */
  function apply(mode, md, name) {
    if (!md) return '';
    if (mode === 'clean') return clean(md);
    if (mode === 'llm') return llmReady(md, name);
    return md.trim();
  }

  UMD.transform = { apply, clean, llmReady, estimateTokens, stats, split };
})();
