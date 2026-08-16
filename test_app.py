import json
import unittest
from unittest import mock

import app


MODEL_RESULT = {
    "tokens": [
        {
            "form": "我",
            "transcription": "wo3",
            "pinyin_diacritic": "wǒ",
            "gloss": "1SG",
        },
        {
            "form": "吃",
            "transcription": "chi1",
            "pinyin_diacritic": "chī",
            "gloss": "eat",
        },
    ],
    "free_translation": "I eat.",
    "note": "",
}


class PromptAndNormalizationTests(unittest.TestCase):
    def test_build_prompt_preserves_user_tokenization(self):
        _, user_prompt, tokens = app.build_prompt({
            "sentence": "  我\t吃  ",
            "input_format": "hanzi",
        })

        self.assertEqual(tokens, ["我", "吃"])
        self.assertIn('Authoritative tokens: ["我", "吃"]', user_prompt)

    def test_pinyin_prompt_forbids_zero_on_neutral_tone(self):
        _, user_prompt, _ = app.build_prompt({
            "sentence": "什么",
            "input_format": "hanzi",
            "transcription_system": "Pinyin",
        })

        self.assertIn("Neutral-tone syllables", user_prompt)
        self.assertIn("never use 0", user_prompt)

    def test_zhuyin_prompt_requests_unicode_bopomofo_and_tone_marks(self):
        _, user_prompt, _ = app.build_prompt({
            "sentence": "我 的",
            "input_format": "hanzi",
            "pinyin_mode": "tone_marks",
            "other_transcription_system": "Zhuyin",
        })

        self.assertIn("Unicode Bopomofo", user_prompt)
        self.assertIn("first tone unmarked", user_prompt)
        self.assertIn("neutral-tone dot before the syllable", user_prompt)

    def test_mandarin_default_requests_only_tone_marked_pinyin(self):
        _, user_prompt, _ = app.build_prompt({
            "sentence": "我 的",
            "input_format": "hanzi",
            "pinyin_mode": "tone_marks",
            "other_transcription_system": "",
        })

        self.assertIn("Hanyu Pinyin with tone diacritics", user_prompt)
        self.assertIn("set transcription to an empty string", user_prompt)

    def test_pinyin_number_and_no_tone_modes_are_explicit(self):
        _, numbered_prompt, _ = app.build_prompt({
            "sentence": "什么",
            "input_format": "hanzi",
            "pinyin_mode": "tone_numbers",
            "other_transcription_system": "",
        })
        _, untoned_prompt, _ = app.build_prompt({
            "sentence": "什么",
            "input_format": "hanzi",
            "pinyin_mode": "no_tone",
            "other_transcription_system": "",
        })

        self.assertIn("tone numbers 1, 2, 3, or 4", numbered_prompt)
        self.assertIn("never use 0", numbered_prompt)
        self.assertIn("without tone marks or tone digits", untoned_prompt)

    def test_ipa_modes_use_numeric_values_or_ipa_tone_letters(self):
        _, numeric_prompt, _ = app.build_prompt({
            "sentence": "妈 麻 马 骂",
            "input_format": "hanzi",
            "other_transcription_system": "IPA numeric tones",
        })
        _, letter_prompt, _ = app.build_prompt({
            "sentence": "妈 麻 马 骂",
            "input_format": "hanzi",
            "other_transcription_system": "IPA tone letters",
        })

        self.assertIn("55, 35, 214, and 51", numeric_prompt)
        self.assertIn("˥, ˧˥, ˨˩˦, and ˥˩", letter_prompt)

    def test_non_mandarin_ipa_uses_variety_specific_tones(self):
        _, numeric_prompt, _ = app.build_prompt({
            "sentence": "佢 食 咗",
            "language": "Cantonese",
            "input_format": "hanzi",
            "other_transcription_system": "IPA numeric tones",
        })

        self.assertIn("appropriate to the requested language/variety", numeric_prompt)
        self.assertNotIn("55, 35, 214, and 51", numeric_prompt)

    def test_normalize_uses_original_forms_and_empty_strings_for_nulls(self):
        result = app.normalize_result({
            "tokens": [
                {
                    "form": "changed",
                    "transcription": None,
                    "pinyin_diacritic": None,
                    "gloss": None,
                },
            ],
            "free_translation": None,
            "note": None,
        }, ["我"], "hanzi")

        self.assertEqual(result, {
            "tokens": [{
                "form": "我",
                "transcription": "",
                "pinyin_diacritic": "",
                "gloss": "",
            }],
            "free_translation": "",
            "note": "",
        })

    def test_normalize_rejects_misaligned_token_count(self):
        with self.assertRaisesRegex(RuntimeError, "input has 2 tokens"):
            app.normalize_result({"tokens": []}, ["我", "吃"], "hanzi")

    def test_romanized_input_reuses_form_for_both_transcription_layers(self):
        result = app.normalize_result({
            "tokens": [{
                "form": "changed",
                "transcription": "changed",
                "pinyin_diacritic": "changed",
                "gloss": "1SG",
            }],
            "free_translation": "I.",
            "note": "",
        }, ["ngo5"], "romanized")

        self.assertEqual(result["tokens"][0]["transcription"], "ngo5")
        self.assertEqual(result["tokens"][0]["pinyin_diacritic"], "ngo5")

    def test_pinyin_neutral_tone_zero_is_removed_during_normalization(self):
        result = app.normalize_result({
            "tokens": [{
                "form": "什么",
                "transcription": "shen2me0",
                "pinyin_diacritic": "shénme0",
                "gloss": "what",
            }],
            "free_translation": "What?",
            "note": "",
        }, ["什么"], "hanzi", "Pinyin")

        self.assertEqual(result["tokens"][0]["transcription"], "shen2me")
        self.assertEqual(result["tokens"][0]["pinyin_diacritic"], "shénme")

    def test_neutral_tone_cleanup_does_not_change_other_transcription_systems(self):
        result = app.normalize_result({
            "tokens": [{
                "form": "例",
                "transcription": "ling0",
                "pinyin_diacritic": "lì",
                "gloss": "example",
            }],
            "free_translation": "Example.",
            "note": "",
        }, ["例"], "hanzi", "Jyutping")

        self.assertEqual(result["tokens"][0]["transcription"], "ling0")

    def test_provider_error_redacts_echoed_api_key_fragment(self):
        error = "Authentication Fails, Your api key: ****Tool is invalid"

        redacted = app.redact_sensitive_text(error)

        self.assertEqual(
            redacted,
            "Authentication Fails, Your api key: [redacted] is invalid",
        )

    def test_provider_error_redacts_full_api_key(self):
        error = "Incorrect API key provided: key-example-secret-value"

        redacted = app.redact_sensitive_text(error)

        self.assertNotIn("key-example-secret-value", redacted)


class ProviderRequestTests(unittest.TestCase):
    @staticmethod
    def completion_body():
        return {"choices": [{"message": {"content": json.dumps(MODEL_RESULT)}}]}

    @mock.patch("app.http_json")
    def test_deepseek_uses_json_output(self, http_json):
        http_json.return_value = (200, self.completion_body())

        app.call_model("deepseek", "test-key", "deepseek-v4-flash", "system", "user")

        payload = http_json.call_args.kwargs["payload"]
        self.assertEqual(payload["response_format"], {"type": "json_object"})
        self.assertEqual(payload["thinking"], {"type": "disabled"})

    @mock.patch("app.http_json")
    def test_openai_uses_strict_json_schema(self, http_json):
        http_json.return_value = (200, self.completion_body())

        app.call_model("openai", "test-key", "gpt-5", "system", "user")

        response_format = http_json.call_args.kwargs["payload"]["response_format"]
        self.assertEqual(response_format["type"], "json_schema")
        self.assertTrue(response_format["json_schema"]["strict"])
        self.assertEqual(response_format["json_schema"]["schema"]["required"], [
            "tokens", "free_translation", "note",
        ])
        token_schema = response_format["json_schema"]["schema"]["properties"]["tokens"]["items"]
        self.assertIn("pinyin_diacritic", token_schema["required"])

    @mock.patch("app.http_json")
    def test_claude_uses_structured_output(self, http_json):
        http_json.return_value = (200, {
            "content": [{"type": "text", "text": json.dumps(MODEL_RESULT)}],
        })

        app.call_model("claude", "test-key", "claude-sonnet-5", "system", "user")

        output_format = http_json.call_args.kwargs["payload"]["output_config"]["format"]
        self.assertEqual(output_format["type"], "json_schema")
        self.assertEqual(output_format["schema"]["type"], "object")

    @mock.patch("app.http_json")
    def test_openrouter_retries_without_schema_when_model_rejects_it(self, http_json):
        http_json.side_effect = [
            RuntimeError("HTTP 400: response_format json_schema is not supported"),
            (200, self.completion_body()),
        ]

        result = app.call_model("openrouter", "test-key", "some/model", "system", "user")

        self.assertEqual(result["free_translation"], "I eat.")
        self.assertEqual(http_json.call_count, 2)
        self.assertNotIn("response_format", http_json.call_args.kwargs["payload"])

    @mock.patch("app.http_json")
    def test_openai_retries_with_legacy_token_parameter(self, http_json):
        http_json.side_effect = [
            RuntimeError("HTTP 400: max_completion_tokens is not supported"),
            (200, self.completion_body()),
        ]

        app.call_model("openai", "test-key", "older-model", "system", "user")

        payload = http_json.call_args.kwargs["payload"]
        self.assertNotIn("max_completion_tokens", payload)
        self.assertEqual(payload["max_tokens"], 1800)

    @mock.patch("app.http_json")
    def test_authentication_errors_are_not_retried(self, http_json):
        http_json.side_effect = RuntimeError("HTTP 401: invalid API key")

        with self.assertRaisesRegex(RuntimeError, "invalid API key"):
            app.call_model("openrouter", "bad-key", "some/model", "system", "user")

        self.assertEqual(http_json.call_count, 1)


class GenerationPipelineTests(unittest.TestCase):
    @mock.patch("app.call_model", return_value=MODEL_RESULT)
    def test_generation_pipeline_returns_normalized_result(self, call_model):
        data = {
            "provider": "deepseek",
            "api_key": "test-key",
            "model": "test-model",
            "sentence": "我 吃",
            "input_format": "hanzi",
        }
        system_prompt, user_prompt, original_tokens = app.build_prompt(data)

        model_result = call_model(
            data["provider"], data["api_key"], data["model"], system_prompt, user_prompt
        )
        result = app.normalize_result(model_result, original_tokens, data["input_format"])

        self.assertEqual([item["form"] for item in result["tokens"]], ["我", "吃"])


if __name__ == "__main__":
    unittest.main()
