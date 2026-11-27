/* Universal Tools — общий код для всех страниц: тема, PWA (service worker) и кнопка установки. */
(() => {
  'use strict';
  const root = document.documentElement;

  /* ---------- Тема ----------
     По умолчанию — как в системе. Кнопка переключает светлую/тёмную и запоминает выбор. */
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const effective = () => root.dataset.theme || (media?.matches ? 'dark' : 'light');
  const syncThemeColor = () => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effective() === 'dark' ? '#0e1411' : '#123f2c');
  };
  document.getElementById('themeBtn')?.addEventListener('click', () => {
    const next = effective() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('ut-theme', next); } catch {}
    syncThemeColor();
    window.dispatchEvent(new Event('themechange'));
  });
  media?.addEventListener?.('change', syncThemeColor);
  syncThemeColor();

  /* ---------- Установка приложения ---------- */
  const installBtn = document.getElementById('installBtn');
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installPrompt = e;
    installBtn?.classList.remove('hidden');
  });
  installBtn?.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installBtn.classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => installBtn?.classList.add('hidden'));

  /* ---------- Офлайн-кэш ---------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
