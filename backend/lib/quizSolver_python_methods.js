/**
 * Detect if question should use Python code generation
 */
shouldUsePythonCode(quizData, fileContents) {
    const text = quizData.text.toLowerCase();

    // Check for CSV files
    const hasCSV = fileContents.some(f => f.fileType === 'csv');
    if (hasCSV) return true;

    // Check for JSON processing
    const hasJSON = fileContents.some(f => f.fileType === 'json');
    const needsJSONOutput = text.includes('json') || text.includes('normalize');
    if (hasJSON && needsJSONOutput) return true;

    // Check for image analysis (color, pixel count, etc.)
    const hasImage = fileContents.some(f => f.fileType === 'image');
    const needsImageProcessing = text.includes('color') || text.includes('pixel') || text.includes('heatmap');
    if (hasImage && needsImageProcessing) return true;

    return false;
}

    /**
     * Get answer using Python code generation
     */
    async getAnswerUsingPython(quizData, fileContents, imageBase64s, previousReasons = []) {
    this.logEntry('info', '🐍 Using Python code generation for this question');

    // Build prompt for code generation
    let prompt = `You are a Python expert. Generate Python code that solves this quiz question and outputs ONLY the JSON submission payload.\n\n`;
    prompt += `=== QUIZ QUESTION ===\n${quizData.text}\n\n`;

    // Add submission format
    prompt += `=== REQUIRED OUTPUT FORMAT ===\nThe code must print EXACTLY this JSON structure (no other output):\n`;
    prompt += `{\n`;
    prompt += `  "email": "${this.email}",\n`;
    prompt += `  "secret": "${this.secret}",\n`;
    prompt += `  "url": "${new URL(quizData.submitUrl).pathname}",\n`;
    prompt += `  "answer": <calculated answer here>\n`;
    prompt += `}\n\n`;

    // Add available data
    if (fileContents.length > 0) {
        prompt += `=== AVAILABLE DATA FILES ===\n`;
        for (const file of fileContents) {
            if (file.localPath) {
                prompt += `File: ${file.localPath} (type: ${file.fileType})\n`;
            }
            if (file.extractedContent?.text && file.extractedContent.text.length < 2000) {
                prompt += `Content preview:\n${file.extractedContent.text.substring(0, 500)}\n\n`;
            }
        }
    }

    //Add previous failures
    if (previousReasons.length > 0) {
        prompt += `=== PREVIOUS ATTEMPTS FAILED ===\n`;
        for (const reason of previousReasons) {
            prompt += `- ${reason}\n`;
        }
        prompt += `\n`;
    }

    prompt += `=== INSTRUCTIONS ===\n`;
    prompt += `1. Write Python code that reads the data files\n`;
    prompt += `2. Process/analyze the data as required by the question\n`;
    prompt += `3. Calculate the correct answer\n`;
    prompt += `4. Use json.dumps() to output the complete submission JSON\n`;
    prompt += `5. For dates in JSON arrays, use ISO 8601 format: "YYYY-MM-DDTHH:MM:SS"\n`;
    prompt += `6. Available libraries: pandas, json, pathlib, datetime\n`;
    prompt += `7. File paths are absolute paths as shown above\n`;
    prompt += `8. Output ONLY the JSON, no print statements except final JSON\n\n`;
    prompt += `Write the complete Python code now:`;

    const systemPrompt = `You are a Python expert. Generate clean, working Python code that solves the quiz question.
Output ONLY the Python code in a single code block. No explanations before or after.
The code must read files, process data, and print ONLY the JSON submission payload.`;

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

        // Extract code from response
        let code = response.trim();

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

        // Parse the JSON output
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Code did not output valid JSON');
        }

        const submissionData = JSON.parse(jsonMatch[0]);

        // Validate the structure
        if (!submissionData.email || !submissionData.secret || !submissionData.url || submissionData.answer === undefined) {
            throw new Error('Generated JSON missing required fields');
        }

        this.logEntry('answer', `Generated answer from Python: ${JSON.stringify(submissionData.answer)}`);

        return submissionData.answer;

    } catch (error) {
        this.logEntry('error', `Python code generation failed: ${error.message}`);
        this.logEntry('warning', 'Falling back to direct LLM answer');
        return null; // Fall back to normal method
    }
}
