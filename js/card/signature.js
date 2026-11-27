/* [VCF] Подписи для писем: HTML-таблицы (совместимы с Outlook, Gmail, Apple Mail и др.),
   текстовые версии и установщик для Outlook на Windows. */
(() => {
  'use strict';
  const UT = (window.UT = window.UT || {});

  const enc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const siteLabel = s => String(s || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const siteHref = s => { s = String(s || '').trim(); return !s ? '' : /^https?:\/\//i.test(s) ? s : 'https://' + s; };
  function telHref(v) {
    let dd = String(v || '').replace(/\D/g, '');
    if (!dd) return '';
    if (dd.length === 11 && dd[0] === '8') dd = '7' + dd.slice(1);
    return '+' + dd;
  }

  const KINDS = [
    { key: 'full', suffix: '', label: 'полная' },
    { key: 'short', suffix: '_Short', label: 'короткая' },
    { key: 'compact', suffix: '_Compact', label: 'компактная' }
  ];

  /** Данные одной стороны для подписи. */
  function sideData(d, side) {
    const ru = side.lang === 'ru', L = UT.card.LANG[side.lang] || UT.card.LANG.en;
    const ext = String(d.ext || '').replace(/\D/g, '');
    const work = String(d.work || '').trim();
    return {
      greeting: d.greeting?.[side.lang] ?? L.greeting,
      name: side.name || '', title: side.title || '', company: side.company || d.brand.company || '',
      corpLabel: work ? work + (ext ? (ru ? ', доб. ' : ', ext. ') + ext : '') : '',
      corpTel: telHref(work) + (ext ? ';ext=' + ext : ''),
      mobile: String(d.mobile || '').trim(), mobileTel: telHref(d.mobile),
      email: String(d.email || '').trim(), wechat: String(d.wechat || '').trim(),
      telegram: String(d.telegram || '').trim(),
      site: siteHref(d.site)
    };
  }

  /** HTML подписи. ctx: { font (CSS-стек), accent, logo: { src, width } | null } */
  function render(kind, s, ctx) {
    const FONT = ctx.font, GREEN = ctx.accent;
    const row = (style, inner) => `<tr><td style="font-family:${FONT};${style}">${inner}</td></tr>`;
    const link = (href, text, color) => `<a href="${enc(href)}" style="color:${color};text-decoration:none;">${enc(text)}</a>`;
    let rows = '', pad = 22;
    if (kind === 'short') {
      rows = row('font-size:13px;line-height:17px;color:#6B6B6B;padding:0 0 3px 0;', enc(s.greeting)) +
             row('font-size:18px;line-height:22px;font-weight:700;color:#222222;padding:0;', enc(s.name));
    } else if (kind === 'compact') {
      pad = 18;
      rows += row('font-size:11px;line-height:15px;color:#6B6B6B;padding:0 0 2px 0;', enc(s.greeting));
      rows += row('font-size:16px;line-height:20px;font-weight:700;color:#222222;padding:0 0 2px 0;', enc(s.name));
      if (s.title) rows += row('font-size:11px;line-height:15px;color:#777777;padding:0 0 5px 0;', enc(s.title));
      const parts = [];
      if (s.corpLabel) parts.push(link('tel:' + s.corpTel, s.corpLabel, '#333333'));
      if (s.mobile) parts.push(link('tel:' + s.mobileTel, s.mobile, '#333333'));
      if (s.email) parts.push(link('mailto:' + s.email, s.email, '#333333'));
      if (parts.length) rows += row('font-size:11px;line-height:16px;color:#333333;padding:0;', parts.join(`<span style="color:${GREEN};">&nbsp;&middot;&nbsp;</span>`));
    } else {
      rows += row('font-size:13px;line-height:17px;color:#6B6B6B;padding:0 0 3px 0;', enc(s.greeting));
      rows += row('font-size:18px;line-height:22px;font-weight:700;color:#222222;padding:0 0 2px 0;', enc(s.name));
      if (s.title) rows += row('font-size:13px;line-height:17px;color:#777777;padding:0 0 3px 0;', enc(s.title));
      if (s.company) rows += row(`font-size:14px;line-height:18px;font-weight:700;color:${GREEN};padding:0 0 8px 0;`, enc(s.company));
      if (s.corpLabel) rows += row('font-size:13px;line-height:18px;color:#333333;padding:0;', link('tel:' + s.corpTel, s.corpLabel, '#333333'));
      if (s.mobile) rows += row('font-size:13px;line-height:18px;color:#333333;padding:0;', link('tel:' + s.mobileTel, s.mobile, '#333333'));
      if (s.email) rows += row('font-size:13px;line-height:18px;color:#333333;padding:0;', link('mailto:' + s.email, s.email, '#333333'));
      if (s.telegram) rows += row('font-size:13px;line-height:18px;color:#333333;padding:0;', 'Telegram: ' + link(UT.qr.telegramUrl(s.telegram), '@' + s.telegram.replace(/^@|^https?:\/\/t\.me\//gi, ''), '#333333'));
      if (s.wechat) rows += row('font-size:13px;line-height:18px;color:#333333;padding:0;', 'WeChat ID: ' + enc(s.wechat));
      if (s.site) rows += row(`font-size:13px;line-height:18px;color:${GREEN};padding:0;`, link(s.site, siteLabel(s.site), GREEN));
    }
    const table = 'role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;font-family:' + FONT + ';"';
    const textCell = `<table ${table}>\n${rows}\n</table>`;
    if (!ctx.logo) {
      return `<table ${table}>\n<tr><td valign="middle" style="border-left:2px solid ${GREEN};padding:2px 0 2px 14px;">\n${textCell}\n</td></tr>\n</table>`;
    }
    const img = `<img src="${enc(ctx.logo.src)}" width="${ctx.logo.width}" alt="${enc(s.company)}" style="display:block;width:${ctx.logo.width}px;height:auto;border:0;outline:none;text-decoration:none;">`;
    return `<table ${table}>\n<tr>\n<td valign="middle" style="padding:0 ${pad}px 0 0;">\n${s.site ? `<a href="${enc(s.site)}" target="_blank" style="text-decoration:none;border:0;">${img}</a>` : img}\n</td>\n` +
      `<td valign="middle" style="border-left:1px solid ${GREEN};padding:2px 0 2px ${pad}px;">\n${textCell}\n</td>\n</tr>\n</table>`;
  }

  const page = body => '<!DOCTYPE html>\n<html>\n<head>\n<meta http-equiv="Content-Type" content="text/html; charset=utf-8">\n<meta name="Generator" content="Microsoft Outlook">\n</head>\n<body style="margin:0;padding:0;background:#ffffff;">\n' + body + '\n</body>\n</html>';

  function textLines(s, kind) {
    if (kind === 'short') return [s.greeting, s.name];
    if (kind === 'compact') {
      const c = [s.greeting, s.name]; if (s.title) c.push(s.title);
      const p = [s.corpLabel, s.mobile, s.email].filter(Boolean); if (p.length) c.push(p.join(' · '));
      return c;
    }
    const t = [s.greeting, s.name, s.title, s.company, s.corpLabel, s.mobile, s.email, s.telegram && 'Telegram: ' + s.telegram, s.wechat && 'WeChat ID: ' + s.wechat, s.site && siteLabel(s.site)];
    return t.filter(Boolean);
  }

  /** Все подписи: для каждой включённой стороны три варианта. logoFor(name) → { src, width } | null */
  function buildAll(d, ctxBase, logoFor) {
    const stem = fileStem(d);
    const out = [];
    d.sides.forEach((side, i) => {
      if (i > 0 && !side.enabled) return;
      const s = sideData(d, side);
      for (const k of KINDS) {
        const dup = i > 0 && d.sides[0].lang === side.lang ? '2' : '';
        const name = `${stem}_${side.lang.toUpperCase()}${dup}${k.suffix}`;
        const ctx = { ...ctxBase, logo: logoFor(name) };
        const body = render(k.key, s, ctx);
        out.push({ name, lang: side.lang, kind: k.key, label: k.label, body, html: page(body), text: textLines(s, k.key) });
      }
    });
    return out;
  }

  /** Латинское имя файла из названия компании или имени. */
  function fileStem(d) {
    const base = (d.brand.company || d.sides[1]?.name || d.sides[0]?.name || 'Signature').trim();
    const tr = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
    const lat = [...base].map(ch => { const l = ch.toLowerCase(), t = tr[l]; return t === undefined ? ch : (ch === l ? t : t.charAt(0).toUpperCase() + t.slice(1)); }).join('');
    return lat.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Signature';
  }

  /* ---------- Установщик для Outlook (Windows) ---------- */
  const psQuote = s => "'" + String(s ?? '').replace(/'/g, "''") + "'";
  const psHereString = s => "@'\n" + String(s).replace(/\r\n/g, '\n').replace(/^'@/gm, " '@") + "\n'@";

  function buildPs1(sigs, logoB64, title) {
    const L = [
      '$ErrorActionPreference = "Stop"', '',
      `# Установщик подписей Outlook: ${title}. Создан в Universal Tools.`,
      '# Повторный запуск просто перезапишет подписи.', '',
      'function RtfEscape([string]$s) {',
      '    $sb = New-Object System.Text.StringBuilder',
      '    foreach ($ch in $s.ToCharArray()) {',
      '        $code = [int][char]$ch',
      "        if ($ch -eq '\\') { [void]$sb.Append('\\\\') }",
      "        elseif ($ch -eq '{') { [void]$sb.Append('\\{') }",
      "        elseif ($ch -eq '}') { [void]$sb.Append('\\}') }",
      '        elseif ($code -gt 127) {',
      '            if ($code -gt 32767) { $code -= 65536 }',
      '            [void]$sb.Append("\\u$code?")',
      '        } else { [void]$sb.Append($ch) }',
      '    }',
      '    return $sb.ToString()',
      '}', '',
      'try {',
      '    Clear-Host',
      '    Write-Host "============================================================" -ForegroundColor Green',
      `    Write-Host ${psQuote(' ' + title + ' - установка подписей Outlook')} -ForegroundColor Green`,
      '    Write-Host "============================================================" -ForegroundColor Green',
      '    Write-Host ""', '',
      '    $signatureRoot = Join-Path $env:APPDATA "Microsoft\\Signatures"',
      '    New-Item -ItemType Directory -Force -Path $signatureRoot | Out-Null', ''
    ];
    if (logoB64) L.push('    $logoBytes = [Convert]::FromBase64String(@"', logoB64.replace(/(.{120})/g, '$1\n'), '"@)', '');
    L.push(
      '    $mailKey = "HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Options\\Mail"',
      '    New-Item -Path $mailKey -Force | Out-Null',
      '    New-ItemProperty -Path $mailKey -Name "Send Pictures With Document" -PropertyType DWord -Value 1 -Force | Out-Null', '',
      '    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)', ''
    );
    for (const s of sigs) {
      L.push(`    # --- ${s.name} ---`, `    $name = ${psQuote(s.name)}`, `    $html = ${psHereString(s.html)}`, `    $lines = @(${s.text.map(psQuote).join(', ')})`);
      if (logoB64) L.push('    $filesDir = Join-Path $signatureRoot ($name + "_files")', '    New-Item -ItemType Directory -Force -Path $filesDir | Out-Null', '    [System.IO.File]::WriteAllBytes((Join-Path $filesDir "logo.png"), $logoBytes)');
      L.push(
        '    [System.IO.File]::WriteAllText((Join-Path $signatureRoot ($name + ".htm")), $html, $utf8NoBom)',
        '    [System.IO.File]::WriteAllText((Join-Path $signatureRoot ($name + ".txt")), (($lines -join [Environment]::NewLine) + [Environment]::NewLine), $utf8NoBom)',
        '    $rtfBody = ($lines | ForEach-Object { (RtfEscape $_) + "\\line " }) -join ""',
        '    $rtf = "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs20 " + $rtfBody + "}"',
        '    [System.IO.File]::WriteAllText((Join-Path $signatureRoot ($name + ".rtf")), $rtf, [System.Text.Encoding]::ASCII)',
        '    Write-Host ("  установлена: " + $name) -ForegroundColor Green', ''
      );
    }
    L.push(
      '    Write-Host ""',
      '    Write-Host "Готово. Перезапустите Outlook, затем: Файл - Параметры - Почта - Подписи." -ForegroundColor Yellow',
      '    Start-Sleep -Seconds 3', '    exit 0', '}', 'catch {', '    Write-Host ""',
      '    Write-Host "Ошибка: $($_.Exception.Message)" -ForegroundColor Red', '    Read-Host "Нажмите Enter"', '    exit 1', '}'
    );
    return L.join('\r\n');
  }

  const buildCmd = ps1 => ['@echo off', 'setlocal EnableExtensions', 'pushd "%~dp0" >nul 2>&1', 'if errorlevel 1 (', '    echo ERROR: cannot access the installer folder.', '    echo Copy the folder to Desktop and run again.', '    pause', '    exit /b 1', ')',
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\${ps1}"`, 'set "RC=%ERRORLEVEL%"', 'popd', 'if not "%RC%"=="0" (', '    echo.', '    echo Installation failed.', '    pause', ')', 'exit /b %RC%'].join('\r\n');

  function readme(sigs, who, files) {
    const lines = [
      'Установка подписей в Outlook для Windows', '', 'Подписи собраны для: ' + who, '',
      'Способ 1 — через .cmd',
      '1. Распакуйте папку целиком (не запускайте прямо из архива).',
      '2. Если Windows пометила файлы как скачанные из интернета:',
      '   правый клик по файлу - Свойства - внизу галочка "Разблокировать" - ОК.',
      `3. Запустите ${files.cmd}`, '4. Перезапустите Outlook.', '',
      'Способ 2 — без .cmd, если антивирус его блокирует',
      `1. Положите ${files.ps1} в любую папку, например в «Загрузки».`,
      '2. Откройте PowerShell (Пуск - наберите powershell - Enter).',
      '3. Вставьте команду, подставив свой путь к файлу, и нажмите Enter:',
      `   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\\Downloads\\${files.ps1}"`, '4. Перезапустите Outlook.', '',
      'Дальше: Файл - Параметры - Почта - Подписи. Выберите подпись для новых сообщений и для ответов.', '',
      'Подходит для классического Outlook 2016, 2019, 2021 и Microsoft 365.',
      'Для нового Outlook и Outlook в браузере используйте кнопку «Скопировать подпись» в генераторе.', '',
      'Будут установлены:',
      ...sigs.map(s => `  ${s.name} - ${UT.card.LANG[s.lang]?.label || s.lang}, ${s.label}`), '',
      'Данные уже внутри установщика. Чтобы изменить их, соберите архив заново.'
    ];
    return lines.join('\r\n') + '\r\n';
  }

  /** Файлы установщика: [{ name, text, bom }] */
  function outlookPackage(d, ctxBase, logoB64, who) {
    const stem = fileStem(d);
    const files = { ps1: `${stem}_Signatures.ps1`, cmd: `Install_${stem}_Signatures.cmd`, readme: 'README.txt' };
    const sigs = buildAll(d, ctxBase, name => logoB64 ? { src: name + '_files/logo.png', width: ctxBase.logoWidth } : null);
    return [
      { name: files.ps1, text: buildPs1(sigs, logoB64, d.brand.company || who), bom: true },
      { name: files.cmd, text: buildCmd(files.ps1), bom: false },
      { name: files.readme, text: readme(sigs, who, files), bom: true }
    ];
  }

  UT.signature = { KINDS, buildAll, outlookPackage, fileStem, sideData };
})();
