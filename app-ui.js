'use strict';

const $ = selector => document.querySelector(selector);
const {
  DEFAULT_TYPOGRAPHY,
  FONT_OPTIONS,
  formatGlossHtml,
  formatGlossHtmlForWord,
  isGlossAbbreviation,
  normalizeTypography,
  typographyCss,
} = GlossTypography;
const {
  exampleNumber,
  isTxtFilename,
  normalizeStartLetter,
  normalizeStartNumber,
  parseExampleLines,
  projectResults,
  tokenEditorItems,
} = GlossBatch;
const {defaultAISettings} = GlossInterfaceLanguage;

const state = {lang: 'zh', results: [], typography: normalizeTypography(), rememberTypography: true};
const defaults = {deepseek: 'deepseek-v4-flash', openai: 'gpt-5.6-luna', claude: 'claude-sonnet-5', openrouter: ''};
const I18N = {
  zh: {
    demo: '载入示例', help: '使用说明', close: '关闭', settings: '项目设置', aiSettings: 'AI 服务', provider: '服务商', model: '模型名称',
    keyHint: '仅用于本次 API 请求，不会保存。', validate: '验证 API', apiKeyHelp: '如何申请', apiKeyDialogTitle: '如何申请 API key', lingSettings: '语言与转写', variety: '语言 / 方言', mandarin: '普通话 / Mandarin', cantonese: '粤语 / Cantonese', other: '其他 / Other', zhuyin: '注音符号 / Zhuyin', jyutping: '粤拼 / Jyutping', ipaNumericTones: 'IPA + 数字声调', ipaToneLetters: 'IPA 固有声调',
    customVariety: '自定义语言 / 方言名称', inputFormat: '输入格式', transcriptionSystem: '主要转写体系', pinyinSettings: '拼音设置', pinyinToneMarks: '拼音有声调', pinyinToneNumbers: '拼音数字声调', pinyinNoTone: '拼音无声调', otherTranscriptionSettings: '其他注音设置', otherTranscriptionHint: '可选；留空时不生成其他注音行。',
    transcriptionHint: '为非普通话材料选择主要转写体系。',
    conventions: 'Gloss 约定（可修改）', input: '输入例句', importTxt: '导入 TXT', clear: '清空', analyze: '生成 Gloss',
    segHint: '每行一个例句；请用空格分词，空行将被忽略。也可导入一行一个例句的 TXT 文件。', editResult: '编辑结果', aligned: '词数已对齐',
    outputLines: '输出行', form: '原文', transcription1: '转写 1', transcription2: '转写 2', pinyinOutput: '拼音', otherTranscriptionOutput: '其他注音', freeTranslation: '英语自由翻译',
    numberingMode: '编号方式', noNumber: '无编号', continuousNumber: '连续数字', alphabeticNumber: '字母：(a)', alphabeticDotNumber: '字母：a.', startNumber: '起始数字', startLetter: '起始字母', typography: '排版设置',
    typographyNote: '逐行控制字体、字号和字形', rememberTypography: '保持现有设置', resetTypography: '恢复默认', outputLine: '输出行',
    font: '字体', fontSize: '字号（pt）', bold: '加粗', italic: '斜体', smallCapsHint: 'Gloss 中的全大写语法缩写将自动显示为小型大写字母。',
    preview: '输出预览', separateTables: '每个例句独立成表', export: '导出', copyTable: '复制表格', copyMD: '复制 HTML / MD', png: '透明 PNG',
    project: '项目', openProject: '打开', saveProject: '保存', hanzi: '汉字', romanized: '拼音 / 罗马字 / IPA', gloss: 'Gloss', validating: '正在验证…',
    valid: 'API key 可用', invalid: '验证失败', generating: '正在生成第 {current}/{total} 个例句…', generated: '已生成 {count} 个例句，可直接逐格修改',
    copied: '已复制', saved: '项目已保存', loaded: '项目已载入', needInput: '请至少输入一个例句', needKey: '请输入 API key', needModel: '请输入模型名称',
    badKeyFormat: 'API key 不应包含空格；请清空后重新粘贴。', localUnavailable: '无法连接本机后端，请确认程序仍在运行。',
    emptyOutput: '请至少选择一项输出内容。', typographyReset: '排版已恢复默认。', invalidTxt: '只能导入扩展名为 .txt 的文本文件。',
    emptyTxt: 'TXT 文件中没有可用例句。', importedTxt: '已导入 {count} 个例句；点击“生成 Gloss”开始处理。', example: '例句', token: '词项', resultCount: '{count} 个例句',
    batchFailed: '第 {line} 行生成失败：{error}', badProject: '项目文件无有效结果。', invalidResponse: '后端返回无效响应', modelUnavailable: '；模型名未出现在列表中',
  },
  en: {
    demo: 'Load demo', help: 'Guide', close: 'Close', settings: 'Project settings', aiSettings: 'AI service', provider: 'Provider', model: 'Model name',
    keyHint: 'Used only for this API request and never saved.', validate: 'Validate API', apiKeyHelp: 'How to apply', apiKeyDialogTitle: 'How to get an API key', lingSettings: 'Language & transcription', variety: 'Language / variety', mandarin: 'Mandarin', cantonese: 'Cantonese', other: 'Other', zhuyin: 'Zhuyin / Bopomofo', jyutping: '粤拼 / Jyutping', ipaNumericTones: 'IPA + numeric tone values', ipaToneLetters: 'IPA tone letters',
    customVariety: 'Custom language / variety', inputFormat: 'Input format', transcriptionSystem: 'Primary transcription system', pinyinSettings: 'Pinyin settings', pinyinToneMarks: 'Pinyin with tone marks', pinyinToneNumbers: 'Pinyin with tone numbers', pinyinNoTone: 'Pinyin without tones', otherTranscriptionSettings: 'Other annotation', otherTranscriptionHint: 'Optional; leave blank to omit the other-annotation line.',
    transcriptionHint: 'Select the primary system for non-Mandarin material.',
    conventions: 'Gloss conventions (editable)', input: 'Input examples', importTxt: 'Import TXT', clear: 'Clear', analyze: 'Generate gloss',
    segHint: 'Enter one example per line, segmenting tokens with spaces. Blank lines are ignored. You may also import a one-example-per-line TXT file.',
    editResult: 'Edit results', aligned: 'tokens aligned', outputLines: 'Output lines', form: 'Form', transcription1: 'Transcription 1', transcription2: 'Transcription 2', pinyinOutput: 'Pinyin', otherTranscriptionOutput: 'Other annotation',
    freeTranslation: 'Free English translation', numberingMode: 'Numbering', noNumber: 'No numbers', continuousNumber: 'Numeric', alphabeticNumber: 'Alphabetic: (a)', alphabeticDotNumber: 'Alphabetic: a.', startNumber: 'Start number', startLetter: 'Start letter',
    typography: 'Typography', typographyNote: 'Control font, size, and emphasis for each line', rememberTypography: 'Keep current settings', resetTypography: 'Restore defaults',
    outputLine: 'Output line', font: 'Font', fontSize: 'Size (pt)', bold: 'Bold', italic: 'Italic',
    smallCapsHint: 'All-uppercase grammatical abbreviations in Gloss are automatically rendered in small caps.', preview: 'Output preview',
    separateTables: 'one table per example', export: 'Export', copyTable: 'Copy tables', copyMD: 'Copy HTML / MD', png: 'Transparent PNG', project: 'Project',
    openProject: 'Open', saveProject: 'Save', hanzi: 'Hanzi', romanized: 'Pinyin / romanization / IPA', gloss: 'Gloss', validating: 'Validating…',
    valid: 'API key is valid', invalid: 'Validation failed', generating: 'Generating example {current}/{total}…',
    generated: 'Generated {count} examples; edit any cell directly', copied: 'Copied', saved: 'Project saved', loaded: 'Project loaded',
    needInput: 'Enter at least one example', needKey: 'Enter an API key', needModel: 'Enter a model name',
    badKeyFormat: 'API keys must not contain spaces. Clear the field and paste it again.', localUnavailable: 'Cannot reach the local backend. Check that the program is still running.',
    emptyOutput: 'Select at least one output line.', typographyReset: 'Typography restored to defaults.', invalidTxt: 'Only .txt text files can be imported.',
    emptyTxt: 'The TXT file contains no usable examples.', importedTxt: 'Imported {count} examples; click “Generate gloss” to process them.', example: 'Example', token: 'Token',
    resultCount: '{count} examples', batchFailed: 'Line {line} failed: {error}', badProject: 'The project has no valid results.', invalidResponse: 'The backend returned an invalid response', modelUnavailable: '; model was not found in the list',
  },
};

I18N['zh-Hant'] = {
  demo: '載入範例', help: '使用說明', close: '關閉', settings: '專案設定', aiSettings: 'AI 服務', provider: '服務提供者', model: '模型名稱',
  keyHint: '僅用於本次 API 請求，不會儲存。', validate: '驗證 API', apiKeyHelp: '如何申請', apiKeyDialogTitle: '如何申請 API key', lingSettings: '語言與轉寫', variety: '語言 / 方言', mandarin: '國語 / Mandarin', cantonese: '粵語 / Cantonese', other: '其他 / Other', zhuyin: '注音符號 / Zhuyin', jyutping: '粵拼 / Jyutping', ipaNumericTones: 'IPA + 數字聲調', ipaToneLetters: 'IPA 聲調符號',
  customVariety: '自訂語言 / 方言名稱', inputFormat: '輸入格式', transcriptionSystem: '主要轉寫系統', pinyinSettings: '拼音設定', pinyinToneMarks: '拼音附聲調符號', pinyinToneNumbers: '拼音數字聲調', pinyinNoTone: '拼音不標聲調', otherTranscriptionSettings: '其他注音設定', otherTranscriptionHint: '選填；留白時不產生其他注音列。',
  transcriptionHint: '為非國語材料選擇主要轉寫系統。',
  conventions: 'Gloss 約定（可修改）', input: '輸入例句', importTxt: '匯入 TXT', clear: '清除', analyze: '產生 Gloss',
  segHint: '每行一個例句；請用空格分詞，空行將被忽略。也可匯入一行一個例句的 TXT 檔案。', editResult: '編輯結果', aligned: '詞數已對齊',
  outputLines: '輸出列', form: '原文', transcription1: '轉寫 1', transcription2: '轉寫 2', pinyinOutput: '拼音', otherTranscriptionOutput: '其他注音', freeTranslation: '英文自由翻譯',
  numberingMode: '編號方式', noNumber: '無編號', continuousNumber: '連續數字', alphabeticNumber: '字母：(a)', alphabeticDotNumber: '字母：a.', startNumber: '起始數字', startLetter: '起始字母', typography: '排版設定',
  typographyNote: '逐列控制字型、字號和字形', rememberTypography: '保留目前設定', resetTypography: '還原預設值', outputLine: '輸出列',
  font: '字型', fontSize: '字號（pt）', bold: '粗體', italic: '斜體', smallCapsHint: 'Gloss 中的全大寫語法縮寫會自動顯示為小型大寫字母。',
  preview: '輸出預覽', separateTables: '每個例句各用一個表格', export: '匯出', copyTable: '複製表格', copyMD: '複製 HTML / MD', png: '透明 PNG',
  project: '專案', openProject: '開啟', saveProject: '儲存', hanzi: '漢字', romanized: '拼音 / 羅馬字 / IPA', gloss: 'Gloss', validating: '正在驗證…',
  valid: 'API key 可用', invalid: '驗證失敗', generating: '正在產生第 {current}/{total} 個例句…', generated: '已產生 {count} 個例句，可直接逐格修改',
  copied: '已複製', saved: '專案已儲存', loaded: '專案已載入', needInput: '請至少輸入一個例句', needKey: '請輸入 API key', needModel: '請輸入模型名稱',
  badKeyFormat: 'API key 不應包含空格；請清除後重新貼上。', localUnavailable: '無法連線至後端，請確認服務仍在執行。',
  emptyOutput: '請至少選擇一個輸出列。', typographyReset: '排版已還原為預設值。', invalidTxt: '只能匯入副檔名為 .txt 的文字檔案。',
  emptyTxt: 'TXT 檔案中沒有可用例句。', importedTxt: '已匯入 {count} 個例句；選取「產生 Gloss」開始處理。', example: '例句', token: '詞項', resultCount: '{count} 個例句',
  batchFailed: '第 {line} 行產生失敗：{error}', badProject: '專案檔案中沒有有效結果。', invalidResponse: '後端傳回無效回應', modelUnavailable: '；模型名稱不在清單中',
};

function t(key, values = {}) {
  return (I18N[state.lang][key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}
function hasResults() { return state.results.length > 0; }
function setStatus(element, message, type = '') { element.textContent = message; element.className = `status ${type}`; }
function revealResults() { $('#previewWorkspace').classList.remove('hidden'); $('#workspace').classList.remove('hidden'); }
function hideResults() { $('#previewWorkspace').classList.add('hidden'); $('#workspace').classList.add('hidden'); }

function applyLang() {
  const htmlLanguages = {zh: 'zh-CN', en: 'en', 'zh-Hant': 'zh-Hant'};
  document.documentElement.lang = htmlLanguages[state.lang] || 'en';
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const value = I18N[state.lang][element.dataset.i18n];
    if (value) element.textContent = value;
  });
  document.querySelectorAll('[data-i18n-opt]').forEach(element => {
    const value = I18N[state.lang][element.dataset.i18nOpt];
    if (value) element.textContent = value;
  });
  $('.help-zh').classList.toggle('hidden', state.lang !== 'zh');
  $('.help-zh-hant').classList.toggle('hidden', state.lang !== 'zh-Hant');
  $('.help-en').classList.toggle('hidden', state.lang !== 'en');
  $('.api-help-zh').classList.toggle('hidden', state.lang !== 'zh');
  $('.api-help-zh-hant').classList.toggle('hidden', state.lang !== 'zh-Hant');
  $('.api-help-en').classList.toggle('hidden', state.lang !== 'en');
  document.querySelectorAll('[data-lang]').forEach(button => {
    const active = button.dataset.lang === state.lang;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  ['#btnCloseHelp', '#btnCloseApiHelp'].forEach(selector => {
    $(selector).setAttribute('aria-label', t('close'));
    $(selector).title = t('close');
  });
  if (hasResults()) renderEditor();
}

function providerChanged() {
  $('#model').value = defaults[$('#provider').value];
  setStatus($('#apiStatus'), '');
}
function applyInterfaceLanguage(language) {
  if (language === state.lang) return;
  state.lang = language;
  const settings = defaultAISettings(language);
  $('#provider').value = settings.provider;
  $('#model').value = settings.model;
  setStatus($('#apiStatus'), '');
  applyLang();
}
function selectedPinyinMode() {
  return document.querySelector('input[name="pinyinMode"]:checked')?.value || 'tone_marks';
}
function setPinyinMode(value) {
  const valid = ['tone_marks', 'tone_numbers', 'no_tone'].includes(value) ? value : 'tone_marks';
  const control = document.querySelector(`input[name="pinyinMode"][value="${valid}"]`);
  if (control) control.checked = true;
}
function selectedOtherTranscriptionSystem() {
  return $('#languagePreset').value === 'Mandarin Chinese' ? $('#otherTranscriptionSystem').value : $('#transcriptionSystem').value;
}
function languageChanged(setRecommended = true) {
  const value = $('#languagePreset').value;
  const isHanzi = $('#inputFormat').value === 'hanzi';
  const isMandarin = value === 'Mandarin Chinese';
  $('#customLanguageWrap').style.display = value === 'custom' ? 'block' : 'none';
  $('#mandarinTranscriptionSettings').style.display = isHanzi && isMandarin ? 'block' : 'none';
  $('#transcriptionWrap').style.display = isHanzi && !isMandarin ? 'block' : 'none';
  if (setRecommended && isHanzi) {
    if (isMandarin) {
      setPinyinMode('tone_marks');
      $('#otherTranscriptionSystem').value = '';
      $('#showTranscription').checked = false;
    } else if (value === 'Cantonese') {
      $('#transcriptionSystem').value = 'Jyutping';
      $('#showTranscription').checked = true;
    } else {
      $('#transcriptionSystem').value = 'Other';
      $('#showTranscription').checked = true;
    }
  }
  if (hasResults()) renderEditor();
}
function inputFormatChanged() {
  languageChanged(false);
}
function getLanguage() {
  return $('#languagePreset').value === 'custom' ? ($('#customLanguage').value.trim() || 'Chinese variety') : $('#languagePreset').value;
}
function inputExamples() { return parseExampleLines($('#sentence').value); }
function getPayload(sentence = '') {
  return {
    provider: $('#provider').value,
    model: $('#model').value.trim(),
    api_key: $('#apiKey').value.trim(),
    language: getLanguage(),
    input_format: $('#inputFormat').value,
    pinyin_mode: selectedPinyinMode(),
    other_transcription_system: selectedOtherTranscriptionSystem(),
    transcription_system: selectedOtherTranscriptionSystem() || 'Pinyin',
    conventions: $('#conventions').value,
    sentence,
  };
}
function validateKeyShape(payload, statusElement) {
  if (/\s/.test(payload.api_key)) {
    setStatus(statusElement, t('badKeyFormat'), 'bad');
    return false;
  }
  return true;
}
async function postJSON(url, payload) {
  let response;
  try {
    response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
  } catch (error) {
    throw new Error(t('localUnavailable'));
  }
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`${t('invalidResponse')} (HTTP ${response.status})`);
  }
  if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
async function validateAPI() {
  const payload = getPayload(inputExamples()[0] || '');
  if (!payload.api_key) return setStatus($('#apiStatus'), t('needKey'), 'bad');
  if (!validateKeyShape(payload, $('#apiStatus'))) return;
  if (!payload.model) return setStatus($('#apiStatus'), t('needModel'), 'bad');
  setStatus($('#apiStatus'), t('validating'));
  try {
    const data = await postJSON('api/validate/', payload);
    const unavailable = data.model_available === false;
    const suffix = unavailable ? t('modelUnavailable') : '';
    setStatus($('#apiStatus'), t('valid') + suffix, unavailable ? 'warn' : 'good');
  } catch (error) {
    setStatus($('#apiStatus'), `${t('invalid')}: ${error.message}`, 'bad');
  }
}
async function analyze() {
  const sentences = inputExamples();
  const basePayload = getPayload(sentences[0] || '');
  if (!sentences.length) return setStatus($('#workStatus'), t('needInput'), 'bad');
  if (!basePayload.api_key) return setStatus($('#workStatus'), t('needKey'), 'bad');
  if (!validateKeyShape(basePayload, $('#workStatus'))) return;
  if (!basePayload.model) return setStatus($('#workStatus'), t('needModel'), 'bad');

  $('#btnAnalyze').disabled = true;
  const previousResults = state.results;
  const generated = [];
  try {
    for (let index = 0; index < sentences.length; index += 1) {
      setStatus($('#workStatus'), t('generating', {current: index + 1, total: sentences.length}));
      const data = await postJSON('api/gloss/', {...basePayload, sentence: sentences[index]});
      generated.push(ensureResult(data.result));
      state.results = generated;
      revealResults();
      renderEditor();
    }
    persist();
    setStatus($('#workStatus'), t('generated', {count: generated.length}), 'good');
  } catch (error) {
    if (!generated.length) state.results = previousResults;
    if (hasResults()) {
      revealResults();
      renderEditor();
      persist();
    }
    setStatus($('#workStatus'), t('batchFailed', {line: generated.length + 1, error: error.message}), 'bad');
  } finally {
    $('#btnAnalyze').disabled = false;
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}
function styleCss(key) { return typographyCss(state.typography[key]); }
function initializeTypographyControls() {
  const options = Object.entries(FONT_OPTIONS).map(([value, option]) => `<option value="${esc(value)}">${esc(option.label)}</option>`).join('');
  document.querySelectorAll('.style-font').forEach(select => { select.innerHTML = options; });
  renderTypographyControls();
}
function renderTypographyControls() {
  document.querySelectorAll('[data-style-row]').forEach(row => {
    const style = state.typography[row.dataset.styleRow];
    row.querySelector('.style-font').value = style.font;
    row.querySelector('.style-size').value = style.size;
    row.querySelector('.style-bold').checked = style.bold;
    row.querySelector('.style-italic').checked = style.italic;
  });
  $('#rememberTypography').checked = state.rememberTypography;
}
function readTypographyControls() {
  const next = {};
  document.querySelectorAll('[data-style-row]').forEach(row => {
    next[row.dataset.styleRow] = {
      font: row.querySelector('.style-font').value,
      size: Number(row.querySelector('.style-size').value),
      bold: row.querySelector('.style-bold').checked,
      italic: row.querySelector('.style-italic').checked,
    };
  });
  state.typography = normalizeTypography(next);
}
function rememberTypography() {
  try {
    if (state.rememberTypography) localStorage.setItem('chineseGlossToolTypography', JSON.stringify(state.typography));
    else localStorage.removeItem('chineseGlossToolTypography');
  } catch (error) {}
}
function typographyChanged() {
  readTypographyControls();
  rememberTypography();
  if (hasResults()) renderEditor();
  persist();
}
function resetTypography() {
  state.typography = normalizeTypography(DEFAULT_TYPOGRAPHY);
  renderTypographyControls();
  rememberTypography();
  if (hasResults()) renderEditor();
  persist();
  setStatus($('#workStatus'), t('typographyReset'), 'good');
}
function rememberTypographyChanged() {
  state.rememberTypography = $('#rememberTypography').checked;
  rememberTypography();
  persist();
}

function stripNeutralToneZero(value) { return String(value ?? '').replace(/([\p{L}:])0/gu, '$1'); }
function ensureResult(result) {
  const normalized = result && typeof result === 'object' ? result : {tokens: []};
  const isHanzi = $('#inputFormat').value === 'hanzi';
  const isOtherPinyin = selectedOtherTranscriptionSystem().toLowerCase() === 'pinyin';
  normalized.tokens = Array.isArray(normalized.tokens) ? normalized.tokens.map(token => {
    const transcription = String(token.transcription ?? '');
    const pinyin = String(token.pinyin_diacritic ?? token.transcription ?? '');
    return {
      form: String(token.form ?? ''),
      transcription: isHanzi && isOtherPinyin ? stripNeutralToneZero(transcription) : transcription,
      pinyin_diacritic: isHanzi ? stripNeutralToneZero(pinyin) : pinyin,
      gloss: String(token.gloss ?? ''),
    };
  }) : [];
  normalized.free_translation = String(normalized.free_translation ?? '');
  normalized.note = String(normalized.note ?? '');
  return normalized;
}
function syncFromEditor() {
  state.results.forEach((result, exampleIndex) => {
    const root = document.querySelector(`[data-example-editor="${exampleIndex}"]`);
    if (!root) return;
    const read = field => [...root.querySelectorAll(`[data-field="${field}"]`)].map(element => element.textContent.trim());
    const forms = read('form');
    const transcriptions = read('transcription');
    const pinyin = read('pinyin_diacritic');
    const glosses = read('gloss');
    result.tokens = result.tokens.map((token, tokenIndex) => ({
      form: forms[tokenIndex] ?? token.form,
      transcription: transcriptions[tokenIndex] ?? token.transcription,
      pinyin_diacritic: pinyin[tokenIndex] ?? token.pinyin_diacritic,
      gloss: glosses[tokenIndex] ?? token.gloss,
    }));
    const translation = root.querySelector('[data-free-translation]');
    if (translation) result.free_translation = translation.value;
  });
}
function editorFieldHTML(exampleIndex, tokenIndex, label, field, value, className, styleKey) {
  const ariaLabel = `${t('example')} ${exampleIndex + 1}, ${t('token')} ${tokenIndex + 1}, ${label}`;
  return `<div class="token-editor-line" data-edit-style="${styleKey}"><span class="token-editor-label">${esc(label)}</span><div class="editable ${className}" contenteditable="true" role="textbox" aria-label="${esc(ariaLabel)}" spellcheck="false" data-field="${field}" data-i="${tokenIndex}">${esc(value)}</div></div>`;
}
function editorExampleHTML(result, exampleIndex) {
  const hasOtherAnnotation = Boolean(selectedOtherTranscriptionSystem()) || result.tokens.some(token => String(token.transcription ?? '').trim());
  const tokenCards = tokenEditorItems(result).map(token => `<section class="token-editor-card" data-token-index="${token.index}" aria-label="${esc(`${t('example')} ${exampleIndex + 1}, ${t('token')} ${token.index + 1}`)}">
    <div class="token-editor-index">${esc(t('token'))} ${token.index + 1}</div>
    ${editorFieldHTML(exampleIndex, token.index, t('form'), 'form', token.form, 'formcell', 'form')}
    ${editorFieldHTML(exampleIndex, token.index, t('pinyinOutput'), 'pinyin_diacritic', token.pinyin_diacritic, 'transcell', 'pinyin')}
    ${hasOtherAnnotation ? editorFieldHTML(exampleIndex, token.index, t('otherTranscriptionOutput'), 'transcription', token.transcription, 'transcell', 'transcription') : ''}
    ${editorFieldHTML(exampleIndex, token.index, t('gloss'), 'gloss', token.gloss, 'glosscell', 'gloss')}
  </section>`).join('');
  return `<article class="editor-example" data-example-editor="${exampleIndex}">
    <div class="editor-example-head"><span class="editor-example-title">${esc(t('example'))} ${exampleIndex + 1}</span><span class="editor-example-status">${esc(t('aligned'))}</span></div>
    <div class="token-editor-grid">${tokenCards}</div>
    <div class="translation-row"><label for="freeTranslation-${exampleIndex}">${esc(t('freeTranslation'))}</label><input type="text" id="freeTranslation-${exampleIndex}" data-free-translation value="${esc(result.free_translation)}" placeholder="I have already eaten three apples."></div>
    <div class="note model-note">${esc(result.note)}</div>
  </article>`;
}
function renderEditor() {
  if (!hasResults()) return;
  state.results = state.results.map(ensureResult);
  $('#editExamples').innerHTML = state.results.map(editorExampleHTML).join('');
  document.querySelectorAll('[data-edit-style]').forEach(row => {
    row.querySelectorAll('.editable').forEach(cell => { cell.style.cssText = styleCss(row.dataset.editStyle); });
  });
  document.querySelectorAll('[data-free-translation]').forEach(input => {
    input.style.cssText = styleCss('free');
    input.addEventListener('input', resultChanged);
  });
  document.querySelectorAll('.editable').forEach(element => element.addEventListener('input', resultChanged));
  $('#resultCount').textContent = t('resultCount', {count: state.results.length});
  renderPreview();
}
function resultChanged() { syncFromEditor(); renderPreview(); persist(); }

function outputOptions() {
  return {
    form: $('#showForm').checked,
    transcription: $('#showTranscription').checked,
    pinyin_diacritic: $('#showPinyin').checked,
    gloss: $('#showGloss').checked,
    translation: $('#showTranslation').checked,
  };
}
function selectedNumber(exampleIndex) {
  const mode = $('#numberingMode').value;
  const start = ['alphabetic', 'alphabetic-dot'].includes(mode) ? $('#startLetter').value : $('#startNumber').value;
  return exampleNumber(mode, start, exampleIndex);
}
function outputRows(result) {
  const options = outputOptions();
  const tokens = result.tokens;
  const rows = [];
  if (options.form) rows.push({key: 'form', styleKey: 'form', values: tokens.map(token => token.form)});
  if (options.pinyin_diacritic) rows.push({key: 'pinyin', styleKey: 'pinyin', values: tokens.map(token => token.pinyin_diacritic)});
  if (options.transcription) rows.push({key: 'transcription', styleKey: 'transcription', values: tokens.map(token => token.transcription)});
  if (options.gloss) rows.push({key: 'gloss', styleKey: 'gloss', values: tokens.map(token => token.gloss)});
  if (options.translation) rows.push({key: 'free', styleKey: 'free', text: `‘${result.free_translation}’`});
  return rows;
}
function publicationTableHTML(result, exampleIndex, glossFormatter = formatGlossHtml) {
  const rows = outputRows(result);
  const number = selectedNumber(exampleIndex);
  const tokenCount = result.tokens.length;
  return `<table class="pubtable"><tbody>${rows.map((row, rowIndex) => {
    let html = `<tr class="${row.key}" style="${esc(styleCss(row.styleKey))}">`;
    if (rowIndex === 0 && number) html += `<td class="num" rowspan="${rows.length}" valign="top" style="vertical-align:top">${esc(number)}</td>`;
    if (row.key === 'free') html += `<td colspan="${Math.max(1, tokenCount)}">${esc(row.text)}</td>`;
    else html += row.values.map(value => `<td>${row.key === 'gloss' ? glossFormatter(value) : esc(value)}</td>`).join('');
    return `${html}</tr>`;
  }).join('')}</tbody></table>`;
}
function publicationHTML(includeLabels = true, glossFormatter = formatGlossHtml) {
  if (!hasResults()) return '';
  syncFromEditor();
  if (!outputRows(state.results[0]).length) return `<div class="empty-preview">${esc(t('emptyOutput'))}</div>`;
  return state.results.map((result, index) => `<article class="example-preview" data-preview-example="${index}">${includeLabels ? `<div class="example-preview-title">${esc(t('example'))} ${index + 1}</div>` : ''}${publicationTableHTML(result, index, glossFormatter)}</article>`).join('');
}
function renderPreview() {
  $('#preview').innerHTML = publicationHTML();
  const mode = $('#numberingMode').value;
  $('#startNumberWrap').classList.toggle('hidden', mode !== 'continuous');
  $('#startLetterWrap').classList.toggle('hidden', !['alphabetic', 'alphabetic-dot'].includes(mode));
}
function requireOutput() {
  if (hasResults() && outputRows(state.results[0]).length) return true;
  setStatus($('#workStatus'), t('emptyOutput'), 'bad');
  return false;
}
function plainText() {
  syncFromEditor();
  return state.results.map((result, exampleIndex) => {
    const rows = outputRows(result);
    const number = selectedNumber(exampleIndex);
    return rows.map((row, rowIndex) => `${number ? `${rowIndex === 0 ? number : ''}\t` : ''}${row.key === 'free' ? row.text : row.values.join('\t')}`).join('\n');
  }).join('\n\n');
}
function inlineGlossHtml(value) {
  return formatGlossHtml(value).replaceAll('class="small-caps"', 'style="font-variant-caps:all-small-caps;font-feature-settings:&quot;smcp&quot; 1,&quot;c2sc&quot; 1;letter-spacing:.035em"');
}
function mdTable(result, exampleIndex) {
  const rows = outputRows(result);
  const number = selectedNumber(exampleIndex);
  const tokenCount = result.tokens.length;
  const cells = row => row.values.map(value => `<td style="border:none;padding:0 12px 0 0;white-space:nowrap;${esc(styleCss(row.styleKey))}">${row.key === 'gloss' ? inlineGlossHtml(value) : esc(value)}</td>`).join('');
  return `<table style="border-collapse:separate;border-spacing:0 4px;border:none">\n${rows.map((row, rowIndex) => {
    let html = '<tr>';
    if (rowIndex === 0 && number) html += `<td rowspan="${rows.length}" style="border:none;padding:0 12px 0 0;vertical-align:top;${esc(styleCss(row.styleKey))}">${esc(number)}</td>`;
    html += row.key === 'free' ? `<td colspan="${Math.max(1, tokenCount)}" style="border:none;padding-top:6px;${esc(styleCss(row.styleKey))}">${esc(row.text)}</td>` : cells(row);
    return `${html}</tr>`;
  }).join('\n')}\n</table>`;
}
function mdHTML() { syncFromEditor(); return state.results.map(mdTable).join('\n\n'); }
async function copyTable() {
  if (!requireOutput()) return;
  const html = `<!doctype html><meta charset="utf-8"><style>.example-preview+.example-preview{margin-top:18px}table{border-collapse:separate;border-spacing:0 4px}td{border:none;padding:0 14px 0 0;white-space:nowrap}td.num{vertical-align:top!important}.free td{padding-top:6px}</style>${publicationHTML(false, formatGlossHtmlForWord)}`;
  const plain = plainText();
  try {
    if (window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([html], {type: 'text/html'}), 'text/plain': new Blob([plain], {type: 'text/plain'})})]);
    } else await navigator.clipboard.writeText(plain);
    setStatus($('#workStatus'), t('copied'), 'good');
  } catch (error) {
    try { await navigator.clipboard.writeText(plain); setStatus($('#workStatus'), t('copied'), 'good'); }
    catch (fallback) { setStatus($('#workStatus'), fallback.message, 'bad'); }
  }
}
async function copyMD() {
  if (!requireOutput()) return;
  try { await navigator.clipboard.writeText(mdHTML()); setStatus($('#workStatus'), t('copied'), 'good'); }
  catch (error) { setStatus($('#workStatus'), error.message, 'bad'); }
}

function getOutputSettings() {
  return {
    form: $('#showForm').checked,
    transcription: $('#showTranscription').checked,
    pinyin_diacritic: $('#showPinyin').checked,
    gloss: $('#showGloss').checked,
    translation: $('#showTranslation').checked,
  };
}
function getProject() {
  syncFromEditor();
  return {
    version: '1.0',
    saved_at: new Date().toISOString(),
    settings: {
      languagePreset: $('#languagePreset').value,
      customLanguage: $('#customLanguage').value,
      inputFormat: $('#inputFormat').value,
      pinyinMode: selectedPinyinMode(),
      otherTranscriptionSystem: $('#otherTranscriptionSystem').value,
      transcriptionSystem: $('#transcriptionSystem').value,
      numberingMode: $('#numberingMode').value,
      startNumber: normalizeStartNumber($('#startNumber').value),
      startLetter: normalizeStartLetter($('#startLetter').value),
      output: getOutputSettings(),
      typography: state.typography,
      rememberTypography: state.rememberTypography,
      provider: $('#provider').value,
      model: $('#model').value,
      conventions: $('#conventions').value,
    },
    sentence: $('#sentence').value,
    results: state.results,
  };
}
function applyChecked(selector, value, defaultValue = true) { $(selector).checked = value === undefined ? defaultValue : value !== false; }
function legacyStartNumber(value) {
  const match = String(value ?? '').match(/-?\d+/);
  return match ? normalizeStartNumber(match[0]) : 1;
}
function loadProjectObj(project, options = {}) {
  const loadedResults = projectResults(project);
  if (!loadedResults.length) throw new Error(t('badProject'));
  const settings = project.settings || {};
  const output = settings.output || {};
  $('#languagePreset').value = settings.languagePreset || 'Mandarin Chinese';
  $('#customLanguage').value = settings.customLanguage || '';
  $('#inputFormat').value = settings.inputFormat || 'hanzi';
  setPinyinMode(settings.pinyinMode || 'tone_marks');
  const legacyTranscriptionSystem = settings.transcriptionSystem || 'Pinyin';
  $('#transcriptionSystem').value = legacyTranscriptionSystem;
  if (settings.otherTranscriptionSystem !== undefined) {
    $('#otherTranscriptionSystem').value = settings.otherTranscriptionSystem;
  } else if ($('#languagePreset').value === 'Mandarin Chinese' && output.transcription !== false) {
    $('#otherTranscriptionSystem').value = legacyTranscriptionSystem;
  } else {
    $('#otherTranscriptionSystem').value = '';
  }
  const savedNumberingMode = settings.numberingMode || (settings.includeNumber === false ? 'none' : 'continuous');
  $('#numberingMode').value = ['none', 'continuous', 'alphabetic', 'alphabetic-dot'].includes(savedNumberingMode) ? savedNumberingMode : 'continuous';
  $('#startNumber').value = normalizeStartNumber(settings.startNumber ?? legacyStartNumber(settings.exampleNo));
  $('#startLetter').value = normalizeStartLetter(settings.startLetter);
  applyChecked('#showForm', output.form);
  applyChecked('#showTranscription', output.transcription, false);
  applyChecked('#showPinyin', output.pinyin_diacritic);
  applyChecked('#showGloss', output.gloss);
  applyChecked('#showTranslation', output.translation);
  state.rememberTypography = settings.rememberTypography !== false;
  state.typography = options.fromAutosave && !state.rememberTypography ? normalizeTypography(DEFAULT_TYPOGRAPHY) : normalizeTypography(settings.typography || state.typography);
  renderTypographyControls();
  rememberTypography();
  $('#provider').value = settings.provider || 'deepseek';
  $('#model').value = settings.model ?? defaults[$('#provider').value];
  $('#conventions').value = settings.conventions || $('#conventions').value;
  $('#sentence').value = project.sentence || loadedResults.map(result => (result.tokens || []).map(token => token.form || '').join(' ')).join('\n');
  state.results = loadedResults.map(ensureResult);
  languageChanged(false);
  inputFormatChanged();
  revealResults();
  renderEditor();
  setStatus($('#workStatus'), t('loaded'), 'good');
}
function persist() {
  try { if (hasResults()) localStorage.setItem('chineseGlossToolAutosave', JSON.stringify(getProject())); }
  catch (error) {}
}
function downloadBlob(blob, name) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => { URL.revokeObjectURL(anchor.href); anchor.remove(); }, 500);
}
function saveProject() {
  downloadBlob(new Blob([JSON.stringify(getProject(), null, 2)], {type: 'application/json'}), 'chinese-gloss-project-1.0.json');
  setStatus($('#workStatus'), t('saved'), 'good');
}
function demo() {
  $('#languagePreset').value = 'Mandarin Chinese';
  $('#inputFormat').value = 'hanzi';
  setPinyinMode('tone_marks');
  $('#otherTranscriptionSystem').value = '';
  $('#transcriptionSystem').value = 'Pinyin';
  $('#sentence').value = '张三 把 那 本 书 买 了\n李四 已经 吃 了 三 个 苹果';
  $('#numberingMode').value = 'continuous';
  $('#startNumber').value = '1';
  $('#startLetter').value = 'a';
  ['#showForm', '#showPinyin', '#showGloss', '#showTranslation'].forEach(selector => { $(selector).checked = true; });
  $('#showTranscription').checked = false;
  state.results = [
    {tokens: [
      {form: '张三', transcription: 'Zhang1san1', pinyin_diacritic: 'Zhāngsān', gloss: 'Zhangsan'},
      {form: '把', transcription: 'ba3', pinyin_diacritic: 'bǎ', gloss: 'BA'},
      {form: '那', transcription: 'na4', pinyin_diacritic: 'nà', gloss: 'that'},
      {form: '本', transcription: 'ben3', pinyin_diacritic: 'běn', gloss: 'CLF'},
      {form: '书', transcription: 'shu1', pinyin_diacritic: 'shū', gloss: 'book'},
      {form: '买', transcription: 'mai3', pinyin_diacritic: 'mǎi', gloss: 'buy'},
      {form: '了', transcription: 'le', pinyin_diacritic: 'le', gloss: 'PFV'},
    ], free_translation: 'Zhangsan bought that book.', note: ''},
    {tokens: [
      {form: '李四', transcription: 'Li3si4', pinyin_diacritic: 'Lǐsì', gloss: 'Lisi'},
      {form: '已经', transcription: 'yi3jing1', pinyin_diacritic: 'yǐjīng', gloss: 'already'},
      {form: '吃', transcription: 'chi1', pinyin_diacritic: 'chī', gloss: 'eat'},
      {form: '了', transcription: 'le', pinyin_diacritic: 'le', gloss: 'PFV'},
      {form: '三', transcription: 'san1', pinyin_diacritic: 'sān', gloss: 'three'},
      {form: '个', transcription: 'ge', pinyin_diacritic: 'ge', gloss: 'CLF'},
      {form: '苹果', transcription: 'ping2guo3', pinyin_diacritic: 'píngguǒ', gloss: 'apple'},
    ], free_translation: 'Lisi has already eaten three apples.', note: ''},
  ].map(result => ({...result, tokens: result.tokens.map(token => ({...token, transcription: ''}))})).map(ensureResult);
  languageChanged();
  inputFormatChanged();
  revealResults();
  renderEditor();
  persist();
  setStatus($('#workStatus'), t('generated', {count: state.results.length}), 'good');
}
function clearAll() {
  state.results = [];
  $('#sentence').value = '';
  $('#preview').innerHTML = '';
  $('#editExamples').innerHTML = '';
  hideResults();
  setStatus($('#workStatus'), '');
  localStorage.removeItem('chineseGlossToolAutosave');
}
async function importTxt(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (!isTxtFilename(file.name)) throw new Error(t('invalidTxt'));
    const examples = parseExampleLines(await file.text());
    if (!examples.length) throw new Error(t('emptyTxt'));
    $('#sentence').value = examples.join('\n');
    setStatus($('#workStatus'), t('importedTxt', {count: examples.length}), 'good');
  } catch (error) {
    setStatus($('#workStatus'), error.message, 'bad');
  } finally {
    event.target.value = '';
  }
}

function svgEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[character]));
}
function canvasFont(key) {
  const style = state.typography[key];
  const sizePixels = style.size * 96 / 72;
  return `${style.italic ? 'italic ' : ''}${style.bold ? '700 ' : '400 '}${sizePixels}px ${FONT_OPTIONS[style.font].stack}`;
}
function svgTextAttributes(key, smallCaps = false) {
  const style = state.typography[key];
  const caps = smallCaps ? ' style="font-variant-caps:all-small-caps;font-feature-settings:\'smcp\' 1,\'c2sc\' 1;letter-spacing:.035em"' : '';
  return `font-family="${svgEscape(FONT_OPTIONS[style.font].stack)}" font-size="${style.size}pt" font-weight="${style.bold ? 700 : 400}" font-style="${style.italic ? 'italic' : 'normal'}"${caps}`;
}
function measureSvgExample(result, exampleIndex, context) {
  const rows = outputRows(result);
  const tokens = result.tokens;
  const number = selectedNumber(exampleIndex);
  const gap = 22;
  const pad = 18;
  const tokenRows = rows.filter(row => row.values);
  const widths = tokens.map((token, tokenIndex) => Math.max(24, ...tokenRows.map(row => {
    context.font = canvasFont(row.styleKey);
    return context.measureText(row.values[tokenIndex] || '').width;
  })) + gap);
  context.font = canvasFont(rows[0].styleKey);
  const numberWidth = number ? context.measureText(number).width + 18 : 0;
  const contentWidth = widths.reduce((sum, width) => sum + width, 0);
  const freeRow = rows.find(row => row.key === 'free');
  let freeWidth = 0;
  if (freeRow) { context.font = canvasFont(freeRow.styleKey); freeWidth = context.measureText(freeRow.text).width; }
  const rowHeights = rows.map(row => Math.max(22, state.typography[row.styleKey].size * 96 / 72 * 1.55));
  return {
    rows, widths, number, numberWidth, rowHeights, pad,
    width: Math.ceil(pad * 2 + numberWidth + Math.max(contentWidth, freeWidth)),
    height: Math.ceil(pad * 2 + rowHeights.reduce((sum, height) => sum + height, 0)),
  };
}
function makeSVG() {
  if (!requireOutput()) return null;
  syncFromEditor();
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const layouts = state.results.map((result, index) => measureSvgExample(result, index, context));
  const tableGap = 26;
  const width = Math.max(...layouts.map(layout => layout.width));
  const height = layouts.reduce((sum, layout) => sum + layout.height, 0) + tableGap * Math.max(0, layouts.length - 1);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`];
  let tableTop = 0;
  layouts.forEach(layout => {
    let top = tableTop + layout.pad;
    const contentX = layout.pad + layout.numberWidth;
    layout.rows.forEach((row, rowIndex) => {
      const baseline = top + state.typography[row.styleKey].size * 96 / 72;
      if (rowIndex === 0 && layout.number) parts.push(`<text x="${layout.pad}" y="${baseline}" ${svgTextAttributes(row.styleKey)}>${svgEscape(layout.number)}</text>`);
      let x = contentX;
      if (row.key === 'free') parts.push(`<text x="${x}" y="${baseline}" ${svgTextAttributes(row.styleKey)}>${svgEscape(row.text)}</text>`);
      else row.values.forEach((value, tokenIndex) => {
        parts.push(`<text x="${x}" y="${baseline}" ${svgTextAttributes(row.styleKey, row.key === 'gloss' && isGlossAbbreviation(value))}>${svgEscape(value)}</text>`);
        x += layout.widths[tokenIndex];
      });
      top += layout.rowHeights[rowIndex];
    });
    tableTop += layout.height + tableGap;
  });
  parts.push('</svg>');
  return {svg: parts.join(''), W: width, H: height};
}
function exportSVG() {
  const output = makeSVG();
  if (!output) return;
  downloadBlob(new Blob([output.svg], {type: 'image/svg+xml'}), 'gloss-examples.svg');
}
function exportPNG() {
  const output = makeSVG();
  if (!output) return;
  const url = URL.createObjectURL(new Blob([output.svg], {type: 'image/svg+xml'}));
  const image = new Image();
  image.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = output.W * scale;
    canvas.height = output.H * scale;
    const context = canvas.getContext('2d');
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob => downloadBlob(blob, 'gloss-examples-transparent.png'), 'image/png');
  };
  image.onerror = () => { URL.revokeObjectURL(url); setStatus($('#workStatus'), 'PNG export failed', 'bad'); };
  image.src = url;
}
function outputSettingChanged() { if (hasResults()) { renderPreview(); persist(); } }
function transcriptionSettingChanged(controlOutput = false) {
  if (controlOutput) $('#showTranscription').checked = Boolean(selectedOtherTranscriptionSystem());
  if (hasResults()) {
    renderEditor();
    persist();
  }
}

$('#provider').addEventListener('change', providerChanged);
$('#languagePreset').addEventListener('change', languageChanged);
$('#inputFormat').addEventListener('change', inputFormatChanged);
document.querySelectorAll('input[name="pinyinMode"]').forEach(control => control.addEventListener('change', () => transcriptionSettingChanged(false)));
$('#otherTranscriptionSystem').addEventListener('change', () => transcriptionSettingChanged(true));
$('#transcriptionSystem').addEventListener('change', () => transcriptionSettingChanged(true));
$('#btnValidate').addEventListener('click', validateAPI);
$('#btnAnalyze').addEventListener('click', analyze);
$('#btnDemo').addEventListener('click', demo);
$('#btnImportTxt').addEventListener('click', () => $('#sentenceFile').click());
$('#sentenceFile').addEventListener('change', importTxt);
$('#btnClear').addEventListener('click', clearAll);
$('#btnCopyTable').addEventListener('click', copyTable);
$('#btnCopyMD').addEventListener('click', copyMD);
$('#btnSVG').addEventListener('click', exportSVG);
$('#btnPNG').addEventListener('click', exportPNG);
$('#btnSave').addEventListener('click', saveProject);
$('#btnOpen').addEventListener('click', () => $('#fileOpen').click());
$('#fileOpen').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try { loadProjectObj(JSON.parse(await file.text())); persist(); }
  catch (error) { setStatus($('#workStatus'), error.message, 'bad'); }
  event.target.value = '';
});
document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => applyInterfaceLanguage(button.dataset.lang)));
$('#toggleKey').addEventListener('click', () => { $('#apiKey').type = $('#apiKey').type === 'password' ? 'text' : 'password'; });
['#showForm', '#showTranscription', '#showPinyin', '#showGloss', '#showTranslation'].forEach(selector => $(selector).addEventListener('change', outputSettingChanged));
$('#numberingMode').addEventListener('change', outputSettingChanged);
$('#startNumber').addEventListener('input', outputSettingChanged);
$('#startNumber').addEventListener('blur', () => {
  $('#startNumber').value = normalizeStartNumber($('#startNumber').value);
  outputSettingChanged();
});
$('#startLetter').addEventListener('input', outputSettingChanged);
document.querySelectorAll('.style-font,.style-bold,.style-italic').forEach(control => control.addEventListener('change', typographyChanged));
document.querySelectorAll('.style-size').forEach(control => control.addEventListener('input', typographyChanged));
$('#rememberTypography').addEventListener('change', rememberTypographyChanged);
$('#btnResetTypography').addEventListener('click', resetTypography);
$('#btnApiHelp').addEventListener('click', () => $('#apiKeyDialog').showModal());
$('#btnCloseApiHelp').addEventListener('click', () => $('#apiKeyDialog').close());
$('#apiKeyDialog').addEventListener('click', event => { if (event.target === $('#apiKeyDialog')) $('#apiKeyDialog').close(); });
$('#btnHelp').addEventListener('click', () => $('#helpDialog').showModal());
$('#btnCloseHelp').addEventListener('click', () => $('#helpDialog').close());
$('#helpDialog').addEventListener('click', event => { if (event.target === $('#helpDialog')) $('#helpDialog').close(); });
window.addEventListener('beforeunload', persist);

try {
  const remembered = localStorage.getItem('chineseGlossToolTypography');
  if (remembered) state.typography = normalizeTypography(JSON.parse(remembered));
} catch (error) {}
initializeTypographyControls();
applyLang();
languageChanged();
inputFormatChanged();
try {
  const saved = localStorage.getItem('chineseGlossToolAutosave');
  if (saved) loadProjectObj(JSON.parse(saved), {fromAutosave: true});
} catch (error) {}
