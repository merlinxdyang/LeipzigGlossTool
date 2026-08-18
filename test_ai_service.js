const test = require('node:test');
const assert = require('node:assert/strict');

const {
  credentialRequestHeaders,
  normalizeAISettings,
} = require('./ai-service.js');

test('shared AI settings accept only supported providers and non-empty model names', () => {
  assert.deepEqual(normalizeAISettings({provider: 'openai', model: 'gpt-5'}), {
    provider: 'openai',
    model: 'gpt-5',
  });
  assert.deepEqual(normalizeAISettings({provider: 'unknown', model: ''}, 'zh'), {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
  });
});

test('credential-backed requests carry the same-origin custom request header', () => {
  assert.deepEqual(credentialRequestHeaders(), {
    'Content-Type': 'application/json',
    'X-CLG-Request': '2',
  });
});
