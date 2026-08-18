<?php
declare(strict_types=1);

ini_set('display_errors', '0');

const CLG_MAX_REQUEST_BYTES = 1048576;
const CLG_CREDENTIAL_COOKIE = '__Secure-clg-vault';
const CLG_CREDENTIAL_AAD = 'ailinguistics.cloud/clg/credential-v1';
const CLG_CREDENTIAL_TTL = 7776000;
const CLG_MAX_API_KEY_BYTES = 512;
const CLG_SUPPORTED_PROVIDERS = ['deepseek', 'openai', 'claude', 'openrouter'];

final class RateLimitException extends RuntimeException {}

function enforce_rate_limit(string $bucket, int $limit, int $windowSeconds): void
{
    $address = (string)($_SERVER['REMOTE_ADDR'] ?? 'cli');
    $directory = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'clg-rate-limit';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Rate limiter is unavailable.');
    }
    $path = $directory . DIRECTORY_SEPARATOR . hash('sha256', $bucket . "\0" . $address) . '.json';
    $handle = fopen($path, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) fclose($handle);
        throw new RuntimeException('Rate limiter is unavailable.');
    }
    try {
        $raw = stream_get_contents($handle);
        $state = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        $now = time();
        if (!is_array($state) || (int)($state['reset_at'] ?? 0) <= $now) {
            $state = ['count' => 0, 'reset_at' => $now + $windowSeconds];
        }
        if ((int)$state['count'] >= $limit) {
            throw new RateLimitException('Too many requests. Try again later.');
        }
        $state['count'] = (int)$state['count'] + 1;
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, json_encode($state));
        fflush($handle);
        chmod($path, 0600);
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function base64url_encode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function base64url_decode(string $value): ?string
{
    if ($value === '' || preg_match('/^[A-Za-z0-9_-]+$/', $value) !== 1) {
        return null;
    }
    $decoded = base64_decode(strtr($value, '-_', '+/') . str_repeat('=', (4 - strlen($value) % 4) % 4), true);
    if ($decoded === false || !hash_equals(base64url_encode($decoded), $value)) {
        return null;
    }
    return $decoded;
}

function credential_master_key(): string
{
    $configured = trim((string)(getenv('CLG_CREDENTIAL_MASTER_KEY') ?: ''));
    if ($configured === '') {
        throw new RuntimeException('Persistent credential storage is not configured.');
    }
    $decoded = base64_decode($configured, true);
    if ($decoded !== false && strlen($decoded) === 32) {
        return $decoded;
    }
    if (preg_match('/^[0-9a-fA-F]{64}$/', $configured) === 1) {
        $decoded = hex2bin($configured);
        if ($decoded !== false) {
            return $decoded;
        }
    }
    throw new RuntimeException('Persistent credential storage is misconfigured.');
}

function encrypt_credential_vault(array $payload): string
{
    $plaintext = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($plaintext === false) {
        throw new RuntimeException('Unable to encode credential storage.');
    }
    $iv = random_bytes(12);
    $tag = '';
    $ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', credential_master_key(), OPENSSL_RAW_DATA, $iv, $tag, CLG_CREDENTIAL_AAD, 16);
    if ($ciphertext === false || strlen($tag) !== 16) {
        throw new RuntimeException('Unable to encrypt credential storage.');
    }
    return base64url_encode(chr(1) . $iv . $tag . $ciphertext);
}

function decrypt_credential_vault(string $token): ?array
{
    try {
        $packed = base64url_decode($token);
        if ($packed === null || strlen($packed) < 30 || ord($packed[0]) !== 1) {
            return null;
        }
        $iv = substr($packed, 1, 12);
        $tag = substr($packed, 13, 16);
        $ciphertext = substr($packed, 29);
        $plaintext = openssl_decrypt($ciphertext, 'aes-256-gcm', credential_master_key(), OPENSSL_RAW_DATA, $iv, $tag, CLG_CREDENTIAL_AAD);
        if ($plaintext === false) {
            return null;
        }
        $payload = json_decode($plaintext, true);
        if (!is_array($payload) || ($payload['version'] ?? null) !== 1) {
            return null;
        }
        if ((int)($payload['expires_at'] ?? 0) <= time() || !is_array($payload['keys'] ?? null)) {
            return null;
        }
        $keys = [];
        foreach ($payload['keys'] as $provider => $key) {
            if (in_array($provider, CLG_SUPPORTED_PROVIDERS, true) && is_string($key) && $key !== '' && strlen($key) <= CLG_MAX_API_KEY_BYTES) {
                $keys[$provider] = $key;
            }
        }
        $payload['keys'] = $keys;
        return $payload;
    } catch (Throwable $error) {
        return null;
    }
}

function local_cookie_preview_enabled(): bool
{
    if ((string)(getenv('CLG_ALLOW_INSECURE_LOCAL_COOKIE') ?: '') !== '1') {
        return false;
    }
    $hostHeader = strtolower(trim((string)($_SERVER['HTTP_HOST'] ?? '')));
    if (substr($hostHeader, 0, 1) === '[') {
        $end = strpos($hostHeader, ']');
        $host = $end === false ? $hostHeader : substr($hostHeader, 1, $end - 1);
    } else {
        $host = explode(':', $hostHeader, 2)[0];
    }
    $remote = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    return in_array($host, ['127.0.0.1', 'localhost', '::1'], true)
        && in_array($remote, ['127.0.0.1', '::1'], true);
}

function credential_cookie_name(): string
{
    return local_cookie_preview_enabled() ? 'clg-local-vault' : CLG_CREDENTIAL_COOKIE;
}

function credential_cookie_path(): string
{
    if (local_cookie_preview_enabled()) {
        return '/api/';
    }
    $script = (string)($_SERVER['SCRIPT_NAME'] ?? '/clg/api/credentials/index.php');
    $marker = strpos($script, '/api/');
    return $marker === false ? '/clg/api/' : substr($script, 0, $marker + 5);
}

function credential_vault_from_request(): ?array
{
    $token = (string)($_COOKIE[credential_cookie_name()] ?? '');
    return $token === '' ? null : decrypt_credential_vault($token);
}

function credential_cookie_options(int $expiresAt, bool $remember): array
{
    return [
        'expires' => $remember ? $expiresAt : 0,
        'path' => credential_cookie_path(),
        'secure' => !local_cookie_preview_enabled(),
        'httponly' => true,
        'samesite' => 'Strict',
    ];
}

function set_credential_vault_cookie(array $payload, bool $remember): void
{
    setcookie(credential_cookie_name(), encrypt_credential_vault($payload), credential_cookie_options((int)$payload['expires_at'], $remember));
}

function clear_credential_vault_cookie(): void
{
    setcookie(credential_cookie_name(), '', credential_cookie_options(time() - 3600, true));
}

function send_json(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function redact_sensitive_text(string $value): string
{
    $value = preg_replace(
        '/((?:your\s+)?api[_ -]?key(?:\s+provided)?\s*:\s*)\S+/i',
        '$1[redacted]',
        $value
    ) ?? $value;
    return preg_replace('/\b(?:sk|key)-[A-Za-z0-9_.-]{8,}\b/i', '[redacted]', $value) ?? $value;
}

function clean_error_body(string $value): string
{
    $value = trim(preg_replace('/\s+/', ' ', strip_tags($value)) ?? '');
    return strlen($value) > 500 ? substr($value, 0, 500) . '…' : $value;
}

function extract_api_error($body): string
{
    if (!is_array($body)) {
        return '';
    }
    $error = $body['error'] ?? null;
    if (is_string($error)) {
        return $error;
    }
    if (is_array($error)) {
        return (string)($error['message'] ?? $error['detail'] ?? '');
    }
    return (string)($body['message'] ?? $body['detail'] ?? '');
}

function http_json(
    string $url,
    string $method = 'GET',
    array $headers = [],
    ?array $payload = null,
    int $timeout = 30
): array {
    if (!function_exists('curl_init')) {
        throw new RuntimeException('The PHP cURL extension is not enabled on this server.');
    }

    $curl = curl_init($url);
    if ($curl === false) {
        throw new RuntimeException('Unable to initialize the provider request.');
    }

    $requestHeaders = $headers;
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $requestHeaders,
        CURLOPT_USERAGENT => 'Merlins-Leipzig-Gloss-Tool/2.0',
    ];
    if ($payload !== null) {
        $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($encoded === false) {
            throw new RuntimeException('Unable to encode the provider request.');
        }
        $requestHeaders[] = 'Content-Type: application/json';
        $options[CURLOPT_HTTPHEADER] = $requestHeaders;
        $options[CURLOPT_POSTFIELDS] = $encoded;
    }

    curl_setopt_array($curl, $options);
    $raw = curl_exec($curl);
    if ($raw === false) {
        $message = curl_error($curl);
        throw new RuntimeException('Network error: ' . redact_sensitive_text($message));
    }
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);

    $body = $raw === '' ? [] : json_decode($raw, true);
    $jsonValid = $raw === '' || json_last_error() === JSON_ERROR_NONE;
    if ($status < 200 || $status >= 300) {
        $message = extract_api_error($body);
        if ($message === '') {
            $message = clean_error_body($raw);
        }
        throw new RuntimeException("HTTP {$status}: " . redact_sensitive_text($message ?: 'Provider request failed.'));
    }
    if (!$jsonValid || !is_array($body)) {
        throw new RuntimeException("Provider returned invalid JSON (HTTP {$status}).");
    }
    return [$status, $body];
}

function validate_key(string $provider, string $apiKey, string $model): array
{
    if ($apiKey === '') {
        throw new RuntimeException('API key is empty.');
    }
    $provider = strtolower($provider);

    if ($provider === 'deepseek') {
        [, $body] = http_json(
            'https://api.deepseek.com/models',
            'GET',
            ['Authorization: Bearer ' . $apiKey]
        );
        $models = array_values(array_filter(array_map(
            static fn($item) => is_array($item) ? ($item['id'] ?? null) : null,
            $body['data'] ?? []
        )));
        return ['ok' => true, 'models' => $models, 'model_available' => $model === '' ? null : in_array($model, $models, true)];
    }

    if ($provider === 'openai') {
        [, $body] = http_json(
            'https://api.openai.com/v1/models',
            'GET',
            ['Authorization: Bearer ' . $apiKey]
        );
        $models = array_values(array_filter(array_map(
            static fn($item) => is_array($item) ? ($item['id'] ?? null) : null,
            $body['data'] ?? []
        )));
        return ['ok' => true, 'models' => array_slice($models, 0, 250), 'model_available' => $model === '' ? null : in_array($model, $models, true)];
    }

    if ($provider === 'claude') {
        [, $body] = http_json(
            'https://api.anthropic.com/v1/models?limit=100',
            'GET',
            ['x-api-key: ' . $apiKey, 'anthropic-version: 2023-06-01']
        );
        $models = array_values(array_filter(array_map(
            static fn($item) => is_array($item) ? ($item['id'] ?? null) : null,
            $body['data'] ?? []
        )));
        return ['ok' => true, 'models' => $models, 'model_available' => $model === '' ? null : in_array($model, $models, true)];
    }

    if ($provider === 'openrouter') {
        [, $body] = http_json(
            'https://openrouter.ai/api/v1/key',
            'GET',
            ['Authorization: Bearer ' . $apiKey]
        );
        return ['ok' => true, 'models' => [], 'model_available' => null, 'key_info' => $body['data'] ?? $body];
    }

    throw new RuntimeException('Unsupported provider: ' . $provider);
}

function result_schema(bool $extended = false): array
{
    $tokenProperties = [
        'form' => ['type' => 'string'],
        'transcription' => ['type' => 'string'],
        'pinyin_diacritic' => ['type' => 'string'],
        'gloss' => ['type' => 'string'],
    ];
    $tokenRequired = ['form', 'transcription', 'pinyin_diacritic', 'gloss'];
    $rootProperties = [
        'tokens' => [
            'type' => 'array',
            'items' => [
                'type' => 'object',
                'properties' => &$tokenProperties,
                'required' => &$tokenRequired,
                'additionalProperties' => false,
            ],
        ],
        'free_translation' => ['type' => 'string'],
        'note' => ['type' => 'string'],
    ];
    $rootRequired = ['tokens', 'free_translation', 'note'];
    if ($extended) {
        $tokenProperties['chinese_gloss'] = ['type' => 'string'];
        $tokenRequired[] = 'chinese_gloss';
        $rootProperties['chinese_free_translation'] = ['type' => 'string'];
        $rootRequired[] = 'chinese_free_translation';
    }
    return [
        'type' => 'object',
        'properties' => $rootProperties,
        'required' => $rootRequired,
        'additionalProperties' => false,
    ];
}

function structured_response_format(bool $extended = false): array
{
    return [
        'type' => 'json_schema',
        'json_schema' => [
            'name' => 'interlinear_gloss',
            'strict' => true,
            'schema' => result_schema($extended),
        ],
    ];
}

function build_prompt(array $data): array
{
    $sentence = trim((string)($data['sentence'] ?? ''));
    $tokens = $sentence === '' ? [] : (preg_split('/\s+/u', $sentence) ?: []);
    $language = trim((string)($data['language'] ?? 'Mandarin Chinese')) ?: 'Mandarin Chinese';
    $inputFormat = (string)($data['input_format'] ?? 'hanzi');
    $isMandarin = in_array(strtolower($language), ['mandarin', 'mandarin chinese'], true)
        || in_array($language, ['普通话', '國語', '国语'], true);
    $pinyinMode = trim((string)($data['pinyin_mode'] ?? 'tone_marks')) ?: 'tone_marks';
    if (!in_array($pinyinMode, ['tone_marks', 'tone_numbers', 'no_tone'], true)) {
        $pinyinMode = 'tone_marks';
    }
    if (array_key_exists('other_transcription_system', $data)) {
        $otherTranscriptionSystem = trim((string)($data['other_transcription_system'] ?? ''));
    } else {
        // Backward compatibility with projects/frontends from before 1.0.
        $otherTranscriptionSystem = trim((string)($data['transcription_system'] ?? 'Pinyin')) ?: 'Pinyin';
    }
    $conventions = trim((string)($data['conventions'] ?? ''));
    $tokenJson = json_encode($tokens, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $system = <<<'PROMPT'
You are a linguist preparing interlinear glossed examples of Sinitic languages.
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
- Preserve the exact morpheme boundary punctuation supplied by the user.
- Free translation should be idiomatic English but should not add discourse content absent from the example.
PROMPT;
    if ($conventions !== '') {
        $system .= "\nUser/project conventions override defaults when compatible with the input:\n{$conventions}\n";
    }

    $count = count($tokens);
    $user = <<<PROMPT
Language/variety: {$language}
Input format: {$inputFormat}
Pinyin setting: {$pinyinMode}
Other transcription system: {$otherTranscriptionSystem}
Original sentence: {$sentence}
Authoritative tokens: {$tokenJson}

Return this JSON schema exactly:
{
  "tokens": [
    {"form": "EXACT ORIGINAL TOKEN", "transcription": "...", "pinyin_diacritic": "...", "gloss": "..."}
  ],
  "free_translation": "...",
  "note": ""
}

There must be exactly {$count} token objects, in exactly the same order as Authoritative tokens.
PROMPT;

    if ($inputFormat === 'hanzi') {
        if ($pinyinMode === 'tone_numbers') {
            $user .= 'In pinyin_diacritic, supply Standard Mandarin Hanyu Pinyin with tone numbers 1, 2, 3, or 4 (for example wo3, chi1). Neutral-tone syllables have no tone digit; never use 0 (for example de, ma, shen2me). ';
        } elseif ($pinyinMode === 'no_tone') {
            $user .= 'In pinyin_diacritic, supply Standard Mandarin Hanyu Pinyin without tone marks or tone digits (for example wo, chi, shenme). ';
        } else {
            $user .= 'In pinyin_diacritic, supply Standard Mandarin Hanyu Pinyin with tone diacritics (for example wǒ, chī). A neutral-tone syllable has neither a tone mark nor a 0. ';
        }

        if ($otherTranscriptionSystem === '') {
            $user .= 'For every token, set transcription to an empty string. ';
        } else {
            $user .= "For every token, supply {$otherTranscriptionSystem} in transcription. ";
        }
        $systemName = strtolower($otherTranscriptionSystem);
        if ($systemName === 'pinyin') {
            $user .= 'Use Pinyin tone numbers (for example wo3, chi1) in transcription. Neutral-tone syllables must have no tone digit; never use 0 (for example de, ma, shen2me). ';
        } elseif (in_array($systemName, ['zhuyin', 'bopomofo'], true) || $otherTranscriptionSystem === '注音符号') {
            $user .= 'Use Unicode Bopomofo in horizontal writing. Leave first tone unmarked; put ˊ, ˇ, or ˋ after the syllable; put the neutral-tone dot before the syllable. ';
        } elseif ($systemName === 'ipa numeric tones') {
            $user .= 'Use IPA segment symbols followed by Chao-style numeric tone values. ';
            if ($isMandarin) {
                $user .= 'For Standard Mandarin, use 55, 35, 214, and 51 for tones 1–4 respectively; do not substitute tone-category numbers 1–4. ';
            } else {
                $user .= 'Use tone values appropriate to the requested language/variety; do not substitute tone-category numbers for phonetic values. ';
            }
            $user .= 'Leave neutral tone without a 0. ';
        } elseif ($systemName === 'ipa tone letters') {
            $user .= 'Use IPA segment symbols with IPA/Chao tone letters. ';
            if ($isMandarin) {
                $user .= 'For Standard Mandarin, use ˥, ˧˥, ˨˩˦, and ˥˩ for tones 1–4 respectively. ';
            } else {
                $user .= 'Use tone letters appropriate to the requested language/variety. ';
            }
            $user .= 'Do not use ASCII tone digits in this layer. ';
        }
        $user .= "Keep both fields aligned to the exact original token.\n";
    } else {
        $user .= "The input is already romanization/IPA: set both transcription and pinyin_diacritic equal to form; do not invent another transcription layer.\n";
    }

    return [$system, $user, $tokens];
}

function language_profiles(): array
{
    static $profiles = null;
    if (is_array($profiles)) {
        return $profiles;
    }
    $raw = file_get_contents(__DIR__ . '/language-profiles.json');
    $decoded = $raw === false ? null : json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Language profile registry is unavailable.');
    }
    $profiles = [];
    foreach ($decoded as $profile) {
        if (is_array($profile) && is_string($profile['id'] ?? null)) {
            $profiles[$profile['id']] = $profile;
        }
    }
    return $profiles;
}

function build_multilingual_prompt(array $data): array
{
    $sentence = trim((string)($data['sentence'] ?? ''));
    $tokens = $sentence === '' ? [] : (preg_split('/\s+/u', $sentence) ?: []);
    $profileId = trim((string)($data['language_profile_id'] ?? ''));
    $profiles = language_profiles();
    if (!isset($profiles[$profileId])) {
        throw new RuntimeException('Unsupported language profile.');
    }
    $profile = $profiles[$profileId];
    $scriptVariant = trim((string)($data['script_variant'] ?? ($profile['script_variants'][0]['id'] ?? '')));
    $variant = null;
    foreach ($profile['script_variants'] as $candidate) {
        if (($candidate['id'] ?? '') === $scriptVariant) {
            $variant = $candidate;
            break;
        }
    }
    if (!is_array($variant)) {
        throw new RuntimeException('Unsupported script variant.');
    }
    $language = (string)($profile['labels']['en'] ?? $profileId);
    $primary = trim((string)($data['primary_transcription_system'] ?? ($profile['primary_transcription'] ?? '')));
    $secondary = trim((string)($data['other_transcription_system'] ?? ''));
    $includeChineseGloss = !empty($data['include_chinese_gloss']);
    $conventions = trim((string)($data['conventions'] ?? ''));
    $tokenJson = json_encode($tokens, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $profileRules = (string)($profile['prompt_rules'] ?? '');
    $count = count($tokens);

    $system = <<<PROMPT
You are a linguist preparing publication-ready interlinear glossed text.
Return ONLY valid JSON. Never change, merge, split, delete, reorder, or add user tokens.
The user's whitespace tokenization is authoritative. Preserve the exact original form of every token.

Follow the Leipzig Glossing Rules: lexical English glosses are lowercase; grammatical abbreviations are uppercase; hyphens and equals signs must correspond across analyzed and gloss layers. Do not invent morpheme boundaries merely because a word expresses several features. Put genuine uncertainty in note.

Language-specific rules:
{$profileRules}

For chinese_gloss, provide exactly one concise Modern Standard Chinese equivalent per source token in source order when requested; otherwise return an empty string. This aligned layer is not a fluent sentence and must never reorder tokens.
For chinese_free_translation, provide an idiomatic Modern Standard Chinese sentence without adding absent discourse content.
For free_translation, provide an idiomatic English sentence without adding absent discourse content.
PROMPT;
    if ($conventions !== '') {
        $system .= "\nUser/project conventions override defaults when compatible with the input:\n{$conventions}\n";
    }
    $chineseInstruction = $includeChineseGloss
        ? 'Supply chinese_gloss for every token.'
        : 'Set chinese_gloss to an empty string for every token.';
    $direction = (string)$variant['direction'];
    $user = <<<PROMPT
Language: {$language}
Language profile: {$profileId}
Script variant: {$scriptVariant}
Direction: {$direction}
Primary transcription system: {$primary}
Secondary annotation system: {$secondary}
Original sentence: {$sentence}
Authoritative tokens: {$tokenJson}

Return this JSON schema exactly:
{
  "tokens": [
    {"form": "EXACT ORIGINAL TOKEN", "pinyin_diacritic": "PRIMARY TRANSCRIPTION OR EMPTY", "transcription": "SECONDARY ANNOTATION OR EMPTY", "chinese_gloss": "ALIGNED CHINESE OR EMPTY", "gloss": "ENGLISH LEIPZIG GLOSS"}
  ],
  "free_translation": "IDIOMATIC ENGLISH",
  "chinese_free_translation": "IDIOMATIC MODERN STANDARD CHINESE",
  "note": ""
}

There must be exactly {$count} token objects in exactly the same order as Authoritative tokens.
{$chineseInstruction}
PROMPT;
    $user .= $primary === ''
        ? ' Set pinyin_diacritic to an empty string for every token.'
        : " Supply {$primary} in pinyin_diacritic, aligned one-to-one with the original tokens.";
    $user .= $secondary === '' || $secondary === 'Chinese aligned gloss'
        ? ' Set transcription to an empty string for every token.'
        : " Supply {$secondary} in transcription, aligned one-to-one with the original tokens.";
    return [$system, $user, $tokens];
}

function build_extended_sinitic_prompt(array $data): array
{
    [$system, $user, $tokens] = build_prompt($data);
    if (($data['language'] ?? '') === 'Southern Min Chinese') {
        $user = preg_replace(
            '/In pinyin_diacritic, supply Standard Mandarin Hanyu Pinyin.*?(?=For every token,)/s',
            'For every token, set pinyin_diacritic to an empty string. ',
            $user
        ) ?? $user;
        $system .= "\nFor Southern Min, use the researcher-selected Tâi-lô or Pe̍h-ōe-jī system in transcription. Do not generate Mandarin Pinyin.\n";
    }
    $user = str_replace(
        '"pinyin_diacritic": "...", "gloss": "..."}',
        '"pinyin_diacritic": "...", "chinese_gloss": "...", "gloss": "..."}',
        $user
    );
    $user = str_replace(
        '"free_translation": "...",' . "\n" . '  "note": ""',
        '"free_translation": "...",' . "\n" . '  "chinese_free_translation": "...",' . "\n" . '  "note": ""',
        $user
    );
    $system .= "\nFor chinese_free_translation, supply an idiomatic Modern Standard Chinese sentence. ";
    $system .= "For chinese_gloss, supply one concise Modern Standard Chinese equivalent per source token in source order; never reorder tokens.\n";
    $user .= !empty($data['include_chinese_gloss'])
        ? "Supply chinese_gloss for every token.\n"
        : "Set chinese_gloss to an empty string for every token.\n";
    return [$system, $user, $tokens];
}

function build_request_prompt(array $data): array
{
    if (($data['workspace'] ?? '') === 'multilingual') {
        [$system, $user, $tokens] = build_multilingual_prompt($data);
        return [$system, $user, $tokens, true];
    }
    $extended = !empty($data['extended_output']) || !empty($data['include_chinese_gloss']);
    if ($extended) {
        [$system, $user, $tokens] = build_extended_sinitic_prompt($data);
        return [$system, $user, $tokens, true];
    }
    [$system, $user, $tokens] = build_prompt($data);
    return [$system, $user, $tokens, false];
}

function post_model_json(string $provider, string $url, array $headers, array $payload): array
{
    $current = $payload;
    for ($attempt = 0; $attempt < 3; $attempt++) {
        try {
            return http_json($url, 'POST', $headers, $current, 90);
        } catch (RuntimeException $error) {
            $message = strtolower($error->getMessage());
            $changed = false;
            foreach (['response_format', 'json_schema', 'structured output', 'structured_outputs', 'output_config'] as $marker) {
                if (strpos($message, $marker) !== false) {
                    if (in_array($provider, ['openai', 'openrouter'], true) && array_key_exists('response_format', $current)) {
                        unset($current['response_format']);
                        $changed = true;
                    }
                    if ($provider === 'claude' && array_key_exists('output_config', $current)) {
                        unset($current['output_config']);
                        $changed = true;
                    }
                    break;
                }
            }
            if ($provider === 'openai' && strpos($message, 'max_completion_tokens') !== false && array_key_exists('max_completion_tokens', $current)) {
                $current['max_tokens'] = $current['max_completion_tokens'];
                unset($current['max_completion_tokens']);
                $changed = true;
            }
            if (!$changed) {
                throw $error;
            }
        }
    }
    throw new RuntimeException('The model endpoint rejected all compatible request formats.');
}

function extract_json_text($text): array
{
    if (!is_string($text)) {
        throw new RuntimeException('Model returned no textual response.');
    }
    $text = trim($text);
    $text = preg_replace('/^```(?:json)?\s*/i', '', $text) ?? $text;
    $text = preg_replace('/\s*```$/', '', $text) ?? $text;
    $decoded = json_decode($text, true);
    if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
        return $decoded;
    }
    $start = strpos($text, '{');
    $end = strrpos($text, '}');
    if ($start !== false && $end !== false && $end > $start) {
        $decoded = json_decode(substr($text, $start, $end - $start + 1), true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            return $decoded;
        }
    }
    throw new RuntimeException('The model did not return valid JSON. Try again or use another model.');
}

function request_origin(): string
{
    $https = !empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off';
    $host = preg_replace('/[^A-Za-z0-9.:[\]-]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost')) ?: 'localhost';
    return ($https ? 'https' : 'http') . '://' . $host . '/';
}

function call_model(string $provider, string $apiKey, string $model, string $systemPrompt, string $userPrompt, bool $extended = false): array
{
    if ($model === '') {
        throw new RuntimeException('Model name is empty.');
    }
    $provider = strtolower($provider);

    if (in_array($provider, ['deepseek', 'openrouter', 'openai'], true)) {
        if ($provider === 'deepseek') {
            $url = 'https://api.deepseek.com/chat/completions';
            $headers = ['Authorization: Bearer ' . $apiKey];
            $payload = [
                'model' => $model,
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ['role' => 'user', 'content' => $userPrompt],
                ],
                'max_tokens' => 1800,
                'stream' => false,
                'thinking' => ['type' => 'disabled'],
                'response_format' => ['type' => 'json_object'],
            ];
        } elseif ($provider === 'openrouter') {
            $url = 'https://openrouter.ai/api/v1/chat/completions';
            $headers = [
                'Authorization: Bearer ' . $apiKey,
                'HTTP-Referer: ' . request_origin(),
                "X-Title: Merlin's Leipzig Gloss Tool 2.0",
            ];
            $payload = [
                'model' => $model,
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ['role' => 'user', 'content' => $userPrompt],
                ],
                'max_tokens' => 1800,
                'stream' => false,
                'response_format' => structured_response_format($extended),
            ];
        } else {
            $url = 'https://api.openai.com/v1/chat/completions';
            $headers = ['Authorization: Bearer ' . $apiKey];
            $payload = [
                'model' => $model,
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ['role' => 'user', 'content' => $userPrompt],
                ],
                'max_completion_tokens' => 1800,
                'stream' => false,
                'response_format' => structured_response_format($extended),
            ];
        }
        [, $body] = post_model_json($provider, $url, $headers, $payload);
        $choices = $body['choices'] ?? [];
        if (!is_array($choices) || count($choices) === 0) {
            throw new RuntimeException(extract_api_error($body) ?: 'Model returned no choices.');
        }
        $message = is_array($choices[0]) ? ($choices[0]['message'] ?? []) : [];
        if (!empty($message['refusal'])) {
            throw new RuntimeException('The model refused this request. Try another model or revise the input.');
        }
        return extract_json_text($message['content'] ?? null);
    }

    if ($provider === 'claude') {
        $url = 'https://api.anthropic.com/v1/messages';
        $headers = ['x-api-key: ' . $apiKey, 'anthropic-version: 2023-06-01'];
        $payload = [
            'model' => $model,
            'max_tokens' => 1800,
            'system' => $systemPrompt,
            'messages' => [['role' => 'user', 'content' => $userPrompt]],
            'output_config' => ['format' => ['type' => 'json_schema', 'schema' => result_schema($extended)]],
        ];
        [, $body] = post_model_json($provider, $url, $headers, $payload);
        if (($body['stop_reason'] ?? '') === 'refusal') {
            throw new RuntimeException('The model refused this request. Try another model or revise the input.');
        }
        $parts = $body['content'] ?? [];
        $text = '';
        foreach ($parts as $part) {
            if (is_array($part) && ($part['type'] ?? '') === 'text') {
                $text .= (string)($part['text'] ?? '');
            }
        }
        return extract_json_text($text);
    }

    throw new RuntimeException('Unsupported provider: ' . $provider);
}

function clean_text($value): string
{
    return $value === null ? '' : trim((string)$value);
}

function strip_pinyin_neutral_tone(string $value): string
{
    return preg_replace('/(?<=[\p{L}:])0/u', '', $value) ?? $value;
}

function normalize_result(array $result, array $originalTokens, string $inputFormat, string $transcriptionSystem = 'Pinyin', bool $extended = false, bool $sinitic = true): array
{
    $aiTokens = $result['tokens'] ?? null;
    if (!is_array($aiTokens)) {
        throw new RuntimeException('Model result has no token list.');
    }
    if (count($aiTokens) !== count($originalTokens)) {
        throw new RuntimeException('Alignment check failed: input has ' . count($originalTokens) . ' tokens but the model returned ' . count($aiTokens) . '.');
    }

    $output = [];
    foreach ($originalTokens as $index => $original) {
        $item = $aiTokens[$index] ?? null;
        if (!is_array($item)) {
            throw new RuntimeException('Model token ' . ($index + 1) . ' is not an object.');
        }
        $transcription = clean_text($item['transcription'] ?? null);
        $pinyin = clean_text($item['pinyin_diacritic'] ?? null);
        if ($sinitic && $inputFormat !== 'hanzi') {
            $transcription = (string)$original;
            $pinyin = (string)$original;
        } elseif ($sinitic) {
            $pinyin = strip_pinyin_neutral_tone($pinyin);
            if (strtolower($transcriptionSystem) === 'pinyin') {
                $transcription = strip_pinyin_neutral_tone($transcription);
            }
        }
        $normalized = [
            'form' => (string)$original,
            'transcription' => $transcription,
            'pinyin_diacritic' => $pinyin,
            'gloss' => clean_text($item['gloss'] ?? null),
        ];
        if ($extended) {
            $normalized['chinese_gloss'] = clean_text($item['chinese_gloss'] ?? null);
        }
        $output[] = $normalized;
    }
    $normalizedResult = [
        'tokens' => $output,
        'free_translation' => clean_text($result['free_translation'] ?? null),
        'note' => clean_text($result['note'] ?? null),
    ];
    if ($extended) {
        $normalizedResult['chinese_free_translation'] = clean_text($result['chinese_free_translation'] ?? null);
    }
    return $normalizedResult;
}

function read_request_json(): array
{
    $length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > CLG_MAX_REQUEST_BYTES) {
        throw new RuntimeException('Request body is too large.');
    }
    $raw = file_get_contents('php://input');
    $data = json_decode($raw === false || $raw === '' ? '{}' : $raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
        throw new RuntimeException('Request body must be a JSON object.');
    }
    return $data;
}

function require_v2_same_origin_request(): void
{
    if ((string)($_SERVER['HTTP_X_CLG_REQUEST'] ?? '') !== '2') {
        throw new RuntimeException('Missing application request header.');
    }
    $origin = rtrim((string)($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
    if ($origin !== '' && !hash_equals(rtrim(request_origin(), '/'), $origin)) {
        throw new RuntimeException('Cross-origin request rejected.');
    }
}

function credential_status_payload(?array $vault): array
{
    return [
        'ok' => true,
        'configured_providers' => $vault === null ? [] : array_values(array_keys($vault['keys'])),
        'remembered' => $vault !== null && !empty($vault['remembered']),
        'expires_at' => $vault === null ? null : (int)$vault['expires_at'],
    ];
}

function handle_credentials_request(): void
{
    $method = (string)($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $vault = credential_vault_from_request();
    if ($method === 'GET') {
        send_json(200, credential_status_payload($vault));
        return;
    }
    enforce_rate_limit('credentials', 10, 900);
    require_v2_same_origin_request();
    $data = read_request_json();
    $provider = strtolower(trim((string)($data['provider'] ?? '')));
    if (!in_array($provider, CLG_SUPPORTED_PROVIDERS, true)) {
        throw new RuntimeException('Unsupported provider.');
    }
    if ($method === 'DELETE') {
        if ($vault !== null) {
            unset($vault['keys'][$provider]);
            if ($vault['keys'] === []) {
                clear_credential_vault_cookie();
                send_json(200, credential_status_payload(null));
                return;
            }
            set_credential_vault_cookie($vault, !empty($vault['remembered']));
        }
        send_json(200, credential_status_payload($vault));
        return;
    }
    if ($method !== 'POST') {
        send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
        return;
    }
    $apiKey = trim((string)($data['api_key'] ?? ''));
    $model = trim((string)($data['model'] ?? ''));
    if ($apiKey === '' || strlen($apiKey) > CLG_MAX_API_KEY_BYTES || preg_match('/\s/', $apiKey) === 1) {
        throw new RuntimeException('API key format is invalid.');
    }
    validate_key($provider, $apiKey, $model);
    $remember = !empty($data['remember']);
    $expiresAt = time() + ($remember ? CLG_CREDENTIAL_TTL : 86400);
    $keys = $vault['keys'] ?? [];
    $keys[$provider] = $apiKey;
    $vault = [
        'version' => 1,
        'issued_at' => time(),
        'expires_at' => $expiresAt,
        'remembered' => $remember,
        'keys' => $keys,
    ];
    set_credential_vault_cookie($vault, $remember);
    send_json(200, credential_status_payload($vault));
}

function handle_request(): void
{
    $action = (string)($_GET['action'] ?? '');
    if ($action === 'credentials') {
        try {
            handle_credentials_request();
        } catch (Throwable $error) {
            send_json($error instanceof RateLimitException ? 429 : 400, ['ok' => false, 'error' => redact_sensitive_text($error->getMessage())]);
        }
        return;
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
        return;
    }
    if (!in_array($action, ['validate', 'gloss'], true)) {
        send_json(404, ['ok' => false, 'error' => 'Not found']);
        return;
    }

    try {
        enforce_rate_limit($action, $action === 'gloss' ? 120 : 30, 900);
        $data = read_request_json();
        $provider = (string)($data['provider'] ?? 'deepseek');
        $apiKey = trim((string)($data['api_key'] ?? ''));
        $model = trim((string)($data['model'] ?? ''));
        if ($apiKey === '') {
            $vault = credential_vault_from_request();
            $apiKey = is_array($vault) ? (string)($vault['keys'][strtolower($provider)] ?? '') : '';
            if ($apiKey !== '') {
                require_v2_same_origin_request();
            }
        }

        if ($action === 'validate') {
            send_json(200, validate_key($provider, $apiKey, $model));
            return;
        }

        $sentence = trim((string)($data['sentence'] ?? ''));
        if ($sentence === '') {
            throw new RuntimeException('Input sentence is empty.');
        }
        if ($apiKey === '') {
            throw new RuntimeException('API key is empty.');
        }
        [$systemPrompt, $userPrompt, $originalTokens, $extended] = build_request_prompt($data);
        $modelResult = call_model($provider, $apiKey, $model, $systemPrompt, $userPrompt, $extended);
        $result = normalize_result(
            $modelResult,
            $originalTokens,
            (string)($data['input_format'] ?? 'hanzi'),
            (string)($data['other_transcription_system'] ?? ($data['transcription_system'] ?? 'Pinyin')),
            $extended,
            ($data['workspace'] ?? 'sinitic') !== 'multilingual'
        );
        send_json(200, ['ok' => true, 'result' => $result]);
    } catch (Throwable $error) {
        send_json($error instanceof RateLimitException ? 429 : 400, ['ok' => false, 'error' => redact_sensitive_text($error->getMessage())]);
    }
}

if (!defined('CLG_API_LIBRARY_ONLY')) {
    handle_request();
}
