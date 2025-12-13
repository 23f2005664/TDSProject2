import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { parseQuizPage, buildPrompt, extractAnswerType } from './questionParser.js';
import { processFile, processUrl, cleanupTempFiles, createSessionLog, appendToLog } from './fileHandler.js';
import { callLLMWithFallback, raceLLMs } from './llmClient.js';
import { renderPage } from './browserManager.js';

// Constants
const RETRY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const RETRY_DELAY_MS = 2000; // 2 seconds between retries
const TEMP_DIR = path.join(process.cwd(), 'temp');
const LOGS_DIR = path.join(process.cwd(), 'logs');

// Utility to get IST timestamp
function getISTTimestamp() {
    return new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).replace(/(\d+)\/(\d+)\/(\d+),\s(.+)/, '$3-$2-$1T$4+05:30');
}

// Logger helper
function log(type, message, data = null) {
    const timestamp = getISTTimestamp();
    const logMsg = `[${timestamp}] [${type.toUpperCase()}] [QuizSolver] ${message}`;
    console.log(logMsg);
    if (data) console.log(JSON.stringify(data, null, 2));
}

export class QuizSolver {
    constructor(options = {}) {
        const timestamp = Date.now();
        this.sessionId = `${timestamp}_session_${timestamp}`; // Timestamp first for sorting
        this.email = options.email;
        this.secret = '123'; // Always use 123 as secret
        this.model = options.model || 'google/gemini-2.0-flash-exp:free';
        this.onLog = options.onLog || ((entry) => log(entry.type, entry.message, entry.data));
        this.onUpdate = options.onUpdate || (() => { });
        this.isPaused = false;
        this.isStopped = false;
        this.currentQuiz = null;
        this.manualAnswer = null;
        this.useManualAnswer = false; // Flag to use manual answer instead of LLM
        this.sessionLogPath = null;
        this.allModelsRateLimited = false;
    }

    logEntry(type, message, data = null) {
        const entry = {
            timestamp: getISTTimestamp(),
            type,
            message,
            data
        };
        this.onLog(entry);
        log(type, message, data);

        // Also log to file
        if (this.sessionLogPath) {
            appendToLog(this.sessionLogPath, entry);
        }

        return entry;
    }

    pause() {
        this.isPaused = true;
        this.logEntry('info', 'Quiz solving paused - waiting for manual input');
    }

    resume() {
        this.isPaused = false;
        // Don't clear manual answer here - it will be used in next submission
        this.logEntry('info', 'Quiz solving resumed');
    }

    stop() {
        this.isStopped = true;
        this.logEntry('info', 'Quiz solving stopped');
        cleanupTempFiles();
    }

    setManualAnswer(answer) {
        this.manualAnswer = answer;
        this.useManualAnswer = true; // Flag to ignore LLM result
        this.logEntry('info', `Manual answer set: ${JSON.stringify(answer)}`);
    }

    setManualPayload(payload) {
        this.manualPayload = payload;
        this.logEntry('info', `Manual payload set`);
    }

    setModel(model) {
        this.model = model;
        this.allModelsRateLimited = false;
        this.logEntry('info', `Model changed to: ${model}`);
    }

    async solveQuiz(quizUrl) {
        if (this.isStopped) {
            this.logEntry('error', 'Solver is stopped');
            return { success: false, error: 'Solver stopped' };
        }

        // Create session log
        if (!this.sessionLogPath) {
            this.sessionLogPath = createSessionLog(Date.now().toString());
            this.logEntry('info', `Session log: ${this.sessionLogPath}`);
        }

        this.currentQuiz = {
            url: quizUrl,
            status: 'processing',
            startTime: Date.now(),
            retryStartTime: Date.now()
        };
        this.onUpdate({ type: 'quiz_started', url: quizUrl });

        try {
            // Step 1: Parse the quiz page
            this.logEntry('info', `Fetching quiz page: ${quizUrl}`);

            let quizData;
            try {
                quizData = await parseQuizPage(quizUrl);
            } catch (error) {
                this.logEntry('error', `Failed to parse quiz page: ${error.message}`);
                throw error;
            }

            this.logEntry('question', 'Quiz content extracted', {
                textLength: quizData.text.length,
                submitUrl: quizData.submitUrl,
                fileLinks: quizData.fileLinks.length,
                imageUrls: quizData.imageUrls.length
            });

            // Start the 3-minute timer NOW (when question is received)
            const retryStartTime = Date.now();

            this.onUpdate({
                type: 'question_parsed',
                question: quizData.text,
                submitUrl: quizData.submitUrl,
                fileLinks: quizData.fileLinks
            });

            // Step 2: Download and process linked files
            const fileContents = [];
            const imageBase64s = [];

            for (const fileUrl of quizData.fileLinks) {
                if (this.isStopped) break;

                try {
                    this.logEntry('info', `Processing: ${fileUrl}`);
                    const file = await processUrl(fileUrl);

                    if (file) {
                        fileContents.push(file);

                        // Save file metadata to debug file
                        const fileLogPath = path.join(LOGS_DIR, `${this.sessionId}_file_${Date.now()}.json`);
                        try {
                            const hasTextContent = !!file.extractedContent?.text;
                            const hasImageContent = file.fileType === 'image' && !!file.extractedContent?.base64;
                            const hasContent = hasTextContent || hasImageContent;

                            fs.writeFileSync(fileLogPath, JSON.stringify({
                                timestamp: getISTTimestamp(),
                                url: fileUrl,
                                filename: file.filename,
                                path: file.path,
                                type: file.fileType,
                                size: file.size || 0,
                                hasContent,
                                hasBase64: !!file.extractedContent?.base64,
                                contentPreview: file.extractedContent?.text?.substring(0, 500) || null
                            }, null, 2));
                            this.logEntry('debug', `File metadata saved: ${fileLogPath}`);
                        } catch (e) { this.logEntry('warning', `Failed to save file metadata: ${e.message}`); }

                        // Notify frontend about downloaded file
                        this.onUpdate({
                            type: 'file_downloaded',
                            file: {
                                filename: file.filename,
                                path: file.path,
                                type: file.fileType,
                                url: fileUrl
                            }
                        });

                        if (file.fileType === 'image' && file.extractedContent?.base64) {
                            imageBase64s.push(file.extractedContent.base64);
                        }

                        this.logEntry('file', `Downloaded: ${file.filename || fileUrl}`, {
                            type: file.fileType,
                            path: file.path,
                            hasContent: !!file.extractedContent?.text || (file.fileType === 'image' && !!file.extractedContent?.base64)
                        });
                    }
                } catch (error) {
                    this.logEntry('warning', `Failed to process: ${fileUrl}`, { error: error.message });
                }
            }

            // Process images from the page
            for (const imgUrl of quizData.imageUrls.slice(0, 5)) {
                if (this.isStopped) break;

                try {
                    const file = await processUrl(imgUrl);
                    if (file?.fileType === 'image' && file.extractedContent?.base64) {
                        imageBase64s.push(file.extractedContent.base64);
                    }
                } catch (error) {
                    // Silently skip failed images
                }
            }

            // Check if paused - wait for manual answer
            if (this.isPaused) {
                this.logEntry('info', 'Waiting for manual answer...');
                this.onUpdate({ type: 'waiting_manual', question: quizData.text });

                while (this.isPaused && !this.isStopped && this.manualAnswer === null) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            // Retry loop with 3-minute timeout
            let latestNextUrl = null;
            let previousReasons = [];
            let attemptCount = 0;

            while (!this.isStopped) {
                attemptCount++;
                const elapsedMs = Date.now() - retryStartTime;
                const remainingMs = RETRY_TIMEOUT_MS - elapsedMs;

                this.logEntry('info', `Attempt ${attemptCount} (${Math.round(remainingMs / 1000)}s remaining)`);

                let answer;

                // Check for manual answer FIRST
                if (this.manualAnswer !== null) {
                    answer = this.manualAnswer;
                    this.manualAnswer = null;
                    this.logEntry('info', `Using manual answer: ${JSON.stringify(answer)}`);
                } else if (this.isPaused) {
                    // If paused, wait for manual answer before proceeding
                    this.logEntry('info', '⏸ Paused - waiting for manual answer...');
                    while (this.isPaused && !this.isStopped && this.manualAnswer === null) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    if (this.manualAnswer !== null) {
                        answer = this.manualAnswer;
                        this.manualAnswer = null;
                        this.logEntry('info', `Using manual answer: ${JSON.stringify(answer)}`);
                    } else {
                        continue; // Resume without answer - retry
                    }
                } else {
                    // Get answer from LLM
                    answer = await this.getAnswerFromLLM(quizData, fileContents, imageBase64s, previousReasons);

                    if (answer === null && this.allModelsRateLimited) {
                        this.logEntry('error', 'All models are rate limited. Please select a model manually.');
                        this.onUpdate({ type: 'all_models_rate_limited' });

                        // Wait for manual model selection or answer
                        while (this.allModelsRateLimited && !this.isStopped && this.manualAnswer === null) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            // Check if model was changed
                            if (this.model && !this.allModelsRateLimited) break;
                        }

                        if (this.manualAnswer !== null) {
                            answer = this.manualAnswer;
                            this.manualAnswer = null;
                        } else {
                            continue; // Retry with new model
                        }
                    }

                    if (answer === null) {
                        this.logEntry('error', 'Failed to get answer from LLM');
                        throw new Error('Failed to get answer from LLM');
                    }
                }

                // Safety check before logging
                if (answer === null || answer === undefined) {
                    this.logEntry('error', 'Answer is null/undefined - both Python and LLM failed');
                    continue; // Retry
                }

                this.logEntry('answer', `Answer: ${JSON.stringify(answer).substring(0, 200)}`);
                this.onUpdate({ type: 'answer_ready', answer });

                // Prepare the submission payload
                const payload = {
                    email: this.email,
                    secret: this.secret,
                    url: quizUrl,
                    answer
                };

                // Send payload for user review/editing
                this.onUpdate({
                    type: 'payload_ready',
                    payload,
                    submitUrl: quizData.submitUrl || 'No URL found - will use default'
                });

                // Wait if paused for payload editing
                while (this.isPaused && !this.isStopped && this.manualAnswer === null) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                // Use manual answer if set (ignore LLM result to avoid race condition)
                if (this.useManualAnswer && this.manualAnswer !== null) {
                    answer = this.manualAnswer;
                    this.logEntry('info', `Using manual answer: ${JSON.stringify(answer)}`);
                    // Reset flags so next attempt (if wrong) uses LLM normally
                    this.manualAnswer = null;
                    this.useManualAnswer = false;
                }

                // Check if payload was manually edited
                if (this.manualPayload) {
                    Object.assign(payload, this.manualPayload);
                    this.manualPayload = null;
                    this.logEntry('info', 'Using manually edited payload');
                }

                const result = await this.submitAnswer(quizData.submitUrl, quizUrl, answer, payload);

                if (result.correct) {
                    // Correct answer!
                    this.logEntry('success', 'Answer was correct!');

                    if (result.url) {
                        this.logEntry('info', `Next quiz: ${result.url}`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        return await this.solveQuiz(result.url);
                    } else {
                        this.logEntry('success', 'Quiz chain complete!');
                        return { success: true, complete: true };
                    }
                } else {
                    // Wrong answer
                    this.logEntry('error', `Wrong answer: ${result.reason || 'No reason given'}`);

                    // Store the reason for next attempt
                    if (result.reason && !previousReasons.includes(result.reason)) {
                        previousReasons.push(result.reason);
                    }

                    // Track the latest next URL
                    if (result.url) {
                        latestNextUrl = result.url;
                    }

                    // Check if we should continue retrying
                    const timeExceeded = Date.now() - retryStartTime >= RETRY_TIMEOUT_MS;

                    if (timeExceeded) {
                        this.logEntry('warning', '3-minute timeout reached');

                        if (latestNextUrl) {
                            this.logEntry('info', `Moving to next question: ${latestNextUrl}`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            return await this.solveQuiz(latestNextUrl);
                        } else {
                            // No next URL - keep retrying
                            this.logEntry('warning', 'No next URL available, continuing to retry...');
                        }
                    }

                    // Wait before next retry
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                }
            }

            return { success: false, error: 'Solver stopped' };

        } catch (error) {
            this.logEntry('error', `Quiz solving error: ${error.message}`, {
                stack: error.stack,
                url: quizUrl
            });
            this.onUpdate({ type: 'error', error: error.message });
            return { success: false, error: error.message };
        }
    }

    async getAnswerFromLLM(quizData, fileContents, imageBase64s, previousReasons = []) {
        // Build the prompt
        let prompt = `You are solving a data analysis quiz. Read the question carefully and provide ONLY the exact answer required.\n\n`;
        prompt += `=== QUESTION ===\n${quizData.text}\n\n`;

        // Add user email for personalized questions
        prompt += `=== YOUR EMAIL (for personalized questions) ===\n${this.email}\n`;
        prompt += `EMAIL LENGTH: ${this.email.length} characters\n\n`;


        // Add file contents
    }


    async getAnswerFromLLM(quizData, fileContents, imageBase64s, previousReasons = []) {
        // Build the prompt
        let prompt = `You are solving a data analysis quiz. Read the question carefully and provide ONLY the exact answer required.\n\n`;
        prompt += `=== QUESTION ===\n${quizData.text}\n\n`;

        // Add user email for personalized questions
        prompt += `=== YOUR EMAIL (for personalized questions) ===\n${this.email}\n`;
        prompt += `EMAIL LENGTH: ${this.email.length} characters\n\n`;



        // Add file contents
        if (fileContents.length > 0) {
            prompt += `=== DATA FROM FILES ===\n`;

            for (const file of fileContents) {
                if (file.localPath) {
                    prompt += `File: ${file.localPath} (type: ${file.fileType})\n`;
                }
                if (file.extractedContent?.text && file.extractedContent.text.length < 2000) {
                    prompt += `Content preview:\n${file.extractedContent.text.substring(0, 500)}\n\n`;
                }
            }
        }

        // Add previous failures
        if (previousReasons.length > 0) {
            prompt += `=== PREVIOUS ATTEMPTS FAILED ===\n`;
            for (const reason of previousReasons) {
                prompt += `- ${reason}\n`;
            }
            prompt += `\n`;
        }

        prompt += `=== INSTRUCTIONS ===\n`;
        prompt += `1. CRITICAL: Use the EXACT file paths shown above - these are absolute Windows paths\n`;
        prompt += `2. Write Python code that reads the data files using those paths\n`;
        prompt += `3. Process/analyze the data as required by the question\n`;
        prompt += `4. Calculate the correct answer\n`;
        prompt += `5. Print ONLY the answer value (no JSON wrapper needed)\n`;
        prompt += `6. For dates in JSON arrays, use ISO 8601 format: "YYYY-MM-DDTHH:MM:SS"\n`;
        prompt += `7. Available libraries: pandas, PIL (Pillow), json, numpy\n`;
        prompt += `8. For JSON answers, use json.dumps() with sort_keys=True\n`;
        prompt += `9. DO NOT use '/project2/...' paths - use the full absolute paths shown above\n\n`;
        prompt += `Write the complete Python code now:`;

        const systemPrompt = `You are a Python expert. Generate clean, working Python code that solves the quiz question.
Output ONLY the Python code in a single code block. No explanations before or after.
The code must read files, process data, and print ONLY the answer value.`;

        this.logEntry('llm', 'Requesting Python code from LLM...', { promptLength: prompt.length });

        try {
            const response = await callLLMWithFallback(prompt, {
                model: this.model,
                systemPrompt,
                onModelSwitch: (newModel) => {
                    this.model = newModel;
                    this.logEntry('info', `Model changed to: ${newModel}`);
                },
                onAllRateLimited: () => {
                    this.logEntry('error', 'All models are rate limited. Please select a model manually.');
                    this.onUpdate({ type: 'all_rate_limited' });
                }
            });

            // Extract code from response (callLLMWithFallback returns {content, model})
            let code = response.content ? response.content.trim() : response.trim();

            // Remove markdown code blocks if present
            if (code.startsWith('```python')) {
                code = code.replace(/```python\n?/g, '').replace(/```\n?$/g, '');
            } else if (code.startsWith('```')) {
                code = code.replace(/```\n?/g, '');
            }

            this.logEntry('debug', 'Generated Python code', { codeLength: code.length });

            // Validate code safety
            const validation = validatePythonCode(code);
            if (!validation.safe) {
                this.logEntry('warning', `Code validation warning: ${validation.reason}`);
                // Still try to run, but log the warning
            }

            // Execute the code
            this.logEntry('info', 'Executing Python code...');
            const output = await executePythonCode(code, {
                workingDir: path.dirname(fileContents[0]?.localPath || process.cwd())
            });

            this.logEntry('success', 'Python code executed successfully');
            this.logEntry('answer', `Generated answer from Python: ${output.trim()}`);

            // Parse the answer
            let answer = output.trim();

            // Try to parse as JSON if it looks like JSON
            if (answer.startsWith('{') || answer.startsWith('[')) {
                try {
                    answer = JSON.parse(answer);
                } catch (e) {
                    // Not JSON, use as string
                }
            }

            return answer;

        } catch (error) {
            this.logEntry('error', `Python code generation failed: ${error.message}`);
            this.logEntry('warning', 'Falling back to direct LLM answer');
            return null; // Fall back to normal method
        }
    }

    async getAnswerFromLLM(quizData, fileContents, imageBase64s, previousReasons = []) {
        // Build the prompt
        let prompt = `You are solving a data analysis quiz. Read the question carefully and provide ONLY the exact answer required.\n\n`;
        prompt += `=== QUESTION ===\n${quizData.text}\n\n`;

        // Add user email for personalized questions
        prompt += `=== YOUR EMAIL (for personalized questions) ===\n${this.email}\n`;
        prompt += `EMAIL LENGTH: ${this.email.length} characters\n\n`;


        // Add file contents
        if (fileContents.length > 0) {
            prompt += `=== DATA FROM FILES ===\n`;

            for (const file of fileContents) {
                if (file.extractedContent?.text) {
                    let content = file.extractedContent.text;
                    if (content.length > 50000) {
                        content = content.substring(0, 50000) + '\n... [truncated]';
                    }
                    prompt += `\n--- ${file.filename || 'File'} (${file.fileType}) ---\n`;
                    if (file.fileType === 'csv') {
                        prompt += `⚠️ CSV DATE WARNING: Verify each date carefully in YYYY-MM-DD format. Distinguish DD vs MM (e.g., 2024-01-02 is Jan 2nd, NOT Feb 1st).\n`;
                    }
                    prompt += `${content}\n`;
                } else if (file.extractedContent?.data) {
                    prompt += `\n--- ${file.filename || 'File'} (${file.fileType}) ---\n${JSON.stringify(file.extractedContent.data, null, 2)}\n`;
                }
            }
            prompt += `\n`;
        }

        // Add previous wrong answer reasons as hints
        if (previousReasons.length > 0) {
            prompt += `=== IMPORTANT: PREVIOUS ATTEMPTS WERE WRONG ===\n`;
            prompt += `The following feedback was given for previous attempts:\n`;
            for (const reason of previousReasons) {
                prompt += `- ${reason}\n`;

                // Add calculation breakdown if modulo/formula detected
                if (reason.includes('mod') || reason.includes('modulo') || reason.includes('%')) {
                    prompt += `  💡 CALCULATION HELP: Break down step-by-step:\n`;
                    prompt += `     Example: "email length mod 2" where email is "${this.email}" (${this.email.length} chars):\n`;
                    prompt += `     Step 1: Email length = ${this.email.length}\n`;
                    prompt += `     Step 2: ${this.email.length} mod 2 = ${this.email.length % 2}\n`;
                    prompt += `     Step 3: If task is "count + (email mod 2)", calculate: count + ${this.email.length % 2}\n`;
                }
            }
            prompt += `Use this feedback to correct your answer.\n\n`;
        }

        const answerType = extractAnswerType(quizData.text);

        prompt += `=== INSTRUCTIONS ===\n`;
        prompt += `1. Analyze all data carefully\n`;
        prompt += `2. Perform exact calculations as required\n`;
        prompt += `3. Return ONLY the answer value - NO explanations\n`;
        prompt += `4. Match the exact format specified in the question\n`;
        prompt += `5. For numbers, just the number. For JSON, valid JSON only.\n`;
        prompt += `6. IMPORTANT: For dates in JSON, ALWAYS use ISO 8601 format with time: "YYYY-MM-DDTHH:MM:SS" (e.g., "2024-01-30T00:00:00")\n\n`;
        prompt += `Your answer:`;

        const systemPrompt = `You are a data analysis expert solving quiz questions.
CRITICAL: Respond with ONLY the answer - no explanations, no markdown formatting, no code blocks.
If the answer is a number, respond with just the number.
If the answer is JSON, respond with valid JSON only.
If the answer is text, respond with just the text.
Be precise and match any format specified in the question.`;

        this.logEntry('llm', `Calling LLM...`, {
            promptLength: prompt.length,
            model: this.model,
            hasImages: imageBase64s.length > 0,
            previousReasons: previousReasons.length
        });

        this.onUpdate({ type: 'llm_called', model: this.model });

        try {
            // Start primary model call (doesn't wait for it)
            const primaryModelPromise = callLLMWithFallback(prompt, {
                model: this.model,
                images: imageBase64s.slice(0, 3),
                systemPrompt,
                onModelSwitch: (newModel, reason) => {
                    this.logEntry('warning', `Switching model: ${reason}`);
                    this.onUpdate({ type: 'model_switched', model: newModel, reason });
                },
                onAllRateLimited: () => {
                    this.allModelsRateLimited = true;
                }
            });

            let llmResponse;

            // Wait up to 20s for primary model
            const timeoutRace = Promise.race([
                primaryModelPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('15s timeout')), 15000))
            ]);

            try {
                llmResponse = await timeoutRace;
            } catch (timeoutError) {
                if (timeoutError.message === '15s timeout') {
                    this.logEntry('warning', '⚡ 15s timeout - Primary model still running, racing with 5 more models');

                    // Race the original (still running) + 3 new models
                    try {
                        const raceResponse = await raceLLMs(prompt, {
                            images: imageBase64s.slice(0, 3),
                            systemPrompt,
                            timeout: 20000
                        }, 3);

                        // Race between the 3 new models and original model
                        llmResponse = await Promise.race([
                            primaryModelPromise,
                            Promise.resolve(raceResponse)
                        ]);

                        this.logEntry('info', '🏁 Got response from race');
                    } catch (raceError) {
                        // If racing fails, still wait for original model
                        this.logEntry('warning', '⚠️ Race failed, waiting for original model to complete');
                        llmResponse = await primaryModelPromise;
                    }
                } else {
                    throw timeoutError;
                }
            }

            this.logEntry('llm', 'LLM response received', {
                contentPreview: llmResponse.content.substring(0, 200),
                model: llmResponse.model
            });

            return this.parseAnswer(llmResponse.content, answerType);

        } catch (error) {
            this.logEntry('error', `LLM call failed: ${error.message}`);
            return null;
        }
    }

    parseAnswer(content, answerType) {
        let answer = content.trim();

        // Remove common prefixes/suffixes and formatting
        answer = answer.replace(/^(answer:|the answer is|result:|output:)/i, '').trim();
        answer = answer.replace(/^["'`]+|["'`]+$/g, '').trim();
        answer = answer.replace(/^```[\w]*\n?|\n?```$/g, '').trim();

        // Handle markdown code blocks
        const codeBlockMatch = answer.match(/```(?:\w+)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
            answer = codeBlockMatch[1].trim();
        }

        // Try to parse based on expected type
        switch (answerType) {
            case 'boolean':
                const lower = answer.toLowerCase();
                if (lower === 'true' || lower === 'yes' || lower === '1') return true;
                if (lower === 'false' || lower === 'no' || lower === '0') return false;
                return answer;

            case 'number':
                const cleanedForNumber = answer.replace(/,/g, '').replace(/\s/g, '');
                const numMatch = cleanedForNumber.match(/-?\d+\.?\d*/);
                if (numMatch) {
                    const num = parseFloat(numMatch[0]);
                    return Number.isInteger(num) ? parseInt(numMatch[0]) : num;
                }
                return answer;

            case 'array':
                try {
                    const parsed = JSON.parse(answer);
                    if (Array.isArray(parsed)) return parsed;
                } catch { }
                const arrayMatch = answer.match(/\[[\s\S]*\]/);
                if (arrayMatch) {
                    try {
                        return JSON.parse(arrayMatch[0]);
                    } catch { }
                }
                return answer;

            case 'object':
                try {
                    return JSON.parse(answer);
                } catch { }
                const objMatch = answer.match(/\{[\s\S]*\}/);
                if (objMatch) {
                    try {
                        return JSON.parse(objMatch[0]);
                    } catch { }
                }
                return answer;

            default:
                return answer;
        }
    }

    async submitAnswer(submitUrl, quizUrl, answer, payload = null) {
        // Use provided payload or create default
        if (!payload) {
            payload = {
                email: this.email,
                secret: this.secret,
                url: quizUrl,
                answer
            };
        }

        this.logEntry('submit', `Submitting to ${submitUrl}`);

        // Save full request payload to debug file
        const requestLogPath = path.join(LOGS_DIR, `${this.sessionId}_request_${Date.now()}.json`);
        try {
            fs.writeFileSync(requestLogPath, JSON.stringify({ timestamp: getISTTimestamp(), submitUrl, quizUrl, payload, answer }, null, 2));
            this.logEntry('debug', `Request saved: ${requestLogPath}`);
        } catch (e) { this.logEntry('warning', `Failed to save request: ${e.message}`); }

        // Send full request JSON to frontend
        this.onUpdate({
            type: 'request_json',
            submitUrl,
            payload: JSON.parse(JSON.stringify(payload)) // Deep copy
        });

        this.onUpdate({ type: 'submitting', submitUrl, payload });

        try {
            const response = await axios.post(submitUrl, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'PostmanRuntime/7.49.1',
                    'Accept': '*/*',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive'
                },
                timeout: 30000,
                maxBodyLength: 1024 * 1024
            });

            const result = response.data;

            // Save full response to debug file
            const responseLogPath = path.join(LOGS_DIR, `${this.sessionId}_response_${Date.now()}.json`);
            try {
                fs.writeFileSync(responseLogPath, JSON.stringify({ timestamp: getISTTimestamp(), submitUrl, status: response.status, headers: response.headers, data: result }, null, 2));
                this.logEntry('debug', `Response saved: ${responseLogPath}`);
            } catch (e) { this.logEntry('warning', `Failed to save response: ${e.message}`); }

            // Send full response JSON to frontend
            this.onUpdate({
                type: 'response_json',
                response: JSON.parse(JSON.stringify(result)), // Deep copy
                status: response.status
            });

            this.logEntry('response', 'Response received', result);
            this.onUpdate({ type: 'response', result });

            return {
                correct: result.correct,
                reason: result.reason,
                url: result.url,
                delay: result.delay
            };

        } catch (error) {
            const errorMessage = error.response?.data?.error || error.message;
            const errorData = error.response?.data;

            // Send error response JSON to frontend
            this.onUpdate({
                type: 'response_json',
                response: errorData || { error: errorMessage },
                status: error.response?.status || 500,
                isError: true
            });

            this.logEntry('error', `Submission error: ${errorMessage}`, {
                status: error.response?.status,
                data: errorData
            });

            return { correct: false, reason: errorMessage, url: null };
        }
    }
}
