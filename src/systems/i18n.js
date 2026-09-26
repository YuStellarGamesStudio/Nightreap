function browserLanguage() {
  if (typeof navigator === 'undefined') return 'en';
  const language = navigator.languages?.[0] || navigator.language || '';
  return /^zh(?:-|$)/i.test(language) ? 'zh' : 'en';
}

export function getLanguage() {
  if (typeof location !== 'undefined') {
    const query = new URLSearchParams(location.search).get('lang');
    if (query === 'en' || query === 'zh') return query;
  }
  return browserLanguage();
}

export function setLanguage(lang) {
  if (lang !== 'en' && lang !== 'zh') throw new TypeError('Unsupported language');
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  history.pushState(history.state, '', url);
  return lang;
}

export function text(value, language = getLanguage()) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return typeof value[language] === 'string' && value[language]
    ? value[language] : typeof value.en === 'string' ? value.en : '';
}
