require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-learning-platform';

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '/')));

// --- Simple File-Based DB Setup ---
const DB_FILE = path.join(__dirname, 'db.json');
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], progress: {} }));
}

function getDB() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}
function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// --- Firebase Admin Setup ---
const admin = require('firebase-admin');

// serviceAccountKey.json must NEVER be committed. 
// Generate a new one from Firebase Console > Project Settings > 
// Service Accounts and store it locally only, outside the repo,
// or use environment variables.
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
        });
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            })
        });
    } else {
        const serviceAccount = require('./serviceAccountKey.json');
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    console.log("Firebase Admin initialized.");
} catch (e) {
    console.warn("Firebase Admin is not configured. Authenticated local API endpoints will return an error.");
}

// --- Auth Middleware ---
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token == null) return res.status(401).json({ error: 'No token provided' });

    try {
        if (!admin.apps.length) throw new Error('Firebase Admin not configured');
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = { id: decodedToken.uid, email: decodedToken.email };
        next();
    } catch (error) {
        console.error("Token verification failed:", error.message);
        return res.status(403).json({ error: 'Unauthorized: Invalid or expired token' });
    }
}

// Auth routes (Login/Register/Me) are now handled securely by Firebase Auth on the frontend.
// We no longer need the custom /api/auth/* endpoints, as the client handles sessions natively.

// --- User Progress Routes ---
app.get('/api/progress', authenticateToken, (req, res) => {
    const db = getDB();
    const progress = db.progress[req.user.id] || { xp: 0, level: 1, streak: 0, lastQuizScore: 0, recentActivity: [] };
    res.json(progress);
});

app.post('/api/progress', authenticateToken, (req, res) => {
    const db = getDB();
    db.progress[req.user.id] = req.body;
    saveDB(db);
    res.json({ message: 'Progress saved' });
});

// --- AI Routes (Requires Auth) ---
app.post('/api/ai/chat', authenticateToken, async (req, res) => {
    const { prompt } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Gemini API key not configured on server' });

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        const text = data.candidates[0].content.parts[0].text;
        res.json({ reply: text });
    } catch (err) {
        console.error("AI Error:", err);
        res.status(500).json({ error: 'Failed to communicate with AI' });
    }
});

// --- Config Route (Frontend Env Variables) ---
app.get('/api/config', (req, res) => {
    res.json({
        AI_CHAT_API: '/api/chat',
        AI_HINT_API: '/api/ai-hint'
    });
});

async function invokeVercelFunction(modulePath, req, res) {
    try {
        let loaded;
        try {
            loaded = require(modulePath);
        } catch (error) {
            loaded = await import(pathToFileURL(path.join(__dirname, modulePath)).href);
        }
        const handler = loaded.default || loaded;
        return handler(req, res);
    } catch (error) {
        console.error(`Local API failed for ${req.path}:`, error.message || error);
        return res.status(503).json({ error: 'Local API endpoint is temporarily unavailable.' });
    }
}

app.all('/api/drive-notes', (req, res) => {
    invokeVercelFunction('./api/drive-notes.js', req, res);
});

app.all('/api/drive-file', (req, res) => {
    invokeVercelFunction('./api/drive-file.js', req, res);
});

app.all('/api/chat', (req, res) => {
    invokeVercelFunction('./api/chat.js', req, res);
});

app.all('/api/ai-hint', (req, res) => {
    invokeVercelFunction('./api/ai-hint.js', req, res);
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
