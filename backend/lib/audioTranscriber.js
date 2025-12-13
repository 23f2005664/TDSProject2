import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const PYTHON_API_URL = 'http://127.0.0.1:8765';

// Logger
function log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] [AudioTranscriber] ${message}`);
}

/**
 * Check if Python transcription API is available
 */
export async function isTranscriptionAvailable() {
    try {
        const response = await axios.get(`${PYTHON_API_URL}/health`, { timeout: 2000 });
        return response.data.model_loaded === true;
    } catch {
        return false;
    }
}

/**
 * Transcribe audio file to text using Python Whisper API
 * @param {Buffer|string} audioBufferOrPath - Audio file buffer or path
 * @param {string} filename - Name of the file (for logging)
 * @returns {Promise<string>} - Transcribed text
 */
export async function transcribeAudio(audioBufferOrPath, filename = 'audio') {
    log('info', `Transcribing ${filename} via Python API...`);

    try {
        // Check if API is available
        const available = await isTranscriptionAvailable();
        if (!available) {
            throw new Error('Python transcription API not available. Start it with: python PythonAPI/main.py');
        }

        const form = new FormData();

        // Handle both buffer and file path
        if (Buffer.isBuffer(audioBufferOrPath)) {
            form.append('file', audioBufferOrPath, filename);
        } else if (typeof audioBufferOrPath === 'string') {
            form.append('file', fs.createReadStream(audioBufferOrPath));
        } else {
            throw new Error('Invalid audio input - must be Buffer or file path');
        }

        const startTime = Date.now();

        const response = await axios.post(`${PYTHON_API_URL}/transcribe`, form, {
            headers: form.getHeaders(),
            timeout: 60000, // 60s timeout for transcription
            maxBodyLength: 50 * 1024 * 1024, // 50MB max
        });

        const elapsed = Date.now() - startTime;
        const { transcription, language, duration } = response.data;

        log('info', `Transcription complete in ${elapsed}ms (${language}, ${duration.toFixed(1)}s audio): "${transcription.substring(0, 100)}${transcription.length > 100 ? '...' : ''}"`);

        return transcription;

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            log('error', 'Python API not running! Start it with: python PythonAPI/main.py');
            throw new Error('Transcription API not running');
        }

        log('error', `Transcription failed for ${filename}: ${error.message}`);
        throw error;
    }
}
