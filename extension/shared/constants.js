(function (VRA) {
  'use strict';

  VRA.Constants = Object.freeze({
    VERSION: '0.1.0',
    DEBUG: false,
    AMAZON_ORIGIN: 'https://logistics.amazon.com',
    DEFAULT_THRESHOLD_MINUTES: 20,
    MIN_THRESHOLD_MINUTES: 5,
    MAX_THRESHOLD_MINUTES: 120,
    NORMAL_MAX_MINUTES: 10,
    TOOLTIP_DELAY_MS: 90,
    TOOLTIP_TIMEOUT_MS: 900,
    MAX_DIAGNOSTIC_SAMPLES: 30,
    BREAK_ALLOWANCES_MINUTES: Object.freeze([15, 30, 15]),
    MESSAGE_TYPES: Object.freeze([
      'CHECK_PAGE_STATUS', 'INSPECT_CHART', 'ANALYZE_CURRENT_DRIVER',
      'CANCEL_ANALYSIS', 'GET_LAST_RESULT', 'SAVE_LAST_RESULT',
      'EXPORT_CSV', 'CLEAR_RESULTS'
    ]),
    STORAGE_KEYS: Object.freeze({
      threshold: 'thresholdMinutes',
      considerPlanned: 'considerPlannedTiming',
      diagnostics: 'lastDiagnostics',
      analysis: 'lastAnalysis',
      csvResult: 'lastCsvReadyResult'
    }),
    STATUS: Object.freeze({
      NORMAL: 'NORMAL',
      PLANNED_BREAK: 'PLANNED BREAK',
      REVIEW: 'REVIEW',
      RED_FLAG: 'RED FLAG',
      INCOMPLETE: 'INCOMPLETE DATA',
      UNSUPPORTED: 'UNSUPPORTED CHART'
    })
  });
})(globalThis.VineRouteAuditor);
