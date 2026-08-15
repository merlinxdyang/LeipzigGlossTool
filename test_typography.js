const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_TYPOGRAPHY,
  formatGlossHtml,
  normalizeTypography,
  typographyCss,
} = require('./typography.js');

test('every output row defaults to Times New Roman with Songti at 10.5 pt', () => {
  for (const key of ['form', 'transcription', 'pinyin', 'gloss', 'free']) {
    assert.deepEqual(DEFAULT_TYPOGRAPHY[key], {
      font: 'times-songti',
      size: 10.5,
      bold: false,
      italic: false,
    });
  }

  const css = typographyCss(DEFAULT_TYPOGRAPHY.form);
  assert.match(css, /Times New Roman/);
  assert.match(css, /Songti SC/);
  assert.match(css, /font-size:10.5pt/);
  assert.match(css, /font-style:normal/);
});

test('typography normalization keeps valid per-row settings and repairs invalid values', () => {
  const styles = normalizeTypography({
    form: {font: 'arial-heiti', size: 12, bold: true, italic: true},
    gloss: {font: 'missing-font', size: 1000, bold: false, italic: false},
  });

  assert.deepEqual(styles.form, {
    font: 'arial-heiti',
    size: 12,
    bold: true,
    italic: true,
  });
  assert.equal(styles.gloss.font, 'times-songti');
  assert.equal(styles.gloss.size, 10.5);
  assert.deepEqual(styles.free, DEFAULT_TYPOGRAPHY.free);
});

test('uppercase grammatical glosses render as small caps without changing lexical glosses', () => {
  const html = formatGlossHtml('book PFV 3SG Zhangsan SFP');

  assert.match(html, /^book /);
  assert.match(html, /<span class="small-caps">PFV<\/span>/);
  assert.match(html, /<span class="small-caps">3SG<\/span>/);
  assert.match(html, /<span class="small-caps">SFP<\/span>$/);
  assert.doesNotMatch(html, /small-caps">Zhangsan/);
});
