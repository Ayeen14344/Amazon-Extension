(function (VRA) {
  'use strict';

  const MAX_CANDIDATES = 25;
  const CHART_TERMS = /progress\s*chart|stop\s*number|view\s*legend|route\s*progress|planned\s*(?:route|break)|actual\s*(?:stop|progress)/i;

  function isAmazonPage() {
    return location.protocol === 'https:' && location.hostname === 'logistics.amazon.com';
  }

  function isVisible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function shortText(element, maxLength) {
    const text = String(element && element.textContent || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, maxLength || 300);
  }

  function addCandidate(list, element, reason) {
    if (!element || list.some((item) => item.element === element) || !isVisible(element) || list.length >= MAX_CANDIDATES) return;
    list.push({ element, reason });
  }

  function candidateContainer(element) {
    if (!element) return null;
    const semantic = element.closest('figure, [role="img"], [role="graphics-document"], section, article');
    if (semantic && (semantic.querySelector('svg, canvas') || CHART_TERMS.test(shortText(semantic, 500)))) return semantic;
    let node = element;
    for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
      if (node.querySelector && node.querySelector('svg, canvas')) return node;
    }
    return element.parentElement || element;
  }

  /** Finds bounded, semantic chart candidates without relying on Amazon class names. */
  function findChartCandidates() {
    const candidates = [];
    document.querySelectorAll('svg, canvas, [role="img"], [role="graphics-document"]').forEach((element) => {
      const label = `${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''} ${shortText(element, 300)}`;
      const container = candidateContainer(element);
      const context = container ? shortText(container, 700) : '';
      const primitives = element.matches('svg') ? element.querySelectorAll('circle, rect, path, line, text').length : 0;
      const hasChartSemantics = CHART_TERMS.test(`${label} ${context}`);
      const explicitGraphicRole = element.matches('[role="graphics-document"]') ||
        (element.matches('[role="img"]') && CHART_TERMS.test(label));
      if (hasChartSemantics && (element.matches('canvas') || primitives >= 3 || explicitGraphicRole)) {
        addCandidate(candidates, container, `graphic:${element.tagName.toLowerCase()}`);
      }
    });
    document.querySelectorAll('h1, h2, h3, h4, h5, [role="heading"], button, figcaption, [aria-label], [title]').forEach((element) => {
      const label = `${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''} ${shortText(element, 220)}`;
      if (CHART_TERMS.test(label)) addCandidate(candidates, candidateContainer(element), 'chart-related label');
    });
    return candidates;
  }

  function renderingMode(candidates) {
    const elements = candidates.map((item) => item.element);
    if (elements.some((element) => element.matches('canvas') || element.querySelector('canvas'))) return 'Canvas';
    if (elements.some((element) => element.matches('svg') || element.querySelector('svg'))) return 'SVG';
    if (elements.length) return 'HTML';
    return 'Unknown';
  }

  function status() {
    if (!isAmazonPage()) return { pageStatus: 'Unsupported page', supported: false, chartDetected: false, chartType: 'Unknown' };
    const candidates = findChartCandidates();
    return {
      pageStatus: candidates.length ? 'Chart detected' : 'Amazon page detected but no progress chart found',
      supported: true,
      chartDetected: candidates.length > 0,
      chartType: renderingMode(candidates),
      chartCandidateCount: candidates.length
    };
  }

  VRA.PageDetector = { isAmazonPage, isVisible, shortText, findChartCandidates, renderingMode, status, CHART_TERMS };
})(globalThis.VineRouteAuditor);
