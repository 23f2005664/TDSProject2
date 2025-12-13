import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Execute Python code and return the output
 * @param {string} code - Python code to execute
 * @param {Object} options - Execution options
 * @returns {Promise<string>} - Output from Python
 */
export async function executePythonCode(code, options = {}) {
    const { timeout = 30000, workingDir = process.cwd() } = options;

    return new Promise((resolve, reject) => {
        const tempFile = path.join(workingDir, `temp_${Date.now()}.py`);

        try {
            // Write code to temporary file
            fs.writeFileSync(tempFile, code);

            // Execute Python
            const python = spawn('python', [tempFile], {
                cwd: workingDir,
                timeout
            });

            let stdout = '';
            let stderr = '';

            python.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            python.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            python.on('close', (code) => {
                // Clean up temp file
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {
                    console.warn('Failed to delete temp file:', e.message);
                }

                if (code === 0) {
                    resolve(stdout.trim());
                } else {
                    reject(new Error(`Python execution failed:\n${stderr}`));
                }
            });

            python.on('error', (error) => {
                // Clean up temp file
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {
                    console.warn('Failed to delete temp file:', e.message);
                }
                reject(new Error(`Failed to spawn Python: ${error.message}`));
            });

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Validate Python code for safety (basic checks)
 * @param {string} code - Python code to validate
 * @returns {Object} - { safe: boolean, reason: string }
 */
export function validatePythonCode(code) {
    const dangerousPatterns = [
        /import\s+os/i,
        /import\s+subprocess/i,
        /import\s+sys/i,
        /__import__/i,
        /exec\s*\(/i,
        /eval\s*\(/i,
        /open\s*\(/i,  // Allow file reading but flag for review
        /\.read\s*\(/i,
        /\.write\s*\(/i,
        /\.delete/i,
        /\.remove/i,
        /\.unlink/i
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(code)) {
            return {
                safe: false,
                reason: `Potentially dangerous pattern detected: ${pattern.source}`
            };
        }
    }

    return { safe: true, reason: 'Code appears safe' };
}
