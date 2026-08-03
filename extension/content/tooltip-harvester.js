(function (VRA) {
  'use strict';

  const D = VRA.PageDetector;
  let cancelled = false;

  const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  const SCOPED_TOOLTIP_SELECTOR = '[role="tooltip"], [aria-live], [data-tooltip], [class*="tooltip" i]';
  const GLOBAL_TOOLTIP_SELECTOR = '[role="tooltip"], [data-tooltip], [class*="tooltip" i]';

  function elementTooltipText(element) {
    return (D.shortText(element, 1000) || element.getAttribute('data-tooltip') || '').trim();
  }

  function addTooltipValue(values, element, genericTooltipAllowed) {
    if (!(element instanceof Element) || !D.isVisible(element)) return;
    const value = elementTooltipText(element);
    if (!value || (!genericTooltipAllowed && !VRA.TooltipParser.isSupportedTooltipText(value))) return;
    if (!values.includes(value)) values.push(value);
  }

  function visibleTooltipTexts(roots, changedElements) {
    const values = [];
    roots.forEach((root) => {
      const scope = root.parentElement || root;
      scope.querySelectorAll(SCOPED_TOOLTIP_SELECTOR).forEach((element) => addTooltipValue(values, element, true));
    });
    document.querySelectorAll(GLOBAL_TOOLTIP_SELECTOR).forEach((element) => addTooltipValue(values, element, true));
    Array.from(changedElements || []).forEach((element) => {
      const generic = element.matches && element.matches(GLOBAL_TOOLTIP_SELECTOR);
      addTooltipValue(values, element, generic);
    });
    return values.slice(0, 40);
  }

  function addChangedElement(set, node) {
    let element = node instanceof Element ? node : node && node.parentElement;
    for (let depth = 0; element && depth < 5; depth += 1, element = element.parentElement) {
      if (element === document.body || element === document.documentElement) break;
      set.add(element);
    }
  }

  function observeTooltipChanges(changedElements) {
    const observer = new MutationObserver((mutations) => mutations.forEach((mutation) => {
      addChangedElement(changedElements, mutation.target);
      mutation.addedNodes.forEach((node) => addChangedElement(changedElements, node));
    }));
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
    });
    return observer;
  }

  function dispatchHover(element) {
    const rect = element.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove'].forEach((type) => {
      const EventType = type.startsWith('pointer') && globalThis.PointerEvent ? PointerEvent : MouseEvent;
      element.dispatchEvent(new EventType(type, init));
    });
  }

  function restore(element) {
    const rect = element.getBoundingClientRect();
    const target = document.body || document.documentElement;
    const init = { bubbles: true, cancelable: true, clientX: rect.right + 2, clientY: rect.bottom + 2, relatedTarget: target };
    ['pointerout', 'pointerleave', 'mouseout', 'mouseleave'].forEach((type) => {
      const EventType = type.startsWith('pointer') && globalThis.PointerEvent ? PointerEvent : MouseEvent;
      element.dispatchEvent(new EventType(type, init));
    });
    ['pointermove', 'mousemove'].forEach((type) => {
      const EventType = type.startsWith('pointer') && globalThis.PointerEvent ? PointerEvent : MouseEvent;
      target.dispatchEvent(new EventType(type, { bubbles: true, clientX: 0, clientY: 0 }));
    });
  }

  function candidateScore(element) {
    let score = 0;
    if (element.hasAttribute('aria-label') || element.hasAttribute('data-tooltip') || element.hasAttribute('tabindex') ||
        element.hasAttribute('title') || element.querySelector('title')) score += 1000;
    if (element.matches('circle')) score += 900;
    else if (element.matches('rect')) score += 800;
    else if (element.matches('path')) score += 500;
    else if (element.matches('line')) score += 200;
    const rect = element.getBoundingClientRect();
    // Geometry is used only to prioritize hover targets; it is never converted into a stop number or timestamp.
    if (element.matches('path') && rect.width <= 48 && rect.height <= 48) score += 250;
    if (getComputedStyle(element).cursor === 'pointer') score += 300;
    return score;
  }

  function pointCandidates(roots) {
    const result = [];
    roots.forEach((root) => root.querySelectorAll(
      'svg circle, svg rect, svg path, svg line, svg [role="img"], svg [aria-label], svg [data-tooltip], svg [tabindex]'
    ).forEach((element) => {
      if (D.isVisible(element) && getComputedStyle(element).pointerEvents !== 'none' && !result.includes(element)) result.push(element);
    }));
    return result.sort((a, b) => candidateScore(b) - candidateScore(a))
      .slice(0, VRA.Constants.MAX_TOOLTIP_POINTS);
  }

  /** Sequentially hovers likely points and returns only newly visible tooltip text. */
  async function harvest(roots, onProgress) {
    cancelled = false;
    const initialUrl = location.href;
    const initialTitle = document.title;
    const points = pointCandidates(roots);
    const records = [];
    const warnings = [];
    for (let index = 0; index < points.length; index += 1) {
      if (cancelled) throw new Error('User cancelled extraction.');
      if (location.href !== initialUrl || document.title !== initialTitle || roots.some((root) => !root.isConnected)) {
        throw new Error('Page changed during extraction. Open the driver chart again and retry.');
      }
      const before = new Set(visibleTooltipTexts(roots));
      const changedElements = new Set();
      const observer = observeTooltipChanges(changedElements);
      let added = [];
      try {
        dispatchHover(points[index]);
        const started = Date.now();
        while (!cancelled && Date.now() - started < VRA.Constants.TOOLTIP_TIMEOUT_MS) {
          await pause(VRA.Constants.TOOLTIP_DELAY_MS);
          added = visibleTooltipTexts(roots, changedElements).filter((text) => !before.has(text));
          if (added.length) break;
        }
      } finally {
        observer.disconnect();
        restore(points[index]);
        await pause(VRA.Constants.TOOLTIP_DELAY_MS);
      }
      added.forEach((text) => records.push({ text, element: points[index], source: 'tooltip' }));
      if (typeof onProgress === 'function') onProgress(index + 1, points.length);
    }
    if (points.length && !records.length) warnings.push('Tooltip harvesting timed out without exposing structured values.');
    return { records, warnings, pointsProcessed: points.length };
  }

  function cancel() { cancelled = true; }

  VRA.TooltipHarvester = { harvest, cancel, visibleTooltipTexts };
})(globalThis.VineRouteAuditor);
