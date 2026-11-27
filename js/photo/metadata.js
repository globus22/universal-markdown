/* [IMG] Чтение метаданных исходного снимка.
   1) Быстрая проверка блоков (EXIF / XMP / ICC / IPTC / текстовые чанки PNG) по байтам файла.
   2) Подробный разбор полей через exifr: камера, дата, GPS, программа, автор, серийные номера. */
(() => {
  'use strict';
  const PS = (window.PS = window.PS || {});

  /** Какие блоки метаданных есть в файле (эвристика по заголовкам, без полного разбора). */
  function detectBlocks(bytes, fileType) {
    const data = new Uint8Array(bytes), max = Math.min(data.length, 3 * 1024 * 1024), found = [];
    const ascii = (from, to) => String.fromCharCode(...data.slice(from, Math.min(to, data.length)));
    if (fileType === 'image/jpeg') {
      for (let i = 2; i < max - 8;) {
        if (data[i] !== 255) break;
        const marker = data[i + 1];
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || marker === 0xd8) { i += 2; continue; }
        const length = (data[i + 2] << 8) | data[i + 3]; if (length < 2) break;
        if (marker === 0xe1) {
          const header = ascii(i + 4, i + 34);
          found.push(header.startsWith('Exif') ? 'EXIF' : header.includes('http://ns.adobe.com/xap') ? 'XMP' : 'APP1');
        }
        if (marker === 0xe2) found.push('ICC');
        if (marker === 0xed) found.push('IPTC');
        if (marker === 0xfe) found.push('Комментарий JPEG');
        i += length + 2;
      }
    } else if (fileType === 'image/png') {
      for (let p = 8; p + 12 < max;) {
        const length = (data[p] * 16777216 + data[p + 1] * 65536 + data[p + 2] * 256 + data[p + 3]) >>> 0;
        const tag = ascii(p + 4, p + 8);
        if (['eXIf', 'tEXt', 'iTXt', 'zTXt', 'iCCP', 'tIME'].includes(tag)) found.push(tag === 'eXIf' ? 'EXIF' : tag === 'iCCP' ? 'ICC' : 'PNG ' + tag);
        if (tag === 'IEND' || length > max) break;
        p += 12 + length;
      }
    } else if (fileType === 'image/webp') {
      const header = new TextDecoder('latin1').decode(data.slice(0, Math.min(max, 1024)));
      if (header.includes('EXIF')) found.push('EXIF');
      if (header.includes('XMP ')) found.push('XMP');
      if (header.includes('ICCP')) found.push('ICC');
    }
    return [...new Set(found)];
  }

  const fmtDate = v => v instanceof Date && !isNaN(v) ? v.toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' }) : String(v);
  const round = (n, d = 6) => Math.round(n * 10 ** d) / 10 ** d;
  const text = v => Array.isArray(v) ? v.join(', ') : v instanceof Date ? fmtDate(v) : typeof v === 'object' && v ? (v.value ?? JSON.stringify(v)) : String(v);

  /* Поля, которые стоит показать человеку, по группам и с оценкой «насколько это личное». */
  const FIELDS = [
    { label: 'Камера / телефон', risk: 'mid', pick: t => [t.Make, t.Model].filter(Boolean).join(' ') },
    { label: 'Объектив', risk: 'low', pick: t => t.LensModel || t.LensMake },
    { label: 'Дата съёмки', risk: 'mid', pick: t => t.DateTimeOriginal || t.CreateDate || t.DateCreated },
    { label: 'Дата изменения', risk: 'low', pick: t => t.ModifyDate },
    { label: 'Программа', risk: 'low', pick: t => t.Software || t.CreatorTool },
    { label: 'Автор', risk: 'high', pick: t => t.Artist || t.creator || t.Creator || t.Byline || t['By-line'] },
    { label: 'Авторские права', risk: 'mid', pick: t => t.Copyright || t.rights || t.CopyrightNotice },
    { label: 'Владелец камеры', risk: 'high', pick: t => t.OwnerName || t.CameraOwnerName },
    { label: 'Серийный номер', risk: 'high', pick: t => t.BodySerialNumber || t.SerialNumber || t.LensSerialNumber },
    { label: 'Описание', risk: 'mid', pick: t => t.ImageDescription || t.description || t.Caption || t['Caption-Abstract'] },
    { label: 'Ключевые слова', risk: 'low', pick: t => t.Keywords || t.subject },
    { label: 'Экспозиция', risk: 'low', pick: t => [t.ExposureTime && (t.ExposureTime < 1 ? `1/${Math.round(1 / t.ExposureTime)} с` : t.ExposureTime + ' с'), t.FNumber && `f/${t.FNumber}`, t.ISO && `ISO ${t.ISO}`, t.FocalLength && `${t.FocalLength} мм`].filter(Boolean).join(' · ') }
  ];

  /** Подробный разбор: { fields: [{label, value, risk}], gps: {lat, lon, alt} | null, all: [[key, value]] } */
  async function parse(file) {
    if (!window.exifr) return null;
    let tags;
    try {
      tags = await exifr.parse(file, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false, jfif: false, ihdr: false, mergeOutput: true, translateValues: true, reviveValues: true });
    } catch { return null; }
    if (!tags) return { fields: [], gps: null, all: [] };
    const fields = [];
    for (const f of FIELDS) {
      const v = f.pick(tags);
      if (v !== undefined && v !== null && String(v).trim()) fields.push({ label: f.label, value: text(v), risk: f.risk });
    }
    let gps = null;
    if (Number.isFinite(tags.latitude) && Number.isFinite(tags.longitude)) {
      gps = { lat: round(tags.latitude), lon: round(tags.longitude), alt: Number.isFinite(tags.GPSAltitude) ? Math.round(tags.GPSAltitude) : null };
    }
    const all = Object.entries(tags)
      .filter(([, v]) => v !== undefined && v !== null && !(v instanceof Uint8Array) && !(Array.isArray(v) && v.length > 16))
      .map(([k, v]) => [k, text(v).slice(0, 160)]);
    return { fields, gps, all };
  }

  PS.metadata = { detectBlocks, parse };
})();
