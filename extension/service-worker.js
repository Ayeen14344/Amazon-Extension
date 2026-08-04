importScripts('shared/namespace.js', 'shared/constants.js', 'shared/validation.js', 'shared/csv-utils.js');

(function (VRA) {
  'use strict';

  const K = VRA.Constants.STORAGE_KEYS;
  const response = VRA.Validation.safeResponse;

  async function getStored() {
    return chrome.storage.local.get(Object.values(K));
  }

  async function handle(message, sender) {
    if (sender.id !== chrome.runtime.id) return response(false, null, 'Rejected message from an untrusted sender.');
    const validation = VRA.Validation.validateMessage(message);
    if (!validation.valid) return response(false, null, validation.error);
    const payload = validation.payload;
    switch (message.type) {
      case 'GET_LAST_RESULT':
        return response(true, await getStored());
      case 'SAVE_LAST_RESULT': { 
        const update = {};
        if (payload.settings) {
          update[K.threshold] = VRA.Validation.clampThreshold(payload.settings.thresholdMinutes);
          update[K.considerPlanned] = payload.settings.considerPlannedTiming === true;
        }
        if (payload.diagnostics) update[K.diagnostics] = payload.diagnostics;
        if (payload.analysis) update[K.analysis] = payload.analysis;
        if (payload.csvResult) update[K.csvResult] = payload.csvResult;
        if (payload.liveCapture) update[K.liveCapture] = payload.liveCapture;
        await chrome.storage.local.set(update);
        return response(true, { saved: true });
      }
      case 'CLEAR_RESULTS':
        await chrome.storage.local.remove([K.diagnostics, K.analysis, K.csvResult]);
        return response(true, { cleared: true });
      case 'CLEAR_LIVE_CAPTURE':
        await chrome.storage.local.remove(K.liveCapture);
        return response(true, { cleared: true });
      case 'EXPORT_CSV': { 
        const stored = await getStored();
        const result = payload.result || stored[K.csvResult];
        if (!result || !Array.isArray(result.gaps)) {
          return response(false, null, 'CSV export unavailable. Analyze the current driver first.');
        }
        const csv = VRA.CsvUtils.toCsv(result);
        const downloadId = await chrome.downloads.download({
          url: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`,
          filename: VRA.CsvUtils.filename(result),
          saveAs: true
        });
        return response(true, { downloadId });
      }
      case 'EXPORT_LIVE_CAPTURE': {
        const stored = await getStored();
        const capture = stored[K.liveCapture];
        if (!capture || !Array.isArray(capture.records)) {
          return response(false, null, 'Live capture export unavailable. Finish a live tooltip capture first.');
        }
        const json = JSON.stringify(capture, null, 2);
        const date = String(capture.captureStartedAt || new Date().toISOString()).slice(0, 10);
        const downloadId = await chrome.downloads.download({
          url: `data:application/json;charset=utf-8,${encodeURIComponent(json)}`,
          filename: `vine-live-tooltip-capture_${/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10)}.json`,
          saveAs: true
        });
        return response(true, { downloadId });
      }
      default:
        return response(false, null, 'This action must be handled by the active Amazon tab.');
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handle(message, sender).then(sendResponse).catch((error) => sendResponse(response(false, null,
      `Extension service failed: ${error.message || 'unknown error'}. Check the service-worker console.`)));
    return true;
  });
})(globalThis.VineRouteAuditor);
