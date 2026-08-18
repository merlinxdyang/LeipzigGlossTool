(function (root) {
  'use strict';

  function parseExampleLines(text) {
    return String(text ?? '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  }

  function isTxtFilename(name) {
    return /\.txt$/i.test(String(name ?? '').trim());
  }

  function normalizeStartNumber(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : 1;
  }

  function normalizeStartLetter(value) {
    const letter = String(value ?? '').trim().toLowerCase();
    return /^[a-z]{1,6}$/.test(letter) ? letter : 'a';
  }

  function letterIndex(value) {
    return [...normalizeStartLetter(value)].reduce(
      (index, letter) => index * 26 + letter.charCodeAt(0) - 96,
      0,
    ) - 1;
  }

  function lettersFromIndex(value) {
    let index = Number.isSafeInteger(value) && value >= 0 ? value : 0;
    let letters = '';
    do {
      letters = String.fromCharCode(97 + index % 26) + letters;
      index = Math.floor(index / 26) - 1;
    } while (index >= 0);
    return letters;
  }

  function exampleNumber(mode, start, index) {
    if (mode === 'continuous') return `(${normalizeStartNumber(start) + index})`;
    if (mode === 'alphabetic') return `(${lettersFromIndex(letterIndex(start) + index)})`;
    if (mode === 'alphabetic-dot') return `${lettersFromIndex(letterIndex(start) + index)}.`;
    return '';
  }

  function projectResults(project) {
    if (Array.isArray(project?.results)) return project.results;
    return project?.result && typeof project.result === 'object' ? [project.result] : [];
  }

  function tokenEditorItems(result) {
    const tokens = Array.isArray(result?.tokens) ? result.tokens : [];
    return tokens.map((token, index) => ({
      index,
      form: String(token?.form ?? ''),
      transcription: String(token?.transcription ?? ''),
      pinyin_diacritic: String(token?.pinyin_diacritic ?? ''),
      chinese_gloss: String(token?.chinese_gloss ?? ''),
      gloss: String(token?.gloss ?? ''),
    }));
  }

  const api = {
    exampleNumber,
    isTxtFilename,
    normalizeStartLetter,
    normalizeStartNumber,
    parseExampleLines,
    projectResults,
    tokenEditorItems,
  };
  root.GlossBatch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
