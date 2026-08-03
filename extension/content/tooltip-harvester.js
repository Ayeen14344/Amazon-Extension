(function (VRA) {
  'use strict';

  const D = VRA.PageDetector;
  let cancelled = false;

  const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function visibleTooltipTexts(roots) {
    const selectors = '[role="tooltip"], [aria-live], [data-tooltip], [class*="tooltip" i]';
    const values = [];
    roots.forEach((root) => {
      const scope = root.parentElement || root;
      scope.querySelectorAll(selectors).forEach((element) => {
        if (!D.isVisible(element)) return;
        const text = D.shortText(element, 500) || element.getAttribute('data-tooltip') || '';
        if (text && !values.includes(text)) values.push(text);
      });
    });
    return values.slice(0, 20);
  }

  function dispatchHover(element) {
    const rect = element.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    ['pointerenter', 'mouseenter', 'pointermove', 'mousemove'].forEach((type) => {
      const EventType = type.startsWith('pointer') && globalThis.PointerEvent ? PointerEvent : MouseEvent;
      element.dispatchEvent(new EventType(type, init));
    });
  }

  function restore(element) {
    const rect = element.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, clientX: rect.right + 2, clientY: rect.bottom + 2 };
    ['pointerleave', 'mouseleave'].forEach((type) => {
      const EventType = type.startsWith('pointer') && globalThis.PointerEvent ? PointerEvent : MouseEvent;
      element.dispatchEvent(new EventType(type, init));
    });
  }

  function pointCandidates(roots) {
    const result = [];
    roots.forEach((root) => root.querySelectorAll('circle, rect, [role="img"], [aria-label], [data-tooltip]').forEach((element) => {
      if (result.length < 120 && D.isVisible(element) && !result.includes(element)) result.push(element);
    }));
    return result;
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
      dispatchHover(points[index]);
      const started = Date.now();
      let added = [];
      while (!cancelled && Date.now() - started < VRA.Constants.TOOLTIP_TIMEOUT_MS) {
        await pause(VRA.Constants.TOOLTIP_DELAY_MS);
        added = visibleTooltipTexts(roots).filter((text) => !before.has(text));
        if (added.length) break;
      }
      restore(points[index]);
      added.forEach((text) => records.push({ text, element: points[index], source: 'tooltip' }));
      if (typeof onProgress === 'function') onProgress(index + 1, points.length);
    }
    if (points.length && !records.length) warnings.push('Tooltip harvesting timed out without exposing structured values.');
    return { records, warnings, pointsProcessed: points.length };
  }

  function cancel() { cancelled = true; }

  VRA.TooltipHarvester = { harvest, cancel, visibleTooltipTexts };
})(globalThis.VineRouteAuditor);
