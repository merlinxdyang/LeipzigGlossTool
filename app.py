#!/usr/bin/env python3
import json
import os
import re
import sys
import urllib.error
import urllib.request
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = int(os.environ.get("GLOSS_TOOL_PORT", "8765"))

GLOSS_RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "tokens": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "form": {"type": "string"},
                    "transcription": {"type": "string"},
                    "pinyin_diacritic": {"type": "string"},
                    "gloss": {"type": "string"},
                },
                "required": ["form", "transcription", "pinyin_diacritic", "gloss"],
                "additionalProperties": False,
            },
        },
        "free_translation": {"type": "string"},
        "note": {"type": "string"},
    },
    "required": ["tokens", "free_translation", "note"],
    "additionalProperties": False,
}

API_KEY_ECHO_RE = re.compile(
    r"(?i)(\b(?:your\s+)?api[_ -]?key(?:\s+provided)?\s*:\s*)(\S+)"
)
API_KEY_TOKEN_RE = re.compile(r"\b(?:sk|key)-[A-Za-z0-9_.-]{8,}\b", re.I)


def redact_sensitive_text(value):
    text = str(value)
    text = API_KEY_ECHO_RE.sub(lambda match: match.group(1) + "[redacted]", text)
    return API_KEY_TOKEN_RE.sub("[redacted]", text)


def http_json(url, method="GET", headers=None, payload=None, timeout=30):
    headers = dict(headers or {})
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(raw) if raw else {}
        except Exception:
            body = {"raw": raw}
        message = extract_api_error(body) or raw or e.reason
        raise RuntimeError(f"HTTP {e.code}: {redact_sensitive_text(message)}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Network error: {e.reason}") from e


def extract_api_error(body):
    if not isinstance(body, dict):
        return ""
    err = body.get("error")
    if isinstance(err, str):
        return err
    if isinstance(err, dict):
        return err.get("message") or err.get("detail") or json.dumps(err, ensure_ascii=False)
    return body.get("message") or body.get("detail") or ""


def validate_key(provider, api_key, model):
    provider = provider.lower()
    if not api_key:
        raise RuntimeError("API key is empty.")

    if provider == "deepseek":
        _, body = http_json(
            "https://api.deepseek.com/models",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        models = [x.get("id") for x in body.get("data", []) if x.get("id")]
        return {"ok": True, "models": models, "model_available": (model in models if model else None)}

    if provider == "openai":
        _, body = http_json(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        models = [x.get("id") for x in body.get("data", []) if x.get("id")]
        return {"ok": True, "models": models[:250], "model_available": (model in models if model else None)}

    if provider == "claude":
        _, body = http_json(
            "https://api.anthropic.com/v1/models?limit=100",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
        )
        models = [x.get("id") for x in body.get("data", []) if x.get("id")]
        return {"ok": True, "models": models, "model_available": (model in models if model else None)}

    if provider == "openrouter":
        _, body = http_json(
            "https://openrouter.ai/api/v1/key",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        return {"ok": True, "models": [], "model_available": None, "key_info": body.get("data", body)}

    raise RuntimeError(f"Unsupported provider: {provider}")


def build_prompt(data):
    sentence = data.get("sentence", "").strip()
    tokens = re.split(r"\s+", sentence) if sentence else []
    language = data.get("language", "Mandarin Chinese").strip() or "Mandarin Chinese"
    input_format = data.get("input_format", "hanzi")
    is_mandarin = language.casefold() in {"mandarin", "mandarin chinese", "普通话", "國語", "国语"}
    pinyin_mode = str(data.get("pinyin_mode", "tone_marks") or "tone_marks").strip()
    if pinyin_mode not in {"tone_marks", "tone_numbers", "no_tone"}:
        pinyin_mode = "tone_marks"
    if "other_transcription_system" in data:
        other_transcription_system = str(data.get("other_transcription_system") or "").strip()
    else:
        # Projects/frontends from before 1.0 used transcription_system as the first layer.
        other_transcription_system = str(data.get("transcription_system", "Pinyin") or "Pinyin").strip()
    conventions = data.get("conventions", "").strip()

    needs_transcription = input_format == "hanzi"
    token_json = json.dumps(tokens, ensure_ascii=False)

    system = """You are a linguist preparing interlinear glossed examples of Sinitic languages.
Return ONLY valid JSON. Do not use Markdown fences. Never change, merge, split, delete, reorder, or add user tokens.
The user's whitespace segmentation is authoritative.

Glossing conventions:
- Lexical glosses are concise English lowercase words such as book, eat, already.
- Grammatical glosses use conventional uppercase abbreviations such as 1SG, PFV, NEG, CLF, ASP.
- Conventional Chinese labels such as BA, BEI, DE, LE may be used where appropriate.
- Proper names are normally repeated in romanized form, e.g. Zhangsan.
- If a form is genuinely uncertain, preserve the form or give one short candidate rather than inventing certainty.
- Use a practical Li & Thompson-oriented analysis by default, not a novel theoretical reanalysis.
- In this tool's default convention, use le1 -> ASP and le2 -> PFV when that distinction is applicable.
- Sentence-final particles may be glossed SFP.
- Preserve the exact morpheme boundary punctuation supplied by the user. If the user supplied x-y or x=y, keep corresponding boundary punctuation in the gloss when possible.
- Free translation should be idiomatic English but should not add discourse content absent from the example.
"""
    if conventions:
        system += "\nUser/project conventions override defaults when compatible with the input:\n" + conventions + "\n"

    user = f"""Language/variety: {language}
Input format: {input_format}
Pinyin setting: {pinyin_mode}
Other transcription system: {other_transcription_system or "none"}
Original sentence: {sentence}
Authoritative tokens: {token_json}

Return this JSON schema exactly:
{{
  "tokens": [
    {{"form": "EXACT ORIGINAL TOKEN", "transcription": "...", "pinyin_diacritic": "...", "gloss": "..."}}
  ],
  "free_translation": "...",
  "note": ""
}}

There must be exactly {len(tokens)} token objects, in exactly the same order as Authoritative tokens.
"""
    if needs_transcription:
        if pinyin_mode == "tone_numbers":
            user += (
                "In pinyin_diacritic, supply Standard Mandarin Hanyu Pinyin with "
                "tone numbers 1, 2, 3, or 4 (for example wo3, chi1). "
                "Neutral-tone syllables have no tone digit; never use 0 "
                "(for example de, ma, shen2me). "
            )
        elif pinyin_mode == "no_tone":
            user += (
                "In pinyin_diacritic, supply Standard Mandarin Hanyu Pinyin "
                "without tone marks or tone digits (for example wo, chi, shenme). "
            )
        else:
            user += (
                "In pinyin_diacritic, supply Standard Mandarin Hanyu Pinyin with "
                "tone diacritics (for example wǒ, chī). A neutral-tone syllable "
                "has neither a tone mark nor a 0. "
            )

        if not other_transcription_system:
            user += "For every token, set transcription to an empty string. "
        else:
            user += f"For every token, supply {other_transcription_system} in transcription. "
        system_name = other_transcription_system.casefold()
        if system_name == "pinyin":
            user += (
                "Use Pinyin tone numbers (for example wo3, chi1) in transcription. "
                "Neutral-tone syllables must have no tone digit; never use 0 "
                "(for example de, ma, shen2me). "
            )
        elif system_name in {"zhuyin", "bopomofo", "注音符号"}:
            user += (
                "Use Unicode Bopomofo (Zhuyin Fuhao) in horizontal writing. "
                "Leave the first tone unmarked; put ˊ, ˇ, or ˋ after the syllable "
                "for the second, third, or fourth tone; put the neutral-tone dot "
                "before the syllable. Examples: ㄨㄛˇ, ㄔ, ˙ㄉㄜ. "
            )
        elif system_name == "ipa numeric tones":
            user += "Use IPA segment symbols followed by Chao-style numeric tone values. "
            if is_mandarin:
                user += (
                    "For Standard Mandarin, use 55, 35, 214, and 51 for tones 1–4 "
                    "respectively; do not substitute tone-category numbers 1–4. "
                )
            else:
                user += (
                    "Use tone values appropriate to the requested language/variety; "
                    "do not substitute tone-category numbers for phonetic values. "
                )
            user += "Leave neutral tone without a 0. "
        elif system_name == "ipa tone letters":
            user += "Use IPA segment symbols with IPA/Chao tone letters. "
            if is_mandarin:
                user += "For Standard Mandarin, use ˥, ˧˥, ˨˩˦, and ˥˩ for tones 1–4 respectively. "
            else:
                user += "Use tone letters appropriate to the requested language/variety. "
            user += "Do not use ASCII tone digits in this layer. "
        user += (
            "Keep both fields aligned to the exact original token.\n"
        )
    else:
        user += (
            "The input is already romanization/IPA: set both transcription and "
            "pinyin_diacritic equal to form; do not invent another transcription layer.\n"
        )

    return system, user, tokens


def extract_json_text(text):
    if not isinstance(text, str):
        raise RuntimeError("Model returned no textual response.")
    s = text.strip()
    s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.I)
    s = re.sub(r"\s*```$", "", s)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        start = s.find("{")
        end = s.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(s[start:end + 1])
            except json.JSONDecodeError:
                pass
        raise RuntimeError("The model did not return valid JSON. Try again or use another model.")


def structured_response_format():
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "interlinear_gloss",
            "strict": True,
            "schema": GLOSS_RESULT_SCHEMA,
        },
    }


def post_model_json(provider, url, headers, payload):
    """POST a model request, retrying only known parameter incompatibilities."""
    current = dict(payload)
    for _ in range(3):
        try:
            return http_json(url, method="POST", headers=headers, payload=current, timeout=90)
        except RuntimeError as error:
            message = str(error).lower()
            changed = False

            format_markers = (
                "response_format",
                "json_schema",
                "structured output",
                "structured_outputs",
                "output_config",
            )
            if any(marker in message for marker in format_markers):
                if provider in {"openai", "openrouter"} and "response_format" in current:
                    current.pop("response_format")
                    changed = True
                if provider == "claude" and "output_config" in current:
                    current.pop("output_config")
                    changed = True

            if provider == "openai" and "max_completion_tokens" in current:
                if "max_completion_tokens" in message:
                    current["max_tokens"] = current.pop("max_completion_tokens")
                    changed = True

            if not changed:
                raise

    raise RuntimeError("The model endpoint rejected all compatible request formats.")


def call_model(provider, api_key, model, system_prompt, user_prompt):
    provider = provider.lower()
    if not model:
        raise RuntimeError("Model name is empty.")

    if provider in {"deepseek", "openrouter", "openai"}:
        if provider == "deepseek":
            url = "https://api.deepseek.com/chat/completions"
            headers = {"Authorization": f"Bearer {api_key}"}
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "max_tokens": 1800,
                "stream": False,
                "thinking": {"type": "disabled"},
                "response_format": {"type": "json_object"},
            }
        elif provider == "openrouter":
            url = "https://openrouter.ai/api/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": f"http://{HOST}:{PORT}",
                "X-Title": "Merlin's Leipzig Gloss Tool 1.0",
            }
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "max_tokens": 1800,
                "stream": False,
                "response_format": structured_response_format(),
            }
        else:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {"Authorization": f"Bearer {api_key}"}
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "max_completion_tokens": 1800,
                "stream": False,
                "response_format": structured_response_format(),
            }

        _, body = post_model_json(provider, url, headers, payload)
        choices = body.get("choices") or []
        if not choices:
            raise RuntimeError(extract_api_error(body) or "Model returned no choices.")
        message = choices[0].get("message") or {}
        if message.get("refusal"):
            raise RuntimeError("The model refused this request. Try another model or revise the input.")
        content = message.get("content")
        return extract_json_text(content)

    if provider == "claude":
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }
        payload = {
            "model": model,
            "max_tokens": 1800,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
            "output_config": {
                "format": {
                    "type": "json_schema",
                    "schema": GLOSS_RESULT_SCHEMA,
                }
            },
        }
        _, body = post_model_json(provider, url, headers, payload)
        if body.get("stop_reason") == "refusal":
            raise RuntimeError("The model refused this request. Try another model or revise the input.")
        parts = body.get("content") or []
        text = "".join(p.get("text", "") for p in parts if p.get("type") == "text")
        return extract_json_text(text)

    raise RuntimeError(f"Unsupported provider: {provider}")


def clean_text(value):
    return "" if value is None else str(value).strip()


def strip_pinyin_neutral_tone(value):
    """Remove a neutral-tone zero after a Pinyin letter or ü written as u:."""
    return re.sub(r"(?:(?<=[^\W\d_])|(?<=:))0", "", value)


def normalize_result(
    result, original_tokens, input_format, transcription_system="Pinyin"
):
    if not isinstance(result, dict):
        raise RuntimeError("Model result is not an object.")
    ai_tokens = result.get("tokens")
    if not isinstance(ai_tokens, list):
        raise RuntimeError("Model result has no token list.")
    if len(ai_tokens) != len(original_tokens):
        raise RuntimeError(
            f"Alignment check failed: input has {len(original_tokens)} tokens but the model returned {len(ai_tokens)}."
        )

    out = []
    for i, original in enumerate(original_tokens):
        if not isinstance(ai_tokens[i], dict):
            raise RuntimeError(f"Model token {i + 1} is not an object.")
        item = ai_tokens[i]
        transcription = clean_text(item.get("transcription"))
        pinyin_diacritic = clean_text(item.get("pinyin_diacritic"))
        gloss = clean_text(item.get("gloss"))
        if input_format != "hanzi":
            transcription = original
            pinyin_diacritic = original
        else:
            pinyin_diacritic = strip_pinyin_neutral_tone(pinyin_diacritic)
            if transcription_system.casefold() == "pinyin":
                transcription = strip_pinyin_neutral_tone(transcription)
        out.append({
            "form": original,
            "transcription": transcription,
            "pinyin_diacritic": pinyin_diacritic,
            "gloss": gloss,
        })

    return {
        "tokens": out,
        "free_translation": clean_text(result.get("free_translation")),
        "note": clean_text(result.get("note")),
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("[gloss-tool] " + (fmt % args) + "\n")

    def send_json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        api_path = self.path.split("?", 1)[0].rstrip("/")
        if api_path not in {"/api/validate", "/api/gloss"}:
            return self.send_json(404, {"ok": False, "error": "Not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode("utf-8")
            data = json.loads(raw or "{}")
            provider = data.get("provider", "deepseek")
            api_key = data.get("api_key", "")
            model = data.get("model", "")

            if api_path == "/api/validate":
                result = validate_key(provider, api_key, model)
                return self.send_json(200, result)

            sentence = data.get("sentence", "").strip()
            if not sentence:
                raise RuntimeError("Input sentence is empty.")
            if not api_key:
                raise RuntimeError("API key is empty.")
            system_prompt, user_prompt, original_tokens = build_prompt(data)
            result = call_model(provider, api_key, model, system_prompt, user_prompt)
            normalized = normalize_result(
                result,
                original_tokens,
                data.get("input_format", "hanzi"),
                data.get("other_transcription_system", data.get("transcription_system", "Pinyin")),
            )
            return self.send_json(200, {"ok": True, "result": normalized})
        except Exception as e:
            return self.send_json(400, {"ok": False, "error": redact_sensitive_text(e)})


if __name__ == "__main__":
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}/"
    print(f"Merlin's Leipzig Gloss Tool 1.0 running at {url}")
    print("Press Ctrl+C to stop.")
    if os.environ.get("GLOSS_TOOL_NO_BROWSER") != "1":
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
