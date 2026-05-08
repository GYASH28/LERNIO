// Public runtime configuration for the frontend.
export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed. Use GET.' });

    res.status(200).json({
        AI_CHAT_API: '/api/chat',
        AI_HINT_API: '/api/ai-hint'
    });
}
