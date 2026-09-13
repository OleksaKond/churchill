(function () {
  const STORAGE_KEY = 'churchill-lang';
  const RTL_LANGS = ['ar'];
  const SUPPORTED = ['en', 'pl', 'ar', 'ru'];
  const DEFAULT = 'pl';

  // Language is pinned per page via <html lang="..">, with an optional
  // ?lang= override (used by sorry.html). No live toggling: the language
  // switcher is a set of links to the per-language URLs (/en/, /pl/, ...).
  function resolveLang() {
    const q = new URLSearchParams(location.search).get('lang');
    if (SUPPORTED.includes(q)) return q;
    const htmlLang = document.documentElement.lang;
    if (SUPPORTED.includes(htmlLang)) return htmlLang;
    return DEFAULT;
  }

  function apply(lang) {
    const dict = (window.translations && window.translations[lang]) || {};
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key] !== undefined) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] !== undefined) el.placeholder = dict[key];
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(el => {
      const key = el.getAttribute('data-i18n-alt');
      if (dict[key] !== undefined) el.alt = dict[key];
    });
  }

  const lang = resolveLang();
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  document.addEventListener('DOMContentLoaded', () => apply(lang));
})();
