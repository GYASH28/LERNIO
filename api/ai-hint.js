function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function readBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch (_) {
            return {};
        }
    }

    return new Promise(resolve => {
        let raw = '';
        req.on('data', chunk => {
            raw += chunk;
            if (raw.length > 30000) req.destroy();
        });
        req.on('end', () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch (_) {
                resolve({});
            }
        });
        req.on('error', () => resolve({}));
    });
}

function pickString(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function extractText(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
        for (const item of value) {
            const text = extractText(item);
            if (text) return text;
        }
        return '';
    }
    if (typeof value === 'object') {
        const keys = ['hint', 'reply', 'response', 'text', 'message', 'output', 'answer', 'content'];
        for (const key of keys) {
            const text = extractText(value[key]);
            if (text) return text;
        }
        const nested = extractText(value.data || value.result || value.body || value.json);
        if (nested) return nested;
    }
    return '';
}

async function readUpstreamResponse(response) {
    const bodyText = await response.text();
    if (!bodyText) return { rawText: '', parsed: null, text: '' };

    try {
        const parsed = JSON.parse(bodyText);
        return { rawText: bodyText, parsed, text: extractText(parsed) };
    } catch (_) {
        return { rawText: bodyText, parsed: null, text: bodyText.trim() };
    }
}

function normalize(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function fallbackHint(payload) {
    const topic = pickString(payload.topic, 'this concept');
    return `Focus on the key idea behind ${topic}. Compare what the question is asking with each option, and eliminate choices that do not match the definition or rule.`;
}

function sanitizeHint(hint, payload) {
    const cleanHint = pickString(hint);
    if (!cleanHint) return '';

    const directRevealPatterns = [
        /\bthe\s+answer\s+is\b/i,
        /\bcorrect\s+(answer|option)\b/i,
        /\banswer\s*[:\-]\s*[a-d]\b/i,
        /\bcorrect\s+is\b/i,
        /\boption\s+[a-d]\b/i,
        /\b[a-d]\s+is\s+(correct|the\s+answer)\b/i,
        /\bchoose\s+[a-d]\b/i
    ];

    if (directRevealPatterns.some(pattern => pattern.test(cleanHint))) {
        return fallbackHint(payload);
    }

    const correctAnswer = payload.correctAnswer;
    const options = Array.isArray(payload.options) ? payload.options : [];
    let correctText = '';
    if (typeof correctAnswer === 'number' && options[correctAnswer]) {
        correctText = options[correctAnswer];
    } else if (typeof correctAnswer === 'string') {
        correctText = correctAnswer;
    }

    const normalizedHint = normalize(cleanHint);
    const normalizedAnswer = normalize(correctText);
    if (normalizedAnswer.length >= 4 && normalizedHint.includes(normalizedAnswer)) {
        return fallbackHint(payload);
    }

    return cleanHint;
}

export default async function handler(req, res) {
    setCors(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    const webhookUrl = process.env.N8N_HINT_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error('AI hint configuration error: N8N_HINT_WEBHOOK_URL is missing.');
        return res.status(503).json({ error: 'Could not fetch AI hint. Please try again.' });
    }

    const body = await readBody(req);
    const question = pickString(body.question);
    if (!question) {
        return res.status(400).json({ error: 'A quiz question is required.' });
    }

    const payload = {
        type: 'quiz_hint',
        subject: pickString(body.subject, 'General'),
        unit: pickString(body.unit, ''),
        topic: pickString(body.topic, ''),
        difficulty: pickString(body.difficulty, ''),
        mode: pickString(body.mode, 'practice'),
        question,
        options: Array.isArray(body.options) ? body.options.map(option => String(option || '')).slice(0, 8) : [],
        correctAnswer: body.correctAnswer,
        source: 'lernio-ai-web',
        instruction: 'Give a helpful hint only. Do not reveal the final answer. Do not mention the correct option letter. Keep it short and student-friendly.'
    };

    console.log('AI hint request payload:', {
        subject: payload.subject,
        unit: payload.unit,
        topic: payload.topic,
        difficulty: payload.difficulty,
        mode: payload.mode,
        questionLength: question.length,
        optionCount: payload.options.length
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000);

    try {
        const upstream = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        const upstreamBody = await readUpstreamResponse(upstream);
        console.log('AI hint upstream status:', upstream.status);

        if (!upstream.ok) {
            console.error('AI hint upstream failed:', {
                status: upstream.status,
                body: upstreamBody.rawText.slice(0, 2000)
            });
            return res.status(502).json({ error: 'Could not fetch AI hint. Please try again.' });
        }

        const hint = sanitizeHint(upstreamBody.text, payload);
        if (!hint) {
            console.error('AI hint upstream returned no valid text:', upstreamBody.rawText.slice(0, 2000));
            return res.status(502).json({ error: 'Sorry, I could not generate a hint right now. Try again.' });
        }

        return res.status(200).json({ hint });
    } catch (error) {
        const timedOut = error?.name === 'AbortError';
        console.error('AI hint request failed:', timedOut ? 'timeout' : (error?.message || error));
        return res.status(timedOut ? 504 : 503).json({ error: 'Could not fetch AI hint. Please try again.' });
    } finally {
        clearTimeout(timeoutId);
    }
}
