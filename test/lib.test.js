import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHtml, findIssues, normalizeUrl, scoreFromIssues } from '../src/lib.js';

const GOOD = `<!doctype html><html lang="en"><head><title>Acme Widgets &amp; Gadgets | Official Store</title>
<meta name="description" content="Buy widgets and gadgets online with free shipping and a 30-day return policy on every order placed today.">
<meta name="viewport" content="width=device-width"><meta name="robots" content="index,follow">
<meta property="og:title" content="Acme"><meta property="og:image" content="https://acme.com/i.png">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="https://acme.com/shop"><link rel="icon" href="/f.ico">
<link rel="alternate" hreflang="de" href="https://acme.com/de/shop">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":["Product","Thing"]}]}</script>
<style>.x{color:red}</style></head><body><h1>Widgets</h1><h2>New</h2><h2>Sale</h2>
<img src="a.png" alt="a"><img src="b.png"><img src="c.png" alt="">
<a href="/about">About</a><a href="https://www.acme.com/x">X</a><a href="https://other.org">O</a><a href="mailto:a@b.c">m</a><a href="#top">t</a>
<script>var hidden="words words words"</script><p>${'word '.repeat(250)}</p></body></html>`;

test('normalizeUrl', () => {
    assert.equal(normalizeUrl('example.com/a#x'), 'https://example.com/a');
    assert.equal(normalizeUrl('http://example.com'), 'http://example.com/');
    assert.equal(normalizeUrl('ftp://x.com'), null);
    assert.equal(normalizeUrl(''), null);
    assert.equal(normalizeUrl('not a url'), null);
});

test('analyzeHtml extracts on-page data', () => {
    const p = analyzeHtml(GOOD, 'https://acme.com/shop');
    assert.equal(p.title, 'Acme Widgets & Gadgets | Official Store');
    assert.equal(p.metaDescriptionLength > 70, true);
    assert.equal(p.lang, 'en');
    assert.equal(p.canonical, 'https://acme.com/shop');
    assert.deepEqual(p.h1, ['Widgets']);
    assert.equal(p.h2Count, 2);
    assert.equal(p.openGraph.image, 'https://acme.com/i.png');
    assert.equal(p.twitterCard, 'summary');
    assert.deepEqual(p.hreflang, [{ lang: 'de', href: 'https://acme.com/de/shop' }]);
    assert.deepEqual(p.jsonLdTypes, ['Organization', 'Product', 'Thing']);
    assert.equal(p.imagesTotal, 3);
    assert.equal(p.imagesMissingAlt, 2);
    assert.equal(p.internalLinks, 2);
    assert.equal(p.externalLinks, 1);
    assert.equal(p.wordCount >= 250 && p.wordCount < 270, true);
    assert.equal(p.hasFavicon, true);
});

test('good page has only alt-text issue', () => {
    const page = analyzeHtml(GOOD, 'https://acme.com/shop');
    const issues = findIssues({ status: 200, finalUrl: 'https://acme.com/shop', redirects: 0, ttfbMs: 200, page, headers: { strictTransportSecurity: 'max-age=1' } });
    assert.deepEqual(issues, ['images_missing_alt']);
    assert.equal(scoreFromIssues(issues), 96);
});

test('bad page collects many issues', () => {
    const page = analyzeHtml('<html><head></head><body><h1>a</h1><h1>b</h1>hi</body></html>', 'http://x.com/');
    const issues = findIssues({ status: 200, finalUrl: 'http://x.com/', redirects: 2, ttfbMs: 3000, page, headers: {} });
    for (const i of ['missing_title', 'missing_meta_description', 'multiple_h1', 'missing_canonical', 'missing_lang', 'missing_viewport', 'missing_open_graph', 'thin_content', 'not_https', 'redirect_chain', 'slow_response']) assert.ok(issues.includes(i), i);
});

test('noindex (meta and header), canonical elsewhere, http error', () => {
    const p = analyzeHtml('<html lang="en"><head><title>A fine long title here</title><meta name="robots" content="NoIndex"><link rel="canonical" href="/other"></head></html>', 'https://a.com/page');
    const i = findIssues({ status: 200, finalUrl: 'https://a.com/page', redirects: 0, ttfbMs: 10, page: p, headers: { strictTransportSecurity: 'x' } });
    assert.ok(i.includes('not_indexable_noindex') && i.includes('canonical_points_elsewhere'));
    const h = findIssues({ status: 200, finalUrl: 'https://a.com/', redirects: 0, ttfbMs: 1, page: analyzeHtml('<html></html>', 'https://a.com/'), headers: { xRobotsTag: 'noindex', strictTransportSecurity: 'x' } });
    assert.ok(h.includes('not_indexable_noindex'));
    assert.deepEqual(findIssues({ status: 404, finalUrl: 'https://a.com/', redirects: 0, ttfbMs: 5, page: null, headers: { strictTransportSecurity: 'x' } }), ['http_error']);
});

test('www and trailing slash do not count as a different canonical', () => {
    const p = analyzeHtml('<html lang="en"><head><link rel="canonical" href="https://www.a.com/x/"></head></html>', 'https://a.com/x');
    assert.ok(!findIssues({ status: 200, finalUrl: 'https://a.com/x', redirects: 0, ttfbMs: 1, page: p, headers: {} }).includes('canonical_points_elsewhere'));
});
