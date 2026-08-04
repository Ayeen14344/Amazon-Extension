(function (VRA) {
  'use strict';

  const D = VRA.TestData;
  const E = VRA.GapEngine;
  const C = VRA.CsvUtils;
  const tests = [];
  const add = (name, expected, run) => tests.push({ name, expected, run });
  const gap = (minutes, options) => E.analyze(D.base([
    D.point('actual', 1, '10:00'), D.point('actual', 2, `10:${String(minutes).padStart(2, '0')}`)
  ], options)).gaps[0];

  add('1. 10-minute gap with no break', 'NORMAL', () => gap(10).status);
  add('2. 18-minute gap with no break', 'REVIEW', () => gap(18).status);
  add('3. 20-minute gap with no break', 'RED FLAG', () => gap(20).status);
  add('4. 28-minute gap with no break', 'RED FLAG', () => gap(28).status);
  add('5. 25-minute gap inside meal break', 'PLANNED BREAK / approved 25', () => {
    const result = gap(25, { plannedBreaks: [D.plannedBreak('09:55', '10:30', 30, {
      breakType: 'meal', sourceText: 'Planned meal break 9:55 AM to 10:30 AM'
    })] });
    return `${result.status} / approved ${result.approvedBreakMinutes}`;
  });
  add('6. 35-minute gap with 15-minute break', 'RED FLAG / remaining 20', () => {
    const result = gap(35, { plannedBreaks: [D.plannedBreak('10:05', '10:20', 15, { breakType: 'rest_break' })] });
    return `${result.status} / remaining ${result.remainingNonBreakGapMinutes}`;
  });
  add('7. Break allowance cannot be used twice', '15 total approved', () => {
    const result = E.analyze(D.base([
      D.point('actual', 1, '10:00'), D.point('actual', 2, '10:10'), D.point('actual', 3, '10:25')
    ], { plannedBreaks: [D.plannedBreak('10:00', '10:25', 15, {
      breakType: 'rest_break', breakWindowId: 'test-rest-break-1'
    })] }));
    const approved = result.gaps.reduce((sum, item) => sum + (item.approvedBreakMinutes || 0), 0);
    return `${approved} total approved`;
  });
  add('8. Invalid timestamps produce incomplete data', 'INCOMPLETE DATA', () => E.analyze(D.base([
    { seriesType: 'actual', stopNumber: 1, timestamp: 'not-a-time', warnings: [] }
  ])).gaps[0].status);
  add('9. Duplicate points are removed', '2', () => E.analyze(D.base([
    D.point('actual', 1, '10:00'), D.point('actual', 1, '10:00'), D.point('actual', 2, '10:12')
  ])).actualStops.length);
  add('10. Actual points sort chronologically', '1,2,3', () => E.analyze(D.base([
    D.point('actual', 3, '10:30'), D.point('actual', 1, '10:00'), D.point('actual', 2, '10:12')
  ])).actualStops.map((item) => item.stopNumber).join(','));
  add('11. Planned timing ignored when disabled', '30', () => {
    const result = gap(30, { considerPlannedTiming: false, plannedStops: [
      D.point('planned', 1, '10:00'), D.point('planned', 2, '10:20')
    ] });
    return result.reviewMinutes;
  });
  add('12. Planned timing changes review when enabled', '10', () => {
    const result = gap(30, { considerPlannedTiming: true, plannedStops: [
      D.point('planned', 1, '10:00'), D.point('planned', 2, '10:20')
    ] });
    return result.reviewMinutes;
  });
  add('13. Midnight route calculates correctly', '20', () => E.analyze(D.base([
    D.point('actual', 1, '23:50', 2), D.point('actual', 2, '00:10', 3)
  ])).gaps[0].actualGapMinutes);
  add('14. CSV formula prefixes escaped', "'=SUM(A1:A2)", () => C.escapeCell('=SUM(A1:A2)'));
  add('15. CSV commas and quotes escaped', '"Driver, ""A"""', () => C.escapeCell('Driver, "A"'));
  add('16. Actual delivery tooltip is parsed', 'actual|98|15:45|16:15|-30|3/3 deliveries', () => {
    const point = VRA.TooltipParser.parse(D.tooltipFixtures.actualDelivery, '2026-08-02', 'tooltip', 'high').point;
    return [point.seriesType, point.stopNumber, point.timestamp.slice(11, 16), point.plannedTimestamp.slice(11, 16),
      point.varianceMinutes, point.deliveryProgress].join('|');
  });
  add('17. Planned delivery tooltip is parsed', 'planned|77|15:22|2', () => {
    const point = VRA.TooltipParser.parse(D.tooltipFixtures.plannedDelivery, '2026-08-02', 'tooltip', 'high').point;
    return [point.seriesType, point.stopNumber, point.timestamp.slice(11, 16), point.packageCount].join('|');
  });
  add('18. Planned meal-break tooltip is parsed', 'break|meal|14:32|15:02|30|30', () => {
    const plannedBreak = VRA.TooltipParser.parse(D.tooltipFixtures.mealBreak, '2026-08-02', 'tooltip', 'high').breakRecord;
    return [plannedBreak.seriesType, plannedBreak.breakType, plannedBreak.plannedStart.slice(11, 16),
      plannedBreak.plannedEnd.slice(11, 16), plannedBreak.plannedDurationMinutes,
      plannedBreak.allowanceMinutes].join('|');
  });
  add('19. Actual live-capture record deduplicates', '1|1', () => {
    const state = VRA.LiveCaptureCore.createInitialState({ currentUrl: 'https://logistics.amazon.com/' });
    const first = VRA.LiveCaptureCore.buildRecord({ text: D.tooltipFixtures.actualDelivery, routeDate: '2026-08-02', eventIsTrusted: true });
    const second = VRA.LiveCaptureCore.buildRecord({ text: D.tooltipFixtures.actualDelivery, routeDate: '2026-08-02', eventIsTrusted: true });
    VRA.LiveCaptureCore.addUniqueRecord(state, first); VRA.LiveCaptureCore.addUniqueRecord(state, second);
    return `${state.counts.actual}|${state.records.length}`;
  });
  add('20. Planned live-capture record deduplicates', '1|1', () => {
    const state = VRA.LiveCaptureCore.createInitialState({});
    VRA.LiveCaptureCore.addUniqueRecord(state, VRA.LiveCaptureCore.buildRecord({ text: D.tooltipFixtures.plannedDelivery, routeDate: '2026-08-02', eventIsTrusted: true }));
    VRA.LiveCaptureCore.addUniqueRecord(state, VRA.LiveCaptureCore.buildRecord({ text: D.tooltipFixtures.plannedDelivery, routeDate: '2026-08-02', eventIsTrusted: true }));
    return `${state.counts.planned}|${state.records.length}`;
  });
  add('21. Meal-break live-capture record deduplicates', '1|1', () => {
    const state = VRA.LiveCaptureCore.createInitialState({});
    VRA.LiveCaptureCore.addUniqueRecord(state, VRA.LiveCaptureCore.buildRecord({ text: D.tooltipFixtures.mealBreak, routeDate: '2026-08-02', eventIsTrusted: true }));
    VRA.LiveCaptureCore.addUniqueRecord(state, VRA.LiveCaptureCore.buildRecord({ text: D.tooltipFixtures.mealBreak, routeDate: '2026-08-02', eventIsTrusted: true }));
    return `${state.counts.break}|${state.records.length}`;
  });
  add('22. Unknown tooltip remains bounded diagnostic data', 'true|unknown|1000|1', () => {
    const candidate = VRA.LiveCaptureCore.isCandidateText(D.tooltipFixtures.unknownTooltip, { tooltipLike: true });
    const state = VRA.LiveCaptureCore.createInitialState({});
    const record = VRA.LiveCaptureCore.buildRecord({ text: D.tooltipFixtures.unknownTooltip, routeDate: '2026-08-02', eventIsTrusted: true });
    VRA.LiveCaptureCore.addUniqueRecord(state, record);
    return `${candidate}|${record.seriesType}|${record.sanitizedTooltipText.length}|${state.counts.unknown}`;
  });
  add('23. Capture panel text is never an Amazon tooltip', 'false', () =>
    VRA.LiveCaptureCore.isCandidateText('VINE Live Tooltip Capture Actual: 0 Planned: 0 Break: 0 Unknown: 0', { tooltipLike: true }));
  add('24. Clear Live Capture preserves settings and analysis', '20|analysis|false', () => {
    const K = VRA.Constants.STORAGE_KEYS;
    const cleared = VRA.LiveCaptureCore.clearStoredCaptureSnapshot({
      [K.threshold]: 20, [K.analysis]: 'analysis', [K.liveCapture]: { records: [] }
    });
    return `${cleared[K.threshold]}|${cleared[K.analysis]}|${Object.prototype.hasOwnProperty.call(cleared, K.liveCapture)}`;
  });
  add('25. Capture cleanup removes listeners and observers', '2|false', () => {
    let removed = 0; const cleanup = VRA.LiveCaptureCore.createCleanupRegistry();
    cleanup.add(() => { removed += 1; }); cleanup.add(() => { removed += 1; }); cleanup.cleanup(); cleanup.cleanup();
    return `${removed}|${cleanup.active}`;
  });
  add('26. Page change stops active capture', 'true|true|false', () => [
    VRA.LiveCaptureCore.shouldStopForPageChange('https://a/one', 'https://a/two', true),
    VRA.LiveCaptureCore.shouldStopForPageChange('https://a/one', 'https://a/one', false),
    VRA.LiveCaptureCore.shouldStopForPageChange('https://a/one', 'https://a/one', true)
  ].join('|'));
  add('27. Trusted-event metadata is preserved', 'true', () =>
    VRA.LiveCaptureCore.buildRecord({ text: D.tooltipFixtures.actualDelivery, routeDate: '2026-08-02', eventIsTrusted: true }).eventIsTrusted);
  add('28. Live-capture JSON export excludes sensitive fields', 'true|true', () => {
    const state = VRA.LiveCaptureCore.createInitialState({
      currentUrl: 'https://logistics.amazon.com/operations/itineraries/PRIVATE_ROUTE?serviceAreaId=PRIVATE_AREA#fragment'
    });
    const record = VRA.LiveCaptureCore.buildRecord({ text: D.tooltipFixtures.actualDelivery, routeDate: '2026-08-02', eventIsTrusted: true });
    record.outerHTML = '<secret>'; record.innerHTML = '<secret>'; record.cookies = 'secret';
    record.tokens = 'secret'; record.requestHeaders = { Authorization: 'secret' };
    record.parsedRecord.tokens = 'secret'; VRA.LiveCaptureCore.addUniqueRecord(state, record);
    const exported = VRA.LiveCaptureCore.createExportPayload(state); const json = JSON.stringify(exported);
    const excluded = !/(outerHTML|innerHTML|cookies|tokens|requestHeaders|Authorization|<secret>)/.test(json);
    return `${excluded}|${exported.currentUrl.indexOf('#') === -1}`;
  });

  function comparable(value) {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  function run() {
    const body = document.getElementById('results');
    let passed = 0;
    tests.forEach((test) => {
      let actual;
      let ok = false;
      try {
        actual = test.run();
        ok = comparable(actual) === comparable(test.expected);
      } catch (error) {
        actual = `Error: ${error.message}`;
      }
      if (ok) passed += 1;
      const row = document.createElement('tr');
      [test.name, comparable(test.expected), comparable(actual)].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      const result = document.createElement('td');
      result.textContent = ok ? 'PASS' : 'FAIL';
      result.className = ok ? 'result-pass' : 'result-fail';
      row.appendChild(result);
      body.appendChild(row);
    });
    document.getElementById('total').textContent = tests.length;
    document.getElementById('passed').textContent = passed;
    document.getElementById('failed').textContent = tests.length - passed;
    document.title = `${passed === tests.length ? 'PASS' : 'FAIL'} — ${passed}/${tests.length} VINE tests`;
  }

  document.addEventListener('DOMContentLoaded', run);
})(globalThis.VineRouteAuditor);
