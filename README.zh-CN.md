# Merlin's Leipzig Gloss Tool 2.0

[English](README.md) | **简体中文** | [正體中文](README.zh-TW.md)

面向在线部署的可编辑莱比锡标注工具。正式地址为 [ailinguistics.cloud/clg](https://ailinguistics.cloud/clg/)。

## 两个工作页面

- `/clg/`：普通话、粤语、闽南语和自定义汉语方言。普通话、粤语默认继续使用已经验证的旧路径。
- `/clg/multilingual.html`：日语、德语、法语、西班牙语、荷兰语、梵语、维吾尔语、蒙古语、藏语及自定义语言。

完整 AI 服务面板固定在两个页面左上端。服务商和模型设置共用，认证加密后的凭据 Cookie 也会在两个页面间自动共用。

## 输出行

所有输出行都可独立选择、编辑和设置排版：

- 原文；
- 主要转写/原文注音；
- 可选的其他注音；
- 汉语释义（逐词对齐）；
- 英语 Leipzig Gloss；
- 英语自由翻译；
- 汉语自由翻译。

“汉语释义”严格保持原文语序，每个原文 token 对应一个单元格；“汉语自由翻译”是单独的自然汉语句子，可按汉语习惯调整语序。若论文只需要四行，可只勾选原文、主要转写、汉语释义和汉语自由翻译。

## 多语言规范

版本化配置保存在 [`language-profiles.json`](language-profiles.json)。默认体系包括日语 Modified Hepburn、梵语 IAST、维吾尔语 ULY/NUL、藏语 THL EWTS，以及分别处理的 `mn-Cyrl` 与 `mn-Mong` 蒙古语文字变体。自定义语言默认生成拉丁转写、IPA、英语及逐词汉语 Gloss 和英语自由翻译。

用户输入的空格始终是最终词界。维吾尔文按逻辑顺序保存，由页面负责 RTL 排版；输入中的 RLO/LRO 等方向控制符会被阻止。天城文、维吾尔阿拉伯文、传统蒙古文、藏文和日文使用多语种字体回退。

## 在线 API key 安全

API key 不会写入项目文件或 `localStorage`。验证成功后，PHP 使用 AES-256-GCM 加密，并把认证密文存入：

```text
Secure; HttpOnly; SameSite=Strict; Path=/clg/api/
```

用户可以选择仅当前浏览器会话，或主动勾选“记住 90 天”。服务器不建立逐用户 key 数据库，但每次调用服务商时必须在内存中临时解密。

仅用于 HTTP 回环测试时，可在启动 PHP 预览服务时设置 `CLG_ALLOW_INSECURE_LOCAL_COOKIE=1`。只有 Host 和客户端地址均为 `localhost`、`127.0.0.1` 或 `::1` 时才会接受；任何非回环部署仍强制使用生产 Secure Cookie。

部署前在服务器 Web 根目录之外设置 32 字节随机主密钥：

```bash
openssl rand -base64 32
```

把结果保存为服务器环境变量 `CLG_CREDENTIAL_MASTER_KEY`。不得提交到 Git，也不得把真实值写进公开 `.htaccess`。更换主密钥会使所有旧浏览器凭据失效。

## LiteSpeed / PHP 部署

服务器要求：

- PHP 7.4 或更高版本；
- `curl`、`json`、`openssl` 扩展；
- HTTPS；
- 已配置 `CLG_CREDENTIAL_MASTER_KEY`。

上传完整目录，包括 `.htaccess`、`api.php`、`api/`、两个工作页面、AI 服务页面和 `language-profiles.json`。`.htaccess` 会增加 CSP、HSTS、防嵌套、Referrer-Policy、Permissions-Policy 和 `nosniff`。

无真实 key 的检查方式：

```bash
curl -i 'https://你的域名/clg/api/credentials/'
curl -i -X POST 'https://你的域名/clg/api/validate/' \
  -H 'Content-Type: application/json' \
  --data '{}'
```

凭据状态接口应返回 HTTP 200 和空服务商列表；空验证请求应返回 HTTP 400 JSON。

## 数据边界

每个非空物理行是一个例句。后端固定 token 数量和顺序，并把 `form` 恢复为用户原文；AI 返回的 token 数量不同会被拒绝。

工程测试只能验证结构、方向和导出行为。AI 生成的转写、形态分析、汉语释义与翻译均保持可编辑，不等同于母语者或研究者已经验证的结论。

## 测试

```bash
python3 -m unittest -v
node --test test_batch.js test_typography.js test_interface_language.js test_language_profiles.js test_ai_service.js
php -l api.php
```

`app.py` 仅保留为 1.x 本地后端；2.0 的在线凭据和多语言流程以 PHP 部署为准。
