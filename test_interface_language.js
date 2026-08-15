const test = require('node:test');
const assert = require('node:assert/strict');

const {defaultAISettings} = require('./interface-language.js');

test('Simplified Chinese defaults to DeepSeek', () => {
  assert.deepEqual(defaultAISettings('zh'), {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
  });
});

test('English and Traditional Chinese default to OpenAI gpt-5.6-luna', () => {
  for (const language of ['en', 'zh-Hant']) {
    assert.deepEqual(defaultAISettings(language), {
      provider: 'openai',
      model: 'gpt-5.6-luna',
    });
  }
});
