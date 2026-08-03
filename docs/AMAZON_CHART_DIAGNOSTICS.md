# Amazon Chart Diagnostics Guide

Use this guide when the popup detects the Amazon page but cannot extract at least two valid actual stops. The goal is to refine semantic extraction using authorized, rendered page data—not to collect private session material or reverse engineer an API.

## Capture the report

1. Manually open one driver's route and expand **Progress chart**.
2. Confirm that the chart, legend, stop axis, and any planned-break bands are visible.
3. Open VINE Route Gap Auditor and click **Inspect Chart**.
4. Read every extraction warning.
5. Click **Download JSON**.
6. Repeat once after manually hovering an actual point, if a tooltip stays visible long enough.
7. Open each JSON file in a text editor and perform the privacy review below before sharing it.

## Privacy review before sharing

Remove values not needed for chart support. Driver, route, station, URL, title, ARIA, title, data-attribute, and tooltip samples can contain operational or personal information. Replace unnecessary identities with consistent placeholders such as `DRIVER_A` and `ROUTE_A` while preserving field structure. Never add or share:

- Passwords, cookies, authorization tokens, request headers, MFA information, or browser history.
- Network/HAR captures, local storage belonging to Amazon, or full page HTML.
- Unrelated page text, unrelated personnel data, or screenshots intended for OCR.

## What the developer needs

Provide:

1. Extension version and Chrome version.
2. Whether the chart was fully expanded.
3. `detectedChartRenderingMode`.
4. SVG/canvas/container and primitive counts.
5. Chart-related heading and visible legend samples.
6. Sanitized chart-adjacent ARIA labels and title attributes.
7. Sanitized relevant data attributes.
8. Tooltip candidate structure and sanitized tooltip strings.
9. Sampled SVG element attributes, especially semantic labels—not pixel-derived interpretations.
10. The three accessibility booleans for actual, planned, and break timestamps.
11. All extraction warnings and unknown-extraction samples.
12. Whether a manual hover reveals a normal DOM tooltip and whether synthetic hover revealed it.
13. Sanitized examples of the exact text patterns for actual stop, planned stop, and break start/end.
14. Whether the route crosses midnight and the route-date format shown on the page.

## Useful comparison captures

If authorized, collect separate privacy-reviewed JSON reports for an SVG chart, a canvas chart, a chart with planned breaks, a route crossing midnight, and a state where the chart is collapsed. These structural comparisons are much more useful than screenshots.

## Expected unsupported behavior

For a canvas chart with no accessible values, the correct Phase 1 result is: **Canvas chart detected, but structured chart values are not accessible in Phase 1.** The extension must not infer values from pixels or invent timestamps.
