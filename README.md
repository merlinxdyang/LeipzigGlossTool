# Merlin's Leipzig Gloss Tool 2.0

**English** | [简体中文](README.zh-CN.md) | [正體中文](README.zh-TW.md)

An online-first, editable interlinear-glossing tool for Sinitic and multilingual research. The deployed application is available at [ailinguistics.cloud/clg](https://ailinguistics.cloud/clg/).

## Workspaces

- `/clg/` — Mandarin, Cantonese, Southern Min, and custom Sinitic varieties. The established Mandarin and Cantonese prompt behavior remains the legacy default.
- `/clg/multilingual.html` — Japanese, German, French, Spanish, Dutch, Sanskrit, Uyghur, Mongolian, Tibetan, and a named custom-language profile.

The complete AI service panel appears at the upper left of both workspaces. Provider and model settings are shared through non-secret browser settings, and encrypted credential cookies are shared automatically.

Every generated result is editable and can be copied to Word, copied as borderless HTML/Markdown, exported as SVG or transparent PNG, or saved as a versioned JSON project.

## Output layers

The standard layers are independently selectable:

- original form;
- primary transcription or romanization;
- optional secondary annotation;
- token-aligned Modern Standard Chinese meaning;
- English Leipzig-style gloss;
- free English translation;
- free Chinese translation.

The aligned Chinese layer keeps the source order and has exactly one cell per source token. The free Chinese translation is a separate idiomatic sentence and may reorder material naturally.

## Multilingual profiles

The versioned registry is [`language-profiles.json`](language-profiles.json). Defaults include Modified Hepburn for Japanese, IAST for Sanskrit, ULY/NUL for Uyghur, THL EWTS for Tibetan, and distinct `mn-Cyrl` / `mn-Mong` Mongolian variants. The custom profile defaults to Latin transcription, IPA, English and aligned Chinese glosses, and free English translation. Every profile retains the user's whitespace tokenization as authoritative.

Uyghur source text uses logical-order Unicode. The UI handles RTL through markup and rejects embedded RLO/LRO/isolate controls in input. Traditional Mongolian, Tibetan, Devanagari, Arabic-script Uyghur, and Japanese use multilingual font fallbacks.

## Browser credential vault

API keys are never written to project JSON or `localStorage`. After validation, PHP seals the provider keys with AES-256-GCM and stores only authenticated ciphertext in a browser cookie with:

```text
Secure; HttpOnly; SameSite=Strict; Path=/clg/api/
```

Users may choose a browser-session cookie or opt into a 90-day cookie. The server keeps no per-user credential database, but it necessarily decrypts a key transiently in memory when making a provider request.

For HTTP-only loopback testing, set `CLG_ALLOW_INSECURE_LOCAL_COOKIE=1` when starting the PHP preview server. This exception is accepted only when both Host and client address are `localhost`, `127.0.0.1`, or `::1`; non-loopback deployments always retain the secure production cookie.

Before deployment, configure a random 32-byte master key outside the web root:

```bash
openssl rand -base64 32
```

Set the generated value as the server environment variable `CLG_CREDENTIAL_MASTER_KEY`. Never commit or place it in a public `.htaccess` file. Rotating this value invalidates all existing browser credential cookies.

## LiteSpeed / PHP deployment

Requirements:

- PHP 7.4 or newer;
- PHP extensions: `curl`, `json`, and `openssl`;
- HTTPS;
- `CLG_CREDENTIAL_MASTER_KEY` configured in the hosting control panel or virtual-host environment.

Upload the complete directory, including `.htaccess`, `api.php`, all three physical API entrypoints, the two work pages, the shared AI page, and `language-profiles.json`. `.htaccess` adds CSP, HSTS, clickjacking, referrer, permission, and content-type protections.

Check the deployment without a real key:

```bash
curl -i 'https://your-domain.example/clg/api/credentials/'
curl -i -X POST 'https://your-domain.example/clg/api/validate/' \
  -H 'Content-Type: application/json' \
  --data '{}'
```

The credential-status endpoint should return HTTP 200 with no configured providers. The empty validation request should return HTTP 400 JSON.

## Input and validation

Each non-empty physical line is one example. Whitespace freezes token count and order; an AI response with a different token count is rejected. Source forms are restored from the original input rather than trusted from model output. Unicode bidi override controls are rejected before generation.

The software validates structural alignment and export behavior. AI transcriptions, morphological analyses, aligned meanings, and translations remain researcher-editable outputs, not human-validated linguistic conclusions.

## Test

```bash
python3 -m unittest -v
node --test test_batch.js test_typography.js test_interface_language.js test_language_profiles.js test_ai_service.js
php -l api.php
```

The retained `app.py` is the legacy local 1.x backend and is not the deployment target for the online-only 2.0 credential and multilingual workflows.
