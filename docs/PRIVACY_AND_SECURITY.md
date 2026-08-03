# Privacy and Security

## Local-only processing

All inspection, parsing, calculation, rendering, storage, and CSV generation occur in Chrome on the operator's device. Phase 1 contains no `fetch`, XMLHttpRequest, WebSocket, beacon, external API, CDN, telemetry, analytics, remote executable code, Supabase, Hostinger, or AI integration.

## Minimum access

The Manifest V3 extension requests only `activeTab`, `storage`, `downloads`, and the single host pattern `https://logistics.amazon.com/*`. It does not request `<all_urls>`, cookies, history, tabs-wide persistent access, or scripting. The content script runs only on the allowed Amazon Logistics origin. There is no externally connectable configuration.

`activeTab` allows popup interaction with the active page, `storage` keeps user settings and the latest local result, and `downloads` creates the operator-requested CSV. The static host permission is required for the page-limited content script.

## Data the extension does not access

The code does not read passwords, cookies, Amazon authentication tokens, MFA data, request headers, protected API responses, browser history, network traffic, or unrelated origin data. It does not bypass authentication, permissions, or access controls.

## Data minimization

Chart discovery is semantic and bounded. Diagnostics contain counts and limited samples of chart-adjacent labels, title/ARIA/data attributes, tooltip structure, and SVG attributes. They do not copy full HTML. Sample counts are capped. The URL fragment is removed. Extracted points retain only the source evidence needed to validate route-gap calculations.

The last diagnostics and result are stored in extension-local storage. **Clear Results** removes them without erasing settings. Removing the extension clears its remaining extension-local storage. Downloads remain on disk until the operator deletes them.

## Message and rendering safety

Messages use an allowlist of named types, require plain-object payloads, validate analysis settings, reject senders whose extension ID does not match, and return structured success/error responses. The manifest exposes no external message endpoint. Popup values are rendered with `textContent` and DOM methods; untrusted page data is never passed to `innerHTML`, `eval`, or `new Function`.

CSV cells beginning with `=`, `+`, `-`, or `@` receive a leading apostrophe. CSV quotes, commas, and new lines are escaped. Filenames are restricted to short alphanumeric, underscore, and hyphen components.

## Human review requirement

Every relevant finding is labeled **Potential route gap requiring manual review**. NORMAL, REVIEW, RED FLAG, PLANNED BREAK, and INCOMPLETE DATA describe deterministic screening output only. They are not findings of time theft, fraud, misconduct, or policy violation. A qualified human must examine route conditions, accessible source records, operational context, policy, and data quality before any action. The extension must never make an employment or disciplinary decision.

## Authorized use

Use is restricted to personnel who are authorized to access the currently displayed Amazon Logistics data and who follow applicable company policy, labor rules, retention requirements, and privacy obligations. Do not share exports or diagnostics beyond authorized recipients. Privacy-review diagnostic JSON before sharing it for development.

## Security review notes

- No external network call or remote code path exists.
- No authentication/session material is queried.
- No broad host access or dynamic code execution exists.
- No pixel analysis, OCR, or protected-API reverse engineering exists.
- Tooltip events are bounded, sequential, cancelable, and followed by pointer/mouse leave events.
- Route/page changes stop extraction.
- Debug logging is disabled by default.
- Operational risk remains in locally downloaded CSV/JSON files; protect and delete them under organizational retention rules.
