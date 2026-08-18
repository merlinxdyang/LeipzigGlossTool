'use strict';

const $ = selector => document.querySelector(selector);
const {DEFAULT_MODELS, credentialRequestHeaders, loadAISettings, saveAISettings} = GlossAIService;
const providers = ['deepseek', 'openai', 'claude', 'openrouter'];
const providerLabels = {deepseek: 'DeepSeek', openai: 'OpenAI', claude: 'Claude / Anthropic', openrouter: 'OpenRouter'};
let interfaceLanguage = 'zh';
let configuredProviders = [];

const messages = {
  zh: {siniticPage:'汉语页面',multilingualPage:'多语言页面',aiServices:'AI 服务',title:'AI 服务中心',subtitle:'两个工作页面共用服务商、模型和本浏览器中的加密凭据。',credentialTitle:'配置或更新 API key',provider:'服务商',model:'模型名称',keyHint:'验证成功后密封保存在此浏览器的 HttpOnly Cookie；网页脚本无法读取。',remember:'在此浏览器记住 90 天；不勾选则关闭浏览器后失效',validateSave:'验证并保存',forget:'忘记此服务商的 key',savedTitle:'本浏览器的凭据状态',securityTitle:'存储边界',securityText:'服务器不建立用户 key 数据库。浏览器只保存认证加密后的密文；每次调用时 PHP 在内存中临时解密。',configured:'已配置',notConfigured:'未配置',saving:'正在验证…',saved:'已验证并保存',deleted:'已删除',missingKey:'请输入 API key',deleteConfirm:'确认删除该服务商在此浏览器保存的 key？'},
  'zh-Hant': {siniticPage:'漢語頁面',multilingualPage:'多語言頁面',aiServices:'AI 服務',title:'AI 服務中心',subtitle:'兩個工作頁面共用服務提供者、模型和此瀏覽器中的加密憑證。',credentialTitle:'設定或更新 API key',provider:'服務提供者',model:'模型名稱',keyHint:'驗證成功後密封儲存在此瀏覽器的 HttpOnly Cookie；網頁指令碼無法讀取。',remember:'在此瀏覽器保留 90 天；不勾選則關閉瀏覽器後失效',validateSave:'驗證並儲存',forget:'忘記此服務提供者的 key',savedTitle:'此瀏覽器的憑證狀態',securityTitle:'儲存邊界',securityText:'伺服器不建立使用者 key 資料庫。瀏覽器只儲存認證加密後的密文；每次呼叫時 PHP 在記憶體中暫時解密。',configured:'已設定',notConfigured:'未設定',saving:'正在驗證…',saved:'已驗證並儲存',deleted:'已刪除',missingKey:'請輸入 API key',deleteConfirm:'確認刪除此服務提供者在此瀏覽器儲存的 key？'},
  en: {siniticPage:'Sinitic',multilingualPage:'Multilingual',aiServices:'AI service',title:'AI service center',subtitle:'Both workspaces share the provider, model, and encrypted credentials stored by this browser.',credentialTitle:'Configure or replace an API key',provider:'Provider',model:'Model name',keyHint:'After validation, the key is sealed in an HttpOnly cookie that page scripts cannot read.',remember:'Remember for 90 days in this browser; otherwise forget when the browser closes',validateSave:'Validate and save',forget:'Forget this provider key',savedTitle:'Credential status in this browser',securityTitle:'Storage boundary',securityText:'The server keeps no per-user key database. The browser stores authenticated ciphertext; PHP decrypts it transiently in memory for each call.',configured:'Configured',notConfigured:'Not configured',saving:'Validating…',saved:'Validated and saved',deleted:'Deleted',missingKey:'Enter an API key',deleteConfirm:'Delete the saved key for this provider from this browser?'},
};

function text(key) { return messages[interfaceLanguage][key] || key; }
function setStatus(message, type = '') { $('#credentialStatus').textContent = message; $('#credentialStatus').className = `status ${type}`; }
function applyLanguage() {
  document.documentElement.lang = interfaceLanguage === 'zh' ? 'zh-CN' : interfaceLanguage;
  document.querySelectorAll('[data-i18n]').forEach(element => { const value = messages[interfaceLanguage][element.dataset.i18n]; if (value) element.textContent = value; });
  document.querySelectorAll('[data-lang]').forEach(button => button.classList.toggle('active', button.dataset.lang === interfaceLanguage));
  renderProviderStatus();
}
function renderProviderStatus() {
  const root = $('#providerStatus');
  root.replaceChildren(...providers.map(provider => {
    const row = document.createElement('div');
    row.className = 'provider-status-row';
    const name = document.createElement('strong');
    name.textContent = providerLabels[provider];
    const badge = document.createElement('span');
    const configured = configuredProviders.includes(provider);
    badge.className = `badge ${configured ? 'good' : ''}`;
    badge.textContent = configured ? text('configured') : text('notConfigured');
    row.append(name, badge);
    return row;
  }));
}
async function requestCredentials(method, body) {
  const response = await fetch('api/credentials/', {method, headers: credentialRequestHeaders(), body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin'});
  const data = await response.json().catch(() => ({ok:false,error:`HTTP ${response.status}`}));
  if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
  configuredProviders = Array.isArray(data.configured_providers) ? data.configured_providers : [];
  renderProviderStatus();
  return data;
}
async function refreshStatus() {
  try {
    const response = await fetch('api/credentials/', {credentials:'same-origin', cache:'no-store'});
    const data = await response.json();
    configuredProviders = Array.isArray(data.configured_providers) ? data.configured_providers : [];
  } catch (error) { configuredProviders = []; }
  renderProviderStatus();
}

const saved = loadAISettings(interfaceLanguage);
$('#provider').value = saved.provider;
$('#model').value = saved.model;
$('#provider').addEventListener('change', () => { $('#model').value = DEFAULT_MODELS[$('#provider').value]; saveAISettings({provider:$('#provider').value,model:$('#model').value}, interfaceLanguage); });
$('#model').addEventListener('change', () => saveAISettings({provider:$('#provider').value,model:$('#model').value}, interfaceLanguage));
$('#toggleKey').addEventListener('click', () => { $('#apiKey').type = $('#apiKey').type === 'password' ? 'text' : 'password'; });
document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => { interfaceLanguage = button.dataset.lang; applyLanguage(); }));
$('#credentialForm').addEventListener('submit', async event => {
  event.preventDefault();
  const apiKey = $('#apiKey').value.trim();
  if (!apiKey) return setStatus(text('missingKey'), 'bad');
  const settings = saveAISettings({provider:$('#provider').value,model:$('#model').value}, interfaceLanguage);
  setStatus(text('saving'));
  try {
    await requestCredentials('POST', {provider:settings.provider,model:settings.model,api_key:apiKey,remember:$('#rememberKey').checked});
    $('#apiKey').value = '';
    $('#apiKey').type = 'password';
    setStatus(text('saved'), 'good');
  } catch (error) { setStatus(error.message, 'bad'); }
});
$('#deleteCredential').addEventListener('click', async () => {
  if (!window.confirm(text('deleteConfirm'))) return;
  try { await requestCredentials('DELETE', {provider:$('#provider').value}); setStatus(text('deleted'), 'good'); }
  catch (error) { setStatus(error.message, 'bad'); }
});
applyLanguage();
refreshStatus();
