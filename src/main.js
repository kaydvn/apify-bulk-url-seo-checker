import { Actor, log } from 'apify';
import { analyzeHtml, findIssues, normalizeUrl, scoreFromIssues, securityHeaders } from './lib.js';

const EVENT = 'url';
const UA = 'Mozilla/5.0 (compatible; bulk-url-seo-checker/1.0; Apify actor; +https://apify.com/mmaker-bot)';
const MAX_HTML = 2_000_000;

async function readCapped(res) {
    const reader = res.body?.getReader();
    if (!reader) return '';
    const chunks = [];
    let size = 0;
    while (size < MAX_HTML) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
    }
    reader.cancel().catch(() => {});
    return Buffer.concat(chunks).toString('utf8');
}

async function check(url, opts) {
    const started = Date.now();
    const chain = [];
    let current = url;
    let res;
    let ttfbMs = null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    try {
        for (let hop = 0; hop <= opts.maxRedirects; hop++) {
            const t0 = Date.now();
            res = await fetch(current, { redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'en' } });
            if (hop === 0) ttfbMs = Date.now() - t0;
            const loc = res.headers.get('location');
            if (res.status >= 300 && res.status < 400 && loc) {
                chain.push({ url: current, status: res.status });
                await res.body?.cancel().catch(() => {});
                current = new URL(loc, current).href;
                if (hop === opts.maxRedirects) return { url, error: 'too_many_redirects', redirectChain: chain, charged: true, status: res.status };
                continue;
            }
            break;
        }
        const type = res.headers.get('content-type') || '';
        const isHtml = /html|xml/i.test(type) || !type;
        const html = res.status < 400 && isHtml ? await readCapped(res) : (await res.body?.cancel().catch(() => {}), '');
        const hdrs = { ...securityHeaders(res.headers), xRobotsTag: res.headers.get('x-robots-tag') };
        const page = html ? analyzeHtml(html, current) : null;
        const issues = findIssues({ status: res.status, finalUrl: current, redirects: chain.length, ttfbMs, page, headers: hdrs });
        const { xRobotsTag, ...secHeaders } = hdrs;
        return {
            url,
            finalUrl: current,
            status: res.status,
            redirectCount: chain.length,
            redirectChain: chain,
            contentType: type || null,
            contentLengthBytes: Number(res.headers.get('content-length')) || (html ? Buffer.byteLength(html) : null),
            server: res.headers.get('server'),
            compression: res.headers.get('content-encoding'),
            ttfbMs,
            totalMs: Date.now() - started,
            xRobotsTag,
            ...(page ?? {}),
            ...(opts.includeHeaders ? { securityHeaders: secHeaders } : {}),
            score: scoreFromIssues(issues),
            issues,
            charged: true,
        };
    } catch (err) {
        return { url, error: err.name === 'AbortError' ? 'timeout' : (err.cause?.code || err.message), charged: false };
    } finally {
        clearTimeout(timer);
    }
}

await Actor.init();
const input = (await Actor.getInput()) || {};
const raw = [...(input.urls || []), ...(input.startUrls || []).map((s) => (typeof s === 'string' ? s : s?.url))];
if (typeof input.urlsText === 'string') raw.push(...input.urlsText.split(/[\s,]+/));
const seen = new Set();
const urls = [];
let invalid = 0;
for (const r of raw) {
    if (!String(r ?? '').trim()) continue;
    const u = normalizeUrl(r);
    if (!u) { invalid++; log.warning(`Skipping invalid URL: ${r}`); continue; }
    if (!seen.has(u)) { seen.add(u); urls.push(u); }
}
if (!urls.length) throw new Error('Give at least one URL in "urls".');
const opts = {
    timeoutMs: Math.min(Math.max(Number(input.timeoutSecs) || 20, 3), 90) * 1000,
    maxRedirects: Math.min(Math.max(Number(input.maxRedirects ?? 5), 0), 10),
    includeHeaders: input.includeSecurityHeaders !== false,
};
const concurrency = Math.min(Math.max(Number(input.concurrency) || 10, 1), 50);
log.info(`${urls.length} unique URLs (${invalid} invalid skipped), concurrency ${concurrency}`);

let next = 0;
let done = 0;
let ok = 0;
let failed = 0;
let limitReached = false;
async function worker() {
    while (next < urls.length && !limitReached) {
        const { charged, ...row } = await check(urls[next++], opts);
        if (row.error) failed++; else ok++;
        if (charged) {
            const c = await Actor.pushData(row, EVENT);
            if (c?.eventChargeLimitReached) limitReached = true;
        } else if (input.includeFailed) {
            await Actor.pushData(row);
        }
        if (++done % 100 === 0) await Actor.setStatusMessage(`Checked ${done}/${urls.length}`);
    }
}
await Promise.all(Array.from({ length: concurrency }, worker));
await Actor.setValue('SUMMARY', { checked: done, responded: ok, failedNoResponse: failed, invalidUrlsSkipped: invalid, stoppedAtChargeLimit: limitReached });
if (limitReached) log.info('Stopped at the maximum charge set for this run.');
await Actor.setStatusMessage(`Finished: ${ok} pages answered, ${failed} unreachable (not charged)`, { isStatusMessageTerminal: true });
await Actor.exit();
