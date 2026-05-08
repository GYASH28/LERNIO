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
            if (raw.length > 20000) req.destroy();
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
        const keys = ['reply', 'response', 'text', 'message', 'output', 'answer', 'content'];
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

export default async function handler(req, res) {
    setCors(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    const webhookUrl = process.env.N8N_CHAT_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error('AI chat configuration error: N8N_CHAT_WEBHOOK_URL is missing.');
        return res.status(503).json({
            error: 'AI Tutor is temporarily unavailable. Please try again in a few seconds.'
        });
    }

    const body = await readBody(req);
    const message = pickString(body.message || body.prompt || body.chatInput);
    if (!message) {
        return res.status(400).json({ error: 'Please enter a message before sending.' });
    }
    if (message.length > 8000) {
        return res.status(413).json({ error: 'Please shorten your message and try again.' });
    }

    const payload = {
        action: 'sendMessage',
        sessionId: pickString(body.sessionId, `session-${Date.now()}`),
        chatInput: message,
        message,
        prompt: message,
        subject: pickString(body.subject, 'General'),
        subjectCode: pickString(body.subjectCode, 'GENERAL'),
        semester: pickString(body.semester, 'Semester 2'),
        mode: pickString(body.mode, 'Explain Simply'),
        userId: pickString(body.userId, 'anonymous'),
        source: pickString(body.source, 'lernio-ai-web'),
        context: {
            ...(body.context && typeof body.context === 'object' ? body.context : {}),
            subjectCode: pickString(body.subjectCode, 'GENERAL'),
            subjectName: pickString(body.subject, 'General'),
            subjectContext: pickString(body.context?.subjectContext || body.subjectContext, 'general studies'),
            page: pickString(body.page || body.context?.page, 'chat'),
            source: 'lernio-ai-web'
        }
    };

    console.log('AI chat request payload:', {
        sessionId: payload.sessionId,
        subject: payload.subject,
        semester: payload.semester,
        mode: payload.mode,
        source: payload.source,
        messageLength: message.length
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
        console.log('AI chat upstream status:', upstream.status);

        if (!upstream.ok) {
            console.error('AI chat upstream failed:', {
                status: upstream.status,
                body: upstreamBody.rawText.slice(0, 2000)
            });
            return res.status(502).json({
                error: 'AI Tutor is temporarily unavailable. Please try again in a few seconds.'
            });
        }

        if (!upstreamBody.text) {
            console.error('AI chat upstream returned no valid text:', upstreamBody.rawText.slice(0, 2000));
            return res.status(502).json({
                error: 'AI Tutor is temporarily unavailable. Please try again in a few seconds.'
            });
        }

        return res.status(200).json({ reply: upstreamBody.text });
    } catch (error) {
        const timedOut = error?.name === 'AbortError';
        console.error('AI chat request failed:', timedOut ? 'timeout' : (error?.message || error));
        return res.status(timedOut ? 504 : 503).json({
            error: 'AI Tutor is temporarily unavailable. Please try again in a few seconds.'
        });
    } finally {
        clearTimeout(timeoutId);
    }
}
