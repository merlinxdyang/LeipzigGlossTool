(function (root) {
  'use strict';

  const ROW_KEYS = ['form', 'transcription', 'pinyin', 'chineseGloss', 'gloss', 'free', 'chineseFree'];
  const FONT_OPTIONS = Object.freeze({
    'times-songti': {
      label: 'Times New Roman / 宋体',
      stack: '"Times New Roman","Songti SC","STSong","SimSun",serif',
    },
    'georgia-songti': {
      label: 'Georgia / 宋体',
      stack: 'Georgia,"Songti SC","STSong","SimSun",serif',
    },
    'arial-heiti': {
      label: 'Arial / 黑体',
      stack: 'Arial,"Heiti SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif',
    },
    songti: {
      label: '宋体 / Songti',
      stack: '"Songti SC","STSong","SimSun",serif',
    },
    heiti: {
      label: '黑体 / Heiti',
      stack: '"Heiti SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif',
    },
    'courier-songti': {
      label: 'Courier New / 宋体',
      stack: '"Courier New","Songti SC","STSong","SimSun",monospace',
    },
    'multilingual-serif': {
      label: 'Multilingual Serif / 多语种衬线',
      stack: '"Times New Roman","Noto Serif CJK JP","Yu Mincho","Noto Serif Devanagari","Kohinoor Devanagari","Noto Naskh Arabic","Geeza Pro","Noto Serif Tibetan",Kailasa,"Mongolian Baiti","Songti SC",serif',
    },
    'multilingual-sans': {
      label: 'Multilingual Sans / 多语种无衬线',
      stack: 'Arial,"Noto Sans CJK JP","Hiragino Sans","Noto Sans Devanagari","Kohinoor Devanagari","Noto Sans Arabic","Geeza Pro","Noto Sans Tibetan",Kailasa,"Noto Sans Mongolian","Heiti SC",sans-serif',
    },
  });
  const BASE_STYLE = Object.freeze({
    font: 'times-songti',
    size: 10.5,
    bold: false,
    italic: false,
  });
  const DEFAULT_TYPOGRAPHY = Object.freeze(Object.fromEntries(
    ROW_KEYS.map(key => [key, Object.freeze({...BASE_STYLE})])
  ));

  function normalizeRowStyle(value) {
    const candidate = value && typeof value === 'object' ? value : {};
    const size = Number(candidate.size);
    return {
      font: Object.hasOwn(FONT_OPTIONS, candidate.font) ? candidate.font : BASE_STYLE.font,
      size: Number.isFinite(size) && size >= 6 && size <= 72 ? size : BASE_STYLE.size,
      bold: candidate.bold === true,
      italic: candidate.italic === true,
    };
  }

  function normalizeTypography(value) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.fromEntries(ROW_KEYS.map(key => [key, normalizeRowStyle(source[key])]));
  }

  function typographyCss(value) {
    const style = normalizeRowStyle(value);
    return [
      `font-family:${FONT_OPTIONS[style.font].stack}`,
      `font-size:${style.size}pt`,
      `font-weight:${style.bold ? 700 : 400}`,
      `font-style:${style.italic ? 'italic' : 'normal'}`,
    ].join(';');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function formatGlossHtml(value) {
    return escapeHtml(value).replace(
      /(^|[^A-Za-z0-9])(\d*[A-Z]{2,}[A-Z0-9]*(?:[.=-][A-Z0-9]+)*)(?=$|[^A-Za-z0-9])/g,
      '$1<span class="small-caps">$2</span>'
    );
  }

  function formatGlossHtmlForWord(value) {
    return escapeHtml(value).replace(
      /(^|[^A-Za-z0-9])(\d*[A-Z]{2,}[A-Z0-9]*(?:[.=-][A-Z0-9]+)*)(?=$|[^A-Za-z0-9])/g,
      (_, boundary, abbreviation) => `${boundary}<span style="font-variant:small-caps">${abbreviation.toLowerCase()}</span>`
    );
  }

  function isGlossAbbreviation(value) {
    return /^\d*[A-Z]{2,}[A-Z0-9]*(?:[.=-][A-Z0-9]+)*$/.test(String(value ?? ''));
  }

  const api = {
    DEFAULT_TYPOGRAPHY,
    FONT_OPTIONS,
    ROW_KEYS,
    formatGlossHtml,
    formatGlossHtmlForWord,
    isGlossAbbreviation,
    normalizeTypography,
    typographyCss,
  };
  root.GlossTypography = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
