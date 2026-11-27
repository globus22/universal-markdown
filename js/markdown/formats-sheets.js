/* [MD] Таблицы: XLSX, XLS, ODS, CSV → Markdown-таблицы (SheetJS). */
(() => {
  'use strict';
  const { util: U, formats } = window.UMD;

  function workbookToMarkdown(wb) {
    return wb.SheetNames.map(name => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false });
      return `## ${name}\n\n${U.matrixToMarkdown(rows)}`;
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
    return { markdown: workbookToMarkdown(XLSX.read(text, { type: 'string' })), assets: [], meta: { engine: 'SheetJS' } };
  }

  formats.register({ exts: ['xlsx', 'xls', 'ods'], label: 'XLSX/XLS/ODS', extract: extractSpreadsheet });
  formats.register({ exts: ['csv'], label: 'CSV', extract: extractCsv });
})();
