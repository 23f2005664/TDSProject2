import axios from 'axios';

// Logger helper
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] [PageFetcher] ${message}`);
    if (data && level === 'error') console.log(JSON.stringify(data, null, 2));
}

/**
 * Fetch a page using simple HTTP request (no browser needed).
 * Most quiz pages are static HTML with embedded content.
 */
export async function fetchPage(url) {
    log('info', `Fetching page: ${url}`);

    try {
        const response = await axios.get(url, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            },
            maxRedirects: 5
        });

        const html = response.data;
        const contentType = response.headers['content-type'] || '';

        // If it's JSON, return as-is
        if (contentType.includes('application/json')) {
            log('info', 'Received JSON response');
            return {
                html: JSON.stringify(html, null, 2),
                text: JSON.stringify(html, null, 2),
                links: [],
                images: [],
                url: response.request?.res?.responseUrl || url,
                isJson: true,
                data: html
            };
        }

        // Parse HTML
        const text = extractTextFromHtml(html);
        const links = extractLinksFromHtml(html, url);
        const images = extractImagesFromHtml(html, url);

        log('info', `Page fetched: ${text.length} chars, ${links.length} links, ${images.length} images`);

        return {
            html,
            text,
            links,
            images,
            url: response.request?.res?.responseUrl || url,
            isJson: false
        };

    } catch (error) {
        log('error', `Failed to fetch page: ${error.message}`);
        throw error;
    }
}

/**
 * Extract text content from HTML (remove tags, scripts, styles)
 */
function extractTextFromHtml(html) {
    if (typeof html !== 'string') return String(html);

    // Remove script and style content
    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
    text = text.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ');

    // Remove HTML tags but keep content
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode common HTML entities
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#39;/gi, "'");
    text = text.replace(/&apos;/gi, "'");

    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
}

/**
 * Extract links from HTML
 */
function extractLinksFromHtml(html, baseUrl) {
    if (typeof html !== 'string') return [];

    const links = [];
    const base = new URL(baseUrl);

    // Match href attributes
    const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
    let match;

    while ((match = hrefRegex.exec(html)) !== null) {
        let href = match[1];

        // Skip anchors, javascript, mailto
        if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
            continue;
        }

        // Resolve relative URLs
        try {
            const fullUrl = new URL(href, baseUrl).href;

            // Get link text if possible
            const textMatch = html.substring(match.index).match(/<a[^>]*>([^<]*)</i);
            const text = textMatch ? textMatch[1].trim() : '';

            links.push({ href: fullUrl, text });
        } catch { }
    }

    return links;
}

/**
 * Extract images from HTML
 */
function extractImagesFromHtml(html, baseUrl) {
    if (typeof html !== 'string') return [];

    const images = [];

    // Match src attributes in img tags
    const srcRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let match;

    while ((match = srcRegex.exec(html)) !== null) {
        let src = match[1];

        // Skip data URLs
        if (src.startsWith('data:')) continue;

        // Resolve relative URLs
        try {
            const fullUrl = new URL(src, baseUrl).href;

            // Get alt text if possible
            const altMatch = match[0].match(/alt\s*=\s*["']([^"']*)["']/i);
            const alt = altMatch ? altMatch[1] : '';

            images.push({ src: fullUrl, alt });
        } catch { }
    }

    return images;
}

/**
 * Download file content from URL
 */
export async function downloadContent(url) {
    log('info', `Downloading: ${url}`);

    try {
        const response = await axios.get(url, {
            timeout: 60000,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*'
            },
            maxContentLength: 50 * 1024 * 1024
        });

        const contentType = response.headers['content-type'] || '';
        const buffer = Buffer.from(response.data);

        log('info', `Downloaded: ${buffer.length} bytes, type: ${contentType}`);

        return {
            buffer,
            contentType,
            size: buffer.length
        };

    } catch (error) {
        log('error', `Download failed: ${error.message}`);
        throw error;
    }
}
