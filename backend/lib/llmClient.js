// Available free models from OpenRouter
export const AVAILABLE_MODELS = [
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', provider: 'Google', default: true },
    { id: 'qwen/qwen3-235b-a22b:free', name: 'Qwen3 235B', provider: 'Qwen' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', provider: 'Meta' },
    { id: 'openai/gpt-oss-120b:free', name: 'GPT OSS 120B', provider: 'OpenAI' },
    { id: 'openai/gpt-oss-20b:free', name: 'GPT OSS 20B', provider: 'OpenAI' },
    { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder', provider: 'Qwen' },
    { id: 'qwen/qwen3-4b:free', name: 'Qwen3 4B', provider: 'Qwen' },
    { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B', provider: 'Mistral' },
    { id: 'mistralai/devstral-2512:free', name: 'Devstral 2512', provider: 'Mistral' },
    { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1', provider: 'Mistral' },
    { id: 'mistralai/mistral-small-3.2-24b-instruct:free', name: 'Mistral Small 3.2', provider: 'Mistral' },
    { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', provider: 'Google' },
    { id: 'google/gemma-3-12b-it:free', name: 'Gemma 3 12B', provider: 'Google' },
    { id: 'google/gemma-3-4b-it:free', name: 'Gemma 3 4B', provider: 'Google' },
    { id: 'google/gemma-3n-e4b-it:free', name: 'Gemma 3N E4B', provider: 'Google' },
    { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'Nemotron 12B VL', provider: 'NVIDIA' },
    { id: 'nvidia/nemotron-nano-9b-v2:free', name: 'Nemotron 9B', provider: 'NVIDIA' },
    { id: 'moonshotai/kimi-k2:free', name: 'Kimi K2', provider: 'Moonshot' },
    { id: 'meituan/longcat-flash-chat:free', name: 'LongCat Flash Chat', provider: 'Meituan' },
    { id: 'amazon/nova-2-lite-v1:free', name: 'Nova 2 Lite', provider: 'Amazon' },
    { id: 'arcee-ai/trinity-mini:free', name: 'Trinity Mini', provider: 'Arcee AI' },
    { id: 'nex-agi/deepseek-v3.1-nex-n1:free', name: 'DeepSeek V3.1', provider: 'Nex AGI' },
    { id: 'tngtech/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2 Chimera', provider: 'TNG Tech' },
    { id: 'tngtech/deepseek-r1t-chimera:free', name: 'DeepSeek R1T Chimera', provider: 'TNG Tech' },
    { id: 'allenai/olmo-3-32b-think:free', name: 'OLMo 3 32B Think', provider: 'Allen AI' },
    { id: 'kwaipilot/kat-coder-pro:free', name: 'KAT Coder Pro', provider: 'Kwai Pilot' },
    { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air', provider: 'Z-AI' },
    { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B', provider: 'Meta' },
    { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 Llama 405B', provider: 'Nous Research' },
    { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', name: 'Dolphin Mistral 24B Venice', provider: 'Cognitive Computations' },
];

// Fallback model chain (in order of preference)
export const FALLBACK_CHAIN = [
    'google/gemini-2.0-flash-exp:free',
    'qwen/qwen3-235b-a22b:free',
    'mistralai/devstral-2512:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'amazon/nova-2-lite-v1:free',
    'google/gemma-3-27b-it:free',
    'openai/gpt-oss-120b:free',
    'openai/gpt-oss-20b:free'
];

export const DEFAULT_MODEL = 'google/gemini-2.0-flash-exp:free';

// Rate limiting
const rateLimitedModels = new Map(); // model => timestamp when it became rate limited

// API Key Management
const API_KEYS = [
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_API_KEY_2,
    process.env.OPENROUTER_API_KEY_3,
    process.env.OPENROUTER_API_KEY_4
].filter(Boolean); // Remove undefined keys

let currentApiKeyIndex = 0;

export function getCurrentApiKey() {
    if (API_KEYS.length === 0) {
        throw new Error('No API keys configured');
    }
    return API_KEYS[currentApiKeyIndex];
}

export function setApiKeyIndex(index) {
    if (index < 0 || index >= API_KEYS.length) {
        throw new Error(`Invalid API key index: ${index}. Available: 0-${API_KEYS.length - 1}`);
    }
    currentApiKeyIndex = index;
    log('info', `Switched to API Key ${index + 1}`);
    return { keyIndex: index + 1, totalKeys: API_KEYS.length };
}

// Automatic rotation on rate limit
export function rotateToNextApiKey() {
    if (API_KEYS.length <= 1) {
        return false; // Can't rotate with only 1 key
    }

    const oldIndex = currentApiKeyIndex;
    currentApiKeyIndex = (currentApiKeyIndex + 1) % API_KEYS.length;

    log('warning', `🔄 Auto-rotated API key: ${oldIndex + 1} → ${currentApiKeyIndex + 1}/${API_KEYS.length}`);
    return true;
}

export function getApiKeyInfo() {
    return {
        currentIndex: currentApiKeyIndex,
        totalKeys: API_KEYS.length,
        availableKeys: API_KEYS.map((_, i) => i + 1)
    };
}

// Logger helper
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}][${level.toUpperCase()}] ${message} `;
    console.log(logMsg);
    if (data) console.log(JSON.stringify(data, null, 2));
}

function isRateLimited(model) {
    const resetTime = rateLimitedModels.get(model);
    if (!resetTime) return false;
    if (Date.now() >= resetTime) {
        rateLimitedModels.delete(model);
        return false;
    }
    return true;
}

function setRateLimited(model, resetAt = Date.now() + 60000) {
    rateLimitedModels.set(model, resetAt);
    log('warning', `Model ${model} marked as rate limited`);
}

export function getRateLimitStatus() {
    const status = {};
    for (const model of AVAILABLE_MODELS) {
        const resetAt = rateLimitedModels.get(model.id);
        status[model.id] = resetAt ? { limited: true, resetAt, remaining: Math.max(0, resetAt - Date.now()) } : { limited: false, resetAt: null, remaining: 0 };
    }
    return status;
}


export function clearRateLimit(modelId) {
    rateLimitedModels.delete(modelId);
    log('info', `Model ${modelId} rate limit cleared`);
}

/**
 * Race multiple LLM models in parallel with timeout
 * Returns the first successful response or throws if all fail
 */
export async function raceLLMs(prompt, options = {}, modelCount = 5) {
    const { timeout = 15000, ...llmOptions } = options; // 15s default timeout (reduced from 20s)

    // Get available models (not rate limited)
    const availableModels = AVAILABLE_MODELS
        .filter(m => !isRateLimited(m.id))
        .slice(0, modelCount);

    if (availableModels.length === 0) {
        throw new Error('All models are rate limited');
    }

    log('info', `🏁 Racing ${availableModels.length} models with ${timeout}ms timeout`);

    // Create race promises
    const racePromises = availableModels.map(async (modelInfo) => {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
        );

        const llmPromise = callLLM(prompt, { ...llmOptions, model: modelInfo.id });

        try {
            const result = await Promise.race([llmPromise, timeoutPromise]);
            return { success: true, result, model: modelInfo.id };
        } catch (error) {
            log('warning', `Model ${modelInfo.id} failed: ${error.message}`);
            return { success: false, error: error.message, model: modelInfo.id };
        }
    });

    // Wait for all, return first success
    const results = await Promise.all(racePromises);

    // Find first successful result
    const winner = results.find(r => r.success);
    if (winner) {
        log('info', `🏆 Winner: ${winner.model} (${winner.result.elapsed}ms)`);
        return winner.result;
    }

    // All failed
    const errors = results.map(r => `${r.model}: ${r.error}`).join(', ');
    throw new Error(`All ${availableModels.length} models failed - ${errors}`);
}

// Main LLM call function
export async function callLLM(prompt, options = {}) {
    const {
        model = DEFAULT_MODEL,
        systemPrompt = 'You are a helpful assistant that solves data analysis tasks. Provide concise, accurate answers.',
        temperature = 0.3,
        maxTokens = 4096,
        images = [],
    } = options;

    const apiKey = getCurrentApiKey();
    if (!apiKey) {
        throw new Error('No API key available');
    }

    // Check if model is rate limited
    if (isRateLimited(model)) {
        throw new Error(`Model ${model} is rate limited`);
    }

    log('info', `Calling LLM: ${model} (prompt: ${prompt.length} chars, images: ${images.length})`);

    // Build messages array
    const messages = [
        { role: 'system', content: systemPrompt }
    ];

    // If we have images, use vision format
    if (images.length > 0) {
        const content = [
            { type: 'text', text: prompt },
            ...images.map(img => ({
                type: 'image_url',
                image_url: { url: img }
            }))
        ];
        messages.push({ role: 'user', content });
    } else {
        messages.push({ role: 'user', content: prompt });
    }

    const startTime = Date.now();

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey} `,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'LLM Quiz Solver'
            },
            body: JSON.stringify({
                model,
                messages,
                temperature,
                max_tokens: maxTokens,
            })
        });

        const elapsed = Date.now() - startTime;

        if (response.status === 429) {
            const resetHeader = response.headers.get('x-ratelimit-reset');
            const resetAt = resetHeader ? parseInt(resetHeader) * 1000 : Date.now() + 60000;
            setRateLimited(model, resetAt);
            throw new Error(`Rate limited on model ${model} `);
        }

        if (!response.ok) {
            const errorText = await response.text();
            log('error', `OpenRouter API error: ${response.status} `, { error: errorText });

            if (response.status >= 500) {
                throw new Error(`Server error on model ${model} `);
            }

            throw new Error(`OpenRouter API error: ${response.status} `);
        }

        const data = await response.json();

        if (data.error) {
            if (data.error.code === 429 || data.error.message?.toLowerCase().includes('rate')) {
                setRateLimited(model);
                throw new Error(`Rate limited on model ${model} `);
            }
            throw new Error(`OpenRouter error: ${data.error.message} `);
        }

        const content = data.choices?.[0]?.message?.content || '';

        log('info', `LLM response received in ${elapsed} ms(${content.length} chars)`);

        return {
            content,
            model: data.model || model,
            usage: data.usage,
            elapsed
        };

    } catch (error) {
        log('error', `LLM call failed: ${error.message} `);
        throw error;
    }
}

// LLM call with automatic fallback to other models
export async function callLLMWithFallback(prompt, options = {}) {
    const {
        model = DEFAULT_MODEL,
        onModelSwitch = () => { },
        onAllRateLimited = () => { },
        ...restOptions
    } = options;

    // Build the fallback chain starting with the requested model
    const modelsToTry = [model, ...FALLBACK_CHAIN.filter(m => m !== model)];

    for (const tryModel of modelsToTry) {
        // Skip if we know it's rate limited
        if (isRateLimited(tryModel)) {
            log('info', `Skipping rate - limited model: ${tryModel} `);
            continue;
        }

        try {
            const result = await callLLM(prompt, { ...restOptions, model: tryModel });

            if (tryModel !== model) {
                onModelSwitch(tryModel, `Switched from ${model} to ${tryModel} `);
            }

            return result;

        } catch (error) {
            log('warning', `Model ${tryModel} failed: ${error.message} `);

            // If it's a rate limit error, it's already marked - try next
            if (error.message.includes('rate') || error.message.includes('Rate')) {
                continue;
            }

            // For other errors, also try next model
            continue;
        }
    }

    // All models failed - try rotating API key
    if (rotateToNextApiKey()) {
        log('info', '🔄 All models failed, rotated API key - retrying...');
        // Recursively try again with new key (limit to prevent infinite loop)
        const retryCount = options.retryCount || 0;
        if (retryCount < API_KEYS.length) {
            return await callLLMWithFallback(prompt, { ...options, retryCount: retryCount + 1 });
        }
    }

    log('error', 'All models are rate limited or failed across all API keys');
    onAllRateLimited();
    throw new Error('All models are rate limited. Please select a model manually or wait.');
}

// Test if a model is available
export async function testModel(modelId) {
    try {
        const result = await callLLM('Respond with just "OK"', {
            model: modelId,
            maxTokens: 10,
            temperature: 0
        });
        return { available: true, response: result.content };
    } catch (error) {
        return { available: false, error: error.message };
    }
}
