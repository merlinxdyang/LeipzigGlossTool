import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent


class SubdirectoryDeploymentTests(unittest.TestCase):
    def test_both_workspaces_embed_the_shared_ai_service_panel_at_top_left(self):
        sinitic = (ROOT / "index.html").read_text(encoding="utf-8")
        multilingual = (ROOT / "multilingual.html").read_text(encoding="utf-8")

        self.assertIn('data-workspace="multilingual"', multilingual)
        self.assertIn('id="languagePreset"', multilingual)
        for html in (sinitic, multilingual):
            self.assertIn('class="embedded-ai-service"', html)
            self.assertIn('id="credentialForm"', html)
            self.assertIn('id="providerStatus"', html)
            self.assertIn('ai-service.js', html)
            self.assertIn('ai-services-ui.js', html)
            self.assertNotIn('href="ai-services.html"', html)

    def test_generation_refreshes_shared_provider_and_credential_state(self):
        source = (ROOT / "app-ui.js").read_text(encoding="utf-8")
        analyze = source[source.index("async function analyze() {"):source.index("function esc(value)")]

        self.assertIn("state.aiSettings = loadAISettings(state.lang)", analyze)
        self.assertIn("await refreshCredentialStatus()", analyze)

    def test_v2_exposes_chinese_aligned_and_free_translation_controls(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        source = (ROOT / "app-ui.js").read_text(encoding="utf-8")

        self.assertIn('value="Chinese aligned gloss"', html)
        self.assertIn('id="showChineseGloss"', html)
        self.assertIn('id="showChineseTranslation"', html)
        self.assertIn('chinese_free_translation', source)

    def test_custom_multilingual_profile_has_named_input_and_requested_default_layers(self):
        html = (ROOT / "multilingual.html").read_text(encoding="utf-8")
        source = (ROOT / "app-ui.js").read_text(encoding="utf-8")

        self.assertIn('id="customLanguage"', html)
        self.assertIn('data-i18n="customVariety"', html)
        self.assertIn("profile.id === 'custom'", source)
        self.assertIn("$('#nonMandarinAnnotation').value = profile.default_secondary_annotation", source)
        self.assertIn("$('#showChineseGloss').checked = profile.default_output.chinese_gloss", source)
        self.assertIn("language_name: getLanguage()", source)
        self.assertIn("const customOrder = workspaceType === 'multilingual' && selectedLanguageProfile()?.id === 'custom'", source)

    def test_security_headers_and_credential_route_are_declared(self):
        rules = (ROOT / ".htaccess").read_text(encoding="utf-8")
        entrypoint = ROOT / "api" / "credentials" / "index.php"

        self.assertIn("Content-Security-Policy", rules)
        self.assertIn("Strict-Transport-Security", rules)
        self.assertIn("Referrer-Policy", rules)
        self.assertIn("credentials", rules)
        self.assertTrue(entrypoint.is_file())
        self.assertIn("'credentials'", entrypoint.read_text(encoding="utf-8"))

    def test_sensitive_endpoints_enforce_same_origin_headers_and_rate_limits(self):
        source = (ROOT / "api.php").read_text(encoding="utf-8")

        self.assertIn("function require_v2_same_origin_request", source)
        self.assertIn("HTTP_X_CLG_REQUEST", source)
        self.assertIn("function enforce_rate_limit", source)
        self.assertIn("enforce_rate_limit('credentials'", source)
        self.assertIn("enforce_rate_limit($action, $action === 'gloss' ? 120 : 30", source)

    def test_numeric_start_field_enforces_a_positive_integer(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        source = (ROOT / "app-ui.js").read_text(encoding="utf-8")

        self.assertIn('id="startNumber" type="number" min="1" step="1" value="1"', html)
        self.assertIn("$('#startNumber').addEventListener('blur'", source)
        self.assertIn("$('#startNumber').value = normalizeStartNumber($('#startNumber').value);", source)

    def test_product_name_is_consistent_across_the_interface_and_runtime(self):
        expected_name = "Merlin's Leipzig Gloss Tool"
        for filename in ("index.html", "README.md", "使用说明.md", "app.py", "api.php"):
            content = (ROOT / filename).read_text(encoding="utf-8")
            self.assertIn(expected_name, content, filename)
            self.assertNotIn("Chinese Leipzig Gloss Tool", content, filename)

        html = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("<title>Merlin's Leipzig Gloss Tool 2.0</title>", html)
        self.assertIn('<div class="brand-copy">Merlin\'s Leipzig Gloss Tool</div>', html)

    def test_three_way_interface_language_switch_is_present(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")

        self.assertIn('id="btnLangEn"', html)
        self.assertIn('id="btnLangZh"', html)
        self.assertIn('id="btnLangZhHant"', html)
        self.assertIn('data-lang="en">EN</button>', html)
        self.assertIn('data-lang="zh">简</button>', html)
        self.assertIn('data-lang="zh-Hant">正</button>', html)
        self.assertNotIn('id="btnLang"', html)

    def test_traditional_chinese_interface_content_and_system_font_stack_are_defined(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        source = (ROOT / "app-ui.js").read_text(encoding="utf-8")

        self.assertIn("I18N['zh-Hant']", source)
        self.assertIn("專案設定", source)
        self.assertIn("匯入 TXT", source)
        self.assertIn("已產生 {count} 個例句", source)
        self.assertIn("粵語 / Cantonese", source)
        self.assertIn("國語 / Mandarin", source)
        traditional = source[source.index("I18N['zh-Hant']"):]
        self.assertNotIn("普通話 / Mandarin", traditional)
        self.assertIn("服務提供者", source)
        self.assertIn("清除", source)
        self.assertIn("還原預設值", source)
        self.assertIn("英文自由翻譯", source)
        self.assertIn('data-i18n-opt="mandarin"', html)
        self.assertIn('data-i18n-opt="zhuyin"', html)
        self.assertIn('class="dialog-body api-help-zh-hant hidden"', html)
        self.assertIn('class="dialog-body help-zh-hant hidden"', html)
        self.assertIn('html[lang="zh-Hant"]', html)
        for font in ("-apple-system", "BlinkMacSystemFont", "PingFang TC", "Microsoft JhengHei", "Noto Sans TC"):
            self.assertIn(font, html)

    def test_language_switch_updates_all_three_content_layers(self):
        source = (ROOT / "app-ui.js").read_text(encoding="utf-8")

        self.assertIn("'zh-Hant': 'zh-Hant'", source)
        self.assertIn("['.help-zh-hant', 'zh-Hant']", source)
        self.assertIn("['.api-help-zh-hant', 'zh-Hant']", source)
        self.assertIn("element.classList.toggle('hidden'", source)
        self.assertIn("document.querySelectorAll('[data-lang]')", source)

    def test_workspaces_use_the_shared_ai_service_settings_module(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        source = (ROOT / "app-ui.js").read_text(encoding="utf-8")

        self.assertIn('src="ai-service.js', html)
        self.assertIn("loadAISettings", source)
        self.assertIn("saveAISettings", source)

    def test_alphabetic_numbering_controls_are_available_in_all_interfaces(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        source = (ROOT / "app-ui.js").read_text(encoding="utf-8")

        self.assertIn('<option value="alphabetic" data-i18n-opt="alphabeticNumber">', html)
        self.assertIn('<option value="alphabetic-dot" data-i18n-opt="alphabeticDotNumber">', html)
        self.assertIn('id="startLetterWrap"', html)
        self.assertIn('id="startLetter"', html)
        self.assertIn("alphabeticNumber: '字母：(a)'", source)
        self.assertIn("alphabeticDotNumber: '字母：a.'", source)
        self.assertIn("alphabeticNumber: 'Alphabetic: (a)'", source)
        self.assertIn("alphabeticDotNumber: 'Alphabetic: a.'", source)
        self.assertIn("alphabeticNumber: '字母：(a)'", source)
        self.assertIn("alphabeticDotNumber: '字母：a.'", source)
        self.assertIn("normalizeStartLetter", source)

    def test_rich_copy_number_cell_is_top_aligned_for_word(self):
        source = (ROOT / "app-ui.js").read_text(encoding="utf-8")

        self.assertIn(
            '<td class="num" rowspan="${rows.length}" valign="top" style="vertical-align:top">',
            source,
        )
        self.assertIn("td.num{vertical-align:top!important}", source)

    def test_mandarin_pinyin_and_optional_annotation_controls_are_present(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        source = (ROOT / "app-ui.js").read_text(encoding="utf-8")

        self.assertIn('id="mandarinTranscriptionSettings"', html)
        self.assertIn('data-i18n="pinyinSettings">拼音设置', html)
        self.assertIn('name="pinyinMode" value="tone_marks" checked', html)
        self.assertIn('name="pinyinMode" value="tone_numbers"', html)
        self.assertIn('name="pinyinMode" value="no_tone"', html)
        self.assertIn('id="otherTranscriptionSystem"', html)
        self.assertIn('<option value=""></option>', html)
        self.assertIn('value="IPA numeric tones"', html)
        self.assertIn('value="IPA tone letters"', html)
        self.assertIn('data-i18n-opt="jyutping">粤拼 / Jyutping</option>', html)
        self.assertIn("pinyin_mode: selectedPinyinMode()", source)
        self.assertIn("other_transcription_system: selectedOtherTranscriptionSystem()", source)

    def test_default_output_keeps_only_form_pinyin_gloss_and_translation(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")

        self.assertIn('id="showForm" checked', html)
        self.assertIn('id="showPinyin" checked', html)
        self.assertIn('id="showTranscription"><span data-i18n="otherTranscriptionOutput"', html)
        self.assertIn('id="showGloss" checked', html)
        self.assertIn('id="showTranslation" checked', html)

    def test_returning_from_southern_min_restores_legacy_mandarin_and_cantonese_lines(self):
        source = (ROOT / "app-ui.js").read_text(encoding="utf-8")

        mandarin_branch = source[source.index("if (isMandarin) {"):source.index("} else if (value === 'Cantonese')")]
        cantonese_branch = source[source.index("} else if (value === 'Cantonese')"):source.index("} else if (value === 'Southern Min Chinese')")]
        self.assertIn("$('#showPinyin').checked = true", mandarin_branch)
        self.assertIn("$('#showPinyin').checked = true", cantonese_branch)
        self.assertIn("$('#showTranscription').checked = true", cantonese_branch)

    def test_word_copy_uses_a_dedicated_small_caps_formatter(self):
        source = (ROOT / "app-ui.js").read_text(encoding="utf-8")

        self.assertIn("formatGlossHtmlForWord", source)
        self.assertIn("publicationHTML(false, formatGlossHtmlForWord)", source)

    def test_api_key_application_dialog_contains_official_links_and_required_notices(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")

        self.assertIn('id="btnApiHelp"', html)
        self.assertIn('id="apiKeyDialog"', html)
        self.assertIn("https://platform.deepseek.com/api_keys", html)
        self.assertIn("https://platform.openai.com/api-keys", html)
        self.assertIn("https://platform.claude.com/settings/keys", html)
        self.assertIn("https://openrouter.ai/settings/keys", html)
        self.assertIn("申请后充值可用。", html)
        self.assertIn("中国境内只能使用 DeepSeek。", html)

    def test_api_key_application_content_is_repeated_in_the_guide(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        guide_start = html.index('<dialog id="helpDialog"')
        guide_html = html[guide_start:]

        self.assertIn("API key 申请", guide_html)
        self.assertIn("申请后充值可用。", guide_html)
        self.assertIn("中国境内只能使用 DeepSeek。", guide_html)
        self.assertIn("https://platform.deepseek.com/api_keys", guide_html)

    def test_api_key_application_dialog_is_wired_for_open_close_and_language_switching(self):
        source = (ROOT / "app-ui.js").read_text(encoding="utf-8")

        self.assertIn("if ($('#btnApiHelp')) $('#btnApiHelp').addEventListener('click'", source)
        self.assertIn("if ($('#btnCloseApiHelp')) $('#btnCloseApiHelp').addEventListener('click'", source)
        self.assertIn("['.api-help-zh', 'zh']", source)
        self.assertIn("['.api-help-en', 'en']", source)

    def test_frontend_uses_subdirectory_relative_api_paths(self):
        source = (ROOT / "app-ui.js").read_text(encoding="utf-8")

        self.assertIn("postJSON('api/gloss/'", source)
        self.assertIn("fetch('api/credentials/'", source)
        self.assertNotIn("postJSON('/api/", source)

    def test_php_api_has_physical_subdirectory_entrypoints(self):
        for action in ("validate", "gloss"):
            entrypoint = ROOT / "api" / action / "index.php"
            self.assertTrue(entrypoint.is_file())
            self.assertIn(f"$_GET['action'] = '{action}';", entrypoint.read_text(encoding="utf-8"))

    def test_litespeed_rewrite_maps_api_routes_to_php(self):
        rules = (ROOT / ".htaccess").read_text(encoding="utf-8")

        self.assertIn("RewriteRule ^api/(validate|gloss)/?$ api.php?action=$1 [L,QSA]", rules)
        self.assertIn("RewriteRule ^api/(credentials)/?$ api.php?action=$1 [L,QSA]", rules)

    @unittest.skipUnless(shutil.which("php"), "PHP CLI is not installed")
    def test_php_backend_has_valid_syntax(self):
        completed = subprocess.run(
            ["php", "-l", str(ROOT / "api.php")],
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)


if __name__ == "__main__":
    unittest.main()
