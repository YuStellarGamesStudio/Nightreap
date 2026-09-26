export async function registerPWA({ beforeUpdate, onUpdate, onError }) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    let updating = false;
    const offerUpdate = () => {
      if (!registration.waiting || !navigator.serviceWorker.controller) return;
      onUpdate(async () => {
        if (updating || !registration.waiting) return;
        updating = true;
        try {
          if (!await beforeUpdate()) { updating = false; return; }
          navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
          registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
        } catch (error) { updating = false; onError(error); }
      });
    };
    offerUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') offerUpdate();
      });
    });
  } catch (error) { onError(error); }
}
