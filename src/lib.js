import { domainToASCII } from 'node:url';

export function normalizeUrl(raw) {
    let s = String(raw ?? '').trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
    try {
        const u = new URL(s);
        if (!/^https?:$/.test(u.protocol) || !domainToASCII(u.hostname)) return null;
        u.hash = '';
        return u.href;
    } catch {
        return null;
    }
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
        if (e[0] === '#') {
            const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
        }
        return ENT[e.toLowerCase()] ?? m;
    });
}

const clean = (s) => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function attrs(tag) {
    const out = {};
    for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
        out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
    }
    return out;
}

export function analyzeHtml(html, pageUrl) {
    const head = html.slice(0, 600000);
    const titleM = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleM ? clean(titleM[1]) : null;
    const meta = {};
    for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
        const a = attrs(m[0]);
        const key = (a.name || a.property || a['http-equiv'] || '').toLowerCase();
        if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content.trim();
    }
    let canonical = null;
    const hreflang = [];
    let favicon = false;
    for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
        const a = attrs(m[0]);
        const rel = (a.rel || '').toLowerCase().split(/\s+/);
        if (rel.includes('canonical') && a.href && !canonical) {
            try { canonical = new URL(a.href, pageUrl).href; } catch { canonical = a.href; }
        }
        if (rel.includes('alternate') && a.hreflang && a.href) hreflang.push({ lang: a.hreflang, href: a.href });
        if (rel.includes('icon')) favicon = true;
    }
    const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, (m) => (/ld\+json/i.test(m) ? m : ' ')).replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
    const jsonLdTypes = [];
    for (const m of html.matchAll(/<script\b[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
        try {
            const walk = (n) => {
                if (Array.isArray(n)) return n.forEach(walk);
                if (n && typeof n === 'object') {
                    const t = n['@type'];
                    for (const x of [].concat(t ?? [])) if (typeof x === 'string' && !jsonLdTypes.includes(x)) jsonLdTypes.push(x);
                    Object.values(n).forEach(walk);
                }
            };
            walk(JSON.parse(m[1]));
        } catch { /* invalid JSON-LD is ignored */ }
    }
    const headings = (n) => [...body.matchAll(new RegExp(`<h${n}\\b[^>]*>([\\s\\S]*?)</h${n}>`, 'gi'))].map((m) => clean(m[1])).filter(Boolean);
    const h1 = headings(1);
    const visible = body.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    const text = clean(visible.replace(/<head\b[\s\S]*?<\/head>/i, ' '));
    const wordCount = text ? text.split(/\s+/).length : 0;
    let imagesTotal = 0;
    let imagesMissingAlt = 0;
    for (const m of visible.matchAll(/<img\b[^>]*>/gi)) {
        imagesTotal++;
        const a = attrs(m[0]);
        if (a.alt === undefined || a.alt.trim() === '') imagesMissingAlt++;
    }
    let internalLinks = 0;
    let externalLinks = 0;
    let host = '';
    try { host = new URL(pageUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
    for (const m of visible.matchAll(/<a\b[^>]*>/gi)) {
        const a = attrs(m[0]);
        if (!a.href || /^(#|mailto:|tel:|javascript:)/i.test(a.href)) continue;
        try {
            const u = new URL(a.href, pageUrl);
            if (!/^https?:$/.test(u.protocol)) continue;
            if (u.hostname.replace(/^www\./, '') === host) internalLinks++; else externalLinks++;
        } catch { /* ignore */ }
    }
    const htmlTag = html.match(/<html\b[^>]*>/i);
    return {
        title,
        titleLength: title ? title.length : 0,
        metaDescription: meta.description ?? null,
        metaDescriptionLength: meta.description ? meta.description.length : 0,
        robotsMeta: meta.robots ?? null,
        viewport: meta.viewport ?? null,
        lang: htmlTag ? attrs(htmlTag[0]).lang ?? null : null,
        canonical,
        h1,
        h2Count: headings(2).length,
        openGraph: {
            title: meta['og:title'] ?? null,
            description: meta['og:description'] ?? null,
            image: meta['og:image'] ?? null,
            type: meta['og:type'] ?? null,
        },
        twitterCard: meta['twitter:card'] ?? null,
        hreflang,
        jsonLdTypes,
        hasFavicon: favicon,
        wordCount,
        imagesTotal,
        imagesMissingAlt,
        internalLinks,
        externalLinks,
    };
}

export function securityHeaders(h) {
    const g = (k) => h.get(k) ?? null;
    return {
        strictTransportSecurity: g('strict-transport-security'),
        contentSecurityPolicy: g('content-security-policy') ? true : null,
        xFrameOptions: g('x-frame-options'),
        xContentTypeOptions: g('x-content-type-options'),
        referrerPolicy: g('referrer-policy'),
    };
}

const sameUrl = (a, b) => {
    try {
        const x = new URL(a);
        const y = new URL(b);
        const p = (u) => u.pathname.replace(/\/$/, '');
        return x.host.replace(/^www\./, '') === y.host.replace(/^www\./, '') && p(x) === p(y) && x.search === y.search;
    } catch { return a === b; }
};

export const ISSUE_PENALTY = {
    http_error: 40, not_indexable_noindex: 30, missing_title: 15, title_too_short: 5, title_too_long: 5, missing_meta_description: 10,
    meta_description_too_short: 3, meta_description_too_long: 3, missing_h1: 8, multiple_h1: 4, missing_canonical: 4,
    canonical_points_elsewhere: 8, missing_lang: 3, missing_viewport: 5, missing_open_graph: 3, images_missing_alt: 4,
    thin_content: 5, slow_response: 5, redirect_chain: 4, not_https: 10, no_hsts: 1,
};

export function findIssues({ status, finalUrl, redirects, ttfbMs, page, headers }) {
    const issues = [];
    if (status >= 400 || status === 0) issues.push('http_error');
    if (finalUrl && !finalUrl.startsWith('https://')) issues.push('not_https');
    if (redirects > 1) issues.push('redirect_chain');
    if (ttfbMs > 1500) issues.push('slow_response');
    if (headers && finalUrl?.startsWith('https://') && !headers.strictTransportSecurity) issues.push('no_hsts');
    if (!page) return issues;
    if (!page.title) issues.push('missing_title');
    else if (page.titleLength < 15) issues.push('title_too_short');
    else if (page.titleLength > 60) issues.push('title_too_long');
    if (!page.metaDescription) issues.push('missing_meta_description');
    else if (page.metaDescriptionLength < 70) issues.push('meta_description_too_short');
    else if (page.metaDescriptionLength > 160) issues.push('meta_description_too_long');
    if (!page.h1.length) issues.push('missing_h1');
    else if (page.h1.length > 1) issues.push('multiple_h1');
    if (!page.canonical) issues.push('missing_canonical');
    else if (!sameUrl(page.canonical, finalUrl)) issues.push('canonical_points_elsewhere');
    if (/noindex/i.test(page.robotsMeta || '') || /noindex/i.test(headers?.xRobotsTag || '')) issues.push('not_indexable_noindex');
    if (!page.lang) issues.push('missing_lang');
    if (!page.viewport) issues.push('missing_viewport');
    if (!page.openGraph.title && !page.openGraph.image) issues.push('missing_open_graph');
    if (page.imagesMissingAlt > 0) issues.push('images_missing_alt');
    if (page.wordCount < 200) issues.push('thin_content');
    return issues;
}

export function scoreFromIssues(issues) {
    return Math.max(0, 100 - issues.reduce((s, i) => s + (ISSUE_PENALTY[i] ?? 0), 0));
}
