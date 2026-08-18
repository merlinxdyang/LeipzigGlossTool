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


if __name__ == "__main__":
    unittest.main()
