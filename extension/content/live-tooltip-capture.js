(function (VRA) {
  'use strict';

  const C = VRA.Constants;
  const PANEL_ID = 'vine-live-tooltip-capture-panel';
  const STYLE_ID = 'vine-live-tooltip-capture-style';
  const KNOWN_HEADING = /\b(?:Actual\s*-\s*Delivery|Planned\s+route\s*-\s*Delivery|Planned\s*-\s*Meal\s+break)\b/i;
  const STRONG_STRUCTURE = /(?:Stop\s*#?\s*\d{1,4}[\s\S]{0,100}\d{1,2}:\d{2}|Start[\s\S]{0,80}\d{1,2}:\d{2}[\s\S]{0,120}End[\s\S]{0,80}\d{1,2}:\d{2})/i;
  const TOOLTIP_SELECTOR = '[role="tooltip"], [data-tooltip], [class*="tooltip" i], [aria-live], [role="dialog"]';
  const RELEVANT_DATA = /(?:chart|stop|time|route|break|series|point|tooltip|progress|planned|actual)/i;
  let activeSession = null;

  const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const bounded = (value, limit) => String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, limit);

  function captureId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `capture-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function emptyCounts() { return { actual: 0, planned: 0, break: 0, unknown: 0 }; }

  function createInitialState(options) {
    const input = options || {};
    return {
      extensionVersion: C.VERSION,
      captureStatus: 'Not started',
      currentUrl: stripFragment(input.currentUrl || ''),
      sharingSafeUrl: sanitizeUrlForSharing(input.currentUrl || ''),
      pageTitle: bounded(input.pageTitle, 200),
      captureStartedAt: input.captureStartedAt || '',
      captureEndedAt: '',
      detectedChartMode: input.detectedChartMode || 'Unknown',
      trustedEventCount: 0,
      counts: emptyCounts(),
      records: [],
      selectorHints: [],
      warnings: [],
      noPixelTimeInferenceUsed: true,
      _dedupKeys: new Set()
    };
  }

  function stripFragment(value) {
    try { const url = new URL(String(value || '')); url.hash = ''; return url.toString(); }
    catch (error) { return bounded(String(value || '').split('#')[0], 500); }
  }

  function sanitizeUrlForSharing(value) {
    try {
      const url = new URL(String(value || ''));
      url.hash = '';
      url.pathname = url.pathname.replace(/(itineraries\/)[^/]+/i, '$1ROUTE_REDACTED');
      Array.from(url.searchParams.keys()).forEach((name) => {
        if (/(?:route|servicearea|service-area|station|driver|itinerary)/i.test(name)) url.searchParams.set(name, 'REDACTED');
      });
      return url.toString();
    } catch (error) { return ''; }
  }

  function headingFromText(text) {
    const match = bounded(text, C.MAX_LIVE_TOOLTIP_TEXT).match(KNOWN_HEADING);
    return match ? match[0].replace(/\s+/g, ' ') : '';
  }

  function isCapturePanelText(text) {
    return /\bVINE\s+Live\s+Tooltip\s+Capture\b/i.test(String(text || ''));
  }

  function isCandidateText(text, options) {
    const value = bounded(text, C.MAX_LIVE_TOOLTIP_TEXT);
    if (!value || isCapturePanelText(value)) return false;
    if (KNOWN_HEADING.test(value)) return true;
    return Boolean(options && options.tooltipLike && STRONG_STRUCTURE.test(value));
  }

  function sanitizeParsedRecord(record) {
    const allowed = [
      'seriesType', 'stopNumber', 'timestamp', 'displayTime', 'actualDisplayTime', 'plannedTimestamp',
      'plannedDisplayTime', 'displayedVariance', 'varianceMinutes', 'deliveryProgress',
      'completedDeliveryCount', 'deliveryCount', 'packageCount', 'breakType', 'plannedStart', 'plannedEnd',
      'plannedStartDisplayTime', 'plannedEndDisplayTime', 'plannedDurationMinutes', 'displayedDuration',
      'allowanceMinutes', 'source', 'sourceText', 'confidence', 'warnings'
    ];
    const clean = {};
    allowed.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(record || {}, key)) return;
      const value = record[key];
      clean[key] = typeof value === 'string' ? bounded(value, key === 'sourceText' ? C.MAX_LIVE_TOOLTIP_TEXT : 300) : value;
    });
    return clean;
  }

  function sanitizeElementSummary(summary) {
    const value = summary || {};
    return {
      tag: bounded(value.tag, 40), role: bounded(value.role, 80), ariaLabel: bounded(value.ariaLabel, 160),
      title: bounded(value.title, 160), classSample: Array.isArray(value.classSample) ? value.classSample.slice(0, 8).map((item) => bounded(item, 60)) : [],
      relevantDataAttributes: sanitizeDataMap(value.relevantDataAttributes), svgElementType: bounded(value.svgElementType, 30),
      ancestorSummary: Array.isArray(value.ancestorSummary) ? value.ancestorSummary.slice(0, 6).map((item) => bounded(item, 60)) : [],
      closestSvgIndex: Number.isInteger(value.closestSvgIndex) ? value.closestSvgIndex : -1,
      closestChartContainerCandidate: Number.isInteger(value.closestChartContainerCandidate) ? value.closestChartContainerCandidate : -1,
      boundingRect: sanitizeRect(value.boundingRect)
    };
  }

  function sanitizeTooltipSummary(summary) {
    const value = summary || {};
    return {
      tag: bounded(value.tag, 40), role: bounded(value.role, 80), ariaLive: bounded(value.ariaLive, 80),
      classSample: Array.isArray(value.classSample) ? value.classSample.slice(0, 8).map((item) => bounded(item, 60)) : [],
      ancestorSummary: Array.isArray(value.ancestorSummary) ? value.ancestorSummary.slice(0, 6).map((item) => bounded(item, 60)) : [],
      renderLocation: ['chart', 'body-portal', 'open-shadow-root', 'unknown'].includes(value.renderLocation) ? value.renderLocation : 'unknown',
      boundingRect: sanitizeRect(value.boundingRect)
    };
  }

  function sanitizeDataMap(value) {
    const clean = {};
    Object.keys(value || {}).slice(0, 12).forEach((key) => { clean[bounded(key, 80)] = bounded(value[key], 140); });
    return clean;
  }

  function sanitizeRect(value) {
    const width = Number(value && value.width); const height = Number(value && value.height);
    return { width: Number.isFinite(width) ? Math.round(width * 10) / 10 : 0,
      height: Number.isFinite(height) ? Math.round(height * 10) / 10 : 0 };
  }

  function buildRecord(options) {
    const input = options || {};
    const text = bounded(input.text, C.MAX_LIVE_TOOLTIP_TEXT);
    const parsed = VRA.TooltipParser.parse(text, input.routeDate || '', 'trusted-user-hover', 'high');
    const parsedRecord = sanitizeParsedRecord(parsed.point || parsed.breakRecord || {});
    const seriesType = parsedRecord.seriesType || 'unknown';
    return {
      captureId: input.captureId || captureId(), capturedAt: input.capturedAt || new Date().toISOString(),
      eventIsTrusted: input.eventIsTrusted === true, seriesType,
      tooltipHeading: headingFromText(text), sanitizedTooltipText: text, parsedRecord,
      hoverTarget: sanitizeElementSummary(input.hoverTarget), tooltipElement: sanitizeTooltipSummary(input.tooltipElement),
      parserConfidence: seriesType === 'unknown' ? 'low' : 'high',
      warnings: (parsed.warnings || []).concat(seriesType === 'unknown' ? ['Tooltip structure was retained as bounded diagnostic data'] : [])
    };
  }

  function dedupKey(record) {
    const parsed = record.parsedRecord || {};
    if (record.seriesType === 'actual') return ['actual', parsed.stopNumber, parsed.timestamp || parsed.actualDisplayTime].join('|');
    if (record.seriesType === 'planned') return ['planned', parsed.stopNumber, parsed.timestamp || parsed.plannedDisplayTime].join('|');
    if (record.seriesType === 'break') return ['break', parsed.breakType, parsed.plannedStart,
      parsed.plannedEnd, parsed.allowanceMinutes || parsed.plannedDurationMinutes].join('|');
    return `unknown|${bounded(record.sanitizedTooltipText, C.MAX_LIVE_TOOLTIP_TEXT).toLowerCase()}`;
  }

  function addUniqueRecord(state, record) {
    if (!state._dedupKeys) state._dedupKeys = new Set((state.records || []).map(dedupKey));
    const key = dedupKey(record);
    if (state._dedupKeys.has(key) || state.records.length >= C.MAX_LIVE_CAPTURE_RECORDS) return false;
    state._dedupKeys.add(key); state.records.push(record);
    state.counts[record.seriesType] = (state.counts[record.seriesType] || 0) + 1;
    return true;
  }

  function createCleanupRegistry() {
    const callbacks = [];
    return {
      active: true,
      add(callback) { if (this.active && typeof callback === 'function') callbacks.push(callback); },
      cleanup() {
        if (!this.active) return;
        this.active = false;
        callbacks.splice(0).reverse().forEach((callback) => { try { callback(); } catch (error) { /* best effort */ } });
      }
    };
  }

  function shouldStopForPageChange(initialUrl, currentUrl, chartPresent) {
    return String(initialUrl || '') !== String(currentUrl || '') || chartPresent === false;
  }

  function clearStoredCaptureSnapshot(snapshot) {
    const clean = Object.assign({}, snapshot || {});
    delete clean[C.STORAGE_KEYS.liveCapture];
    return clean;
  }

  function recordForExport(record) {
    return {
      captureId: bounded(record.captureId, 120), capturedAt: bounded(record.capturedAt, 80),
      eventIsTrusted: record.eventIsTrusted === true, seriesType: record.seriesType,
      tooltipHeading: bounded(record.tooltipHeading, 100), sanitizedTooltipText: bounded(record.sanitizedTooltipText, C.MAX_LIVE_TOOLTIP_TEXT),
      parsedRecord: sanitizeParsedRecord(record.parsedRecord), hoverTarget: sanitizeElementSummary(record.hoverTarget),
      tooltipElement: sanitizeTooltipSummary(record.tooltipElement), parserConfidence: bounded(record.parserConfidence, 20),
      warnings: Array.isArray(record.warnings) ? record.warnings.slice(0, 12).map((item) => bounded(item, 240)) : []
    };
  }

  function createExportPayload(state) {
    return {
      extensionVersion: C.VERSION, currentUrl: stripFragment(state.currentUrl),
      sharingSafeUrl: sanitizeUrlForSharing(state.currentUrl), pageTitle: bounded(state.pageTitle, 200),
      captureStartedAt: state.captureStartedAt || '', captureEndedAt: state.captureEndedAt || '',
      captureStatus: state.captureStatus || 'Not started', detectedChartMode: state.detectedChartMode || 'Unknown',
      trustedEventCount: Math.max(0, Number(state.trustedEventCount) || 0),
      counts: Object.assign(emptyCounts(), state.counts || {}),
      records: (state.records || []).slice(0, C.MAX_LIVE_CAPTURE_RECORDS).map(recordForExport),
      selectorHints: (state.selectorHints || []).slice(0, 30),
      captureWarnings: (state.warnings || []).slice(0, 20).map((item) => bounded(item, 300)),
      noPixelTimeInferenceUsed: true,
      privacyWarning: 'Privacy-review this JSON before sharing it with a developer.'
    };
  }

  function classSample(element) {
    const value = element && element.getAttribute && element.getAttribute('class');
    return String(value || '').split(/\s+/).filter(Boolean).slice(0, 8).map((item) => bounded(item, 60));
  }

  function ancestorSummary(element) {
    const values = [];
    let current = element && element.parentElement;
    while (current && values.length < 6) { values.push(current.tagName.toLowerCase()); current = current.parentElement; }
    return values;
  }

  function relevantDataAttributes(element) {
    const values = {};
    Array.from(element && element.attributes || []).forEach((attribute) => {
      if (attribute.name.startsWith('data-') && RELEVANT_DATA.test(attribute.name) && Object.keys(values).length < 12) {
        values[attribute.name] = bounded(attribute.value, 140);
      }
    });
    return values;
  }

  function summarizeHoverTarget(target, path, chartRoots) {
    const element = target instanceof Element ? target : null;
    if (!element) return sanitizeElementSummary({});
    const rect = element.getBoundingClientRect();
    const svg = element.closest('svg');
    const svgList = svg ? Array.from(document.querySelectorAll('svg')) : [];
    const tag = element.tagName.toLowerCase();
    const svgTypes = ['circle', 'rect', 'path', 'line', 'g', 'text'];
    const ancestors = Array.isArray(path) ? path.filter((item) => item instanceof Element).slice(1, 7)
      .map((item) => item.tagName.toLowerCase()) : ancestorSummary(element);
    return sanitizeElementSummary({
      tag, role: element.getAttribute('role'), ariaLabel: element.getAttribute('aria-label'), title: element.getAttribute('title'),
      classSample: classSample(element), relevantDataAttributes: relevantDataAttributes(element),
      svgElementType: svgTypes.includes(tag) ? tag : '', ancestorSummary: ancestors,
      closestSvgIndex: svg ? svgList.indexOf(svg) : -1,
      closestChartContainerCandidate: chartRoots.findIndex((root) => root === element || root.contains(element)),
      boundingRect: { width: rect.width, height: rect.height }
    });
  }

  function summarizeTooltipElement(element, chartRoots) {
    const rect = element.getBoundingClientRect();
    const rootNode = element.getRootNode();
    let renderLocation = 'unknown';
    if (typeof ShadowRoot !== 'undefined' && rootNode instanceof ShadowRoot) renderLocation = 'open-shadow-root';
    else if (chartRoots.some((root) => root === element || root.contains(element))) renderLocation = 'chart';
    else if (document.body.contains(element)) renderLocation = 'body-portal';
    return sanitizeTooltipSummary({ tag: element.tagName.toLowerCase(), role: element.getAttribute('role'),
      ariaLive: element.getAttribute('aria-live'), classSample: classSample(element), ancestorSummary: ancestorSummary(element),
      renderLocation, boundingRect: { width: rect.width, height: rect.height } });
  }

  function deriveSelectorHint(record) {
    return {
      extensionVersion: C.VERSION, seriesType: record.seriesType, tooltipHeading: record.tooltipHeading,
      hoverTarget: { tag: record.hoverTarget.tag, role: record.hoverTarget.role,
        svgElementType: record.hoverTarget.svgElementType, ancestorSummary: record.hoverTarget.ancestorSummary.slice(0, 4),
        semanticAttributes: { hasAriaLabel: Boolean(record.hoverTarget.ariaLabel), hasTitle: Boolean(record.hoverTarget.title),
          dataAttributeNames: Object.keys(record.hoverTarget.relevantDataAttributes || {}) } },
      tooltip: { tag: record.tooltipElement.tag, role: record.tooltipElement.role,
        ariaLive: record.tooltipElement.ariaLive, renderLocation: record.tooltipElement.renderLocation,
        ancestorSummary: record.tooltipElement.ancestorSummary.slice(0, 4) }
    };
  }

  function isVisible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  }

  function tooltipText(element) { return bounded(element && element.textContent, C.MAX_LIVE_TOOLTIP_TEXT); }

  function openRoots() {
    const roots = [document];
    document.querySelectorAll('*').forEach((element) => {
      if (roots.length < 50 && element.shadowRoot && element.shadowRoot.mode === 'open') roots.push(element.shadowRoot);
    });
    return roots;
  }

  function panelElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function createPanel(session) {
    document.getElementById(PANEL_ID)?.remove(); document.getElementById(STYLE_ID)?.remove();
    const style = panelElement('style'); style.id = STYLE_ID;
    style.textContent = `#${PANEL_ID}{position:fixed;top:88px;right:18px;width:286px;z-index:2147483000;background:#fff;color:#18313f;border:1px solid #78909c;border-radius:8px;box-shadow:0 4px 18px #0003;font:13px Arial,sans-serif;pointer-events:auto}#${PANEL_ID} *{box-sizing:border-box}#${PANEL_ID} .vine-live-head{padding:10px 12px;background:#145a70;color:#fff;border-radius:7px 7px 0 0;font-weight:700;cursor:pointer}#${PANEL_ID} .vine-live-body{padding:10px 12px}#${PANEL_ID} .vine-live-status{margin:0 0 8px;font-weight:700}#${PANEL_ID} .vine-live-counts{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:8px 0}#${PANEL_ID} .vine-live-note{min-height:30px;color:#4c626d;font-size:12px}#${PANEL_ID} .vine-live-actions{display:flex;gap:5px;flex-wrap:wrap}#${PANEL_ID} button{padding:5px 7px;border:1px solid #78909c;border-radius:4px;background:#fff;color:#18313f;cursor:pointer}#${PANEL_ID} .vine-live-finish{background:#145a70;color:#fff}#${PANEL_ID}.vine-live-minimized .vine-live-body{display:none}`;
    document.documentElement.appendChild(style);
    const panel = panelElement('aside'); panel.id = PANEL_ID; panel.setAttribute('aria-label', 'VINE Live Tooltip Capture panel');
    const head = panelElement('div', 'vine-live-head', 'VINE Live Tooltip Capture');
    head.tabIndex = 0; head.setAttribute('role', 'button'); head.setAttribute('aria-label', 'Minimize or expand VINE Live Tooltip Capture');
    const body = panelElement('div', 'vine-live-body');
    const status = panelElement('p', 'vine-live-status', 'Waiting for a chart tooltip');
    const counts = panelElement('div', 'vine-live-counts');
    const countNodes = {};
    ['actual', 'planned', 'break', 'unknown'].forEach((type) => {
      const item = panelElement('span', '', `${type[0].toUpperCase()}${type.slice(1)}: `);
      countNodes[type] = panelElement('strong', '', '0'); item.appendChild(countNodes[type]); counts.appendChild(item);
    });
    const note = panelElement('p', 'vine-live-note', 'Hover normally over a green, gray, or yellow chart item.');
    const actions = panelElement('div', 'vine-live-actions');
    const finish = panelElement('button', 'vine-live-finish', 'Finish Capture');
    const cancel = panelElement('button', '', 'Cancel'); const minimize = panelElement('button', '', 'Minimize');
    finish.type = cancel.type = minimize.type = 'button'; actions.append(finish, cancel, minimize);
    body.append(status, counts, note, actions); panel.append(head, body); document.body.appendChild(panel);
    finish.addEventListener('click', () => session.stop('Capture completed', { keep: true }));
    cancel.addEventListener('click', () => {
      const keep = session.state.records.length > 0 && globalThis.confirm('Keep captured samples in the cancelled capture?');
      session.stop('Capture cancelled', { keep });
    });
    const toggleMinimized = () => {
      const minimized = panel.classList.toggle('vine-live-minimized'); minimize.textContent = minimized ? 'Expand' : 'Minimize';
    };
    minimize.addEventListener('click', toggleMinimized);
    head.addEventListener('click', toggleMinimized);
    head.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleMinimized(); } });
    session.cleanup.add(() => { panel.remove(); style.remove(); });
    return { panel, status, note, countNodes };
  }

  function updatePanel(session, message) {
    if (!session.panel) return;
    Object.keys(session.panel.countNodes).forEach((type) => {
      session.panel.countNodes[type].textContent = String(session.state.counts[type] || 0);
    });
    session.panel.status.textContent = session.state.captureStatus === 'Capture active' ? 'Waiting for a chart tooltip' : session.state.captureStatus;
    if (message) session.panel.note.textContent = message;
  }

  async function saveCapture(state) {
    const payload = createExportPayload(state);
    await chrome.runtime.sendMessage({ type: 'SAVE_LAST_RESULT', payload: { liveCapture: payload } });
    return payload;
  }

  function createSession(options) {
    const chartRoots = options.chartRoots;
    const initialOpenRoots = openRoots();
    const state = createInitialState({ currentUrl: location.href, pageTitle: document.title,
      captureStartedAt: new Date().toISOString(), detectedChartMode: options.chartMode });
    state.captureStatus = 'Capture active';
    const session = { state, chartRoots, routeDate: options.routeDate || '', cleanup: createCleanupRegistry(),
      panel: null, lastTrustedHover: null, lastTrustedAt: 0, changedElements: new Set(), pendingElements: new WeakSet(),
      observedRoots: new Set(), baselineTooltipTexts: new Set(), stopping: false, hoverTimer: null };
    initialOpenRoots.forEach((root) => root.querySelectorAll(TOOLTIP_SELECTOR).forEach((element) => {
      if (isVisible(element)) session.baselineTooltipTexts.add(tooltipText(element));
    }));

    session.stop = async (status, stopOptions) => {
      if (session.stopping) return null;
      session.stopping = true; session.cleanup.cleanup();
      state.captureStatus = status; state.captureEndedAt = new Date().toISOString();
      if (status === 'Capture completed' && state.records.length === 0) state.captureStatus = 'No tooltip detected';
      if (status === 'Page changed') state.warnings.push('Capture stopped because the page URL changed or the progress chart disappeared.');
      if (stopOptions && stopOptions.timeout) state.warnings.push('Capture stopped at the five-minute timeout.');
      if (!(stopOptions && stopOptions.keep)) { state.records = []; state.counts = emptyCounts(); state.selectorHints = []; state._dedupKeys = new Set(); }
      activeSession = null;
      return saveCapture(state).catch(() => createExportPayload(state));
    };

    session.stabilize = async (element, hoverTarget) => {
      if (session.pendingElements.has(element) || !session.cleanup.active) return;
      session.pendingElements.add(element);
      await pause(C.LIVE_TOOLTIP_STABILITY_MS);
      const first = isVisible(element) ? tooltipText(element) : '';
      await pause(Math.max(80, C.LIVE_TOOLTIP_STABILITY_MS - 20));
      const second = isVisible(element) ? tooltipText(element) : '';
      session.pendingElements.delete(element);
      const tooltipLike = element.matches && element.matches(TOOLTIP_SELECTOR);
      if (!session.cleanup.active || first !== second || !isCandidateText(second, { tooltipLike })) return;
      const record = buildRecord({ text: second, routeDate: session.routeDate, eventIsTrusted: true,
        hoverTarget, tooltipElement: summarizeTooltipElement(element, chartRoots) });
      if (!addUniqueRecord(state, record)) return;
      const hint = deriveSelectorHint(record); const hintKey = JSON.stringify(hint);
      if (!state.selectorHints.some((item) => JSON.stringify(item) === hintKey)) state.selectorHints.push(hint);
      updatePanel(session, `Captured: ${record.tooltipHeading || 'Unknown tooltip'}${record.parsedRecord.stopNumber ? `, Stop #${record.parsedRecord.stopNumber}` : ''}`);
      saveCapture(state).catch(() => {});
    };

    session.scan = () => {
      if (!session.cleanup.active || !session.lastTrustedHover || Date.now() - session.lastTrustedAt > 1500) return;
      const changed = new Set(session.changedElements); const candidates = new Set(changed); session.changedElements.clear();
      Array.from(session.observedRoots).forEach((root) => root.querySelectorAll(TOOLTIP_SELECTOR).forEach((element) => candidates.add(element)));
      candidates.forEach((element) => {
        if (!(element instanceof Element) || element.closest(`#${PANEL_ID}`) || !isVisible(element)) return;
        const text = tooltipText(element); const tooltipLike = element.matches(TOOLTIP_SELECTOR);
        if (session.baselineTooltipTexts.has(text) && !changed.has(element)) return;
        if (isCandidateText(text, { tooltipLike })) session.stabilize(element, session.lastTrustedHover);
      });
    };

    session.scheduleScan = () => {
      if (session.hoverTimer) clearTimeout(session.hoverTimer);
      session.hoverTimer = setTimeout(session.scan, 35);
    };
    session.cleanup.add(() => { if (session.hoverTimer) clearTimeout(session.hoverTimer); });

    const onTrustedHover = (event) => {
      if (!event.isTrusted || !session.cleanup.active || event.target instanceof Element && event.target.closest(`#${PANEL_ID}`)) return;
      state.trustedEventCount += 1; session.lastTrustedAt = Date.now();
      session.lastTrustedHover = summarizeHoverTarget(event.target, event.composedPath ? event.composedPath() : [], chartRoots);
      session.scheduleScan();
    };
    ['pointerover', 'pointerenter', 'pointermove', 'mouseover', 'mouseenter', 'mousemove'].forEach((type) => {
      document.addEventListener(type, onTrustedHover, true);
      session.cleanup.add(() => document.removeEventListener(type, onTrustedHover, true));
    });

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        let element = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        for (let depth = 0; element && depth < 5; depth += 1, element = element.parentElement) {
          if (element.id === PANEL_ID || element.closest && element.closest(`#${PANEL_ID}`)) break;
          if (element !== document.body && element !== document.documentElement) session.changedElements.add(element);
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element && node.id !== PANEL_ID) session.changedElements.add(node);
          if (node instanceof Element && node.shadowRoot && node.shadowRoot.mode === 'open') observeRoot(node.shadowRoot);
        });
      });
      session.scheduleScan();
    });
    const observeRoot = (root) => {
      if (session.observedRoots.has(root)) return;
      observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'role', 'aria-live'] });
      session.observedRoots.add(root);
    };
    observeRoot(document.body); initialOpenRoots.slice(1).forEach(observeRoot);
    session.cleanup.add(() => observer.disconnect());

    const keyHandler = (event) => { if (event.key === 'Escape' && event.isTrusted) session.stop('Capture completed', { keep: true }); };
    document.addEventListener('keydown', keyHandler, true); session.cleanup.add(() => document.removeEventListener('keydown', keyHandler, true));
    const pageTimer = setInterval(() => {
      const chartPresent = chartRoots.some((root) => root.isConnected);
      if (shouldStopForPageChange(state.currentUrl, stripFragment(location.href), chartPresent)) session.stop('Page changed', { keep: true });
    }, 1000);
    session.cleanup.add(() => clearInterval(pageTimer));
    const timeout = setTimeout(() => session.stop(state.records.length ? 'Capture completed' : 'No tooltip detected', { keep: true, timeout: true }),
      Math.min(Math.max(options.timeoutMs || C.LIVE_CAPTURE_TIMEOUT_MS, 60000), 600000));
    session.cleanup.add(() => clearTimeout(timeout));
    session.panel = createPanel(session); updatePanel(session);
    saveCapture(state).catch(() => {});
    return session;
  }

  async function start(options) {
    if (activeSession && activeSession.cleanup.active) return { alreadyActive: true, capture: createExportPayload(activeSession.state) };
    const candidates = VRA.PageDetector.findChartCandidates();
    if (!candidates.length) throw new Error('No progress-chart candidate is visible. Expand the chart and try again.');
    const diagnostics = options && options.diagnostics || VRA.ChartInspector.inspect();
    const routeDate = VRA.ChartExtractor.normalizeRouteDate(diagnostics.routeDateCandidate);
    activeSession = createSession({ chartRoots: candidates.map((item) => item.element),
      chartMode: diagnostics.detectedChartRenderingMode, routeDate, timeoutMs: options && options.timeoutMs });
    return { alreadyActive: false, capture: createExportPayload(activeSession.state) };
  }

  function status() { return activeSession ? createExportPayload(activeSession.state) : null; }

  VRA.LiveCaptureCore = { createInitialState, buildRecord, dedupKey, addUniqueRecord, isCandidateText,
    isCapturePanelText, createCleanupRegistry, shouldStopForPageChange, clearStoredCaptureSnapshot,
    stripFragment, sanitizeUrlForSharing, createExportPayload };
  VRA.LiveTooltipCapture = { start, status, PANEL_ID };
})(globalThis.VineRouteAuditor);
