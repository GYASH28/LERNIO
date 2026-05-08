// Optional Gemini proxy. The main frontend chat uses /api/chat.
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'AI service is not configured.' });
    }

    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt) {
        return res.status(400).json({ error: 'Request body must include a non-empty prompt.' });
    }
    if (prompt.length > 8000) {
        return res.status(413).json({ error: 'Prompt is too long. Please shorten it.' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        const geminiEndpoint =
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const geminiResponse = await fetch(geminiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024,
                    topP: 0.95
                }
            }),
            signal: controller.signal
        });

        if (!geminiResponse.ok) {
            return res.status(geminiResponse.status).json({
                error: geminiResponse.status === 429
                    ? 'AI rate limit reached. Please wait a moment and try again.'
                    : 'AI service returned an error. Please try again.'
            });
        }

        const geminiData = await geminiResponse.json();
        const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        return res.status(200).json({
            reply: reply || "I didn't get a response from the AI. Please try again."
        });
    } catch (error) {
        const message = error.name === 'AbortError'
            ? 'AI request timed out. Please try again.'
            : 'AI service is temporarily unavailable.';
        return res.status(503).json({ error: message });
    } finally {
        clearTimeout(timeoutId);
    }
}
