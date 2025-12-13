import { fetchPage } from './pageFetcher.js';

// Logger helper
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] [QuestionParser] ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
}

/**
 * Parse a quiz page and extract question, submit URL, and file links
 */
export async function parseQuizPage(url) {
    log('info', `Parsing quiz page: ${url}`);

    const page = await fetchPage(url);

    // Extract submit URL
    const submitUrl = extractSubmitUrl(page.text, page.links, url);

    // Extract file links (PDFs, CSVs, images, audio, etc.)
    const fileLinks = extractFileLinks(page.text, page.links, url);

    // Extract image URLs
    const imageUrls = page.images.map(img => img.src);

    // Get answer format hints
    const answerFormatHints = extractAnswerFormatHints(page.text);

    log('info', 'Quiz page parsed', {
        textLength: page.text.length,
        submitUrl,
        fileLinksCount: fileLinks.length,
        imageCount: imageUrls.length
    });

    return {
        text: page.text,
        html: page.html,
        submitUrl,
        fileLinks,
        imageUrls,
        answerFormatHints,
        originalUrl: url
    };
}

/**
 * Extract the submit URL from page content
 */
function extractSubmitUrl(text, links, baseUrl) {
    // Look for POST/submit URLs in various patterns
    const patterns = [
        /POST\s+(?:to\s+)?[`"']?(https?:\/\/[^\s`"']+)[`"']?/i,
        /submit\s+(?:to\s+)?[`"']?(https?:\/\/[^\s`"']+)[`"']?/i,
        /url\s*[=:]\s*[`"']?(https?:\/\/[^\s`"']+)[`"']?/i,
        /endpoint[:\s]+[`"']?(https?:\/\/[^\s`"']+)[`"']?/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1].replace(/[`"'.,;]+$/, '');
        }
    }

    // Check links for likely submit URLs
    for (const link of links) {
        const href = link.href.toLowerCase();
        if (href.includes('project2-') || href.includes('submit') || href.includes('answer')) {
            return link.href;
        }
    }

    // Look for URLs in the page that look like submit endpoints
    const urlPattern = /https?:\/\/[^\s<>"']+project2[^\s<>"']*/gi;
    const matches = text.match(urlPattern);
    if (matches) {
        for (const match of matches) {
            if (match !== baseUrl && !match.includes('.json') && !match.includes('.csv')) {
                return match.replace(/[.,;]+$/, '');
            }
        }
    }

    // Default: use /submit at the base domain
    try {
        const base = new URL(baseUrl);
        return `${base.origin}/submit`;
    } catch {
        return null;
    }
}

/**
 * Extract file links from page content
 */
function extractFileLinks(text, links, baseUrl) {
    const fileLinks = new Set();
    const base = new URL(baseUrl);

    // File extensions to look for
    const fileExts = ['.json', '.csv', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.mp3', '.wav', '.opus', '.ogg', '.zip', '.txt', '.xml', '.xlsx'];

    // Extract from links
    for (const link of links) {
        const lowerHref = link.href.toLowerCase();
        if (fileExts.some(ext => lowerHref.includes(ext))) {
            fileLinks.add(link.href);
        }
    }

    // Also look for URLs in text
    const urlPattern = /https?:\/\/[^\s<>"'\]]+/gi;
    const matches = text.match(urlPattern) || [];

    for (let match of matches) {
        // Clean up trailing punctuation
        match = match.replace(/[.,;:)\]]+$/, '');
        const lowerMatch = match.toLowerCase();

        if (fileExts.some(ext => lowerMatch.includes(ext))) {
            fileLinks.add(match);
        }
    }

    // Look for relative paths and convert to absolute
    const relativePattern = /\/project2\/[^\s<>"']+\.(json|csv|pdf|png|jpg|jpeg|gif|mp3|wav|opus|zip)/gi;
    const relMatches = text.match(relativePattern) || [];

    for (const relPath of relMatches) {
        try {
            const fullUrl = new URL(relPath, baseUrl).href;
            fileLinks.add(fullUrl);
        } catch { }
    }

    return Array.from(fileLinks);
}

/**
 * Extract hints about expected answer format
 */
export function extractAnswerFormatHints(text) {
    const hints = [];
    const lowerText = text.toLowerCase();

    if (lowerText.includes('json') || lowerText.includes('array') || lowerText.includes('object')) {
        hints.push('json');
    }
    if (lowerText.includes('number') || lowerText.includes('integer') || lowerText.includes('decimal')) {
        hints.push('number');
    }
    if (lowerText.includes('true') || lowerText.includes('false') || lowerText.includes('boolean')) {
        hints.push('boolean');
    }
    if (lowerText.includes('text') || lowerText.includes('string') || lowerText.includes('command')) {
        hints.push('string');
    }

    return hints;
}

/**
 * Determine the expected answer type
 */
export function extractAnswerType(text) {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('json array') || lowerText.includes('array of')) {
        return 'array';
    }
    if (lowerText.includes('json object') || lowerText.includes('json {')) {
        return 'object';
    }
    if (lowerText.includes('true or false') || lowerText.includes('boolean')) {
        return 'boolean';
    }
    if (lowerText.includes('number') || lowerText.includes('integer') || lowerText.includes('count') || lowerText.includes('sum') || lowerText.includes('total')) {
        return 'number';
    }

    return 'string';
}

/**
 * Build a prompt for the LLM
 */
export function buildPrompt(quizData, fileContents = []) {
    let prompt = quizData.text;

    // Add file contents
    if (fileContents.length > 0) {
        prompt += '\n\n=== FILE CONTENTS ===\n';
        for (const file of fileContents) {
            if (file.extractedContent?.text) {
                prompt += `\n--- ${file.filename || 'File'} ---\n${file.extractedContent.text}\n`;
            }
        }
    }

    const answerType = extractAnswerType(quizData.text);

    return { prompt, answerType };
}
