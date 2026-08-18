import base64
import json
import os
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
TEST_MASTER_KEY = base64.b64encode(bytes(range(32))).decode("ascii")


def call_php(expression, env=None):
    command = (
        "define('CLG_API_LIBRARY_ONLY', true); "
        f"require {json.dumps(str(ROOT / 'api.php'))}; "
        f"{expression}"
    )
    completed = subprocess.run(
        ["php", "-r", command],
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "CLG_CREDENTIAL_MASTER_KEY": TEST_MASTER_KEY, **(env or {})},
    )
    if completed.returncode != 0:
        raise AssertionError(completed.stdout + completed.stderr)
    return completed.stdout


@unittest.skipUnless(subprocess.run(["sh", "-c", "command -v php"], capture_output=True).returncode == 0, "PHP CLI is not installed")
class CredentialEnvelopeTests(unittest.TestCase):
    def test_encrypted_vault_round_trips_without_containing_plaintext(self):
        output = call_php(
            "$payload = ['version' => 1, 'expires_at' => time() + 3600, "
            "'keys' => ['openai' => 'test-secret-value']]; "
            "$token = encrypt_credential_vault($payload); "
            "echo json_encode(['token' => $token, 'decoded' => decrypt_credential_vault($token)]);"
        )
        result = json.loads(output)

        self.assertNotIn("test-secret-value", result["token"])
        self.assertEqual(result["decoded"]["keys"]["openai"], "test-secret-value")

    def test_tampered_vault_is_rejected(self):
        output = call_php(
            "$payload = ['version' => 1, 'expires_at' => time() + 3600, "
            "'keys' => ['deepseek' => 'test-secret-value']]; "
            "$token = encrypt_credential_vault($payload); "
            "$token[strlen($token) - 1] = $token[strlen($token) - 1] === 'A' ? 'B' : 'A'; "
            "echo decrypt_credential_vault($token) === null ? 'rejected' : 'accepted';"
        )

        self.assertEqual(output, "rejected")

    def test_multilingual_schema_adds_chinese_fields_without_changing_legacy_schema(self):
        output = call_php(
            "echo json_encode(['legacy' => result_schema(), 'extended' => result_schema(true)]);"
        )
        schemas = json.loads(output)

        legacy_token = schemas["legacy"]["properties"]["tokens"]["items"]["properties"]
        extended_token = schemas["extended"]["properties"]["tokens"]["items"]["properties"]
        self.assertNotIn("chinese_gloss", legacy_token)
        self.assertIn("chinese_gloss", extended_token)
        self.assertIn("chinese_free_translation", schemas["extended"]["properties"])

    def test_persistent_cookie_is_http_only_secure_strict_and_api_scoped(self):
        output = call_php(
            "$options = credential_cookie_options(time() + 3600, true); echo json_encode($options);"
        )
        options = json.loads(output)

        self.assertTrue(options["secure"])
        self.assertTrue(options["httponly"])
        self.assertEqual(options["samesite"], "Strict")
        self.assertEqual(options["path"], "/clg/api/")
        self.assertGreater(options["expires"], 0)

    def test_explicit_local_preview_mode_uses_one_loopback_cookie_across_both_pages(self):
        output = call_php(
            "$_SERVER['HTTP_HOST'] = '127.0.0.1:8766'; $_SERVER['REMOTE_ADDR'] = '127.0.0.1'; "
            "$_SERVER['SCRIPT_NAME'] = '/api/credentials/index.php'; "
            "echo json_encode(['name' => credential_cookie_name(), "
            "'options' => credential_cookie_options(time() + 3600, true)]);",
            env={"CLG_ALLOW_INSECURE_LOCAL_COOKIE": "1"},
        )
        result = json.loads(output)

        self.assertEqual(result["name"], "clg-local-vault")
        self.assertFalse(result["options"]["secure"])
        self.assertEqual(result["options"]["path"], "/api/")
        self.assertTrue(result["options"]["httponly"])
        self.assertEqual(result["options"]["samesite"], "Strict")

    def test_local_preview_flag_cannot_weaken_a_non_loopback_host(self):
        output = call_php(
            "$_SERVER['HTTP_HOST'] = 'ailinguistics.cloud'; $_SERVER['REMOTE_ADDR'] = '203.0.113.9'; "
            "$_SERVER['SCRIPT_NAME'] = '/clg/api/credentials/index.php'; "
            "echo json_encode(['name' => credential_cookie_name(), "
            "'options' => credential_cookie_options(time() + 3600, true)]);",
            env={"CLG_ALLOW_INSECURE_LOCAL_COOKIE": "1"},
        )
        result = json.loads(output)

        self.assertEqual(result["name"], "__Secure-clg-vault")
        self.assertTrue(result["options"]["secure"])
        self.assertEqual(result["options"]["path"], "/clg/api/")

    def test_mandarin_keeps_legacy_prompt_while_multilingual_uses_extended_prompt(self):
        output = call_php(
            "$mandarin = build_request_prompt(['sentence' => '我 吃', 'language' => 'Mandarin Chinese']); "
            "$uyghur = build_request_prompt(['workspace' => 'multilingual', 'sentence' => 'مۇخبىر گېزىت', "
            "'language_profile_id' => 'uyghur', 'script_variant' => 'ug-Arab', 'include_chinese_gloss' => true]); "
            "echo json_encode(['mandarin_extended' => $mandarin[3], 'mandarin_user' => $mandarin[1], "
            "'uyghur_extended' => $uyghur[3], 'uyghur_user' => $uyghur[1], 'uyghur_tokens' => $uyghur[2]]);"
        )
        result = json.loads(output)

        self.assertFalse(result["mandarin_extended"])
        self.assertNotIn("chinese_free_translation", result["mandarin_user"])
        self.assertTrue(result["uyghur_extended"])
        self.assertIn("ULY/NUL", result["uyghur_user"])
        self.assertEqual(result["uyghur_tokens"], ["مۇخبىر", "گېزىت"])

    def test_southern_min_extended_prompt_does_not_request_mandarin_pinyin(self):
        output = call_php(
            "$built = build_request_prompt(['sentence' => '伊 食 饭', 'language' => 'Southern Min Chinese', "
            "'other_transcription_system' => 'Tâi-lô', 'extended_output' => true]); "
            "echo json_encode(['system' => $built[0], 'user' => $built[1], 'extended' => $built[3]]);"
        )
        result = json.loads(output)

        self.assertTrue(result["extended"])
        self.assertIn("Tâi-lô", result["user"])
        self.assertNotIn("Standard Mandarin Hanyu Pinyin", result["user"])

    def test_multilingual_normalization_preserves_model_transcription_and_original_form(self):
        output = call_php(
            "$result = normalize_result(['tokens' => [["
            "'form' => 'changed', 'pinyin_diacritic' => 'muxbir', 'transcription' => 'mʊxbɪr', "
            "'chinese_gloss' => '记者', 'gloss' => 'reporter']], 'free_translation' => 'A reporter.', "
            "'chinese_free_translation' => '一名记者。', 'note' => ''], ['مۇخبىر'], 'hanzi', '', true, false); "
            "echo json_encode($result);"
        )
        result = json.loads(output)

        self.assertEqual(result["tokens"][0]["form"], "مۇخبىر")
        self.assertEqual(result["tokens"][0]["pinyin_diacritic"], "muxbir")
        self.assertEqual(result["tokens"][0]["transcription"], "mʊxbɪr")


if __name__ == "__main__":
    unittest.main()
