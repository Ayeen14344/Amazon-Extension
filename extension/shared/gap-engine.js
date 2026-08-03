(function (VRA) {
  'use strict';

  const C = VRA.Constants;
  const T = VRA.TimeUtils;

  function pointKey(point) {
    return [point.seriesType || 'unknown', point.stopNumber ?? '', point.timestamp || ''].join('|');
  }

  function deduplicatePoints(points) {
    const seen = new Set();
    return (Array.isArray(points) ? points : []).filter((point) => {
      const key = pointKey(point);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function preparePoints(points, routeDate) {
    const valid = [];
    const invalid = [];
    deduplicatePoints(points).forEach((point) => {
      const copy = Object.assign({ warnings: [], confidence: 'medium' }, point);
      const parsed = T.parseTimestamp(copy.timestamp || copy.displayTime || copy.sourceText, routeDate);
      copy.warnings = copy.warnings.concat(parsed.warnings);
      if (!parsed.valid || !Number.isFinite(Number(copy.stopNumber))) {
        copy.warnings.push(!Number.isFinite(Number(copy.stopNumber)) ? 'Stop number is invalid' : 'Timestamp is invalid');
        invalid.push(copy);
        return;
      }
      copy.stopNumber = Number(copy.stopNumber);
      copy.timestamp = parsed.timestamp;
      copy._date = parsed.date;
      valid.push(copy);
    });
    const clockOnly = valid.filter((point) => point.warnings.includes('Clock time combined with route date'));
    if (clockOnly.length >= 2) {
      let previousClock = null;
      clockOnly.sort((a, b) => a.stopNumber - b.stopNumber).forEach((point) => {
        if (previousClock && point._date < previousClock && previousClock - point._date > 12 * 60 * 60000) {
          point._date = new Date(point._date.getTime() + 86400000);
          point.timestamp = T.toLocalIso(point._date);
          point.warnings.push('Timestamp adjusted to next day using stop order for midnight crossing');
        }
        previousClock = point._date;
      });
    }
    valid.sort((a, b) => a._date - b._date || a.stopNumber - b.stopNumber);
    return { valid, invalid };
  }

  function prepareBreaks(breaks, routeDate) {
    const prepared = (Array.isArray(breaks) ? breaks : []).map((item, index) => {
      const start = T.parseTimestamp(item.plannedStart, routeDate);
      const end = T.parseTimestamp(item.plannedEnd, routeDate);
      let endDate = end.date;
      if (start.valid && end.valid && endDate <= start.date) endDate = new Date(endDate.getTime() + 86400000);
      const duration = start.valid && end.valid ? Math.max(0, T.minutesBetween(start.date, endDate)) : 0;
      return Object.assign({}, item, {
        breakIndex: item.breakIndex || index + 1,
        breakWindowId: stableBreakWindowId(item, start.timestamp, end.timestamp, index),
        _start: start.date,
        _end: endDate,
        valid: start.valid && end.valid && endDate > start.date,
        _plannedDurationMinutes: duration
      });
    }).sort((a, b) => (a._start || 0) - (b._start || 0));

    const seenWindowIds = new Set();
    const distinctPrepared = prepared.filter((item) => {
      if (seenWindowIds.has(item.breakWindowId)) return false;
      seenWindowIds.add(item.breakWindowId);
      return true;
    });

    let unidentifiedBreakIndex = 0;
    distinctPrepared.forEach((item) => {
      const resolved = resolveBreakAllowance(item, unidentifiedBreakIndex);
      if (resolved.source === 'chronological-fallback') unidentifiedBreakIndex += 1;
      const allowance = item.valid ? Math.min(resolved.minutes, item._plannedDurationMinutes) : 0;
      item.allowanceSource = resolved.source;
      item.allowanceMinutes = Math.max(0, allowance);
      item.remainingAllowanceMinutes = Math.max(0, allowance);
    });
    return distinctPrepared;
  }

  function normalizedBreakType(item) {
    const value = item.normalizedBreakType || item.breakType || '';
    return String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  function sanitizedBreakLabel(item) {
    return [item.breakLabel, item.label, item.sourceText]
      .filter((value) => typeof value === 'string')
      .join(' ').replace(/\s+/g, ' ').trim().slice(0, 500);
  }

  function resolveBreakAllowance(item, unidentifiedBreakIndex) {
    const explicit = typeof item.allowanceMinutes === 'number'
      ? item.allowanceMinutes
      : (typeof item.allowanceMinutes === 'string' && item.allowanceMinutes.trim() !== ''
        ? Number(item.allowanceMinutes) : NaN);
    if (Number.isFinite(explicit) && explicit > 0) {
      return { minutes: explicit, source: 'explicit-allowance' };
    }

    const type = normalizedBreakType(item);
    if (Object.prototype.hasOwnProperty.call(C.BREAK_TYPE_ALLOWANCES_MINUTES, type)) {
      // Explicit meal metadata must win before the 15/30/15 fallback so a standalone meal is not treated as a first rest break.
      return { minutes: C.BREAK_TYPE_ALLOWANCES_MINUTES[type], source: 'normalized-break-type' };
    }

    const label = sanitizedBreakLabel(item);
    if (/\b(?:meal|lunch)\b/i.test(label)) return { minutes: 30, source: 'recognized-meal-label' };
    if (/\b(?:rest|first\s+break|second\s+break|paid\s+break|15[ -]?minute\s+break)\b/i.test(label)) {
      return { minutes: 15, source: 'recognized-rest-label' };
    }

    const fallbacks = C.BREAK_ALLOWANCES_MINUTES;
    return {
      minutes: fallbacks[Math.min(unidentifiedBreakIndex, fallbacks.length - 1)],
      source: 'chronological-fallback'
    };
  }

  function stableBreakWindowId(item, startTimestamp, endTimestamp, originalIndex) {
    const supplied = item.breakWindowId || item.breakId;
    if (typeof supplied === 'string' && supplied.trim()) return supplied.trim().slice(0, 120);
    if (startTimestamp && endTimestamp) {
      return [startTimestamp, endTimestamp, normalizedBreakType(item) || 'unknown'].join('|');
    }
    return ['invalid-window', originalIndex + 1].join('|');
  }

  function findPlanned(planned, stopNumber, actualDate) {
    const candidates = planned.filter((point) => point.stopNumber === stopNumber);
    if (!candidates.length) return { point: null, ambiguous: false };
    candidates.sort((a, b) => Math.abs(a._date - actualDate) - Math.abs(b._date - actualDate));
    return { point: candidates[0], ambiguous: candidates.length > 1 };
  }

  function approveBreakOverlap(start, end, breaks) {
    let approved = 0;
    const used = [];
    breaks.forEach((plannedBreak) => {
      if (!plannedBreak.valid || plannedBreak.remainingAllowanceMinutes <= 0) return;
      const overlapMs = Math.max(0, Math.min(end, plannedBreak._end) - Math.max(start, plannedBreak._start));
      const overlapMinutes = overlapMs / 60000;
      const applied = Math.min(overlapMinutes, plannedBreak.remainingAllowanceMinutes);
      if (applied > 0) {
        plannedBreak.remainingAllowanceMinutes -= applied;
        approved += applied;
        used.push({ breakIndex: plannedBreak.breakIndex, breakWindowId: plannedBreak.breakWindowId, minutes: T.round1(applied) });
      }
    });
    return { approved: Math.max(0, approved), used };
  }

  function classify(reviewMinutes, approvedBreakMinutes, remaining, threshold) {
    if (approvedBreakMinutes > 0 && remaining < 10) return C.STATUS.PLANNED_BREAK;
    // The required acceptance fixture defines an exact 10-minute gap as NORMAL.
    if (reviewMinutes <= C.NORMAL_MAX_MINUTES) return C.STATUS.NORMAL;
    if (reviewMinutes >= threshold) return C.STATUS.RED_FLAG;
    return C.STATUS.REVIEW;
  }

  function reasonFor(status, reviewMinutes, threshold, plannedAvailable) {
    if (status === C.STATUS.PLANNED_BREAK) return 'Gap is explained by available planned-break overlap.';
    if (status === C.STATUS.RED_FLAG) return `Potential route gap requiring manual review: ${T.round1(reviewMinutes)} review minutes meets or exceeds the ${threshold}-minute threshold.`;
    if (status === C.STATUS.REVIEW) return `Potential route gap requiring manual review: ${T.round1(reviewMinutes)} review minutes is below the red-flag threshold.`;
    if (status === C.STATUS.INCOMPLETE) return 'Calculation could not be completed confidently.';
    return plannedAvailable ? 'Gap is within the configured review range.' : 'Gap is within the configured review range; planned timing was unavailable.';
  }

  /** Runs the deterministic route-gap analysis. */
  function analyze(input) {
    const routeDate = String(input.routeDate || '');
    const threshold = VRA.Validation.clampThreshold(input.thresholdMinutes);
    const considerPlanned = input.considerPlannedTiming === true;
    const actual = preparePoints(input.actualStops, routeDate);
    const planned = preparePoints(input.plannedStops, routeDate);
    const breaks = prepareBreaks(input.plannedBreaks, routeDate);
    const warnings = Array.isArray(input.warnings) ? input.warnings.slice() : [];
    if (!breaks.some((item) => item.valid)) warnings.push('Planned-break data unavailable');
    if (actual.invalid.length) warnings.push(`${actual.invalid.length} actual record(s) were invalid and excluded`);
    const gaps = [];

    for (let index = 1; index < actual.valid.length; index += 1) {
      const previous = actual.valid[index - 1];
      const next = actual.valid[index];
      const actualGap = T.minutesBetween(previous._date, next._date);
      if (!Number.isFinite(actualGap) || actualGap < 0) {
        gaps.push({ previousStop: previous.stopNumber, nextStop: next.stopNumber, status: C.STATUS.INCOMPLETE,
          reviewReason: reasonFor(C.STATUS.INCOMPLETE, 0, threshold, false), confidence: 'low' });
        continue;
      }
      const previousPlanned = findPlanned(planned.valid, previous.stopNumber, previous._date);
      const nextPlanned = findPlanned(planned.valid, next.stopNumber, next._date);
      const plannedAvailable = Boolean(previousPlanned.point && nextPlanned.point);
      const plannedGap = plannedAvailable ? T.minutesBetween(previousPlanned.point._date, nextPlanned.point._date) : null;
      const overlap = approveBreakOverlap(previous._date, next._date, breaks);
      const remaining = Math.max(0, actualGap - overlap.approved);
      const delay = plannedAvailable ? actualGap - plannedGap : null;
      const review = Math.max(0, considerPlanned && plannedAvailable ? remaining - Math.max(0, plannedGap) : remaining);
      const status = classify(review, overlap.approved, remaining, threshold);
      const gapWarnings = [];
      if (!breaks.some((item) => item.valid)) gapWarnings.push('Planned-break data unavailable');
      if (!plannedAvailable) gapWarnings.push('Matching planned stop timing unavailable');
      if (previousPlanned.ambiguous || nextPlanned.ambiguous) gapWarnings.push('Duplicate planned stop number matched to closest timestamp');
      gaps.push({
        previousStop: previous.stopNumber,
        nextStop: next.stopNumber,
        previousActualTime: previous.timestamp,
        nextActualTime: next.timestamp,
        actualGapMinutes: T.round1(actualGap),
        previousPlannedTime: previousPlanned.point ? previousPlanned.point.timestamp : '',
        nextPlannedTime: nextPlanned.point ? nextPlanned.point.timestamp : '',
        plannedGapMinutes: T.round1(plannedGap),
        approvedBreakMinutes: T.round1(overlap.approved),
        remainingNonBreakGapMinutes: T.round1(remaining),
        delayVersusPlanMinutes: T.round1(delay),
        reviewMinutes: T.round1(review),
        thresholdMinutes: threshold,
        status,
        confidence: previousPlanned.ambiguous || nextPlanned.ambiguous ? 'medium' :
          (previous.confidence === 'low' || next.confidence === 'low' ? 'low' : 'high'),
        reviewReason: reasonFor(status, review, threshold, plannedAvailable),
        breakUsage: overlap.used,
        warnings: gapWarnings
      });
    }
    if (actual.valid.length < 2) {
      gaps.push({ status: C.STATUS.INCOMPLETE, confidence: 'low',
        reviewReason: actual.valid.length === 0 ? 'No valid actual stop points were found.' : 'Only one valid actual stop was found.', warnings: warnings.slice() });
    }
    const counts = gaps.reduce((acc, gap) => {
      acc[gap.status] = (acc[gap.status] || 0) + 1;
      return acc;
    }, {});
    return Object.assign({}, input, {
      thresholdMinutes: threshold,
      considerPlannedTiming: considerPlanned,
      actualStops: actual.valid.map(stripInternal),
      plannedStops: planned.valid.map(stripInternal),
      plannedBreaks: breaks.map(stripInternal),
      invalidActualStops: actual.invalid,
      invalidPlannedStops: planned.invalid,
      gaps,
      warnings: Array.from(new Set(warnings)),
      summary: {
        actualPoints: actual.valid.length,
        plannedPoints: planned.valid.length,
        plannedBreaks: breaks.filter((item) => item.valid).length,
        gapsAnalyzed: gaps.filter((gap) => gap.actualGapMinutes !== undefined).length,
        redFlags: counts[C.STATUS.RED_FLAG] || 0,
        reviewItems: counts[C.STATUS.REVIEW] || 0,
        incompleteItems: counts[C.STATUS.INCOMPLETE] || 0
      }
    });
  }

  function stripInternal(value) {
    const copy = Object.assign({}, value);
    Object.keys(copy).filter((key) => key.startsWith('_') || key === 'remainingAllowanceMinutes' || key === 'valid')
      .forEach((key) => delete copy[key]);
    return copy;
  }

  VRA.GapEngine = { analyze, deduplicatePoints, preparePoints };
})(globalThis.VineRouteAuditor);
