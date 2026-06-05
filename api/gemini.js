const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function getApiKeys() {
    const list = [
        process.env.GEMINI_API_KEY_1,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3,
        process.env.GEMINI_API_KEY_4
    ].map(k => (k || '').trim()).filter(Boolean);

    if (list.length > 0) return list;

    if (process.env.GEMINI_API_KEYS) {
        return process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
    }

    return [];
}

function buildRequestBody(systemPrompt, conversationHistory, expectJson) {
    const contents = [
        {
            role: 'user',
            parts: [{ text: systemPrompt }]
        },
        ...(Array.isArray(conversationHistory) ? conversationHistory : [])
    ];

    const generationConfig = {
        temperature: 0.4,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024
    };

    if (expectJson) {
        generationConfig.responseMimeType = 'application/json';
    }

    return {
        contents,
        generationConfig,
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
        ]
    };
}

async function callGemini(apiKey, model, requestBody) {
    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error?.message || 'Unknown error';
        const err = new Error(`API request failed: ${response.status} - ${message}`);
        err.status = response.status;
        throw err;
    }

    const data = await response.json().catch(() => null);
    if (!data) {
        throw new Error('API returned empty response body');
    }

    return data;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: { message: 'Method Not Allowed' } });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const systemPrompt = (body.systemPrompt || '').toString();
    const conversationHistory = body.conversationHistory || [];
    const expectJson = body.expectJson === true;

    if (!systemPrompt) {
        return res.status(400).json({ error: { message: 'Missing systemPrompt' } });
    }

    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
        return res.status(500).json({ error: { message: 'No API keys configured' } });
    }

    const primaryModel = process.env.PRIMARY_MODEL || 'gemini-2.5-flash';
    const fallbackModel = process.env.FALLBACK_MODEL || 'gemini-2.5-flash-lite';
    const requestBody = buildRequestBody(systemPrompt, conversationHistory, expectJson);

    let lastError = null;

    for (let i = 0; i < apiKeys.length; i++) {
        const apiKey = apiKeys[i];

        try {
            const data = await callGemini(apiKey, primaryModel, requestBody);
            return res.status(200).json(data);
        } catch (error) {
            lastError = error;
        }

        try {
            const data = await callGemini(apiKey, fallbackModel, requestBody);
            return res.status(200).json(data);
        } catch (error) {
            lastError = error;
        }
    }

    return res.status(500).json({
        error: {
            message: lastError && lastError.message ? lastError.message : 'All API keys failed'
        }
    });
}
