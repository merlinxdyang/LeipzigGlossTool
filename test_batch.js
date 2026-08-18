const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_OUTPUT_ORDER,
  exampleNumber,
  isTxtFilename,
  moveOutputLayer,
  normalizeStartLetter,
  normalizeStartNumber,
  normalizeOutputOrder,
  parseExampleLines,
  placeOutputLayer,
  projectResults,
  tokenEditorItems,
} = require('./batch.js');

test('one non-empty text line becomes one trimmed example', () => {
  assert.deepEqual(
    parseExampleLines(' 我 吃\r\n\r\n 你 来了 \n他 走 了\n'),
    ['我 吃', '你 来了', '他 走 了'],
  );
});

test('TXT import accepts only filenames ending in .txt', () => {
  assert.equal(isTxtFilename('examples.txt'), true);
  assert.equal(isTxtFilename('EXAMPLES.TXT'), true);
  assert.equal(isTxtFilename('examples.csv'), false);
  assert.equal(isTxtFilename('examples.txt.json'), false);
});

test('continuous numbering accepts only positive integer starts', () => {
  assert.equal(normalizeStartNumber('12'), 12);
  assert.equal(normalizeStartNumber('-3'), 1);
  assert.equal(normalizeStartNumber('0'), 1);
  assert.equal(normalizeStartNumber('1.5'), 1);
  assert.equal(normalizeStartNumber('not a number'), 1);
  assert.equal(exampleNumber('continuous', 12, 0), '(12)');
  assert.equal(exampleNumber('continuous', 12, 2), '(14)');
  assert.equal(exampleNumber('continuous', -1, 0), '(1)');
  assert.equal(exampleNumber('continuous', -1, 1), '(2)');
  assert.equal(exampleNumber('none', 12, 2), '');
});

test('parenthesized and dotted alphabetic numbering support custom starts and continue after z', () => {
  assert.equal(normalizeStartLetter(' C '), 'c');
  assert.equal(normalizeStartLetter('AA'), 'aa');
  assert.equal(normalizeStartLetter('c1'), 'a');
  assert.equal(exampleNumber('alphabetic', 'c', 0), '(c)');
  assert.equal(exampleNumber('alphabetic', 'c', 2), '(e)');
  assert.equal(exampleNumber('alphabetic', 'z', 1), '(aa)');
  assert.equal(exampleNumber('alphabetic', 'aa', 1), '(ab)');
  assert.equal(exampleNumber('alphabetic-dot', 'c', 0), 'c.');
  assert.equal(exampleNumber('alphabetic-dot', 'c', 2), 'e.');
  assert.equal(exampleNumber('alphabetic-dot', 'z', 1), 'aa.');
});

test('project results supports new batches and legacy single-result projects', () => {
  const first = {tokens: [{form: '我'}]};
  const second = {tokens: [{form: '你'}]};

  assert.deepEqual(projectResults({results: [first, second]}), [first, second]);
  assert.deepEqual(projectResults({result: first}), [first]);
  assert.deepEqual(projectResults({}), []);
});

test('responsive editor items keep every token and all aligned layers together', () => {
  const result = {
    tokens: [
      {form: '张三', transcription: 'Zhang1san1', pinyin_diacritic: 'Zhāngsān', chinese_gloss: '张三', gloss: 'Zhangsan'},
      {form: '把', transcription: 'ba3', pinyin_diacritic: 'bǎ', chinese_gloss: '把', gloss: 'BA'},
    ],
  };

  assert.deepEqual(tokenEditorItems(result), [
    {index: 0, form: '张三', transcription: 'Zhang1san1', pinyin_diacritic: 'Zhāngsān', chinese_gloss: '张三', gloss: 'Zhangsan'},
    {index: 1, form: '把', transcription: 'ba3', pinyin_diacritic: 'bǎ', chinese_gloss: '把', gloss: 'BA'},
  ]);
});

test('output order accepts only known unique layers and appends missing layers safely', () => {
  assert.deepEqual(DEFAULT_OUTPUT_ORDER, [
    'form', 'pinyin', 'transcription', 'chinese-gloss', 'gloss', 'free', 'chinese-free',
  ]);
  assert.deepEqual(
    normalizeOutputOrder(['gloss', 'form', 'gloss', '__proto__']),
    ['gloss', 'form', 'pinyin', 'transcription', 'chinese-gloss', 'free', 'chinese-free'],
  );
  assert.deepEqual(normalizeOutputOrder('not-an-array'), DEFAULT_OUTPUT_ORDER);
});

test('output layers move left or right without changing the layer set', () => {
  assert.deepEqual(
    moveOutputLayer(DEFAULT_OUTPUT_ORDER, 'gloss', -1),
    ['form', 'pinyin', 'transcription', 'gloss', 'chinese-gloss', 'free', 'chinese-free'],
  );
  assert.deepEqual(moveOutputLayer(DEFAULT_OUTPUT_ORDER, 'form', -1), DEFAULT_OUTPUT_ORDER);
  assert.deepEqual(moveOutputLayer(DEFAULT_OUTPUT_ORDER, 'unknown', 1), DEFAULT_OUTPUT_ORDER);
  assert.deepEqual(
    moveOutputLayer(['form', 'gloss', 'free'], 'gloss', -1),
    ['gloss', 'form', 'free'],
  );
});

test('drag placement can put an output layer before or after another layer', () => {
  assert.deepEqual(
    placeOutputLayer(DEFAULT_OUTPUT_ORDER, 'gloss', 'form', false),
    ['gloss', 'form', 'pinyin', 'transcription', 'chinese-gloss', 'free', 'chinese-free'],
  );
  assert.deepEqual(
    placeOutputLayer(DEFAULT_OUTPUT_ORDER, 'form', 'gloss', true),
    ['pinyin', 'transcription', 'chinese-gloss', 'gloss', 'form', 'free', 'chinese-free'],
  );
});
