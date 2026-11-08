(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FM4FinancePlanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const fail = (code, message) => ({ ok: false, code, message });
  const safeInteger = value => Number.isSafeInteger(value);
  const nonNegativeInteger = value => safeInteger(value) && value >= 0;

  function forecast(input) {
    const x = input || {};
    if (!safeInteger(x.budget)) return fail('INVALID_BUDGET', 'ميزانية المسيرة غير صالحة.');
    if (!nonNegativeInteger(x.weeksRemaining)) return fail('INVALID_WEEKS', 'عدد الأسابيع المتبقية غير صالح.');
    const commitments = x.weeklyCommitments || {};
    const keys = ['wages', 'academy', 'stadium', 'other'];
    for (const key of keys) {
      if (!nonNegativeInteger(commitments[key] === undefined ? 0 : commitments[key])) {
        return fail('INVALID_COMMITMENT', 'قيمة الالتزام الأسبوعي غير صالحة: ' + key);
      }
    }
    const reserve = x.reserve === undefined ? 0 : x.reserve;
    const oneOff = x.committedOneOff === undefined ? 0 : x.committedOneOff;
    if (!nonNegativeInteger(reserve) || !nonNegativeInteger(oneOff)) {
      return fail('INVALID_RESERVE', 'الاحتياطي أو الالتزامات الإضافية غير صالحة.');
    }
    const weeklyTotal = keys.reduce((sum, key) => sum + (commitments[key] || 0), 0);
    const futureWeeklyCommitments = weeklyTotal * x.weeksRemaining;
    const totalCommitted = futureWeeklyCommitments + oneOff;
    const availableAfterCommitments = x.budget - totalCommitted;
    const transferCapacity = Math.max(0, availableAfterCommitments - reserve);
    if (![weeklyTotal, futureWeeklyCommitments, totalCommitted, availableAfterCommitments, transferCapacity].every(safeInteger)) {
      return fail('FORECAST_OVERFLOW', 'نتيجة التوقع تتجاوز النطاق المالي الآمن.');
    }
    const baseRisk = riskFor(availableAfterCommitments, reserve);
    const scenarios = Array.isArray(x.scenarios) ? x.scenarios : [];
    const seen = new Set();
    const simulated = [];
    for (const scenario of scenarios) {
      if (!scenario || typeof scenario.id !== 'string' || !scenario.id.trim() ||
          typeof scenario.label !== 'string' || !scenario.label.trim() ||
          !nonNegativeInteger(scenario.cost)) {
        return fail('INVALID_SCENARIO', 'بيانات أحد سيناريوهات القرار غير صالحة.');
      }
      if (seen.has(scenario.id)) return fail('DUPLICATE_SCENARIO_ID', 'معرّف السيناريو مكرر.');
      seen.add(scenario.id);
      const projectedBalance = availableAfterCommitments - scenario.cost;
      if (!safeInteger(projectedBalance)) return fail('SCENARIO_OVERFLOW', 'نتيجة المحاكاة تتجاوز النطاق المالي الآمن.');
      simulated.push({
        id: scenario.id,
        label: scenario.label,
        cost: scenario.cost,
        projectedBalance,
        transferCapacityAfter: Math.max(0, projectedBalance - reserve),
        risk: riskFor(projectedBalance, reserve)
      });
    }
    return {
      ok: true,
      budget: x.budget,
      weeksRemaining: x.weeksRemaining,
      weeklyCommitments: { wages: commitments.wages || 0, academy: commitments.academy || 0, stadium: commitments.stadium || 0, other: commitments.other || 0 },
      weeklyTotal,
      futureWeeklyCommitments,
      committedOneOff: oneOff,
      totalCommitted,
      reserve,
      availableAfterCommitments,
      transferCapacity,
      projectedBalance: availableAfterCommitments,
      risk: baseRisk,
      scenarios: simulated,
      assumptions: 'تقدير افتراضي يفترض ثبات الالتزامات الأسبوعية، ولا يحتسب الإيرادات المستقبلية أو المكافآت غير المؤكدة.'
    };
  }

  function riskFor(balance, reserve) {
    if (balance < 0) return 'critical';
    if (balance < reserve) return 'warning';
    return 'stable';
  }

  return Object.freeze({ forecast });
});
