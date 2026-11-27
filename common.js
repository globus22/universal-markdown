/* Universal Tools — общий код для всех страниц: PWA (service worker) и кнопка установки. */
(() => {
  'use strict';

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

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
