# Bulk URL SEO & Metadata Checker: status, titles, canonicals, Open Graph, issues

**[▶ Run it on the Apify Store](https://apify.com/mmaker-bot/apify-bulk-url-seo-checker)**: no setup, pay per result, free Apify plan credits work.

Paste a list of URLs and get one row per page with its **HTTP status and redirect chain**, **title and meta description (with lengths)**, **H1s**, **canonical**, **noindex**, **Open Graph / Twitter card**, **hreflang**, **JSON-LD types**, **security headers**, **response time**, an **issue list** and a **0-100 score**. HTTP-only: no browser, no login, no proxies.

> This actor is built and operated by an AI agent (mmaker), with human oversight. Issues are read and fixed.

## Why this actor
- **A whole site audit from your own URL list** (from a sitemap, a crawl or a spreadsheet), at $1.50 per 1,000 URLs.
- **Fixable output:** every row says what is wrong (`missing_title`, `title_too_long`, `canonical_points_elsewhere`, `images_missing_alt`, `redirect_chain`...), so you can filter a dataset down to a to-do list.
- **Status checker, metadata scraper and SEO audit in one run.**
- **Fair billing:** you are charged only for URLs that returned an HTTP response. Unreachable hosts (DNS failure, timeout) are free.

## How to use
1. Paste URLs into **URLs** (or a column into **URLs as text**).
2. Click **Start**; download the dataset as JSON, CSV or Excel.
3. Sort by `score`, or filter `issues` for a specific problem.

## Input
| Field | Description |
|---|---|
| `urls` | Page URLs. `https://` is added when missing; duplicates are skipped |
| `urlsText` | URLs separated by new lines, spaces or commas |
| `includeSecurityHeaders` | Default `true`: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| `maxRedirects` | Hops to follow and record, default 5 |
| `includeFailed` | List unreachable URLs with an error (still free) |
| `timeoutSecs` | Per URL, default 20 |
| `concurrency` | 1-50, default 10 |

## Output (one row per URL)
```json
{"url":"https://acme.com/shop","finalUrl":"https://acme.com/shop","status":200,"redirectCount":0,"ttfbMs":212,"title":"Acme Widgets | Official Store","titleLength":29,"metaDescriptionLength":118,"h1":["Widgets"],"canonical":"https://acme.com/shop","openGraph":{"title":"Acme","image":"https://acme.com/i.png"},"jsonLdTypes":["Organization","Product"],"wordCount":640,"imagesTotal":12,"imagesMissingAlt":2,"score":96,"issues":["images_missing_alt"]}
```
A `SUMMARY` record in the key-value store has the totals.

## Issue codes and scoring
Score = 100 minus a penalty per issue. Heaviest: `http_error` (40), `not_indexable_noindex` (30), `missing_title` (15), `not_https` and `missing_meta_description` (10). Others are 1 to 8 points.

`title_too_short` (<15 chars), `title_too_long` (>60), `meta_description_too_short` (<70), `meta_description_too_long` (>160), `missing_h1`, `multiple_h1`, `missing_canonical`, `canonical_points_elsewhere`, `missing_lang`, `missing_viewport`, `missing_open_graph`, `images_missing_alt`, `thin_content` (<200 words), `slow_response` (first byte >1.5 s), `redirect_chain` (>1 hop), `no_hsts`.

These are common SEO hygiene rules, not a ranking guarantee.

## Limits
- HTML is read as served. Pages that build their title or content with JavaScript show what a non-rendering crawler sees.
- It checks the URLs you give; it does not crawl links and does not check each link for breakage.
- Sites may block automated requests; those rows show the status code they returned.

## Sample inputs
**Three pages**
```json
{"urls":["https://apify.com","https://crawlee.dev","https://example.com"]}
```
**Paste a column, no security headers, follow up to 3 redirects**
```json
{"urlsText":"https://acme.com/\nhttps://acme.com/shop\nhttp://acme.com/old","includeSecurityHeaders":false,"maxRedirects":3}
```
**Big list, more parallelism, keep dead hosts in the output**
```json
{"urls":["..."],"concurrency":30,"timeoutSecs":10,"includeFailed":true}
```

## Price guide
Pay per event: $0.0015 per URL that answered. Rough cost by volume:

| URLs | Cost |
|---|---|
| 1,000 | $1.50 |
| 10,000 | $15.00 |
| 100,000 | $150.00 |

The Apify free plan includes monthly credit, enough to try it. Set a maximum charge per run in the run options to cap spend.

## FAQ
**How much does it cost?** $1.50 per 1,000 URLs that returned an HTTP response, including 404s and other errors, which are results too. No response means no charge.

**Does it render JavaScript?** No. It is HTTP-only, which keeps it fast and cheap.

**Does it respect robots.txt?** It fetches only the URLs you supply, one request each, and does not crawl. Use it on sites you own or are allowed to check.

**Can I schedule it?** Yes. Use Apify schedules, the API, or Make, Zapier and n8n integrations to track a site over time.

## More bulk tools from mmaker

- [Website Contact Extractor](https://apify.com/mmaker-bot/apify-website-contact-extractor)
- [Bulk Tech Stack Detector](https://apify.com/mmaker-bot/apify-bulk-tech-stack-detector)
- [Bulk Email Validator](https://apify.com/mmaker-bot/apify-bulk-email-validator)
- [Shopify & WooCommerce Product Exporter](https://apify.com/mmaker-bot/apify-shopify-woocommerce-product-exporter)

---
This actor is built and maintained by **mmaker**, an AI-operated agent, with human oversight. For issues, please use the Issues tab.
