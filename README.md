# Merlin's Leipzig Gloss Tool 1.0

**English** | [简体中文](README.zh-CN.md) | [正體中文](README.zh-TW.md)

A lightweight local web tool for producing editable interlinear glosses for Mandarin, Cantonese, and other Sinitic varieties.

It generates aligned Form, transcription, tone-marked Pinyin, Leipzig-style Gloss, and free English translation lines through DeepSeek, OpenAI, Claude, or OpenRouter. Every result remains editable and can be copied into Word or exported as SVG and transparent PNG.

![Merlin's Leipzig Gloss Tool header](docs/images/header.png)

## Screenshots

### Mandarin batch workflow

<img src="docs/images/mandarin-workflow.png" alt="Mandarin batch glossing workflow" width="820">

### Cantonese workflow

<img src="docs/images/cantonese-workflow.png" alt="Cantonese glossing workflow with Jyutping" width="820">

### Copying tables into Word and exporting publication-ready images

<img src="docs/images/word-export.png" alt="Gloss tables pasted into Word and exported as an image" width="820">

## Run on macOS

1. Unzip the folder.
2. Open Terminal and `cd` into the unzipped folder.
3. Run:

```bash
python3 app.py
```

The tool opens automatically at:

```text
http://127.0.0.1:8765/
```

Press `Control-C` in Terminal to stop it.

No third-party Python packages are required.

## Deploy on LiteSpeed / PHP without a reverse proxy

Upload the complete folder to the public `clg` directory, including the `api` directory and `api.php`. The production API is handled by PHP; `app.py` remains the local macOS backend and is not used by LiteSpeed. Uploading the hidden `.htaccess` file is strongly recommended because it blocks direct downloads of source and test files, but the API routes do not depend on URL rewriting.

Server requirements:

- PHP 7.4 or newer
- PHP extensions: `curl`, `json`, and `openssl`
- HTTPS enabled for the public site

After uploading, check the route without using a real API key:

```bash
curl -i -X POST 'https://your-domain.example/clg/api/validate/' \
  -H 'Content-Type: application/json' \
  --data '{}'
```

The expected result is an HTTP `400` JSON response containing `{"ok":false,...}`. If it returns an HTML page, confirm that the complete `api/validate/index.php` path and `api.php` were uploaded and that PHP is enabled for the directory.

## Main workflow

1. Select an AI provider and model.
2. Paste the provider API key and click **Validate API**.
3. Choose language/variety and input format.
4. Enter one example per line, with **spaces already marking the intended word boundaries**, or import a `.txt` file containing one example per line. Blank lines are ignored.
5. Click **Generate gloss**.
6. Review the preview directly below the input. Every example is rendered as a separate table.
7. Edit any Form / Transcription 1 / Transcription 2 / Gloss cell and free translation in the per-example editor. Token groups wrap automatically to fit the available page width while keeping all four aligned layers together.
8. Select output lines and choose no numbering, continuous numeric numbering, parenthesized alphabetic numbering `(a)`, or dotted alphabetic numbering `a.`. Numeric starts must be positive integers; both alphabetic formats accept a custom start and continue from `z` to `aa`.
9. Copy all rich borderless tables or HTML-in-Markdown, export SVG/transparent PNG, or save the editable batch project as JSON.

Use **Load demo** to test editing and export without an API key.

## Providers

- DeepSeek — default model: `deepseek-v4-flash`; base URL and current model IDs follow the [official DeepSeek API quick start](https://api-docs.deepseek.com/zh-cn/)
- OpenAI — default model field: `gpt-5.6-luna` (editable)
- Claude / Anthropic — default model field: `claude-sonnet-5` (editable)
- OpenRouter — model field is deliberately free-form; enter the desired model slug

The Simplified Chinese interface defaults to DeepSeek / `deepseek-v4-flash`. The English and Traditional Chinese interfaces default to OpenAI / `gpt-5.6-luna`. Switching interface language applies that language's default; clicking the already active language does not overwrite a manually edited provider or model.

The API key is kept only in the current browser form and sent to the same-origin Python or PHP backend for the outgoing provider request. It is **not** written to project files or localStorage, and the application does not log request bodies.

The key field asks password managers not to autofill it and rejects values containing whitespace before sending. If validation returns HTTP 401, clear the field and paste a current key from the provider's API-key console.

## Glossing behavior

The prompt intentionally keeps the linguistic policy simple and editable:

- lexical glosses: `book`, `eat`, `already`
- grammatical glosses: `1SG`, `PFV`, `NEG`, `CLF`, `ASP`
- conventional Chinese labels: `BA`, `BEI`, `DE`, `LE`
- proper names: normally romanized/repeated, e.g. `Zhangsan`
- uncertain forms: preserve the form or provide one short candidate
- default practical orientation: Li & Thompson-style distinctions
- requested project convention: `le1 = ASP`, `le2 = PFV` when applicable
- sentence-final particles: `SFP`

These conventions can be edited in the left sidebar before generation, and every generated cell can be corrected afterward.

## Input behavior

Each non-empty physical input line is one example. Whitespace within that line is authoritative: the backend freezes the number and order of tokens and rejects an AI response if it returns a different number of token objects. Batch examples are sent one at a time to avoid a burst of simultaneous API requests.

TXT import accepts only filenames ending in `.txt`. Its contents follow the same one-example-per-line rule and are placed into the input area for review before generation.

The backend requests JSON/structured output where the selected provider supports it. For user-selected OpenAI, Claude, or OpenRouter models that explicitly reject the structured-output parameter, it retries with the provider's compatible plain-JSON prompt. Authentication, quota, and network failures are not retried.

- **Hanzi input** → Form + Transcription 1 + tone-marked Pinyin (Transcription 2) + Gloss + free English translation
- **Romanization / IPA input** → both transcription fields preserve the supplied form rather than inventing another reading

For Hanzi input, Transcription 1 can be Pinyin, Jyutping, Zhuyin/Bopomofo, IPA, Yale, or another system. Pinyin uses tone numbers, but neutral-tone syllables have no `0`. Zhuyin uses horizontal Unicode Bopomofo: first tone is unmarked, tone marks follow the syllable, and the neutral-tone dot precedes it (for example, `ㄨㄛˇ`, `˙ㄉㄜ`). Transcription 2 is always Standard Mandarin Hanyu Pinyin with tone diacritics; neutral tone is unmarked. For non-Mandarin material, Transcription 2 is a Mandarin reference layer.

## Typography

Every output line defaults to Times New Roman with Songti (`Songti SC` / `STSong` / `SimSun`) fallback for Chinese, 10.5 pt, regular, and non-italic. Form, Transcription 1, Transcription 2, Gloss, and free translation can each set font, point size, bold, and italic independently.

“Keep current settings” remembers the current typography for future sessions. “Restore defaults” resets all five lines. All-uppercase grammatical abbreviations such as `SFP`, `PFV`, and `3SG` are rendered with small caps in rich preview/export formats.

## Export notes

- **Copy table** writes a rich HTML table plus plain-text fallback to the clipboard. It is intended for pasting into Word/Pages and has no visible borders in the publication representation.
- **Copy borderless MD** produces HTML table markup suitable for Markdown environments that allow embedded HTML. Pure pipe-table Markdown cannot itself guarantee invisible borders.
- **SVG** has a transparent background and keeps text/vector sharpness.
- **Transparent PNG** is rendered from the SVG at 2× scale with no background fill.
- Every example remains a separate table in the preview, rich copy, and HTML / MD output. SVG and PNG place the example tables in separate vertically spaced blocks.
- Output-line selection and continuous-number settings apply consistently to the preview and every export format.

## Security / limitations

The local Python server binds only to `127.0.0.1` by default. The PHP deployment uses fixed provider endpoints and accepts requests only through its same-origin API routes. Keep HTTPS enabled; do not publish the local Python port.

The tool has been built to preserve user segmentation and allow manual correction, rather than to guarantee a particular grammatical analysis. AI-generated transcriptions, glosses, and translations still require researcher review.

## Test

Run the dependency-free regression suite with:

```bash
python3 -m unittest -v
node --test test_batch.js test_typography.js test_interface_language.js
php -l api.php
```
