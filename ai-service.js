(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GlossAIService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const STORAGE_KEY = 'glossToolAISettingsV2';
  const DEFAULT_MODELS = Object.freeze({
    deepseek: 'deepseek-v4-flash',
    openai: 'gpt-5.6-luna',
    claude: 'claude-sonnet-5',
    openrouter: '',
  });

  function defaultAISettings(language = 'zh') {
    return language === 'zh'
      ? {provider: 'deepseek', model: DEFAULT_MODELS.deepseek}
      : {provider: 'openai', model: DEFAULT_MODELS.openai};
  }

  function normalizeAISettings(value, language = 'zh') {
    const fallback = defaultAISettings(language);
    const candidate = value && typeof value === 'object' ? value : {};
    const provider = Object.hasOwn(DEFAULT_MODELS, candidate.provider) ? candidate.provider : fallback.provider;
    const model = String(candidate.model ?? '').trim() || DEFAULT_MODELS[provider] || fallback.model;
    return {provider, model};
  }

  function loadAISettings(language = 'zh') {
    try {
      return normalizeAISettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'), language);
    } catch (error) {
      return defaultAISettings(language);
    }
  }

  function saveAISettings(value, language = 'zh') {
    const settings = normalizeAISettings(value, language);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (error) {}
    return settings;
  }

  function credentialRequestHeaders() {
    return {'Content-Type': 'application/json', 'X-CLG-Request': '2'};
  }

  return {
    DEFAULT_MODELS,
    STORAGE_KEY,
    credentialRequestHeaders,
    defaultAISettings,
    loadAISettings,
    normalizeAISettings,
    saveAISettings,
  };
});
