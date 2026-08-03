(function (VRA) {
  'use strict';

  const T = VRA.TimeUtils;
  const TIME_TEXT = '(?:1[0-2]|0?[1-9]):[0-5]\\d(?::[0-5]\\d)?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)|(?:[01]?\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?';
  const SUPPORTED_HEADING = /\b(?:Actual\s*-\s*Delivery|Planned\s+route\s*-\s*Delivery|Planned\s*-\s*Meal\s+break)\b/i;

  function normalizeTooltipText(value) {
    const text = Array.isArray(value) ? value.join('\n') : String(value || '');
    return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim().slice(0, 1200);
  }

  function isSupportedTooltipText(value) {
    return SUPPORTED_HEADING.test(normalizeTooltipText(value));
  }

  function parsedTime(value, routeDate) {
    const parsed = T.parseTimestamp(value, routeDate);
    return { parsed, display: String(value || '').replace(/\s+/g, '') };
  }

  function parseActual(text, routeDate, source, confidence) {
    const stopMatch = text.match(new RegExp('Stop\\s*#?\\s*(\\d{1,4})\\s+(' + TIME_TEXT + ')', 'i'));
    const plannedMatch = text.match(new RegExp('Planned\\s+(' + TIME_TEXT + ')(?:\\s*\\(\\s*([+-]?\\d+(?:\\.\\d+)?)\\s*m\\s*\\))?', 'i'));
    if (!stopMatch) return incomplete(text, 'Actual delivery tooltip did not expose a stop number and time');
    const actual = parsedTime(stopMatch[2], routeDate);
    const planned = plannedMatch ? parsedTime(plannedMatch[1], routeDate) : null;
    if (!actual.parsed.valid) return incomplete(text, 'Actual delivery time was invalid or ambiguous', actual.parsed.warnings);
    const deliveryMatch = text.match(/\b(\d+)\s*\/\s*(\d+)\s+deliver(?:y|ies)\b/i);
    const packageMatch = text.match(/\b(\d+)\s+packages?\b/i);
    const varianceMinutes = plannedMatch && plannedMatch[2] !== undefined ? Number(plannedMatch[2]) : null;
    const warnings = actual.parsed.warnings.concat(planned ? planned.parsed.warnings : []);
    if (planned && !planned.parsed.valid) warnings.push('Planned comparison time was invalid or ambiguous');
    return { recognized: true, point: {
      seriesType: 'actual',
      stopNumber: Number(stopMatch[1]),
      timestamp: actual.parsed.timestamp,
      displayTime: actual.display,
      actualDisplayTime: actual.display,
      plannedTimestamp: planned && planned.parsed.valid ? planned.parsed.timestamp : '',
      plannedDisplayTime: planned ? planned.display : '',
      displayedVariance: varianceMinutes === null ? '' : `${plannedMatch[2]}m`,
      varianceMinutes,
      deliveryProgress: deliveryMatch ? `${deliveryMatch[1]}/${deliveryMatch[2]} deliveries` : '',
      completedDeliveryCount: deliveryMatch ? Number(deliveryMatch[1]) : null,
      deliveryCount: deliveryMatch ? Number(deliveryMatch[2]) : null,
      packageCount: packageMatch ? Number(packageMatch[1]) : null,
      source, sourceText: text, confidence, warnings
    } };
  }

  function parsePlanned(text, routeDate, source, confidence) {
    const stopMatch = text.match(new RegExp('Stop\\s*#?\\s*(\\d{1,4})\\s+(' + TIME_TEXT + ')', 'i'));
    if (!stopMatch) return incomplete(text, 'Planned delivery tooltip did not expose a stop number and time');
    const planned = parsedTime(stopMatch[2], routeDate);
    if (!planned.parsed.valid) return incomplete(text, 'Planned delivery time was invalid or ambiguous', planned.parsed.warnings);
    const packageMatch = text.match(/\b(\d+)\s+packages?\b/i);
    const deliveryMatch = text.match(/\b(\d+)(?:\s*\/\s*(\d+))?\s+deliver(?:y|ies)\b/i);
    return { recognized: true, point: {
      seriesType: 'planned',
      stopNumber: Number(stopMatch[1]),
      timestamp: planned.parsed.timestamp,
      displayTime: planned.display,
      plannedDisplayTime: planned.display,
      packageCount: packageMatch ? Number(packageMatch[1]) : null,
      deliveryCount: deliveryMatch ? Number(deliveryMatch[2] || deliveryMatch[1]) : null,
      source, sourceText: text, confidence, warnings: planned.parsed.warnings
    } };
  }

  function parseMealBreak(text, routeDate, source, confidence) {
    const startMatch = text.match(new RegExp('Start\\s+(' + TIME_TEXT + ')', 'i'));
    const endMatch = text.match(new RegExp('End\\s+(' + TIME_TEXT + ')', 'i'));
    const durationMatch = text.match(/Duration\s+([0-9]+(?:\.[0-9]+)?)\s*m(?:in(?:ute)?s?)?/i);
    if (!startMatch || !endMatch) return incomplete(text, 'Meal-break tooltip did not expose both start and end times');
    const start = parsedTime(startMatch[1], routeDate);
    const end = parsedTime(endMatch[1], routeDate);
    if (!start.parsed.valid || !end.parsed.valid) {
      return incomplete(text, 'Meal-break start or end time was invalid or ambiguous', start.parsed.warnings.concat(end.parsed.warnings));
    }
    let endDate = end.parsed.date;
    if (endDate <= start.parsed.date) endDate = new Date(endDate.getTime() + 86400000);
    const calculatedDuration = Math.max(0, T.minutesBetween(start.parsed.date, endDate));
    const displayedDuration = durationMatch ? Number(durationMatch[1]) : null;
    return { recognized: true, breakRecord: {
      seriesType: 'break', breakType: 'meal',
      plannedStart: T.toLocalIso(start.parsed.date),
      plannedEnd: T.toLocalIso(endDate),
      plannedStartDisplayTime: start.display,
      plannedEndDisplayTime: end.display,
      plannedDurationMinutes: calculatedDuration,
      displayedDuration: displayedDuration === null ? '' : `${durationMatch[1]}m`,
      allowanceMinutes: displayedDuration,
      source, sourceText: text, confidence,
      warnings: start.parsed.warnings.concat(end.parsed.warnings)
    } };
  }

  function incomplete(text, warning, additionalWarnings) {
    return { recognized: true, unknown: text, warnings: [warning].concat(additionalWarnings || []) };
  }

  /** Parses only the three observed Amazon tooltip headings; no stop or time value is hardcoded. */
  function parse(value, routeDate, source, confidence) {
    const text = normalizeTooltipText(value);
    if (!text) return { recognized: false };
    if (/\bActual\s*-\s*Delivery\b/i.test(text)) return parseActual(text, routeDate, source || 'tooltip', confidence || 'medium');
    if (/\bPlanned\s+route\s*-\s*Delivery\b/i.test(text)) return parsePlanned(text, routeDate, source || 'tooltip', confidence || 'medium');
    if (/\bPlanned\s*-\s*Meal\s+break\b/i.test(text)) return parseMealBreak(text, routeDate, source || 'tooltip', confidence || 'medium');
    return { recognized: false };
  }

  VRA.TooltipParser = { parse, isSupportedTooltipText, normalizeTooltipText };
})(globalThis.VineRouteAuditor);
