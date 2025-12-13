import { firefox } from 'playwright';

let browser = null;
let browserLaunchPromise = null;

// Logger helper
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] [Browser] ${message}`);
    if (data && level === 'error') console.log(JSON.stringify(data, null, 2));
}

export async function getBrowser() {
    if (browser && browser.isConnected()) return browser;

    if (browserLaunchPromise) {
        await browserLaunchPromise;
        return browser;
    }

    browserLaunchPromise = launchBrowser();
    await browserLaunchPromise;
    browserLaunchPromise = null;

    return browser;
}

async function launchBrowser() {
    log('info', 'Launching Firefox browser...');

    try {
        browser = await firefox.launch({
            headless: true,
            timeout: 30000
        });

        log('info', 'Browser launched successfully');

        browser.on('disconnected', () => {
            log('warning', 'Browser disconnected');
            browser = null;
        });

    } catch (error) {
        log('error', `Failed to launch browser: ${error.message}`);
        throw error;
    }
}

export async function closeBrowser() {
    if (browser) {
        log('info', 'Closing browser...');
        try {
            await browser.close();
        } catch (error) {
            log('warning', `Error closing browser: ${error.message}`);
        }
        browser = null;
    }
}

export async function renderPage(url, options = {}) {
    const { timeout = 30000, waitTime = 2000 } = options;

    log('info', `Rendering page: ${url}`);

    const browserInstance = await getBrowser();
    const context = await browserInstance.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    try {
        log('info', 'Navigating...');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

        log('info', `Waiting ${waitTime}ms...`);
        await page.waitForTimeout(waitTime);

        const content = await page.content();

        const textContent = await page.evaluate(() => {
            document.querySelectorAll('script, style, noscript').forEach(s => s.remove());
            return document.body?.innerText || document.body?.textContent || '';
        });

        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href]')).map(a => ({
                href: a.href,
                text: a.innerText?.trim() || ''
            })).filter(l => l.href?.startsWith('http'));
        });

        const images = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img[src]')).map(img => ({
                src: img.src,
                alt: img.alt || ''
            })).filter(i => i.src?.startsWith('http'));
        });

        log('info', `Page rendered: ${textContent.length} chars, ${links.length} links`);

        return { html: content, text: textContent, links, images, url: page.url() };

    } catch (error) {
        log('error', `Page render failed: ${error.message}`);
        throw error;
    } finally {
        await context.close().catch(() => { });
    }
}

export async function takeScreenshot(url, options = {}) {
    const { fullPage = true, type = 'png' } = options;

    log('info', `Taking screenshot: ${url}`);

    const browserInstance = await getBrowser();
    const context = await browserInstance.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        const screenshot = await page.screenshot({ fullPage, type });

        log('info', 'Screenshot captured');
        return `data:image/${type};base64,${screenshot.toString('base64')}`;

    } finally {
        await context.close().catch(() => { });
    }
}
