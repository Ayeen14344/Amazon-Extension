(function (VRA) {
  'use strict';

  const D = VRA.PageDetector;
  const MAX = VRA.Constants.MAX_DIAGNOSTIC_SAMPLES;
  const ATTRIBUTE_NAMES = ['aria-label', 'aria-describedby', 'title', 'alt', 'role', 'data-tooltip', 'data-testid'];
  const RELEVANT_DATA = /(?:chart|stop|time|route|break|series|point|tooltip|progress|planned|actual)/i;

  function unique(values, limit) {
    return Array.from(new Set(values.filter(Boolean))).slice(0, limit || MAX);
  }

  function nearbyRoots(candidates) {
    return unique(candidates.map((item) => item.element), MAX);
  }

  function elementsFromRoots(roots, selector, limit) {
    const output = [];
    roots.forEach((root) => {
      if (root.matches && root.matches(selector)) output.push(root);
      root.querySelectorAll(selector).forEach((element) => {
        if (output.length < (limit || 500) && !output.includes(element)) output.push(element);
      });
    });
    return output.slice(0, limit || 500);
  }

  function structuralAttributeSample(element) {
    const sample = { tag: element.tagName.toLowerCase() };
    Array.from(element.attributes || []).forEach((attribute) => {
      if (ATTRIBUTE_NAMES.includes(attribute.name) || RELEVANT_DATA.test(attribute.name) ||
          ['cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'fill', 'stroke'].includes(attribute.name)) {
        sample[attribute.name] = attribute.value.slice(0, 180);
      }
    });
    return sample;
  }

  function contextText(roots) {
    return roots.map((root) => D.shortText(root, 1500)).join(' ');
  }

  function findCandidate(regex, values) {
    for (const value of values) {
      const match = value.match(regex);
      if (match) return match[1].trim().slice(0, 100);
    }
    return '';
  }

  function metadataCandidates(roots) {
    const values = elementsFromRoots(roots, 'h1, h2, h3, h4, [aria-label], [title], dt, dd', 120)
      .map((element) => `${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''} ${D.shortText(element, 220)}`);
    return {
      driverName: findCandidate(/(?:driver|associate|da)\s*(?:name)?\s*[:\-]\s*([^|,;]+)/i, values),
      routeDate: findCandidate(/(?:route\s*)?date\s*[:\-]\s*([A-Za-z0-9,\/\- ]{6,30})/i, values),
      routeId: findCandidate(/route\s*(?:id|identifier|code)?\s*[:#\-]\s*([A-Za-z0-9_-]{2,40})/i, values),
      station: findCandidate(/(?:station|service\s*area)\s*[:\-]\s*([A-Za-z0-9 _-]{2,40})/i, values)
    };
  }

  /** Produces a bounded structure-focused chart diagnostic report. */
  function inspect() {
    const candidates = D.findChartCandidates();
    const roots = nearbyRoots(candidates);
    const graphics = elementsFromRoots(roots, 'svg, canvas', 100);
    const svgElements = elementsFromRoots(roots, 'svg', 100);
    const textElements = elementsFromRoots(roots, 'h1, h2, h3, h4, h5, [role="heading"], text, figcaption', 250);
    const labelled = elementsFromRoots(roots, '[aria-label], [title], [data-tooltip], [role="tooltip"]', 400);
    const dataElements = elementsFromRoots(roots, '*', 600).filter((element) =>
      Array.from(element.attributes || []).some((attribute) => attribute.name.startsWith('data-') && RELEVANT_DATA.test(attribute.name)));
    const svgSamples = elementsFromRoots(roots, 'circle, rect, path, line, g, text', 600)
      .slice(0, MAX).map(structuralAttributeSample);
    const ariaLabels = unique(labelled.map((element) => element.getAttribute('aria-label')).filter(Boolean));
    const titles = unique(labelled.map((element) => element.getAttribute('title')).filter(Boolean));
    const tooltipCandidates = unique(labelled.filter((element) =>
      element.getAttribute('role') === 'tooltip' || element.hasAttribute('data-tooltip') || /tooltip/i.test(element.getAttribute('aria-describedby') || ''))
      .map((element) => structuralAttributeSample(element)));
    const relevantDataAttributes = [];
    dataElements.slice(0, MAX).forEach((element) => Array.from(element.attributes).forEach((attribute) => {
      if (attribute.name.startsWith('data-') && RELEVANT_DATA.test(attribute.name)) {
        relevantDataAttributes.push({ tag: element.tagName.toLowerCase(), name: attribute.name, value: attribute.value.slice(0, 180) });
      }
    }));
    const text = contextText(roots);
    const mode = D.renderingMode(candidates);
    const warnings = [];
    if (!candidates.length) warnings.push('No chart container found. Expand one driver’s Progress chart and inspect again.');
    if (mode === 'Canvas' && !/(?:am|pm|\d{1,2}:\d{2})/i.test(text + ariaLabels.join(' '))) {
      warnings.push('Canvas chart detected, but structured chart values are not accessible in Phase 1.');
    }
    const metadata = metadataCandidates(roots);
    return {
      currentUrl: location.href.split('#')[0].slice(0, 500),
      pageTitle: document.title.slice(0, 200),
      scanTimestamp: new Date().toISOString(),
      driverNameCandidate: metadata.driverName,
      routeDateCandidate: metadata.routeDate,
      routeIdCandidate: metadata.routeId,
      stationCandidate: metadata.station,
      numberOfSvgElements: svgElements.length,
      numberOfCanvasElements: graphics.filter((element) => element.tagName.toLowerCase() === 'canvas').length,
      numberOfChartContainerCandidates: candidates.length,
      numberOfCircleElements: elementsFromRoots(roots, 'circle', 5000).length,
      numberOfRectElements: elementsFromRoots(roots, 'rect', 5000).length,
      numberOfPathElements: elementsFromRoots(roots, 'path', 5000).length,
      numberOfLineElements: elementsFromRoots(roots, 'line', 5000).length,
      visibleChartRelatedHeadings: unique(textElements.filter(D.isVisible).map((element) => D.shortText(element, 180))
        .filter((value) => D.CHART_TERMS.test(value))),
      visibleLegendText: unique(textElements.filter(D.isVisible).map((element) => D.shortText(element, 180))
        .filter((value) => /legend|actual|planned|break/i.test(value))),
      ariaLabelsFoundNearChart: ariaLabels,
      titleAttributesFoundNearChart: titles,
      relevantDataAttributes: relevantDataAttributes.slice(0, MAX),
      tooltipCandidates,
      sampledSvgElementAttributes: svgSamples,
      actualTimestampsAppearAccessible: /actual.{0,100}\b\d{1,2}:\d{2}/i.test(text + ' ' + ariaLabels.join(' ')),
      plannedTimestampsAppearAccessible: /planned.{0,100}\b\d{1,2}:\d{2}/i.test(text + ' ' + ariaLabels.join(' ')),
      breakPeriodsAppearAccessible: /break.{0,100}\b\d{1,2}:\d{2}/i.test(text + ' ' + ariaLabels.join(' ')),
      detectedChartRenderingMode: mode,
      extractionWarnings: warnings
    };
  }

  VRA.ChartInspector = { inspect, metadataCandidates, elementsFromRoots, structuralAttributeSample };
})(globalThis.VineRouteAuditor);
