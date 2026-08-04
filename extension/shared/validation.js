(function (VRA) {
  'use strict';

  const C = VRA.Constants;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function validateMessage(message) {
    if (!isPlainObject(message) || typeof message.type !== 'string' ||
        !C.MESSAGE_TYPES.includes(message.type)) {
      return { valid: false, error: 'The extension received an unsupported message.' };
    }
    if (own(message, 'payload') && !isPlainObject(message.payload)) {
      return { valid: false, error: 'The message payload must be an object.' };
    }
    const payload = message.payload || {};
    if (message.type === 'ANALYZE_CURRENT_DRIVER') {
      const threshold = Number(payload.thresholdMinutes);
      if (!Number.isFinite(threshold) || threshold < C.MIN_THRESHOLD_MINUTES ||
          threshold > C.MAX_THRESHOLD_MINUTES) {
        return { valid: false, error: 'Threshold must be from 5 to 120 minutes.' };
      }
      if (typeof payload.considerPlannedTiming !== 'boolean') {
        return { valid: false, error: 'Planned timing setting must be true or false.' };
      }
    }
    if (message.type === 'START_LIVE_TOOLTIP_CAPTURE' && own(payload, 'timeoutMs')) {
      const timeout = Number(payload.timeoutMs);
      if (!Number.isFinite(timeout) || timeout < 60000 || timeout > 600000) {
        return { valid: false, error: 'Live capture timeout must be from 1 to 10 minutes.' };
      }
    }
    return { valid: true, payload };
  }

  function safeResponse(success, data, error) {
    return success
      ? { success: true, data: data === undefined ? null : data }
      : { success: false, error: String(error || 'The operation could not be completed.') };
  }

  function clampThreshold(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return C.DEFAULT_THRESHOLD_MINUTES;
    return Math.min(C.MAX_THRESHOLD_MINUTES, Math.max(C.MIN_THRESHOLD_MINUTES, number));
  }

  VRA.Validation = { isPlainObject, validateMessage, safeResponse, clampThreshold };
})(globalThis.VineRouteAuditor);
