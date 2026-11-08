(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FM4FinanceLedger = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const fail = (code, message) => ({ ok: false, code, message });
  const validAmount = value => Number.isSafeInteger(value);
  const validPeriod = value => Number.isInteger(value) && value >= 0;

  function recordTransaction(input) {
    const x = input || {};
    if (!Array.isArray(x.history)) return fail('INVALID_HISTORY', 'سجل الحركات المالية غير صالح.');
    if (typeof x.eventId !== 'string' || !x.eventId.trim()) return fail('INVALID_EVENT_ID', 'معرّف الحركة المالية مطلوب.');
    if (!validAmount(x.amount) || x.amount === 0) return fail('INVALID_AMOUNT', 'قيمة الحركة يجب أن تكون عدداً صحيحاً آمناً وغير صفري.');
    if (!Number.isSafeInteger(x.balanceBefore)) return fail('INVALID_BALANCE', 'الرصيد قبل الحركة غير صالح.');
    if (!validPeriod(x.season) || x.season < 1 || !validPeriod(x.round)) return fail('INVALID_PERIOD', 'بيانات الموسم أو الجولة غير صالحة.');
    if (typeof x.category !== 'string' || !x.category.trim() || typeof x.description !== 'string' || !x.description.trim()) {
      return fail('INVALID_DETAILS', 'تصنيف الحركة ووصفها مطلوبان.');
    }
    const balanceAfter = x.balanceBefore + x.amount;
    if (!Number.isSafeInteger(balanceAfter)) return fail('INVALID_RESULTING_BALANCE', 'الحركة تتجاوز النطاق المالي الآمن.');
    const existing = x.history.find(item => item && item.id === x.eventId);
    if (existing) {
      const same = existing.amount === x.amount && existing.balanceBefore === x.balanceBefore &&
        existing.season === x.season && existing.round === x.round &&
        existing.category === x.category && existing.description === x.description;
      return same
        ? { ok: true, duplicate: true, history: x.history.map(item => ({ ...item })), transaction: { ...existing }, balanceAfter: existing.balanceAfter }
        : fail('EVENT_ID_CONFLICT', 'معرّف الحركة مستخدم مسبقاً لبيانات مالية مختلفة.');
    }
    const transaction = {
      id: x.eventId,
      season: x.season,
      round: x.round,
      category: x.category,
      description: x.description,
      amount: x.amount,
      balanceBefore: x.balanceBefore,
      balanceAfter
    };
    return { ok: true, duplicate: false, history: [...x.history.map(item => ({ ...item })), transaction], transaction: { ...transaction }, balanceAfter };
  }

  function applyToCareer(career, input) {
    const state = career || {};
    const x = input || {};
    if (!Number.isSafeInteger(state.budget)) return fail('INVALID_CAREER_BUDGET', 'ميزانية المسيرة غير صالحة.');
    if (!Array.isArray(state.financeHistory)) state.financeHistory = [];
    const existing = state.financeHistory.find(item => item && item.id === x.eventId);
    if (existing) return { ok: true, duplicate: true, transaction: { ...existing }, balanceAfter: state.budget };
    const result = recordTransaction({ ...x, history: state.financeHistory, balanceBefore: state.budget });
    if (!result.ok) return result;
    state.financeHistory = result.history;
    state.budget = result.balanceAfter;
    return { ok: true, duplicate: false, transaction: result.transaction, balanceAfter: result.balanceAfter };
  }

  function summarize(history, season) {
    if (!Array.isArray(history) || !Number.isInteger(season) || season < 1) return fail('INVALID_SUMMARY_INPUT', 'بيانات ملخص الموسم غير صالحة.');
    const entries = history.filter(item => item && item.season === season);
    const income = entries.reduce((sum, item) => item.amount > 0 ? sum + item.amount : sum, 0);
    const expenses = entries.reduce((sum, item) => item.amount < 0 ? sum - item.amount : sum, 0);
    if (!Number.isSafeInteger(income) || !Number.isSafeInteger(expenses)) return fail('SUMMARY_OVERFLOW', 'إجمالي الحركات يتجاوز النطاق المالي الآمن.');
    return { ok: true, season, count: entries.length, income, expenses, net: income - expenses, entries: entries.map(item => ({ ...item })) };
  }

  return Object.freeze({ recordTransaction, applyToCareer, summarize });
});
