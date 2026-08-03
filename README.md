# VINE Route Gap Auditor

Version 0.1.0 — Phase 1: Current Driver Analysis

VINE Route Gap Auditor is a private, local-only Chrome extension for authorized Amazon DSP personnel. It inspects one manually opened Amazon Logistics driver Progress chart, extracts only accessible structured values, applies a deterministic planned-break allowance engine, identifies potential route gaps requiring manual review, and exports the results to CSV.

The extension is an anomaly-screening aid. A result is never proof of time theft, fraud, misconduct, or a policy violation, and it must never make or substitute for an employment decision.

## What Phase 1 does

- Recognizes `https://logistics.amazon.com/` pages and checks for a likely expanded progress chart.
- Inspects bounded HTML, SVG, canvas, accessibility, title, data-attribute, legend, and tooltip structures.
- Tries accessible attributes, visible chart text, SVG metadata, and safe sequential hover tooltips in that order.
- Extracts explicitly identified actual stops, planned stops, and planned-break windows when their structured timestamps are available.
- Calculates consecutive actual-stop gaps, break overlap, remaining non-break time, optional delay versus plan, and explainable classifications.
- Stores the last diagnostics, analysis, CSV-ready result, and settings in `chrome.storage.local`.
- Shows results safely in the popup and exports a UTF-8 CSV protected against formula injection.
- Produces structure-focused diagnostics instead of fabricating values when Amazon's real chart is unsupported.

## What Phase 1 does not do

It does not navigate Operations, Delivery, or DAs; click or select drivers; select dates; process multiple drivers; use OCR or pixels; reverse engineer Amazon APIs; access credentials, cookies, tokens, MFA, headers, or history; send data externally; upload to Supabase or Hostinger; call AI; recommend discipline; or implement any Phase 2 automation.

## Security and privacy limits

Processing remains in Chrome. The manifest is limited to `activeTab`, `storage`, `downloads`, and `https://logistics.amazon.com/*`. There is no `<all_urls>`, scripting permission, externally connectable entry, remote script, external request, analytics, or telemetry. Diagnostics sample a limited number of chart-adjacent structures and never copy the whole page HTML. The operator is responsible for authorized use and safe handling of downloaded route data. See [PRIVACY_AND_SECURITY.md](docs/PRIVACY_AND_SECURITY.md).

## Folder structure

```text
vine-route-gap-auditor/
├── extension/             Load this folder in Chrome
│   ├── manifest.json
│   ├── service-worker.js
│   ├── shared/            Deterministic utilities
│   ├── content/           Detection, inspection, extraction
│   └── popup/             Accessible operator interface
├── tests/                 Direct-open browser tests
├── docs/                  Diagnostics, security, and test guidance
├── README.md
└── .gitignore
```

There is deliberately no `package.json`, `node_modules`, build configuration, server, or generated bundle.

## Install with Chrome Developer mode

No terminal command is needed.

1. Save or extract this entire `vine-route-gap-auditor` folder in a stable location.
2. Open Google Chrome.
3. Enter `chrome://extensions` in the address bar.
4. Turn on **Developer mode** in the upper-right corner.
5. Click **Load unpacked**.
6. Select the `vine-route-gap-auditor/extension` folder, not the project root.
7. Confirm that **VINE Route Gap Auditor 0.1.0** appears without errors.
8. Optional: open Chrome's Extensions menu and pin VINE Route Gap Auditor.
9. If an Amazon Logistics page was already open, reload that tab once so the content script is installed.

After any source-file update, return to `chrome://extensions`, click the extension's reload button, and reload the Amazon tab.

## Open and analyze one driver

1. Log in to Amazon through the normal authorized workflow.
2. Manually open Operations, Delivery, then DAs.
3. Manually choose one driver and the appropriate route/date.
4. Manually expand that driver's **Progress chart**.
5. Click the VINE Route Gap Auditor toolbar button.
6. Verify that the popup says **Supported Amazon page** or **Chart detected**.
7. Set the red-flag threshold from 5 to 120 minutes. The default is 20.
8. Leave **Consider planned route timing** unchecked for the default raw non-break-gap rule; check it only when planned timing should reduce review minutes.
9. Click **Inspect Chart** first.
10. Review the detected mode, counts, accessibility samples, and warnings.
11. Click **Analyze Current Driver**. Tooltip points are processed sequentially; click **Cancel** if needed.
12. Review every result and warning manually. A red flag is only a potential route gap requiring manual review.

## Inspect Chart and diagnostics

**Inspect Chart** records the URL without its fragment, page title, timestamp, limited route candidates, graphics counts, chart-related headings, legend text, nearby ARIA/title/data attributes, tooltip candidates, sampled SVG structure, accessibility signals, rendering mode, and extraction warnings. It does not save full HTML.

Use **Copy Diagnostics** to put formatted JSON on the clipboard, or **Download JSON** to save `vine-chart-diagnostics_YYYY-MM-DD.json`. When extraction fails on the real chart, follow [AMAZON_CHART_DIAGNOSTICS.md](docs/AMAZON_CHART_DIAGNOSTICS.md) and share a privacy-reviewed diagnostics file with the developer.

## Export CSV

After analysis, click **Export CSV**, choose a local destination, and save. The filename resembles `vine-route-gap-audit_DRIVER_2026-08-02.csv`. Commas, quotes, and line breaks are correctly quoted. Cells beginning with `=`, `+`, `-`, or `@` receive a leading apostrophe to reduce spreadsheet formula-injection risk.

## Clear stored results

Click **Clear Results** to remove the last diagnostics, analysis, and CSV-ready result from extension-local storage. The saved threshold and planned-timing preference remain. Remove the extension itself to delete all of its remaining local data.

## Run the browser tests

No server or extension installation is required.

1. Open the project `tests` folder in File Explorer.
2. Double-click `test-runner.html`, or drag it into Chrome.
3. Confirm the page title starts with **PASS**.
4. Confirm **Total 15**, **Passed 15**, and **Failed 0**.
5. Review each expected value, actual value, and PASS/FAIL result.

Tests use fixed August 2026 timestamps and cover thresholds, planned breaks, allowance reuse, invalid records, sorting, duplicates, planned timing, midnight crossing, and CSV escaping.

## Inspect errors

### Popup errors

1. Open the popup.
2. Right-click inside it and choose **Inspect**.
3. In DevTools, open **Console**. User-readable errors also appear in the popup.

### Service-worker errors

1. Open `chrome://extensions`.
2. Find VINE Route Gap Auditor.
3. Click the **service worker** link under **Inspect views**.
4. Review the Console. If the worker is inactive, open the popup once and try again.

### Content-script errors

1. Open the authorized Amazon Logistics tab.
2. Press F12 or use **More tools → Developer tools**.
3. Open **Console** and select the page's JavaScript context.
4. Reload the page after extension updates before reproducing the issue.

The code's `DEBUG` constant defaults to `false`, so routine chart data is not logged.

## Known limitations

- The authenticated Amazon DOM was not available during development. Amazon-specific extraction is therefore unproven; the implementation uses layered semantic discovery and fails with diagnostics when values are inaccessible.
- Canvas pixels are never read. A canvas chart without accessible DOM/tooltips reports that structured values are unavailable in Phase 1.
- Clock-only values require an unambiguous route date. Ambiguous or invalid values are preserved as diagnostic warnings and excluded from calculations.
- Series names must be present in accessible text or metadata. Colors and SVG positions alone are not treated as proof of actual, planned, or break series.
- Hover-disclosed values depend on the real page responding to synthetic pointer/mouse events.
- Matching uses stop number and then closest valid timestamp for duplicates; duplicate matches reduce confidence.
- The required browser fixture treats an exact 10.0 review-minute result as NORMAL; results above 10.0 and below the configured threshold are REVIEW.

## Information needed for Amazon selector refinement

Provide a privacy-reviewed diagnostics JSON from both a working expanded chart and, if possible, a failed chart state. Also report the visible legend wording, rendering mode, whether manual hover shows a DOM tooltip, sanitized example tooltip strings for actual/planned/break values, and whether the page changed while extracting. Do not provide cookies, tokens, request captures, full HTML, credentials, or screenshots for OCR. Detailed instructions are in [AMAZON_CHART_DIAGNOSTICS.md](docs/AMAZON_CHART_DIAGNOSTICS.md).

## Remove the extension

1. Open `chrome://extensions`.
2. Find VINE Route Gap Auditor.
3. Click **Remove**, then confirm.
4. Delete locally exported CSV/diagnostic files according to your organization's retention rules.
5. Delete the project folder if it is no longer required.

Removing the extension deletes its `chrome.storage.local` data. It does not automatically delete files already downloaded to disk.
