/* [MD] OCR через Tesseract.js. Ядро, воркер и языковые модели лежат в vendor/tesseract,
   поэтому распознавание работает без внешних CDN. */
(() => {
  'use strict';
  const UMD = (window.UMD = window.UMD || {});

  const abs = path => new URL(path, document.baseURI).href;
  const STATUS = {
    'loading tesseract core': 'ядро',
    'initializing tesseract': 'инициализация',
    'loading language traineddata': 'язык',
    'initializing api': 'подготовка',
    'recognizing text': 'распознавание'
  };

  let worker = null, workerLang = null, onProgress = null;

  async function getWorker(lang) {
    if (!window.Tesseract) throw new Error('Tesseract.js не загружен. OCR сейчас недоступен.');
    if (worker && workerLang === lang) return worker;
    await terminate();
    onProgress?.(0.02, 'Загрузка OCR-модели…');
    worker = await Tesseract.createWorker(lang.split('+'), 1, {
      workerPath: abs('vendor/tesseract/worker.min.js'),
      corePath: abs('vendor/tesseract/core'),
      langPath: abs('vendor/tesseract/lang'),
      workerBlobURL: false,
      logger: m => {
        if (typeof m.progress !== 'number' || !onProgress) return;
        const p = Math.min(.98, Math.max(.02, m.progress));
        onProgress(p, m.status ? `OCR: ${STATUS[m.status] || m.status} ${Math.round(m.progress * 100)}%` : 'OCR…');
      }
    });
    workerLang = lang;
    return worker;
  }

  /** Склеивает переносы, собирает абзацы, угадывает списки и заголовки в тексте после OCR. */
  function normalize(text) {
    let t = String(text || '').replace(/\r\n?/g, '\n').replace(/­/g, '');
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

  /** Распознаёт canvas, File или Blob и возвращает нормализованный текст. */
  async function recognize(input, { lang = 'rus+eng', progress = null } = {}) {
    onProgress = progress;
    const w = await getWorker(lang);
    const result = await w.recognize(input);
    return normalize(result?.data?.text || '');
  }

  async function terminate() {
    if (!worker) return;
    try { await worker.terminate(); } catch {}
    worker = null; workerLang = null;
  }

  UMD.ocr = { recognize, terminate, normalize };
})();
