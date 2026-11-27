# Сторонние библиотеки

Все библиотеки хранятся в репозитории, чтобы сайт не обращался к внешним CDN и работал офлайн.
Файлы взяты из npm-пакетов без изменений.

| Файл | Пакет | Версия | Лицензия |
|---|---|---|---|
| `mammoth.browser.min.js` | mammoth | 1.10.0 | BSD-2-Clause |
| `turndown.js` | turndown (`lib/turndown.browser.umd.js`) | 7.2.3 | MIT |
| `turndown-plugin-gfm.js` | turndown-plugin-gfm | 1.0.2 | MIT |
| `xlsx.full.min.js` | xlsx (SheetJS CE, cdn.sheetjs.com) | 0.20.3 | Apache-2.0 |
| `pdfjs/pdf.min.js`, `pdfjs/pdf.worker.min.js` | pdfjs-dist | 3.11.174 | Apache-2.0 |
| `jszip.min.js` | jszip | 3.10.1 | MIT или GPL-3.0 |
| `marked.js` | marked (`lib/marked.umd.js`) | 16.3.0 | MIT |
| `purify.min.js` | dompurify | 3.4.14 | MPL-2.0 или Apache-2.0 |
| `tesseract/tesseract.min.js`, `tesseract/worker.min.js` | tesseract.js | 7.0.0 | Apache-2.0 |
| `tesseract/core/*-lstm.wasm.js` | tesseract.js-core | 7.0.0 | Apache-2.0 |
| `tesseract/lang/rus.traineddata.gz`, `eng.traineddata.gz` | @tesseract.js-data/rus, /eng (`4.0.0_best_int`) | 1.0.0 | MIT (модели Tesseract — Apache-2.0) |
| `heic2any.min.js` | heic2any | 0.0.4 | MIT |
| `exifr.js` | exifr (`dist/full.umd.js`) | 7.1.3 | MIT |

Обновление: `npm i <пакет>@<версия>` во временной папке и копирование тех же файлов сюда.
После обновления увеличьте версию `CACHE` в `sw.js`.
