(function (VRA) {
  'use strict';

  const HEADERS = [
    'Driver Name', 'Route Date', 'Route ID', 'Station', 'Previous Stop', 'Next Stop',
    'Previous Actual Time', 'Next Actual Time', 'Actual Gap Minutes', 'Previous Planned Time',
    'Next Planned Time', 'Planned Gap Minutes', 'Approved Break Minutes',
    'Remaining Non-Break Gap Minutes', 'Delay Versus Plan Minutes', 'Review Minutes',
    'Threshold Minutes', 'Status', 'Confidence', 'Review Reason', 'Extraction Warnings',
    'Analysis Timestamp'
  ];

  function protectFormula(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
  }

  function escapeCell(value) {
    const safe = protectFormula(value);
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }

  function toCsv(result) {
    const gaps = Array.isArray(result.gaps) ? result.gaps : [];
    const rows = gaps.map((gap) => [
      result.driverName, result.routeDate, result.routeId, result.station,
      gap.previousStop, gap.nextStop, gap.previousActualTime, gap.nextActualTime,
      gap.actualGapMinutes, gap.previousPlannedTime, gap.nextPlannedTime,
      gap.plannedGapMinutes, gap.approvedBreakMinutes, gap.remainingNonBreakGapMinutes,
      gap.delayVersusPlanMinutes, gap.reviewMinutes, gap.thresholdMinutes,
      gap.status, gap.confidence, gap.reviewReason,
      (gap.warnings || []).join('; '), result.analyzedAt
    ]);
    return '\uFEFF' + [HEADERS].concat(rows).map((row) => row.map(escapeCell).join(',')).join('\r\n');
  }

  function safeFilenamePart(value, fallback) {
    const sanitized = String(value || '').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '').slice(0, 50);
    return sanitized || fallback;
  }

  function filename(result) {
    return `vine-route-gap-audit_${safeFilenamePart(result.driverName, 'driver')}_${safeFilenamePart(result.routeDate, 'date-unknown')}.csv`;
  }

  VRA.CsvUtils = { HEADERS, protectFormula, escapeCell, toCsv, filename };
})(globalThis.VineRouteAuditor);
