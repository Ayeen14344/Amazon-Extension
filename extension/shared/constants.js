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
    MAX_TOOLTIP_POINTS: 180,
    LIVE_CAPTURE_TIMEOUT_MS: 300000,
    LIVE_TOOLTIP_STABILITY_MS: 140,
    MAX_LIVE_CAPTURE_RECORDS: 100,
    MAX_LIVE_TOOLTIP_TEXT: 1000,
    MAX_DIAGNOSTIC_SAMPLES: 30,
    BREAK_ALLOWANCES_MINUTES: Object.freeze([15, 30, 15]),
    BREAK_TYPE_ALLOWANCES_MINUTES: Object.freeze({
      first_break: 15,
      meal: 30,
      lunch: 30,
      second_break: 15,
      rest_break: 15
    }),
    MESSAGE_TYPES: Object.freeze([
      'CHECK_PAGE_STATUS', 'INSPECT_CHART', 'ANALYZE_CURRENT_DRIVER',
      'CANCEL_ANALYSIS', 'GET_LAST_RESULT', 'SAVE_LAST_RESULT',
      'EXPORT_CSV', 'CLEAR_RESULTS', 'START_LIVE_TOOLTIP_CAPTURE',
      'GET_LIVE_CAPTURE_STATUS', 'CLEAR_LIVE_CAPTURE', 'EXPORT_LIVE_CAPTURE'
    ]),
    STORAGE_KEYS: Object.freeze({
      threshold: 'thresholdMinutes',
      considerPlanned: 'considerPlannedTiming',
      diagnostics: 'lastDiagnostics',
      analysis: 'lastAnalysis',
      csvResult: 'lastCsvReadyResult',
      liveCapture: 'lastLiveTooltipCapture'
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
