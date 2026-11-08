(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FM4TransferSystem = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_RULES = Object.freeze({
    minSquadSize: 14,
    maxSquadSize: 26,
    minGoalkeepers: 2,
    maxActiveLoansPerClub: 3,
    minContractYearsForLoan: 1
  });

  const fail = (code, message) => ({ ok: false, code, message });
  const validMoney = value => Number.isSafeInteger(value) && value >= 0;
  const rulesWith = rules => ({ ...DEFAULT_RULES, ...(rules || {}) });
  const clubPlayers = (players, clubId) => players.filter(p => p.clubId === clubId);
  const countKeepers = players => players.filter(p => p.pos === 'GK').length;
  const findPlayer = (players, playerId) => players.find(p => p.id === playerId);

  function validateSquadMove(players, player, fromClubId, toClubId, rules) {
    const r = rulesWith(rules);
    if (toClubId !== 0 && !players.some(p => p.clubId === toClubId)) return fail('BUYER_NOT_FOUND', 'النادي المشتري غير موجود في قاعدة بيانات المسيرة.');
    if (fromClubId !== 0) {
      const from = clubPlayers(players, fromClubId);
      if (from.length - 1 < r.minSquadSize) return fail('SELLER_SQUAD_TOO_SMALL', 'لا يمكن إتمام الصفقة لأنها ستترك النادي البائع بعدد لاعبين أقل من الحد الأدنى.');
      if (player.pos === 'GK' && countKeepers(from) - 1 < r.minGoalkeepers) {
        return fail('SELLER_NEEDS_GOALKEEPERS', 'لا يمكن إتمام الصفقة؛ يجب أن يحتفظ النادي البائع بحارسي مرمى على الأقل.');
      }
    }
    const to = clubPlayers(players, toClubId);
    if (to.length + 1 > r.maxSquadSize) return fail('BUYER_SQUAD_FULL', 'قائمة النادي المشتري ممتلئة.');
    return { ok: true };
  }

  function validatePurchase(input) {
    const x = input || {};
    if (!Array.isArray(x.players)) return fail('INVALID_PLAYERS', 'قائمة اللاعبين غير صالحة.');
    const player = findPlayer(x.players, x.playerId);
    if (!player) return fail('PLAYER_NOT_FOUND', 'اللاعب غير موجود.');
    if (!Number.isInteger(x.buyerClubId) || !Number.isInteger(x.sellerClubId) || x.buyerClubId === x.sellerClubId) {
      return fail('INVALID_CLUBS', 'الأندية المحددة غير صالحة.');
    }
    if (player.clubId !== x.sellerClubId) return fail('SELLER_MISMATCH', 'اللاعب لم يعد تابعاً للنادي البائع.');
    if (!validMoney(x.fee)) return fail('INVALID_FEE', 'قيمة الانتقال يجب أن تكون مبلغاً صحيحاً غير سالب.');
    if (!validMoney(x.budget)) return fail('INVALID_BUDGET', 'ميزانية النادي غير صالحة.');
    if (x.budget < x.fee) return fail('INSUFFICIENT_BUDGET', 'ميزانية النادي لا تكفي لإتمام الصفقة.');
    if (!Number.isInteger(x.contractYears) || x.contractYears < 1 || x.contractYears > 5) {
      return fail('INVALID_CONTRACT_LENGTH', 'مدة العقد يجب أن تكون بين موسم وخمسة مواسم.');
    }
    if (!validMoney(x.weeklyWage)) return fail('INVALID_WAGE', 'الراتب الأسبوعي غير صالح.');
    if (x.loans && x.loans.some(l => l.status === 'active' && l.playerId === player.id)) {
      return fail('PLAYER_ON_LOAN', 'لا يمكن شراء لاعب مرتبط بإعارة نشطة.');
    }
    return validateSquadMove(x.players, player, x.sellerClubId, x.buyerClubId, x.rules);
  }

  function completePurchase(input) {
    const x = input || {};
    const check = validatePurchase(x);
    if (!check.ok) return check;
    const players = x.players.map(p => p.id === x.playerId
      ? { ...p, clubId: x.buyerClubId, cy: x.contractYears, wg: x.weeklyWage }
      : { ...p });
    return {
      ok: true,
      players,
      budget: x.budget - x.fee,
      transfer: {
        type: 'permanent',
        playerId: x.playerId,
        fromClubId: x.sellerClubId,
        toClubId: x.buyerClubId,
        fee: x.fee,
        contractYears: x.contractYears,
        weeklyWage: x.weeklyWage,
        season: Number.isInteger(x.season) ? x.season : null
      }
    };
  }

  function validateSale(input) {
    const x = input || {};
    if (!Array.isArray(x.players)) return fail('INVALID_PLAYERS', 'قائمة اللاعبين غير صالحة.');
    const player = findPlayer(x.players, x.playerId);
    if (!player) return fail('PLAYER_NOT_FOUND', 'اللاعب غير موجود.');
    if (!Number.isInteger(x.sellerClubId) || !Number.isInteger(x.buyerClubId) || x.sellerClubId === x.buyerClubId) {
      return fail('INVALID_CLUBS', 'الأندية المحددة غير صالحة.');
    }
    if (player.clubId !== x.sellerClubId) return fail('SELLER_MISMATCH', 'اللاعب ليس ضمن النادي البائع.');
    if (!validMoney(x.fee)) return fail('INVALID_FEE', 'قيمة البيع غير صالحة.');
    if (!validMoney(x.budget) || !Number.isSafeInteger(x.budget + x.fee)) return fail('INVALID_BUDGET', 'ميزانية النادي أو قيمة الصفقة غير صالحة.');
    if (x.loans && x.loans.some(l => l.status === 'active' && l.playerId === player.id)) {
      return fail('PLAYER_ON_LOAN', 'لا يمكن بيع لاعب مرتبط بإعارة نشطة.');
    }
    return validateSquadMove(x.players, player, x.sellerClubId, x.buyerClubId, x.rules);
  }

  function completeSale(input) {
    const x = input || {};
    const check = validateSale(x);
    if (!check.ok) return check;
    const players = x.players.map(p => p.id === x.playerId ? { ...p, clubId: x.buyerClubId } : { ...p });
    return {
      ok: true,
      players,
      budget: x.budget + x.fee,
      transfer: {
        type: 'sale',
        playerId: x.playerId,
        fromClubId: x.sellerClubId,
        toClubId: x.buyerClubId,
        fee: x.fee,
        season: Number.isInteger(x.season) ? x.season : null
      }
    };
  }

  function validateLoan(input) {
    const x = input || {};
    if (!Array.isArray(x.players)) return fail('INVALID_PLAYERS', 'قائمة اللاعبين غير صالحة.');
    const player = findPlayer(x.players, x.playerId);
    if (!player) return fail('PLAYER_NOT_FOUND', 'اللاعب غير موجود.');
    if (!Number.isInteger(x.fromClubId) || !Number.isInteger(x.toClubId) || x.fromClubId <= 0 || x.toClubId <= 0 || x.fromClubId === x.toClubId) {
      return fail('INVALID_CLUBS', 'الأندية المحددة للإعارة غير صالحة؛ يجب أن تكون أندية فعلية وليست سوق اللاعبين الأحرار.');
    }
    if (x.loans !== undefined && !Array.isArray(x.loans)) return fail('INVALID_LOANS', 'سجل الإعارات غير صالح.');
    if (player.clubId !== x.fromClubId) return fail('OWNER_MISMATCH', 'النادي المُعير لا يملك اللاعب حالياً.');
    if (!Number.isInteger(x.season) || x.season < 1) return fail('INVALID_SEASON', 'الموسم المحدد غير صالح.');
    if (!Number.isInteger(x.durationSeasons) || x.durationSeasons < 1 || x.durationSeasons > 2) {
      return fail('INVALID_LOAN_DURATION', 'مدة الإعارة يجب أن تكون موسماً أو موسمين.');
    }
    if (Number.isInteger(player.cy) && player.cy < x.durationSeasons) return fail('CONTRACT_TOO_SHORT', 'مدة عقد اللاعب لا تغطي مدة الإعارة المطلوبة.');
    if (!validMoney(x.loanFee)) return fail('INVALID_LOAN_FEE', 'رسوم الإعارة غير صالحة.');
    if (!Number.isInteger(x.wageSharePct) || x.wageSharePct < 0 || x.wageSharePct > 100) {
      return fail('INVALID_WAGE_SHARE', 'نسبة تحمّل الراتب يجب أن تكون بين 0 و100.');
    }
    const active = (x.loans || []).filter(l => l.status === 'active');
    if (active.some(l => l.playerId === player.id)) return fail('PLAYER_ALREADY_LOANED', 'اللاعب مرتبط بإعارة نشطة بالفعل.');
    const r = rulesWith(x.rules);
    if (active.filter(l => l.toClubId === x.toClubId).length >= r.maxActiveLoansPerClub) {
      return fail('LOAN_LIMIT_REACHED', 'بلغ النادي الحد الأقصى للاعبين المعارين إليه.');
    }
    return validateSquadMove(x.players, player, x.fromClubId, x.toClubId, x.rules);
  }

  function createLoan(input) {
    const x = input || {};
    const check = validateLoan(x);
    if (!check.ok) return check;
    const loanIdBase = 'loan:' + String(x.playerId) + ':' + x.season + ':' + x.toClubId;
    let loanId = loanIdBase, loanSequence = 2;
    while ((x.loans || []).some(existing => existing && existing.id === loanId)) {
      loanId = loanIdBase + ':' + loanSequence++;
    }
    const loan = {
      id: loanId,
      playerId: x.playerId,
      fromClubId: x.fromClubId,
      toClubId: x.toClubId,
      startSeason: x.season,
      endSeason: x.season + x.durationSeasons - 1,
      loanFee: x.loanFee,
      wageSharePct: x.wageSharePct,
      status: 'active'
    };
    return {
      ok: true,
      players: x.players.map(p => p.id === x.playerId ? { ...p, clubId: x.toClubId } : { ...p }),
      loans: [...(x.loans || []).map(l => ({ ...l })), loan],
      loan
    };
  }

  function returnLoansAtSeasonEnd(input) {
    const x = input || {};
    if (!Array.isArray(x.players) || !Array.isArray(x.loans) || !Number.isInteger(x.season)) {
      return fail('INVALID_RETURN_INPUT', 'بيانات إرجاع الإعارات غير مكتملة.');
    }
    const activeDue = x.loans.filter(l => l.status === 'active' && l.endSeason <= x.season);
    const activePlayerIds = new Set();
    for (const loan of x.loans.filter(l => l.status === 'active')) {
      if (activePlayerIds.has(loan.playerId)) return fail('DUPLICATE_ACTIVE_PLAYER_LOAN', 'يوجد أكثر من سجل إعارة نشط للاعب نفسه؛ أُوقف الإرجاع لتجنب تغيير النادي الأصلي بصورة خاطئة.');
      activePlayerIds.add(loan.playerId);
    }
    if (activeDue.some(l => !x.players.some(p => p.id === l.playerId) || !Number.isInteger(l.fromClubId) || l.fromClubId <= 0)) {
      return fail('INVALID_ACTIVE_LOAN', 'تعذر إرجاع الإعارة بسبب سجل لاعب أو نادٍ غير صالح.');
    }
    const due = new Set(activeDue.map(l => l.playerId));
    const loans = x.loans.map(l => due.has(l.playerId) && l.status === 'active'
      ? { ...l, status: 'completed', returnedSeason: x.season }
      : { ...l });
    const owners = new Map(x.loans.filter(l => due.has(l.playerId) && l.status === 'active').map(l => [l.playerId, l.fromClubId]));
    const players = x.players.map(p => owners.has(p.id) ? { ...p, clubId: owners.get(p.id) } : { ...p });
    return { ok: true, players, loans, returnedPlayerIds: [...due] };
  }

  function calculateWeeklyWageCommitment(input) {
    const x = input || {};
    if (!Array.isArray(x.players) || !Array.isArray(x.loans) || !Number.isInteger(x.clubId) || typeof x.wageForPlayer !== 'function') {
      return fail('INVALID_WAGE_INPUT', 'بيانات حساب رواتب الإعارات غير مكتملة.');
    }
    const activeLoans = x.loans.filter(loan => loan && loan.status === 'active');
    const byPlayer = new Map();
    for (const loan of activeLoans) {
      if (loan.playerId == null || !Number.isInteger(loan.fromClubId) || loan.fromClubId <= 0 ||
          !Number.isInteger(loan.toClubId) || loan.toClubId <= 0 || loan.fromClubId === loan.toClubId ||
          !Number.isInteger(loan.wageSharePct) || loan.wageSharePct < 0 || loan.wageSharePct > 100) {
        return fail('INVALID_ACTIVE_LOAN', 'سجل إعارة نشط غير صالح لحساب الرواتب.');
      }
      if (byPlayer.has(loan.playerId)) return fail('DUPLICATE_ACTIVE_PLAYER_LOAN', 'يوجد أكثر من سجل إعارة نشط للاعب نفسه.');
      byPlayer.set(loan.playerId, loan);
    }
    let amount = 0;
    for (const player of x.players) {
      const loan = byPlayer.get(player.id);
      let sharePct = 100;
      if (loan) {
        if (player.clubId !== loan.toClubId) return fail('LOAN_PLAYER_CLUB_MISMATCH', 'النادي المسجل للاعب لا يطابق النادي المستعير.');
        if (x.clubId === loan.toClubId) sharePct = loan.wageSharePct;
        else if (x.clubId === loan.fromClubId) sharePct = 100 - loan.wageSharePct;
        else continue;
      } else if (player.clubId !== x.clubId) {
        continue;
      }
      const wage = x.wageForPlayer(player);
      if (!validMoney(wage)) return fail('INVALID_PLAYER_WAGE', 'راتب أحد اللاعبين غير صالح.');
      const portion = Math.round(wage * sharePct / 100);
      if (!Number.isSafeInteger(amount + portion)) return fail('WAGE_TOTAL_OVERFLOW', 'إجمالي الرواتب يتجاوز النطاق المالي المسموح.');
      amount += portion;
    }
    return { ok: true, amount };
  }

  return Object.freeze({
    DEFAULT_RULES,
    validatePurchase,
    completePurchase,
    validateSale,
    completeSale,
    validateLoan,
    createLoan,
    returnLoansAtSeasonEnd,
    calculateWeeklyWageCommitment
  });
});
