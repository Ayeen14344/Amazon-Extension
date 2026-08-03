(function (VRA) {
  'use strict';

  const T = VRA.TimeUtils;
  const D = VRA.PageDetector;
  const I = VRA.ChartInspector;
  const RELEVANT_ATTRIBUTE = /^(?:aria-label|title|alt|data-tooltip|data-testid)$|(?:stop|time|route|break|series|point|planned|actual)/i;
  const STOP_PATTERN = /\b(?:stop(?:\s*number|\s*no\.?|\s*#)?\s*[:#-]?\s*)(\d{1,4})\b/i;
  const SERIES_ACTUAL = /\bactual\b|completed\s+(?:delivery\s+)?stop|delivered/i;
  const SERIES_PLANNED = /\bplanned\b|scheduled|route\s*plan/i;
  const SERIES_BREAK = /\bbreak\b|meal|rest\s*period/i;
  const CLOCKS = /\b(?:1[0-2]|0?[1-9]):[0-5]\d(?::[0-5]\d)?\s*(?:A\.?M\.?|P\.?M\.?)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/gi;

  function normalizeRouteDate(candidate) {
    const text = String(candidate || '');
    const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const mdy = text.match(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d{2})\b/);
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
    return '';
  }

  function seriesType(text) {
    if (SERIES_BREAK.test(text)) return 'break';
    if (SERIES_ACTUAL.test(text)) return 'actual';
    if (SERIES_PLANNED.test(text)) return 'planned';
    return 'unknown';
  }

  function parseBreak(text, routeDate, source, confidence) {
    const clocks = Array.from(String(text).matchAll(CLOCKS)).map((match) => match[0]);
    if (clocks.length < 2) return null;
    const start = T.parseTimestamp(clocks[0], routeDate);
    const end = T.parseTimestamp(clocks[1], routeDate);
    const warnings = start.warnings.concat(end.warnings);
    if (!start.valid || !end.valid) return null;
    let endDate = end.date;
    if (endDate <= start.date) endDate = new Date(endDate.getTime() + 86400000);
    const duration = Math.max(0, T.minutesBetween(start.date, endDate));
    return {
      seriesType: 'break', plannedStart: T.toLocalIso(start.date), plannedEnd: T.toLocalIso(endDate),
      allowanceMinutes: duration, source, sourceText: String(text).slice(0, 500), confidence, warnings
    };
  }

  function parsePoint(text, routeDate, source, confidence) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    const kind = seriesType(value);
    if (kind === 'break') return { breakRecord: parseBreak(value, routeDate, source, confidence) };
    const stop = value.match(STOP_PATTERN);
    const parsed = T.parseTimestamp(value, routeDate);
    if (!stop || !parsed.valid) return { unknown: value, warnings: parsed.warnings };
    return { point: {
      seriesType: kind,
      stopNumber: Number(stop[1]),
      timestamp: parsed.timestamp,
      displayTime: T.displayTime(parsed.date),
      source,
      sourceText: value.slice(0, 500),
      confidence: kind === 'unknown' ? 'low' : confidence,
      warnings: parsed.warnings.concat(kind === 'unknown' ? ['Series type could not be identified'] : [])
    } };
  }

  function accessibleValues(roots) {
    const output = [];
    I.elementsFromRoots(roots, '[aria-label], [title], [alt], [data-tooltip], [data-testid], [data-stop], [data-time], [data-series]', 800)
      .forEach((element) => Array.from(element.attributes || []).forEach((attribute) => {
        if (RELEVANT_ATTRIBUTE.test(attribute.name) && attribute.value.trim()) {
          output.push({ text: attribute.value, source: attribute.name, confidence: 'high' });
        }
      }));
    return output;
  }

  function visibleValues(roots) {
    return I.elementsFromRoots(roots, 'text, [role="tooltip"], figcaption, dt, dd, li, span', 1000)
      .filter(D.isVisible).map((element) => ({ text: D.shortText(element, 500), source: 'visible-text', confidence: 'medium' }))
      .filter((item) => item.text && (STOP_PATTERN.test(item.text) || SERIES_BREAK.test(item.text)));
  }

  function svgValues(roots) {
    return I.elementsFromRoots(roots, 'svg circle, svg rect, svg path, svg line, svg g, svg text', 1200).map((element) => {
      const parts = [D.shortText(element, 300)];
      Array.from(element.attributes || []).forEach((attribute) => {
        if (RELEVANT_ATTRIBUTE.test(attribute.name)) parts.push(attribute.value);
      });
      const parent = element.parentElement;
      if (parent) ['aria-label', 'title', 'data-tooltip'].forEach((name) => parts.push(parent.getAttribute(name) || ''));
      return { text: parts.filter(Boolean).join(' '), source: `svg-${element.tagName.toLowerCase()}`, confidence: 'medium' };
    }).filter((item) => item.text);
  }

  function collect(records, routeDate) {
    const actualStops = [];
    const plannedStops = [];
    const plannedBreaks = [];
    const unknownSamples = [];
    records.forEach((record) => {
      const parsed = parsePoint(record.text, routeDate, record.source, record.confidence || 'medium');
      if (parsed.point && parsed.point.seriesType === 'actual') actualStops.push(parsed.point);
      else if (parsed.point && parsed.point.seriesType === 'planned') plannedStops.push(parsed.point);
      else if (parsed.breakRecord) plannedBreaks.push(parsed.breakRecord);
      else if (parsed.point || parsed.unknown) unknownSamples.push({ source: record.source, text: String(record.text).slice(0, 300), warnings: parsed.warnings || parsed.point.warnings });
    });
    return {
      actualStops: VRA.GapEngine.deduplicatePoints(actualStops),
      plannedStops: VRA.GapEngine.deduplicatePoints(plannedStops),
      plannedBreaks: plannedBreaks.filter((item, index, all) => all.findIndex((other) =>
        other.plannedStart === item.plannedStart && other.plannedEnd === item.plannedEnd) === index),
      unknownSamples: unknownSamples.slice(0, VRA.Constants.MAX_DIAGNOSTIC_SAMPLES)
    };
  }

  /** Executes layered extraction and retains source/confidence evidence for every point. */
  async function extract(diagnostics, onProgress) {
    const candidates = D.findChartCandidates();
    if (!candidates.length) throw new Error('No chart container found. Open one driver’s Progress chart, ensure it is expanded, and try again.');
    const roots = candidates.map((item) => item.element);
    const routeDate = normalizeRouteDate(diagnostics.routeDateCandidate);
    const warnings = [];
    if (!routeDate) warnings.push('Route date is unavailable or ambiguous; clock-only timestamps cannot be used.');
    const records = accessibleValues(roots).concat(visibleValues(roots), svgValues(roots));
    const tooltipResult = await VRA.TooltipHarvester.harvest(roots, onProgress);
    tooltipResult.records.forEach((record) => records.push({ text: record.text, source: 'tooltip', confidence: 'medium' }));
    warnings.push(...tooltipResult.warnings);
    const collected = collect(records, routeDate);
    if (diagnostics.detectedChartRenderingMode === 'Canvas' && !collected.actualStops.length) {
      warnings.push('Canvas chart detected, but structured chart values are not accessible in Phase 1.');
    }
    if (!collected.actualStops.length) warnings.push('No actual stop points found. Download diagnostics for Amazon-specific selector refinement.');
    else if (collected.actualStops.length === 1) warnings.push('Only one valid actual stop found; at least two are required for a gap.');
    return Object.assign(collected, { routeDate, warnings: Array.from(new Set(warnings)), tooltipPointsProcessed: tooltipResult.pointsProcessed });
  }

  VRA.ChartExtractor = { extract, parsePoint, normalizeRouteDate };
})(globalThis.VineRouteAuditor);
