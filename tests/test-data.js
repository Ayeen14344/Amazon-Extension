(function (VRA) {
  'use strict';

  const iso = (time, day) => `2026-08-${String(day || 2).padStart(2, '0')}T${time}:00`;
  const point = (seriesType, stopNumber, time, day) => ({
    seriesType,
    stopNumber,
    timestamp: iso(time, day),
    displayTime: time,
    source: 'test-fixture',
    sourceText: `${seriesType} stop ${stopNumber}, ${time}`,
    confidence: 'high',
    warnings: []
  });
  const plannedBreak = (start, end, allowanceMinutes, metadata) => Object.assign({
    seriesType: 'break', plannedStart: iso(start), plannedEnd: iso(end),
    allowanceMinutes, source: 'test-fixture', sourceText: 'planned break', confidence: 'high', warnings: []
  }, metadata || {});
  const base = (actualStops, options) => Object.assign({
    driverName: 'Test Driver', routeDate: '2026-08-02', routeId: 'TEST-1', station: 'TST',
    analyzedAt: '2026-08-02T18:00:00', thresholdMinutes: 20,
    considerPlannedTiming: false, actualStops, plannedStops: [], plannedBreaks: [], warnings: []
  }, options || {});

  const tooltipFixtures = Object.freeze({
    actualDelivery: [
      'Actual - Delivery',
      'DRIVER_A',
      'Stop #98    3:45pm',
      'Planned    4:15pm (-30m)',
      '3/3 deliveries'
    ].join('\n'),
    plannedDelivery: [
      'Planned route - Delivery',
      'Stop #77    3:22pm',
      '2 packages'
    ].join('\n'),
    mealBreak: [
      'Planned - Meal break',
      'Start    2:32pm',
      'End    3:02pm',
      'Duration    30m'
    ].join('\n')
  });

  VRA.TestData = { iso, point, plannedBreak, base, tooltipFixtures };
})(globalThis.VineRouteAuditor);
