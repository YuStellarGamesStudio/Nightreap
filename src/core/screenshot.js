const URL_IN_CSS = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;
const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE']);

export function screenshotFilename(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `Nightreap_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`;
}

function styleText(style, sources) {
  const declarations = [];
  for (let i = 0; i < style.length; i++) {
    const property = style[i];
    if (/^(?:animation|transition)(?:-|$)/.test(property)) continue;
    let value = style.getPropertyValue(property);
    value = value.replace(URL_IN_CSS, (match, double, single, bare) => {
      const url = (double ?? single ?? bare).trim();
      if (url) {
        const absolute = new URL(url, document.baseURI).href;
        sources.add(absolute);
        return `url("${absolute}")`;
      }
      return match;
    });
    declarations.push(`${property}:${value}${style.getPropertyPriority(property) ? ' !important' : ''};`);
  }
  declarations.push('animation:none !important;transition:none !important;caret-color:transparent !important;');
  return declarations.join('');
}

function snapshot() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (!width || !height) throw new Error('Cannot capture an empty viewport');
  const sources = new Set();
  const pseudoRules = [];
  let pseudoIndex = 0;

  function copy(original) {
    if (original.nodeType === Node.TEXT_NODE) return document.createTextNode(original.textContent);
    if (original.nodeType !== Node.ELEMENT_NODE || SKIP.has(original.tagName)) return null;
    const computed = getComputedStyle(original);
    if (computed.display === 'none' || original.hidden) return null;

    const clone = original.cloneNode(false);
    clone.setAttribute('style', styleText(computed, sources));
    const index = pseudoIndex++;
    for (const kind of ['before', 'after']) {
      const pseudo = getComputedStyle(original, `::${kind}`);
      if (pseudo.content !== 'none' && pseudo.content !== 'normal' && pseudo.display !== 'none') {
        clone.setAttribute('data-shot-pseudo', index);
        pseudoRules.push(`[data-shot-pseudo="${index}"]::${kind}{${styleText(pseudo, sources)}}`);
      }
    }

    if (original instanceof HTMLCanvasElement) {
      if (!original.width || !original.height) throw new Error('Cannot capture an empty canvas');
      const image = document.createElement('img');
      image.setAttribute('style', clone.getAttribute('style'));
      image.setAttribute('src', original.toDataURL('image/png'));
      return image;
    }
    if (original instanceof HTMLImageElement) {
      const src = original.currentSrc || original.getAttribute('src');
      clone.removeAttribute('srcset');
      clone.removeAttribute('sizes');
      clone.removeAttribute('loading');
      if (src) {
        if (!original.complete || !original.naturalWidth) throw new Error(`Image is not ready for capture: ${src}`);
        const absolute = new URL(src, document.baseURI);
        if (absolute.hash) {
          // Nested SVG images can share the first :target fragment in Chromium.
          // Freeze the already-decoded sprite before embedding the document.
          const sprite = document.createElement('canvas');
          sprite.width = Math.ceil(Math.max(original.naturalWidth, original.clientWidth * (window.devicePixelRatio || 1)));
          sprite.height = Math.ceil(sprite.width * original.naturalHeight / original.naturalWidth);
          const context = sprite.getContext('2d');
          if (!context) throw new Error('Cannot capture sprite image');
          context.drawImage(original, 0, 0, sprite.width, sprite.height);
          clone.setAttribute('src', sprite.toDataURL('image/png'));
        } else {
          clone.setAttribute('src', absolute.href);
          sources.add(absolute.href);
        }
      } else clone.removeAttribute('src');
    }
    if (original instanceof HTMLInputElement) {
      clone.setAttribute('value', original.value);
      if (original.checked) clone.setAttribute('checked', '');
      else clone.removeAttribute('checked');
    } else if (original instanceof HTMLTextAreaElement) {
      clone.textContent = original.value;
    } else if (original instanceof HTMLOptionElement) {
      if (original.selected) clone.setAttribute('selected', '');
      else clone.removeAttribute('selected');
    }
    for (const child of original.childNodes) {
      const copied = copy(child);
      if (copied) clone.appendChild(copied);
    }
    // Scroll offsets live on DOM objects and cannot be serialized into an SVG image.
    // Shift painted children without changing their layout or the scroll container's clip.
    if (original.scrollTop || original.scrollLeft) {
      for (const child of clone.children) {
        const old = child.style.transform;
        child.style.transform = `translate(${-original.scrollLeft}px, ${-original.scrollTop}px) ${old === 'none' ? '' : old}`;
      }
    }
    return clone;
  }

  const html = copy(document.documentElement);
  if (!html) throw new Error('Cannot capture the document');
  html.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  html.style.width = `${width}px`;
  html.style.height = `${height}px`;
  const rules = document.createElement('style');
  rules.textContent = pseudoRules.join('\n');
  html.querySelector('body').prepend(rules);

  // Dialogs serialize their open state, but their top-layer position is browser state.
  const dialog = document.querySelector('dialog:modal');
  if (dialog) {
    const duplicate = html.querySelector(`#${CSS.escape(dialog.id)}`);
    if (duplicate) {
      const rect = dialog.getBoundingClientRect();
      duplicate.style.cssText += `position:fixed;left:${rect.left}px;top:${rect.top}px;right:auto;bottom:auto;margin:0;width:${rect.width}px;height:${rect.height}px;z-index:2147483647;`;
    }
  }
  return { html, sources, width, height, ratio: window.devicePixelRatio || 1 };
}

async function inlineSource(url) {
  if (url.startsWith('data:')) return url;
  const parsed = new URL(url);
  if (parsed.origin !== location.origin)
    throw new Error(`Cannot capture external asset: ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot capture asset: ${url} (${response.status})`);
  const blob = await response.blob();
  if (!blob.size) throw new Error(`Empty capture asset: ${url}`);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // Sprite sheets use :target; embedding the SVG must retain its selected fragment.
    reader.onload = () => resolve(reader.result + parsed.hash);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Browser could not render the complete viewport snapshot'));
    image.src = url;
  });
}

export async function captureViewport() {
  // Everything dependent on live state is copied before the first asynchronous step.
  const { html, sources, width, height, ratio } = snapshot();
  const entries = await Promise.all([...sources].map(async url => [url, await inlineSource(url)]));
  const replacements = new Map(entries);
  for (const image of html.querySelectorAll('img[src]')) {
    const value = replacements.get(image.getAttribute('src'));
    if (value) image.setAttribute('src', value);
  }
  for (const element of [html, ...html.querySelectorAll('[style]')]) {
    const style = element.getAttribute('style');
    if (!style) continue;
    element.setAttribute('style', style.replace(URL_IN_CSS, (match, double, single, bare) => {
      const url = (double ?? single ?? bare).trim();
      return replacements.has(url) ? `url("${replacements.get(url)}")` : match;
    }));
  }
  for (const sheet of html.querySelectorAll('style')) {
    sheet.textContent = sheet.textContent.replace(URL_IN_CSS, (match, double, single, bare) => {
      const url = (double ?? single ?? bare).trim();
      return replacements.has(url) ? `url("${replacements.get(url)}")` : match;
    });
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create screenshot canvas');
  const xml = new XMLSerializer().serializeToString(html);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
  // A blob: SVG containing foreignObject taints canvas in Chromium; a self-contained
  // data: SVG has a clean origin and can be exported once every asset is embedded.
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (ctx.getImageData(0, 0, 1, 1).data[3] !== 255)
    throw new Error('Browser did not render the game viewport');
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Screenshot PNG encoding failed')), 'image/png'));
  if (blob.type !== 'image/png') throw new Error('Screenshot is not a PNG');
  return blob;
}
