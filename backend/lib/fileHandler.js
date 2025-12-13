import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import { transcribeAudio } from './audioTranscriber.js';
import AdmZip from 'adm-zip';

const TEMP_DIR = path.join(process.cwd(), 'temp');
const LOGS_DIR = path.join(process.cwd(), 'logs');

// Ensure directories exist
[TEMP_DIR, LOGS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Logger helper
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] [${level.toUpperCase()}] [FileHandler] ${message}`;
    console.log(logMsg);
    if (data) console.log(JSON.stringify(data, null, 2));
}

// Create session log file
export function createSessionLog(sessionId) {
    const logPath = path.join(LOGS_DIR, `session_${sessionId}_${Date.now()}.log`);
    return logPath;
}

// Append to log file
export function appendToLog(logPath, entry) {
    try {
        const line = `[${new Date().toISOString()}] ${JSON.stringify(entry)}\n`;
        fs.appendFileSync(logPath, line);
    } catch (error) {
        console.error('Failed to write to log:', error.message);
    }
}

// Detect if URL is a downloadable file or a webpage
export function isDownloadableFile(url) {
    const downloadableExtensions = [
        '.pdf', '.csv', '.json', '.txt', '.xml', '.xlsx', '.xls',
        '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
        '.mp3', '.wav', '.ogg', '.opus', '.m4a',
        '.mp4', '.webm', '.zip', '.tar', '.gz'
    ];

    const urlLower = url.toLowerCase();
    return downloadableExtensions.some(ext => urlLower.includes(ext));
}

export async function downloadFile(url, options = {}) {
    const { filename = null, timeout = 120000 } = options;

    log('info', `Downloading file: ${url}`);

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout,
            maxContentLength: 50 * 1024 * 1024,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*'
            }
        });

        // Determine filename
        const contentDisposition = response.headers['content-disposition'];
        let finalFilename = filename;

        if (!finalFilename && contentDisposition) {
            const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (match) finalFilename = match[1].replace(/['"]/g, '');
        }

        if (!finalFilename) {
            const urlPath = new URL(url).pathname;
            finalFilename = path.basename(urlPath) || `file_${uuidv4()}`;
        }

        const filePath = path.join(TEMP_DIR, `${uuidv4()}_${finalFilename}`);
        fs.writeFileSync(filePath, Buffer.from(response.data));

        const contentType = response.headers['content-type'] || '';

        log('info', `File downloaded: ${finalFilename} (${response.data.byteLength} bytes)`);

        return {
            path: filePath,
            filename: finalFilename,
            contentType,
            size: response.data.byteLength,
            buffer: Buffer.from(response.data)
        };
    } catch (error) {
        log('error', `File download failed: ${url}`, { error: error.message });
        throw new Error(`Failed to download file from ${url}: ${error.message}`);
    }
}

// Fetch webpage content (for JSON pages that aren't downloadable)
export async function fetchWebContent(url) {
    log('info', `Fetching web content: ${url}`);

    try {
        const response = await axios.get(url, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        const contentType = response.headers['content-type'] || '';
        const data = response.data;

        // If it's JSON, parse it
        if (contentType.includes('json') || typeof data === 'object') {
            return {
                type: 'json',
                data: typeof data === 'string' ? JSON.parse(data) : data,
                text: JSON.stringify(data, null, 2)
            };
        }

        // If it's text/html
        return {
            type: 'text',
            data: data,
            text: typeof data === 'string' ? data : JSON.stringify(data)
        };

    } catch (error) {
        log('error', `Failed to fetch web content: ${url}`, { error: error.message });
        return null;
    }
}

export async function extractPdfText(filePathOrBuffer) {
    log('info', 'Extracting text from PDF...');

    try {
        let buffer;
        if (Buffer.isBuffer(filePathOrBuffer)) {
            buffer = filePathOrBuffer;
        } else {
            buffer = fs.readFileSync(filePathOrBuffer);
        }

        const data = await pdfParse(buffer);

        log('info', `PDF extracted: ${data.numpages} pages, ${data.text.length} characters`);

        return {
            text: data.text,
            numPages: data.numpages,
            info: data.info
        };
    } catch (error) {
        log('error', 'PDF extraction failed', { error: error.message });
        throw new Error(`Failed to extract PDF text: ${error.message}`);
    }
}

export function fileToBase64(filePath) {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.opus': 'audio/opus',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.csv': 'text/csv',
        '.json': 'application/json',
        '.txt': 'text/plain'
    };

    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export function getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    const typeMap = {
        '.pdf': 'pdf',
        '.png': 'image',
        '.jpg': 'image',
        '.jpeg': 'image',
        '.gif': 'image',
        '.webp': 'image',
        '.svg': 'image',
        '.mp3': 'audio',
        '.wav': 'audio',
        '.ogg': 'audio',
        '.opus': 'audio',
        '.flac': 'audio',
        '.m4a': 'audio',
        '.mp4': 'video',
        '.webm': 'video',
        '.csv': 'csv',
        '.json': 'json',
        '.txt': 'text',
        '.html': 'html',
        '.xml': 'xml',
        '.xlsx': 'excel',
        '.xls': 'excel',
        '.zip': 'archive'
    };

    return typeMap[ext] || 'unknown';
}

export function cleanupTempFiles() {
    try {
        const files = fs.readdirSync(TEMP_DIR);
        let cleaned = 0;
        for (const file of files) {
            fs.unlinkSync(path.join(TEMP_DIR, file));
            cleaned++;
        }
        log('info', `Cleaned up ${cleaned} temp files`);
    } catch (error) {
        log('error', 'Cleanup error', { error: error.message });
    }
}

export async function processFile(url) {
    log('info', `Processing file: ${url}`);

    const file = await downloadFile(url);
    const fileType = getFileType(file.path);

    let extractedContent = null;

    try {
        log('debug', `File type detected: ${fileType} for ${file.filename}`);
        switch (fileType) {
            case 'pdf':
                const pdfData = await extractPdfText(file.buffer);
                extractedContent = {
                    text: pdfData.text,
                    numPages: pdfData.numPages,
                    type: 'pdf'
                };
                break;

            case 'image':
                extractedContent = {
                    base64: fileToBase64(file.path),
                    type: 'image',
                    filename: file.filename
                };
                break;

            case 'audio':
                log('info', 'Transcribing audio file...');
                try {
                    const transcription = await transcribeAudio(file.buffer, file.filename);
                    extractedContent = {
                        text: transcription,  // Transcribed text for LLM
                        base64: fileToBase64(file.path),  // Also send raw audio
                        type: 'audio',
                        filename: file.filename,
                        transcribed: true
                    };
                    log('info', `Audio transcribed: "${transcription.substring(0, 100)}..."`);
                } catch (transcribeError) {
                    log('error', `Transcription failed: ${transcribeError.message}`);
                    log('error', `Stack: ${transcribeError.stack}`);
                    extractedContent = {
                        base64: fileToBase64(file.path),
                        type: 'audio',
                        filename: file.filename,
                        transcribed: false,
                        error: transcribeError.message
                    };
                }
                break;

            case 'csv':
                const csvText = fs.readFileSync(file.path, 'utf-8');
                extractedContent = {
                    text: csvText,
                    type: 'csv',
                    rows: csvText.split('\n').length
                };
                break;

            case 'json':
                const jsonText = fs.readFileSync(file.path, 'utf-8');
                try {
                    extractedContent = {
                        text: jsonText,
                        data: JSON.parse(jsonText),
                        type: 'json'
                    };
                } catch {
                    extractedContent = { text: jsonText, type: 'json' };
                }
                break;

            case 'text':
            case 'html':
            case 'xml':
                extractedContent = {
                    text: fs.readFileSync(file.path, 'utf-8'),
                    type: fileType
                };
                break;

            case 'archive':
                log('info', 'Extracting ZIP archive...');
                try {
                    const zip = new AdmZip(file.path);
                    const zipEntries = zip.getEntries();
                    let extractedText = '';

                    for (const entry of zipEntries) {
                        if (!entry.isDirectory) {
                            const entryName = entry.entryName;
                            const ext = path.extname(entryName).toLowerCase();

                            // Extract text-based files
                            if (['.txt', '.md', '.log', '.csv', '.json', '.xml', '.sql'].includes(ext)) {
                                try {
                                    const content = entry.getData().toString('utf8');
                                    extractedText += `\n\n=== ${entryName} ===\n${content.substring(0, 10000)}\n`;
                                } catch (e) {
                                    log('warning', `Failed to extract ${entryName}: ${e.message}`);
                                }
                            }
                        }
                    }

                    extractedContent = {
                        text: extractedText,
                        type: 'archive',
                        filesCount: zipEntries.length
                    };
                    log('info', `Extracted ${zipEntries.length} files from ZIP`);
                } catch (zipError) {
                    log('error', `ZIP extraction failed: ${zipError.message}`);
                    extractedContent = {
                        type: 'archive',
                        error: zipError.message
                    };
                }
                break;

            default:
                extractedContent = {
                    base64: fileToBase64(file.path),
                    type: 'binary',
                    filename: file.filename
                };
        }

        log('info', `File processed: ${file.filename} (type: ${fileType})`);

    } catch (error) {
        log('error', `Error processing file content: ${error.message}`);
        extractedContent = { error: error.message, type: 'error' };
    }

    return {
        ...file,
        fileType,
        extractedContent
    };
}

// Process URL - handles both downloadable files and web pages
export async function processUrl(url) {
    log('info', `Processing URL: ${url}`);

    if (isDownloadableFile(url)) {
        // It's a file - download and process
        return await processFile(url);
    } else {
        // It might be a webpage with JSON or text content
        const webContent = await fetchWebContent(url);
        if (webContent) {
            return {
                url,
                filename: url.split('/').pop(),
                fileType: webContent.type,
                extractedContent: webContent
            };
        }

        // If direct fetch failed, try as file anyway
        try {
            return await processFile(url);
        } catch {
            return null;
        }
    }
}
