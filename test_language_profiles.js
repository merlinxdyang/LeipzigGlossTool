const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, 'language-profiles.json'), 'utf8'));

test('multilingual profile registry contains the approved languages plus a custom profile', () => {
  assert.deepEqual(
    profiles.map(profile => profile.id),
    ['japanese', 'german', 'french', 'spanish', 'dutch', 'sanskrit', 'uyghur', 'mongolian', 'tibetan', 'custom'],
  );
});

test('every language profile has versioned identity, labels, script variants, and prompt rules', () => {
  for (const profile of profiles) {
    assert.match(profile.bcp47, /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?$/);
    assert.ok(profile.labels.zh);
    assert.ok(profile.labels.en);
    assert.ok(profile.labels['zh-Hant']);
    assert.ok(profile.prompt_rules.length > 20);
    assert.ok(profile.script_variants.length >= 1);
    for (const variant of profile.script_variants) {
      assert.ok(['ltr', 'rtl'].includes(variant.direction));
      assert.ok(variant.input_label.zh);
    }
  }
});

test('complex-script defaults use the approved transliteration and direction profiles', () => {
  const byId = Object.fromEntries(profiles.map(profile => [profile.id, profile]));
  assert.equal(byId.sanskrit.primary_transcription, 'IAST');
  assert.equal(byId.uyghur.primary_transcription, 'ULY/NUL');
  assert.equal(byId.uyghur.script_variants[0].direction, 'rtl');
  assert.equal(byId.tibetan.primary_transcription, 'THL EWTS');
  assert.deepEqual(byId.mongolian.script_variants.map(item => item.bcp47), ['mn-Cyrl', 'mn-Mong']);
});

test('custom language defaults to Latin transcription, IPA, bilingual glosses, and English translation', () => {
  const custom = profiles.find(profile => profile.id === 'custom');

  assert.equal(custom.primary_transcription, 'Latin transcription');
  assert.equal(custom.default_secondary_annotation, 'IPA');
  assert.deepEqual(custom.default_output, {
    primary_transcription: true,
    secondary_annotation: true,
    english_gloss: true,
    chinese_gloss: true,
    english_free_translation: true,
    chinese_free_translation: false,
  });
  assert.deepEqual(custom.script_variants.map(item => item.direction), ['ltr', 'rtl']);
});
