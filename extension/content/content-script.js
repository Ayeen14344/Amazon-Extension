(function (VRA) {
  'use strict';

  const response = VRA.Validation.safeResponse;

  async function saveResult(payload) {
    try {
      return await chrome.runtime.sendMessage({ type: 'SAVE_LAST_RESULT', payload });
    } catch (error) {
      return response(false, null, `Analysis completed but local storage failed: ${error.message}`);
    }
  }

  async function handle(message) {
    const validation = VRA.Validation.validateMessage(message);
    if (!validation.valid) return response(false, null, validation.error);
    if (!VRA.PageDetector.isAmazonPage()) {
      return response(false, null, 'Unsupported page. Open https://logistics.amazon.com/ and navigate manually to one driver’s Progress chart.');
    }
    switch (message.type) {
      case 'CHECK_PAGE_STATUS':
        return response(true, VRA.PageDetector.status());
      case 'INSPECT_CHART': { 
        const diagnostics = VRA.ChartInspector.inspect();
        await saveResult({ diagnostics });
        return response(true, diagnostics);
      }
      case 'ANALYZE_CURRENT_DRIVER': {
        const diagnostics = VRA.ChartInspector.inspect();
        if (!diagnostics.numberOfChartContainerCandidates) {
          return response(false, null, 'Amazon page detected but the chart is not expanded. Open one driver’s Progress chart and try again.');
        }
        const extraction = await VRA.ChartExtractor.extract(diagnostics);
        const result = VRA.GapEngine.analyze({
          driverName: diagnostics.driverNameCandidate || '',
          routeDate: extraction.routeDate || '',
          routeId: diagnostics.routeIdCandidate || '',
          station: diagnostics.stationCandidate || '',
          analyzedAt: new Date().toISOString(),
          thresholdMinutes: validation.payload.thresholdMinutes,
          considerPlannedTiming: validation.payload.considerPlannedTiming,
          actualStops: extraction.actualStops,
          plannedStops: extraction.plannedStops,
          plannedBreaks: extraction.plannedBreaks,
          diagnostics: Object.assign({}, diagnostics, {
            unknownExtractionSamples: extraction.unknownSamples,
            tooltipPointsProcessed: extraction.tooltipPointsProcessed
          }),
          warnings: extraction.warnings
        });
        await saveResult({ analysis: result, diagnostics: result.diagnostics, csvResult: result,
          settings: { thresholdMinutes: result.thresholdMinutes, considerPlannedTiming: result.considerPlannedTiming } });
        return response(true, result);
      }
      case 'CANCEL_ANALYSIS':
        VRA.TooltipHarvester.cancel();
        return response(true, { cancelled: true });
      default:
        return response(false, null, 'This action must be handled by the extension service worker.');
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) {
      sendResponse(response(false, null, 'Rejected message from an untrusted sender.'));
      return false;
    }
    handle(message).then(sendResponse).catch((error) => sendResponse(response(false, null,
      `${error.message || 'Chart processing failed'} Try reopening the driver chart and run Inspect Chart.`)));
    return true;
  });
})(globalThis.VineRouteAuditor);
