# Merlin's Leipzig Gloss Tool 2.0

[English](README.md) | [简体中文](README.zh-CN.md) | **正體中文**

以線上部署為主的可編輯萊比錫標註工具。正式網址為 [ailinguistics.cloud/clg](https://ailinguistics.cloud/clg/)。

## 兩個工作頁面

- `/clg/`：國語、粵語、閩南語和自訂漢語方言。國語、粵語預設繼續使用已驗證的舊路徑。
- `/clg/multilingual.html`：日語、德語、法語、西班牙語、荷蘭語、梵語、維吾爾語、蒙古語、藏語。

完整 AI 服務面板固定在兩個頁面的左上方。服務提供者和模型設定共用，認證加密後的憑證 Cookie 亦會在兩頁間自動共用。

## 輸出列

所有輸出列皆可獨立選取、編輯及設定排版：

- 原文；
- 主要轉寫／原文注音；
- 選填的其他注音；
- 漢語釋義（逐詞對齊）；
- 英文 Leipzig Gloss；
- 英文自由翻譯；
- 漢語自由翻譯。

「漢語釋義」嚴格保留原文語序，每個原文 token 對應一個儲存格；「漢語自由翻譯」是獨立的自然漢語句子，可依漢語習慣調整語序。

## 多語言規範

九種語言的版本化設定儲存在 [`language-profiles.json`](language-profiles.json)。預設系統包括日語 Modified Hepburn、梵語 IAST、維吾爾語 ULY/NUL、藏語 THL EWTS，以及分別處理的 `mn-Cyrl` 與 `mn-Mong` 蒙古語文字變體。

使用者輸入的空格始終是最終詞界。維吾爾文按邏輯順序儲存，由頁面負責 RTL 排版；輸入中的 RLO/LRO 等方向控制字元會被阻擋。

## 線上 API key 安全

API key 不會寫入專案檔或 `localStorage`。驗證成功後，PHP 使用 AES-256-GCM 加密，並把認證密文儲存在：

```text
Secure; HttpOnly; SameSite=Strict; Path=/clg/api/
```

使用者可選擇只保留於目前瀏覽器工作階段，或主動勾選「保留 90 天」。伺服器不建立逐使用者 key 資料庫，但每次呼叫服務提供者時仍須在記憶體中暫時解密。

部署前在伺服器 Web 根目錄之外設定 32 位元組隨機主密鑰：

```bash
openssl rand -base64 32
```

將結果設為伺服器環境變數 `CLG_CREDENTIAL_MASTER_KEY`。不得提交至 Git，也不得把真實值寫入公開 `.htaccess`。

## LiteSpeed / PHP 部署

需求：PHP 7.4 或更新版本、`curl`／`json`／`openssl` 擴充套件、HTTPS，以及已設定的 `CLG_CREDENTIAL_MASTER_KEY`。

上傳完整資料夾，包括 `.htaccess`、`api.php`、`api/`、兩個工作頁面、AI 服務頁面與 `language-profiles.json`。

## 資料邊界

每個非空白實體行是一個例句。後端固定 token 數量和順序，並將 `form` 還原為使用者原文；AI 傳回不同 token 數量時會拒絕結果。

工程測試只能驗證結構、方向和匯出行為。AI 產生的轉寫、形態分析、漢語釋義與翻譯皆保持可編輯，不等同於母語者或研究者已驗證的結論。

## 測試

```bash
python3 -m unittest -v
node --test test_batch.js test_typography.js test_interface_language.js test_language_profiles.js test_ai_service.js
php -l api.php
```
