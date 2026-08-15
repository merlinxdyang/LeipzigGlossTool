<?php
declare(strict_types=1);

ini_set('display_errors', '0');

const CLG_MAX_REQUEST_BYTES = 1048576;

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
        CURLOPT_USERAGENT => 'Chinese-Leipzig-Gloss-Tool/1.0',
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

function result_schema(): array
{
    return [
        'type' => 'object',
        'properties' => [
            'tokens' => [
                'type' => 'array',
                'items' => [
                    'type' => 'object',
                    'properties' => [
                        'form' => ['type' => 'string'],
                        'transcription' => ['type' => 'string'],
                        'pinyin_diacritic' => ['type' => 'string'],
                        'gloss' => ['type' => 'string'],
                    ],
                    'required' => ['form', 'transcription', 'pinyin_diacritic', 'gloss'],
                    'additionalProperties' => false,
                ],
            ],
            'free_translation' => ['type' => 'string'],
            'note' => ['type' => 'string'],
        ],
        'required' => ['tokens', 'free_translation', 'note'],
        'additionalProperties' => false,
    ];
}

function structured_response_format(): array
{
    return [
        'type' => 'json_schema',
        'json_schema' => [
            'name' => 'interlinear_gloss',
            'strict' => true,
            'schema' => result_schema(),
        ],
    ];
}

function build_prompt(array $data): array
{
    $sentence = trim((string)($data['sentence'] ?? ''));
    $tokens = $sentence === '' ? [] : (preg_split('/\s+/u', $sentence) ?: []);
    $language = trim((string)($data['language'] ?? 'Mandarin Chinese')) ?: 'Mandarin Chinese';
    $inputFormat = (string)($data['input_format'] ?? 'hanzi');
    $transcriptionSystem = trim((string)($data['transcription_system'] ?? 'Pinyin')) ?: 'Pinyin';
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
Requested transcription system: {$transcriptionSystem}
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
        $user .= "For every token, supply a {$transcriptionSystem} transcription in transcription. ";
        $systemName = strtolower($transcriptionSystem);
        if ($systemName === 'pinyin') {
            $user .= 'Use tone numbers (for example wo3, chi1). Neutral-tone syllables must have no tone digit; never use 0 (for example de, ma, shen2me). ';
        } elseif (in_array($systemName, ['zhuyin', 'bopomofo'], true) || $transcriptionSystem === '注音符号') {
            $user .= 'Use Unicode Bopomofo in horizontal writing. Leave first tone unmarked; put ˊ, ˇ, or ˋ after the syllable; put the neutral-tone dot before the syllable. ';
        }
        $user .= "Also supply Standard Mandarin Hanyu Pinyin with tone diacritics in pinyin_diacritic. Keep each transcription aligned to the exact original token. Neutral tone has neither a tone mark nor a 0.\n";
    } else {
        $user .= "The input is already romanization/IPA: set both transcription and pinyin_diacritic equal to form; do not invent another transcription layer.\n";
    }

    return [$system, $user, $tokens];
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

function call_model(string $provider, string $apiKey, string $model, string $systemPrompt, string $userPrompt): array
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
                "X-Title: Merlin's Leipzig Gloss Tool 1.0",
            ];
            $payload = [
                'model' => $model,
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ['role' => 'user', 'content' => $userPrompt],
                ],
                'max_tokens' => 1800,
                'stream' => false,
                'response_format' => structured_response_format(),
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
                'response_format' => structured_response_format(),
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
            'output_config' => ['format' => ['type' => 'json_schema', 'schema' => result_schema()]],
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

function normalize_result(array $result, array $originalTokens, string $inputFormat, string $transcriptionSystem = 'Pinyin'): array
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
        if ($inputFormat !== 'hanzi') {
            $transcription = (string)$original;
            $pinyin = (string)$original;
        } else {
            $pinyin = strip_pinyin_neutral_tone($pinyin);
            if (strtolower($transcriptionSystem) === 'pinyin') {
                $transcription = strip_pinyin_neutral_tone($transcription);
            }
        }
        $output[] = [
            'form' => (string)$original,
            'transcription' => $transcription,
            'pinyin_diacritic' => $pinyin,
            'gloss' => clean_text($item['gloss'] ?? null),
        ];
    }
    return [
        'tokens' => $output,
        'free_translation' => clean_text($result['free_translation'] ?? null),
        'note' => clean_text($result['note'] ?? null),
    ];
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

function handle_request(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
        return;
    }
    $action = (string)($_GET['action'] ?? '');
    if (!in_array($action, ['validate', 'gloss'], true)) {
        send_json(404, ['ok' => false, 'error' => 'Not found']);
        return;
    }

    try {
        $data = read_request_json();
        $provider = (string)($data['provider'] ?? 'deepseek');
        $apiKey = trim((string)($data['api_key'] ?? ''));
        $model = trim((string)($data['model'] ?? ''));

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
        [$systemPrompt, $userPrompt, $originalTokens] = build_prompt($data);
        $modelResult = call_model($provider, $apiKey, $model, $systemPrompt, $userPrompt);
        $result = normalize_result(
            $modelResult,
            $originalTokens,
            (string)($data['input_format'] ?? 'hanzi'),
            (string)($data['transcription_system'] ?? 'Pinyin')
        );
        send_json(200, ['ok' => true, 'result' => $result]);
    } catch (Throwable $error) {
        send_json(400, ['ok' => false, 'error' => redact_sensitive_text($error->getMessage())]);
    }
}

if (!defined('CLG_API_LIBRARY_ONLY')) {
    handle_request();
}
