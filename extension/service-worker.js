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
        await chrome.storage.local.set(update);
        return response(true, { saved: true });
      }
      case 'CLEAR_RESULTS':
        await chrome.storage.local.remove([K.diagnostics, K.analysis, K.csvResult]);
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
