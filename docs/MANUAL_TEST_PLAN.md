# Manual Test Plan

Use Chrome with a non-production or otherwise authorized page whenever possible. Reload the extension and Amazon tab after source changes. Record Chrome version, extension version, route type, rendering mode, expected result, actual result, and evidence for every test. Never put credentials, tokens, or full page HTML in evidence.

## A. Installation and popup

1. **Load unpacked.** Select `extension/` in `chrome://extensions`. Expected: VINE Route Gap Auditor 0.1.0 loads with no manifest error and no icons required.
2. **No build dependency.** Install from a clean copied folder without running a command. Expected: popup opens normally; no missing bundles or external assets.
3. **Unsupported origin.** Open `https://example.com/`, then the popup. Expected: **Unsupported page**; Inspect and Analyze are unavailable; next-action guidance points to Amazon Logistics.
4. **Amazon page, collapsed chart.** Open an authorized Logistics page without expanding Progress chart. Expected: Amazon page recognized and **Amazon page detected but no progress chart found**.
5. **Expanded chart.** Manually expand one driver's Progress chart. Expected: **Chart detected** and type HTML, SVG, Canvas, or Unknown.
6. **Settings validation.** Enter below 5 and above 120, then analyze/change focus. Expected: value is clamped into the permitted range; default on fresh install is 20; planned timing defaults to unchecked.
7. **Settings persistence.** Change threshold and checkbox, close/reopen popup. Expected: values persist.

## B. Inspection and diagnostics

8. **Inspect structured chart.** Click Inspect Chart on the expanded chart. Expected: bounded diagnostic JSON appears with URL, title, timestamp, graphic/container counts, labels, samples, accessibility flags, mode, and warnings.
9. **No full HTML.** Download diagnostics and inspect the file. Expected: structured samples only; no complete `html`, `head`, or `body` dump.
10. **Copy diagnostics.** Click Copy Diagnostics and paste into a text editor. Expected: valid formatted JSON matching the preview.
11. **Download diagnostics.** Click Download JSON. Expected: a local `vine-chart-diagnostics_YYYY-MM-DD.json` file.
12. **Canvas without accessible values.** Inspect such a chart if available. Expected: **Canvas chart detected, but structured chart values are not accessible in Phase 1.** No pixel/OCR-derived values.
13. **Collapsed chart error.** Click Analyze when no candidate exists. Expected: guidance to expand one driver's Progress chart.

## C. Extraction and cancellation

14. **Accessible actual points.** Use a chart whose labels/tooltips explicitly say actual/completed stop and time. Expected: normalized actual records retain stop, timestamp, source text, source, confidence, and warnings.
15. **Planned points.** Use explicitly labeled planned points. Expected: planned records are extracted and matched primarily by stop number.
16. **Break windows.** Use accessible planned-break start/end values. Expected: breaks sort chronologically and receive 15/30/15 caps.
17. **No series fabrication.** Use an unlabeled colored point. Expected: it is not promoted to actual/planned solely from color or position; it may appear only in unknown samples.
18. **Cancel hover.** Start analysis on a chart with many points and click Cancel. Expected: user-cancelled message and no silent partial decision.
19. **Page changes during extraction.** Start analysis, then navigate the page. Expected: extraction stops with a page-changed message.
20. **Only one actual point.** Expected: INCOMPLETE DATA and a message that two points are required.
21. **Invalid/ambiguous time.** Use clock text with no accessible route date. Expected: warning; invalid point excluded; no guessed timestamp.

## D. Deterministic engine browser tests

Open `tests/test-runner.html` directly in Chrome. Expected summary: Total 15, Passed 15, Failed 0. Individually verify:

22. 10-minute gap, no break → NORMAL.
23. 18-minute gap, no break → REVIEW.
24. 20-minute gap, no break → RED FLAG.
25. 28-minute gap, no break → RED FLAG.
26. 25-minute gap in 30-minute meal window → PLANNED BREAK, 25 approved.
27. 35-minute gap overlapping a 15-minute break → 20 remaining, RED FLAG.
28. One 15-minute allowance across two gaps → no more than 15 total approved.
29. Invalid timestamps → INCOMPLETE DATA.
30. Exact duplicates → removed.
31. Out-of-order actual points → chronological order.
32. Planned timing disabled → planned gap does not reduce review minutes.
33. Planned timing enabled → matching planned gap reduces review minutes.
34. 23:50 to 00:10 next day → 20 minutes.
35. CSV cell beginning `=` → prefixed with apostrophe.
36. CSV comma and embedded quote → RFC-style quoted and doubled quote.

## E. Results, storage, and export

37. **Safe rendering.** Use authorized fixture text containing `<img onerror=...>` or markup-like characters in a label. Expected: literal text; no HTML execution.
38. **Result columns.** Expected: all required gap, plan, break, status, and reason fields appear; horizontal scrolling works.
39. **Human-review language.** Expected: red flags say **Potential route gap requiring manual review** and never allege theft/fraud/misconduct.
40. **CSV export.** Analyze, click Export CSV, save, open in a text editor. Expected: UTF-8 BOM, required headers, one row per gap, sanitized filename, properly escaped cells.
41. **CSV formula safety.** Check cells beginning `=`, `+`, `-`, or `@`. Expected: leading apostrophe.
42. **Last result persistence.** Close/reopen popup. Expected: last analysis and export availability return from extension-local storage.
43. **Clear Results.** Click Clear Results. Expected: diagnostics/results/export removed; threshold and checkbox remain.
44. **Remove extension.** Remove it in `chrome://extensions`. Expected: extension-local data disappears; previously downloaded files remain for manual retention cleanup.

## F. Security checks

45. Inspect `manifest.json`. Expected: only activeTab, storage, downloads, and the Logistics host; no broad hosts, scripting, cookies, history, externally connectable, or remote code.
46. Search source for `fetch`, XMLHttpRequest, WebSocket, EventSource, sendBeacon, `eval`, and `new Function`. Expected: none in executable extension code.
47. Use DevTools Network during inspect/analyze. Expected: no extension-initiated external request.
48. Inspect service-worker and page consoles. Expected: no unhandled rejection and no routine route data logged with DEBUG false.
49. Verify workflow. Expected: the extension does not navigate Operations/Delivery/DAs, click drivers, change dates, or process multiple drivers.
