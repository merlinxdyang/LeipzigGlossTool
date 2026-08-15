(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GlossInterfaceLanguage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function defaultAISettings(language) {
    if (language === 'zh') {
      return {provider: 'deepseek', model: 'deepseek-v4-flash'};
    }
    return {provider: 'openai', model: 'gpt-5.6-luna'};
  }

  return {defaultAISettings};
});
