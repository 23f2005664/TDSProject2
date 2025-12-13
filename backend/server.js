import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import { QuizSolver } from './lib/quizSolver.js';
import { AVAILABLE_MODELS, getRateLimitStatus, FALLBACK_CHAIN, setApiKeyIndex, getApiKeyInfo } from './lib/llmClient.js';
import { cleanupTempFiles } from './lib/fileHandler.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Logger
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] [Server] ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
}

// Middleware
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));

// Custom JSON parsing middleware with error handling for 400 status
app.use((req, res, next) => {
    if (req.method === 'POST' && req.headers['content-type']?.includes('application/json')) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            if (!body) {
                req.body = {};
                return next();
            }
            try {
                req.body = JSON.parse(body);
                next();
            } catch (err) {
                log('warning', 'Invalid JSON received');
                return res.status(400).json({ error: 'Invalid JSON format' });
            }
        });
    } else {
        next();
    }
});

// Request logging
app.use((req, res, next) => {
    log('info', `${req.method} ${req.path}`);
    next();
});

// Store active sessions
const sessions = new Map();
const wsClients = new Map();

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// WebSocket handling
wss.on('connection', (ws) => {
    const clientId = uuidv4();
    wsClients.set(clientId, ws);
    log('info', `WebSocket connected: ${clientId}`);

    ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        models: AVAILABLE_MODELS,
        fallbackChain: FALLBACK_CHAIN,
        rateLimits: getRateLimitStatus()
    }));

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            await handleWebSocketMessage(clientId, ws, data);
        } catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    });

    ws.on('close', () => {
        log('info', `WebSocket disconnected: ${clientId}`);
        wsClients.delete(clientId);
        const session = sessions.get(clientId);
        if (session?.solver) session.solver.stop();
        sessions.delete(clientId);
    });
});

async function handleWebSocketMessage(clientId, ws, data) {
    const { action } = data;
    log('info', `Action: ${action}`, { clientId });


    switch (action) {
        case 'start': await handleStart(clientId, ws, data); break;
        case 'stop': handleStop(clientId, ws); break;
        case 'pause': handlePause(clientId, ws); break;
        case 'resume': handleResume(clientId, ws); break;
        case 'submit_manual': handleManualSubmit(clientId, ws, data); break;
        case 'edit_payload': handleEditPayload(clientId, ws, data); break;
        case 'change_model': handleModelChange(clientId, ws, data); break;
        case 'change_api_key': handleApiKeyChange(clientId, ws, data); break;
        case 'get_rate_limits': ws.send(JSON.stringify({ type: 'rate_limits', rateLimits: getRateLimitStatus() })); break;
        case 'get_api_key_info': ws.send(JSON.stringify({ type: 'api_key_info', ...getApiKeyInfo() })); break;
        default: ws.send(JSON.stringify({ type: 'error', message: `Unknown action: ${action}` }));
    }

}

async function handleStart(clientId, ws, data) {
    const { email, secret, url, model } = data;

    if (!email || !url) {
        ws.send(JSON.stringify({ type: 'error', message: 'Email and URL required' }));
        return;
    }

    // SECURITY: Validate secret key
    const REQUIRED_SECRET = '123';  // TODO: Move to environment variable
    if (secret !== REQUIRED_SECRET) {
        log('warning', `Unauthorized access attempt from ${email} with wrong secret`);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid secret key'
        }));
        return;
    }

    log('info', `Starting quiz for ${email}`, { url, model });

    const solver = new QuizSolver({
        email,
        model: model || 'google/gemini-2.0-flash-exp:free',
        onLog: (e) => { try { ws.send(JSON.stringify({ type: 'log', log: e })); } catch { } },
        onUpdate: (u) => {
            try {
                ws.send(JSON.stringify({ type: 'update', update: u }));
                if (u.type === 'all_models_rate_limited') {
                    ws.send(JSON.stringify({ type: 'request_model_selection', models: AVAILABLE_MODELS }));
                }
            } catch { }
        }
    });

    sessions.set(clientId, { solver, email });
    ws.send(JSON.stringify({ type: 'started', message: 'Started' }));

    try {
        const result = await solver.solveQuiz(url);
        ws.send(JSON.stringify({ type: 'complete', result }));
    } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
    } finally {
        cleanupTempFiles();
    }
}

function handleStop(clientId, ws) {
    const session = sessions.get(clientId);
    if (session?.solver) {
        session.solver.stop();
        ws.send(JSON.stringify({ type: 'stopped' }));
    }
}

function handlePause(clientId, ws) {
    const session = sessions.get(clientId);
    if (session?.solver) {
        session.solver.pause();
        ws.send(JSON.stringify({ type: 'paused' }));
    }
}

function handleResume(clientId, ws) {
    const session = sessions.get(clientId);
    if (session?.solver) {
        session.solver.resume();
        ws.send(JSON.stringify({ type: 'resumed' }));
    }
}

function handleManualSubmit(clientId, ws, data) {
    const session = sessions.get(clientId);
    if (session?.solver) {
        session.solver.setManualAnswer(data.answer);
        session.solver.resume();
        ws.send(JSON.stringify({ type: 'manual_submitted', answer: data.answer }));
    }
}

function handleEditPayload(clientId, ws, data) {
    const session = sessions.get(clientId);
    if (session?.solver) {
        session.solver.setManualPayload(data.payload);
        session.solver.resume();
        ws.send(JSON.stringify({ type: 'payload_submitted', payload: data.payload }));
    }
}

function handleModelChange(clientId, ws, data) {
    const session = sessions.get(clientId);
    if (!session?.solver) {
        ws.send(JSON.stringify({ type: 'error', message: 'No active session' }));
        return;
    }

    session.solver.setModel(data.model);
    ws.send(JSON.stringify({ type: 'model_changed', model: data.model }));
}

function handleApiKeyChange(clientId, ws, data) {
    try {
        const keyIndex = parseInt(data.keyIndex) - 1; // Frontend sends 1-4, backend uses 0-3
        const result = setApiKeyIndex(keyIndex);
        ws.send(JSON.stringify({ type: 'api_key_changed', ...result }));
        log('info', `API Key switched to ${result.keyIndex}/${result.totalKeys}`);
    } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
}

// REST API Endpoints

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get models
app.get('/api/models', (req, res) => {
    res.json({ models: AVAILABLE_MODELS, fallbackChain: FALLBACK_CHAIN, rateLimits: getRateLimitStatus() });
});

// Main quiz endpoint with proper status codes
app.post('/api/quiz', (req, res) => {
    const { email, secret, url } = req.body || {};

    // Check for required fields - 400 Bad Request
    if (!email || !url) {
        log('warning', 'Missing required fields');
        return res.status(400).json({ error: 'Missing required fields: email and url' });
    }

    // Check secret - 403 Forbidden
    if (secret !== '123') {
        log('warning', 'Invalid secret');
        return res.status(403).json({ error: 'Invalid secret' });
    }

    log('info', `Quiz request from ${email}`, { url });

    // 200 OK - Request accepted
    res.status(200).json({
        status: 'accepted',
        message: 'Quiz solving started',
        timestamp: new Date().toISOString()
    });

    // Solve in background
    const solver = new QuizSolver({
        email,
        model: 'google/gemini-2.0-flash-exp:free',
        onLog: (e) => log(e.type, e.message),
        onUpdate: () => { }
    });

    solver.solveQuiz(url).finally(() => cleanupTempFiles());
});

// Error handling
app.use((err, req, res, next) => {
    log('error', 'Error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
async function shutdown() {
    log('info', 'Shutting down...');
    for (const [, session] of sessions) {
        if (session.solver) session.solver.stop();
    }
    cleanupTempFiles();
    for (const [, ws] of wsClients) ws.close();
    server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start
server.listen(PORT, () => {
    log('info', `🚀 Server: http://localhost:${PORT}`);
    log('info', `📡 WebSocket: ws://localhost:${PORT}`);
    log('info', `Endpoints: /health, /api/models, /api/quiz`);
    log('info', `Status codes: 200 (valid), 400 (invalid JSON), 403 (invalid secret)`);
});
