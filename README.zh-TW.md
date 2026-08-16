# Merlin's Leipzig Gloss Tool 1.0

[English](README.md) | [简体中文](README.zh-CN.md) | **正體中文**

一套輕量、可編輯的漢語萊比錫標註工具，支援國語、粵語及其他漢語方言。

工具可透過 DeepSeek、OpenAI、Claude 或 OpenRouter 產生相互對齊的原文、可設定拼音、選填注音、Gloss 和英文自由翻譯。所有結果皆可逐格修改，並可複製到 Word，或匯出為 SVG 和透明 PNG。

![Merlin's Leipzig Gloss Tool 標題列](docs/images/header.png)

## 介面展示

### 國語批次處理

<img src="docs/images/mandarin-workflow.png" alt="國語批次 Gloss 工作介面" width="820">

### 粵語與粵拼

<img src="docs/images/cantonese-workflow.png" alt="粵語和粵拼 Gloss 工作介面" width="820">

### 貼到 Word 與圖片匯出

<img src="docs/images/word-export.png" alt="表格貼到 Word 以及圖片匯出效果" width="820">

## 主要功能

- 每行輸入一個例句，支援每行一句的 TXT 批次匯入。
- 支援國語、粵語和自訂漢語方言。
- 國語拼音可選擇附聲調符號、數字聲調或不標聲調；預設附聲調符號，輕聲不標 `0`。
- 其他注音預設留白，可選注音符號、兩種 IPA 聲調、粵拼 / Jyutping、Yale 或自訂系統。
- 每個詞的原文、拼音、選填注音和 Gloss 均可編輯，英文翻譯亦可修改。
- 輸出列可任意組合，並可使用數字編號、`(a)` 編號、`a.` 編號或不編號。
- 每列均可分別設定字型、字級、粗體和斜體；全大寫語法標記會自動使用小型大寫字母，貼到 Word 時會保留此格式。
- 可將無框線表格複製到 Word，或匯出 HTML / MD、SVG 和透明 PNG。
- 支援英文、簡體中文和正體中文介面。

## 在本機執行

不必安裝第三方 Python 套件。在終端機進入專案資料夾後執行：

```bash
python3 app.py
```

瀏覽器會自動開啟：

```text
http://127.0.0.1:8765/
```

按 `Control-C` 停止程式。

## LiteSpeed / PHP 部署

將完整資料夾上傳至網站目錄，同時保留 `api/`、`api.php` 和隱藏檔 `.htaccess`。正式環境由 PHP 處理 API 請求，不需要反向代理。

伺服器需求：

- PHP 7.4 或更新版本
- `curl`、`json`、`openssl` 擴充套件
- HTTPS

## 使用流程

1. 選擇 AI 服務提供者和模型，輸入並驗證 API key。
2. 選擇語言和輸入格式；國語選擇拼音形式，並視需要選擇其他注音。
3. 每行輸入一個已經用空格分詞的例句，或匯入 TXT 檔案。
4. 點選「產生 Gloss」。
5. 檢查並逐格修改結果。
6. 選擇輸出列、編號方式和排版。
7. 複製表格、匯出圖片或儲存專案。

API key 只會傳送到同源後端供目前請求使用，不會寫入專案檔案或瀏覽器儲存空間。AI 產生的語言學分析仍應由研究者確認。

## 測試

```bash
python3 -m unittest -v
node --test test_batch.js test_typography.js test_interface_language.js
php -l api.php
```
