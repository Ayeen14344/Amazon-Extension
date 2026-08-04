(function (VRA) {
  'use strict';

  const C = VRA.Constants;
  const byId = (id) => document.getElementById(id);
  let activeTab = null;
  let currentDiagnostics = null;
  let currentResult = null;
  let currentLiveCapture = null;

  function setText(id, value, fallback) {
    byId(id).textContent = value === null || value === undefined || value === '' ? (fallback || '—') : String(value);
  }

  function showMessage(message, isError) {
    const box = byId('message-box');
    box.hidden = !message;
    box.textContent = message || '';
    box.style.borderLeftColor = isError ? '#b3261e' : '#d28a00';
  }

  function setBusy(busy, operation) {
    ['inspect', 'analyze', 'export', 'clear'].forEach((id) => { byId(id).disabled = busy || (id === 'export' && !currentResult); });
    byId('cancel').hidden = !busy;
    setText('operation-message', operation || (busy ? 'Working…' : 'Ready.'));
  }

  function badge(text, kind) {
    const element = byId('status-badge');
    element.textContent = text;
    element.className = `badge ${kind}`;
  }

  function displayMetadata(source) {
    setText('driver-name', source.driverName || source.driverNameCandidate);
    setText('route-date', source.routeDate || source.routeDateCandidate);
    setText('route-id', source.routeId || source.routeIdCandidate);
    setText('station', source.station || source.stationCandidate);
  }

  function displayDiagnostics(diagnostics) {
    currentDiagnostics = diagnostics;
    byId('diagnostics-section').hidden = false;
    setText('diagnostic-mode', diagnostics.detectedChartRenderingMode);
    setText('chart-type', diagnostics.detectedChartRenderingMode);
    byId('diagnostics-preview').textContent = JSON.stringify(diagnostics, null, 2);
    displayMetadata(diagnostics);
    const warnings = diagnostics.extractionWarnings || [];
    showMessage(warnings.join('\n'), warnings.length > 0);
  }

  function timeLabel(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : value;
  }

  function appendCell(row, value, className) {
    const cell = document.createElement('td');
    if (className) {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = value === undefined || value === null || value === '' ? '—' : String(value);
      cell.appendChild(span);
    } else {
      cell.textContent = value === undefined || value === null || value === '' ? '—' : String(value);
    }
    row.appendChild(cell);
  }

  function displayResult(result) {
    currentResult = result;
    displayMetadata(result);
    if (result.diagnostics) displayDiagnostics(result.diagnostics);
    const summary = result.summary || {};
    setText('actual-count', summary.actualPoints || 0, '0');
    setText('planned-count', summary.plannedPoints || 0, '0');
    setText('break-count', summary.plannedBreaks || 0, '0');
    setText('gap-count', summary.gapsAnalyzed || 0, '0');
    setText('flag-count', summary.redFlags || 0, '0');
    const body = byId('results-body');
    body.replaceChildren();
    (result.gaps || []).forEach((gap) => {
      const row = document.createElement('tr');
      appendCell(row, gap.previousStop); appendCell(row, gap.nextStop);
      appendCell(row, timeLabel(gap.previousActualTime)); appendCell(row, timeLabel(gap.nextActualTime));
      appendCell(row, gap.actualGapMinutes); appendCell(row, gap.plannedGapMinutes);
      appendCell(row, gap.approvedBreakMinutes); appendCell(row, gap.remainingNonBreakGapMinutes);
      appendCell(row, gap.delayVersusPlanMinutes);
      appendCell(row, gap.status, `status status-${String(gap.status || '').toLowerCase().replace(/\s+/g, '-')}`);
      appendCell(row, gap.reviewReason);
      body.appendChild(row);
    });
    if (!body.children.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 11; cell.className = 'empty'; cell.textContent = 'No calculable gaps were found.';
      row.appendChild(cell); body.appendChild(row);
    }
    showMessage((result.warnings || []).join('\n'), false);
    byId('export').disabled = false;
  }

  function displayLiveCapture(capture, showPreview) {
    currentLiveCapture = capture || null;
    const counts = capture && capture.counts || {};
    setText('live-actual-count', counts.actual || 0, '0');
    setText('live-planned-count', counts.planned || 0, '0');
    setText('live-break-count', counts.break || 0, '0');
    setText('live-unknown-count', counts.unknown || 0, '0');
    const status = capture && capture.captureStatus || 'Not started';
    const statusBadge = byId('live-capture-status');
    statusBadge.textContent = status;
    statusBadge.className = `badge ${status === 'Capture completed' ? 'good' :
      (status === 'Capture active' ? 'warn' : (status === 'Not started' ? 'neutral' : 'bad'))}`;
    const active = status === 'Capture active';
    byId('view-live-capture').disabled = !capture;
    byId('download-live-capture').disabled = !capture || active;
    byId('clear-live-capture').disabled = !capture || active;
    if (active) byId('start-live-capture').disabled = true;
    const preview = byId('live-capture-preview');
    preview.textContent = capture ? JSON.stringify(capture, null, 2) : '';
    preview.hidden = !(capture && showPreview);
  }

  async function workerMessage(type, payload) {
    try {
      const reply = await chrome.runtime.sendMessage({ type, payload: payload || {} });
      if (!reply || !reply.success) throw new Error(reply && reply.error || 'The service worker did not respond.');
      return reply.data;
    } catch (error) {
      throw new Error(`${error.message} Open chrome://extensions, find VINE Route Gap Auditor, and inspect its service worker.`);
    }
  }

  async function tabMessage(type, payload) {
    if (!activeTab || !activeTab.id) throw new Error('No active browser tab is available.');
    if (!/^https:\/\/logistics\.amazon\.com(?:\/|$)/.test(activeTab.url || '')) {
      throw new Error('Unsupported page. Open logistics.amazon.com and manually expand one driver’s Progress chart.');
    }
    try {
      const reply = await chrome.tabs.sendMessage(activeTab.id, { type, payload: payload || {} });
      if (!reply || !reply.success) throw new Error(reply && reply.error || 'The content script did not respond.');
      return reply.data;
    } catch (error) {
      throw new Error(`${error.message} Reload the Amazon tab after installing or updating the extension, then try again.`);
    }
  }

  async function inspectChart() {
    setBusy(true, 'Inspecting chart structure…'); showMessage('');
    try {
      const diagnostics = await tabMessage('INSPECT_CHART');
      displayDiagnostics(diagnostics);
      badge(diagnostics.numberOfChartContainerCandidates ? 'Chart detected' : 'No chart found',
        diagnostics.numberOfChartContainerCandidates ? 'good' : 'warn');
      setText('operation-message', 'Chart inspection complete.');
    } catch (error) { showMessage(error.message, true); setText('operation-message', 'Inspection failed.'); }
    finally { setBusy(false); }
  }

  async function analyze() {
    const threshold = VRA.Validation.clampThreshold(byId('threshold').value);
    byId('threshold').value = threshold;
    setBusy(true, 'Extracting chart values and analyzing gaps…'); showMessage('');
    try {
      const result = await tabMessage('ANALYZE_CURRENT_DRIVER', {
        thresholdMinutes: threshold, considerPlannedTiming: byId('consider-planned').checked
      });
      displayResult(result);
      setText('operation-message', 'Analysis complete. Review every flagged item manually.');
    } catch (error) { showMessage(error.message, true); setText('operation-message', 'Analysis failed.'); }
    finally { setBusy(false); }
  }

  async function cancel() {
    try { await tabMessage('CANCEL_ANALYSIS'); setText('operation-message', 'Cancellation requested…'); }
    catch (error) { showMessage(error.message, true); }
  }

  async function exportCsv() {
    setBusy(true, 'Preparing CSV export…');
    try { await workerMessage('EXPORT_CSV', { result: currentResult }); setText('operation-message', 'CSV download started.'); }
    catch (error) { showMessage(error.message, true); setText('operation-message', 'CSV export failed.'); }
    finally { setBusy(false); }
  }

  async function clearResults() {
    setBusy(true, 'Clearing stored analysis…');
    try {
      await workerMessage('CLEAR_RESULTS'); currentResult = null; currentDiagnostics = null;
      byId('diagnostics-section').hidden = true; byId('results-body').replaceChildren();
      const row = document.createElement('tr'); const cell = document.createElement('td');
      cell.colSpan = 11; cell.className = 'empty'; cell.textContent = 'No analysis results yet.';
      row.appendChild(cell); byId('results-body').appendChild(row);
      ['actual-count', 'planned-count', 'break-count', 'gap-count', 'flag-count'].forEach((id) => setText(id, 0, '0'));
      showMessage('Stored diagnostics and analysis were removed. Settings were preserved.', false);
      setText('operation-message', 'Results cleared.');
    } catch (error) { showMessage(error.message, true); }
    finally { setBusy(false); }
  }

  async function startLiveCapture() {
    showMessage('');
    try {
      const result = await tabMessage('START_LIVE_TOOLTIP_CAPTURE', { timeoutMs: C.LIVE_CAPTURE_TIMEOUT_MS });
      displayLiveCapture(result.capture, false);
      setText('operation-message', result.alreadyActive ? 'Live capture is already active on the page.' :
        'Live capture started. Close the popup and hover normally over actual, planned, and meal-break chart items.');
    } catch (error) { showMessage(error.message, true); setText('operation-message', 'Live capture could not start.'); }
  }

  async function viewLiveCapture() {
    try {
      const stored = await workerMessage('GET_LAST_RESULT');
      displayLiveCapture(stored[C.STORAGE_KEYS.liveCapture] || null, true);
      setText('operation-message', stored[C.STORAGE_KEYS.liveCapture] ? 'Last live capture displayed.' : 'No saved live capture is available.');
    } catch (error) { showMessage(error.message, true); }
  }

  async function downloadLiveCapture() {
    try {
      await workerMessage('EXPORT_LIVE_CAPTURE');
      setText('operation-message', 'Live capture JSON download started. Privacy-review it before sharing.');
    } catch (error) { showMessage(error.message, true); }
  }

  async function clearLiveCapture() {
    try {
      await workerMessage('CLEAR_LIVE_CAPTURE'); displayLiveCapture(null, false);
      setText('operation-message', 'Live capture data cleared. Analysis results and settings were preserved.');
    } catch (error) { showMessage(error.message, true); }
  }

  async function copyDiagnostics() {
    if (!currentDiagnostics) return;
    try { await navigator.clipboard.writeText(JSON.stringify(currentDiagnostics, null, 2)); setText('operation-message', 'Diagnostics copied.'); }
    catch (error) { showMessage(`Could not copy diagnostics: ${error.message}. Use Download JSON instead.`, true); }
  }

  function downloadDiagnostics() {
    if (!currentDiagnostics) return;
    const blob = new Blob([JSON.stringify(currentDiagnostics, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `vine-chart-diagnostics_${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setText('operation-message', 'Diagnostics download started.');
  }

  async function initialize() {
    [
      ['inspect', inspectChart], ['analyze', analyze], ['cancel', cancel], ['export', exportCsv],
      ['clear', clearResults], ['copy-diagnostics', copyDiagnostics], ['download-diagnostics', downloadDiagnostics],
      ['start-live-capture', startLiveCapture], ['view-live-capture', viewLiveCapture],
      ['download-live-capture', downloadLiveCapture], ['clear-live-capture', clearLiveCapture]
    ].forEach(([id, handler]) => byId(id).addEventListener('click', handler));
    byId('threshold').addEventListener('change', () => workerMessage('SAVE_LAST_RESULT', { settings: {
      thresholdMinutes: VRA.Validation.clampThreshold(byId('threshold').value), considerPlannedTiming: byId('consider-planned').checked
    }}).catch((error) => showMessage(error.message, true)));
    byId('consider-planned').addEventListener('change', () => workerMessage('SAVE_LAST_RESULT', { settings: {
      thresholdMinutes: VRA.Validation.clampThreshold(byId('threshold').value), considerPlannedTiming: byId('consider-planned').checked
    }}).catch((error) => showMessage(error.message, true)));
    try {
      [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const stored = await workerMessage('GET_LAST_RESULT');
      byId('threshold').value = stored[C.STORAGE_KEYS.threshold] || C.DEFAULT_THRESHOLD_MINUTES;
      byId('consider-planned').checked = stored[C.STORAGE_KEYS.considerPlanned] === true;
      if (stored[C.STORAGE_KEYS.diagnostics]) displayDiagnostics(stored[C.STORAGE_KEYS.diagnostics]);
      if (stored[C.STORAGE_KEYS.analysis]) displayResult(stored[C.STORAGE_KEYS.analysis]);
      displayLiveCapture(stored[C.STORAGE_KEYS.liveCapture] || null, false);
      if (!activeTab || !/^https:\/\/logistics\.amazon\.com(?:\/|$)/.test(activeTab.url || '')) {
        badge('Unsupported page', 'bad'); setText('operation-message', 'Open an authorized Amazon Logistics driver page.');
        byId('inspect').disabled = true; byId('analyze').disabled = true; return;
      }
      const status = await tabMessage('CHECK_PAGE_STATUS');
      badge(status.pageStatus, status.chartDetected ? 'good' : 'warn'); setText('chart-type', status.chartType);
      byId('start-live-capture').disabled = !status.chartDetected;
      if (status.chartDetected) {
        const activeCapture = await tabMessage('GET_LIVE_CAPTURE_STATUS');
        if (activeCapture) displayLiveCapture(activeCapture, false);
      }
      setText('operation-message', status.chartDetected ? 'Ready to inspect or analyze.' : 'Expand the driver Progress chart, then inspect.');
    } catch (error) { badge('Content script unavailable', 'bad'); showMessage(error.message, true); }
  }

  document.addEventListener('DOMContentLoaded', initialize);
})(globalThis.VineRouteAuditor);
