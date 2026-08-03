(function (VRA) {
  'use strict';

  const CLOCK_12 = /\b(1[0-2]|0?[1-9]):([0-5]\d)(?::([0-5]\d))?\s*([AP]\.?M\.?)\b/i;
  const CLOCK_24 = /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/;
  const ISO_LIKE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?\b/;

  function validDateParts(routeDate) {
    if (typeof routeDate !== 'string') return null;
    const match = routeDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 ||
        date.getDate() !== Number(match[3])) return null;
    return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
  }

  /** Parses an ISO value or clock time without silently choosing a route date. */
  function parseTimestamp(value, routeDate) {
    const warnings = [];
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      return { valid: true, date: new Date(value.getTime()), timestamp: value.toISOString(), warnings };
    }
    const text = String(value || '').trim();
    if (!text) return { valid: false, date: null, timestamp: '', warnings: ['Timestamp is missing'] };
    const iso = text.match(ISO_LIKE);
    if (iso) {
      const date = new Date(iso[0]);
      if (Number.isFinite(date.getTime())) return { valid: true, date, timestamp: date.toISOString(), warnings };
      return { valid: false, date: null, timestamp: '', warnings: ['ISO timestamp is invalid'] };
    }
    const parts = validDateParts(routeDate);
    const match12 = text.match(CLOCK_12);
    const match24 = match12 ? null : text.match(CLOCK_24);
    if (!match12 && !match24) {
      return { valid: false, date: null, timestamp: '', warnings: ['No supported timestamp was found'] };
    }
    if (!parts) {
      return { valid: false, date: null, timestamp: '', warnings: ['Clock time is ambiguous without a valid route date'] };
    }
    let hour;
    let minute;
    let second;
    if (match12) {
      hour = Number(match12[1]) % 12;
      if (/P/i.test(match12[4])) hour += 12;
      minute = Number(match12[2]);
      second = Number(match12[3] || 0);
    } else {
      hour = Number(match24[1]);
      minute = Number(match24[2]);
      second = Number(match24[3] || 0);
    }
    const date = new Date(parts.year, parts.month, parts.day, hour, minute, second, 0);
    warnings.push('Clock time combined with route date');
    return { valid: true, date, timestamp: toLocalIso(date), warnings };
  }

  function toLocalIso(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function displayTime(dateOrValue) {
    const date = dateOrValue instanceof Date ? dateOrValue : new Date(dateOrValue);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function minutesBetween(start, end) {
    return (end.getTime() - start.getTime()) / 60000;
  }

  function round1(value) {
    return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 10) / 10 : null;
  }

  /** Moves a clock-only point to the following day when route order clearly crosses midnight. */
  function adjustMidnightSequence(records) {
    let previous = null;
    return records.map((record) => {
      const copy = Object.assign({}, record);
      const parsed = parseTimestamp(copy.timestamp || copy.displayTime || copy.sourceText, copy.routeDate);
      if (!parsed.valid) return copy;
      let date = parsed.date;
      if (previous && date.getTime() < previous.getTime() &&
          previous.getTime() - date.getTime() > 12 * 60 * 60000) {
        date = new Date(date.getTime() + 24 * 60 * 60000);
        copy.warnings = (copy.warnings || []).concat('Timestamp adjusted to next day for midnight crossing');
      }
      copy.timestamp = toLocalIso(date);
      previous = date;
      return copy;
    });
  }

  VRA.TimeUtils = { parseTimestamp, displayTime, minutesBetween, round1, toLocalIso, adjustMidnightSequence };
})(globalThis.VineRouteAuditor);
