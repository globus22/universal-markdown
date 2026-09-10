# [MD] Universal Markdown v2

Полностью клиентская утилита для конвертации документов в Markdown. Backend не требуется.

## Что поддерживается

- DOCX → Markdown через Mammoth + Turndown, с извлечением изображений в `assets/`
- XLSX/XLS/CSV → Markdown tables через SheetJS
- PDF → текст через PDF.js
- Сканированные PDF → автоматический OCR через Tesseract.js
- PNG/JPG/JPEG/WEBP/BMP → OCR → Markdown
- PPTX → текст, таблицы, заметки и извлечение media-файлов
- HTML → Markdown
- TXT/MD → импорт как текст
- Standard / Clean / LLM Ready
- Удаление повторяющихся PDF-колонтитулов и номеров страниц в Clean/LLM Ready
- Разбиение больших Markdown-файлов примерно на 10K / 20K / 50K токенов
- Markdown Preview
- Bundle ZIP с `.md` + `assets/`
- PWA manifest + service worker

## Приватность

Содержимое выбранных файлов не отправляется на backend — backend отсутствует. JS-библиотеки и OCR-языковые модели загружаются с CDN. Для первого OCR требуется интернет.

## Локальный запуск

`index.html` можно открыть напрямую для большинства функций. Для PWA/service worker лучше запустить локальный HTTP-сервер:

```bash
python3 -m http.server 8080
```

Затем открыть `http://localhost:8080`.

## GitHub Pages

Загрузите содержимое этой папки в репозиторий. В GitHub: Settings → Pages → Deploy from a branch → `main` / root. GitHub Pages работает по HTTPS, поэтому PWA сможет регистрировать service worker.

## Ограничения v2

- OCR выполняется локально и на больших PDF может быть ресурсоёмким.
- PPTX извлекает текст приблизительно по координатам; сложный визуальный порядок может отличаться от оригинала.
- Изображения PPTX экспортируются в `assets`, но не всегда можно точно сопоставить каждое изображение с местом на слайде.
- PDF.js не восстанавливает таблицы и сложную многоколоночную вёрстку идеально.
- Старые `.doc` и `.ppt` не поддерживаются.
