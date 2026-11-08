(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FM4NegotiationSystem = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RULES = Object.freeze({
    minOfferRatio: 0.78,
    counterOfferRatio: 0.90,
    acceptOfferRatio: 1.12,
    maxClubRounds: 3,
    maxContractYears: 5,
    minContractYears: 1
  });
  const fail = (code, message) => ({ ok: false, code, message });
  const money = value => Number.isSafeInteger(value) && value >= 0;
  const round1000 = value => Math.ceil(value / 1000 - 1e-10 * Math.max(1, Math.abs(value / 1000))) * 1000;
  const atLeastRatio = (amount, value, ratio) => { const threshold = value * ratio; return amount + 1e-10 * Math.max(1, Math.abs(threshold)) >= threshold; };
  const rulesWith = rules => ({ ...RULES, ...(rules || {}) });

  function validateOffer(x) {
    const p = x && x.player;
    if (!p || p.id == null) return fail('PLAYER_NOT_FOUND', 'اللاعب المستهدف غير موجود.');
    if (!Number.isInteger(x.buyerClubId) || !Number.isInteger(p.clubId) || p.clubId <= 0 || x.buyerClubId <= 0 || p.clubId === x.buyerClubId) {
      return fail('INVALID_CLUBS', 'الناديان المحددان غير صالحين للتفاوض.');
    }
    if (!money(x.fee)) return fail('INVALID_FEE', 'قيمة العرض يجب أن تكون مبلغاً صحيحاً غير سالب.');
    if (!money(x.budget)) return fail('INVALID_BUDGET', 'ميزانية النادي غير صالحة.');
    if (!money(x.signingBonus || 0)) return fail('INVALID_SIGNING_BONUS', 'مكافأة التوقيع غير صالحة.');
    if (!money(x.weeklyWage)) return fail('INVALID_WAGE', 'الراتب الأسبوعي غير صالح.');
    if (!Number.isInteger(x.contractYears) || x.contractYears < 1 || x.contractYears > 5) return fail('INVALID_CONTRACT_LENGTH', 'مدة العقد يجب أن تكون بين موسم وخمسة مواسم.');
    if (!Number.isSafeInteger(x.fee + (x.signingBonus || 0))) return fail('BUDGET_OVERFLOW', 'إجمالي تكلفة الصفقة يتجاوز النطاق المالي المسموح.');
    if (x.budget < x.fee + (x.signingBonus || 0)) return fail('INSUFFICIENT_BUDGET', 'الميزانية لا تكفي لقيمة الانتقال ومكافأة التوقيع.');
    if (x.playerOnLoan) return fail('PLAYER_ON_LOAN', 'لا يمكن التفاوض على لاعب مرتبط بإعارة نشطة.');
    return { ok: true };
  }

  function createOffer(input) {
    const x = input || {};
    const check = validateOffer(x);
    if (!check.ok) return check;
    const existing = (Array.isArray(x.negotiations) ? x.negotiations : []).some(n =>
      n && n.playerId === x.player.id && n.buyerClubId === x.buyerClubId &&
      ['pending', 'countered', 'club_accepted', 'player_countered', 'player_accepted'].includes(n.status)
    );
    if (existing) return fail('NEGOTIATION_ALREADY_ACTIVE', 'توجد مفاوضات نشطة بالفعل حول هذا اللاعب.');
    const sequence = (Array.isArray(x.negotiations) ? x.negotiations.length : 0) + 1;
    const offer = {
      id: 'neg:' + String(x.player.id) + ':' + String(x.season || 1) + ':' + String(x.buyerClubId) + ':' + sequence,
      playerId: x.player.id,
      sellerClubId: x.player.clubId,
      buyerClubId: x.buyerClubId,
      season: Number.isInteger(x.season) && x.season > 0 ? x.season : 1,
      fee: x.fee,
      weeklyWage: x.weeklyWage,
      contractYears: x.contractYears,
      signingBonus: x.signingBonus || 0,
      clubRounds: 0,
      status: 'pending'
    };
    return { ok: true, offer };
  }

  function evaluateClubOffer(input) {
    const x = input || {};
    const offer = x.offer;
    const player = x.player;
    if (!offer || offer.status !== 'pending' || !player || offer.playerId !== player.id || offer.sellerClubId !== player.clubId) return fail('STALE_NEGOTIATION', 'تغيرت ملكية اللاعب أو لم تعد بيانات المفاوضات صالحة.');
    if (!money(x.fee)) return fail('INVALID_FEE', 'قيمة العرض غير صالحة.');
    const r = rulesWith(x.rules);
    const value = Number.isSafeInteger(x.marketValue) && x.marketValue > 0 ? x.marketValue : 0;
    if (!value) return fail('INVALID_MARKET_VALUE', 'القيمة السوقية للاعب غير صالحة.');
    const next = { ...offer, fee: x.fee, clubRounds: (offer.clubRounds || 0) + 1 };
    if (atLeastRatio(x.fee, value, r.acceptOfferRatio)) {
      next.status = 'club_accepted';
      next.counterFee = null;
      return { ok: true, offer: next, decision: 'accepted', message: 'وافق النادي على قيمة الانتقال.' };
    }
    if (atLeastRatio(x.fee, value, r.minOfferRatio) && next.clubRounds <= r.maxClubRounds) {
      next.status = 'countered';
      next.counterFee = Math.max(x.fee, round1000(value * r.acceptOfferRatio));
      return { ok: true, offer: next, decision: 'countered', message: 'قدم النادي عرضاً مضاداً.' };
    }
    next.status = 'rejected';
    next.counterFee = null;
    return { ok: true, offer: next, decision: 'rejected', message: 'رفض النادي العرض لأنه أقل من الحد المقبول.' };
  }

  function submitCounterOffer(input) {
    const x = input || {};
    const offer = x.offer;
    if (!offer || offer.status !== 'countered') return fail('NO_COUNTER_TO_ANSWER', 'لا يوجد عرض مضاد بانتظار الرد.');
    if ((offer.clubRounds || 0) >= rulesWith(x.rules).maxClubRounds) return fail('NEGOTIATION_LIMIT', 'بلغت المفاوضات الحد الأقصى للجولات.');
    const bonus = offer.signingBonus || 0;
    if (!money(x.fee) || !money(x.budget) || !money(bonus)) return fail('INVALID_MONEY', 'قيمة العرض أو الميزانية أو مكافأة التوقيع غير صالحة.');
    if (!Number.isSafeInteger(x.fee + bonus)) return fail('BUDGET_OVERFLOW', 'إجمالي تكلفة العرض يتجاوز النطاق المالي المسموح.');
    if (x.budget < x.fee + bonus) return fail('INSUFFICIENT_BUDGET', 'الميزانية لا تكفي للعرض الجديد.');
    return { ok: true, offer: { ...offer, fee: x.fee, status: 'pending', counterFee: null } };
  }

  function acceptClubCounter(input) {
    const x = input || {};
    const offer = x.offer;
    const player = x.player;
    if (!offer || offer.status !== 'countered' || !money(offer.counterFee)) return fail('NO_COUNTER_TO_ANSWER', 'لا يوجد عرض مضاد من النادي لقبوله.');
    if (!player || offer.playerId !== player.id || offer.sellerClubId !== player.clubId) return fail('STALE_NEGOTIATION', 'تغيرت ملكية اللاعب؛ لم يعد العرض المضاد صالحاً.');
    const bonus = offer.signingBonus || 0;
    if (!money(bonus) || !Number.isSafeInteger(offer.counterFee + bonus)) return fail('INVALID_CONTRACT_MONEY', 'قيمة العرض المضاد أو مكافأة التوقيع غير صالحة.');
    if (!money(x.budget)) return fail('INVALID_BUDGET', 'ميزانية النادي غير صالحة.');
    if (x.budget < offer.counterFee + bonus) return fail('INSUFFICIENT_BUDGET', 'الميزانية لا تكفي لقبول العرض المضاد.');
    return {
      ok: true,
      offer: { ...offer, fee: offer.counterFee, status: 'club_accepted', counterFee: null },
      decision: 'accepted',
      message: 'تم قبول العرض المضاد من النادي.'
    };
  }

  function evaluatePlayerContract(input) {
    const x = input || {};
    const offer = x.offer;
    const player = x.player;
    if (!offer || offer.status !== 'club_accepted' || !player || offer.playerId !== player.id) return fail('CLUB_NOT_ACCEPTED', 'يجب موافقة النادي البائع أولاً.');
    if (!money(x.weeklyWage) || !money(x.signingBonus || 0)) return fail('INVALID_CONTRACT_MONEY', 'الراتب أو مكافأة التوقيع غير صالح.');
    if (!Number.isInteger(x.contractYears) || x.contractYears < 1 || x.contractYears > 5) return fail('INVALID_CONTRACT_LENGTH', 'مدة العقد يجب أن تكون بين موسم وخمسة مواسم.');
    const currentWage = money(x.currentWage) ? x.currentWage : money(player.wg) ? player.wg : 0;
    const skillPremium = Math.max(0, (Number(player.ovr) || 0) - 60) * 0.012;
    const demand = Math.max(currentWage, Math.ceil(currentWage * (1.08 + skillPremium)));
    const next = { ...offer, weeklyWage: x.weeklyWage, signingBonus: x.signingBonus || 0, contractYears: x.contractYears };
    if (x.weeklyWage >= demand) {
      next.status = 'player_accepted';
      next.counterWage = null;
      return { ok: true, offer: next, decision: 'accepted', demandedWage: demand, message: 'وافق اللاعب على الراتب ومدة العقد.' };
    }
    if (x.weeklyWage >= demand * 0.82) {
      next.status = 'player_countered';
      next.counterWage = demand;
      return { ok: true, offer: next, decision: 'countered', demandedWage: demand, message: 'طلب اللاعب راتباً أسبوعياً أعلى.' };
    }
    next.status = 'player_rejected';
    next.counterWage = null;
    return { ok: true, offer: next, decision: 'rejected', demandedWage: demand, message: 'رفض اللاعب العرض المالي.' };
  }

  function acceptPlayerCounter(input) {
    const x = input || {};
    const offer = x.offer;
    if (!offer || offer.status !== 'player_countered' || !money(offer.counterWage)) return fail('NO_PLAYER_COUNTER', 'لا يوجد طلب راتب مضاد.');
    const bonus = offer.signingBonus || 0;
    if (!money(offer.fee) || !money(bonus) || !Number.isSafeInteger(offer.fee + bonus)) return fail('INVALID_CONTRACT_MONEY', 'قيمة الانتقال أو مكافأة التوقيع غير صالحة.');
    if (!money(x.budget)) return fail('INVALID_BUDGET', 'ميزانية النادي غير صالحة.');
    if (x.budget < offer.fee + bonus) return fail('INSUFFICIENT_BUDGET', 'الميزانية لا تكفي لإتمام الصفقة.');
    return { ok: true, offer: { ...offer, weeklyWage: offer.counterWage, status: 'player_accepted', counterWage: null } };
  }

  function expireAtSeasonEnd(input) {
    const x = input || {};
    if (!Array.isArray(x.negotiations) || !Number.isInteger(x.season) || x.season < 1) return fail('INVALID_EXPIRY_INPUT', 'بيانات إنهاء المفاوضات غير صالحة.');
    const active = new Set(['pending', 'countered', 'club_accepted', 'player_countered', 'player_accepted']);
    let expired = 0;
    const negotiations = x.negotiations.map(n => {
      if (n && active.has(n.status) && Number.isInteger(n.season) && n.season <= x.season) {
        expired++;
        return { ...n, status: 'expired', expiredSeason: x.season };
      }
      return { ...n };
    });
    return { ok: true, negotiations, expired };
  }

  function finalizeDeal(input) {
    const x = input || {};
    const offer = x.offer;
    if (!offer || offer.status !== 'player_accepted') return fail('NEGOTIATION_NOT_COMPLETE', 'لم تكتمل موافقة النادي واللاعب بعد.');
    if (!Array.isArray(x.players) || !x.players.some(p => p.id === offer.playerId && p.clubId === offer.sellerClubId)) return fail('STALE_NEGOTIATION', 'اللاعب لم يعد تابعاً للنادي البائع.');
    const bonus = offer.signingBonus || 0;
    if (!money(offer.fee) || !money(bonus) || !money(offer.weeklyWage) || !Number.isInteger(offer.contractYears) || offer.contractYears < 1 || offer.contractYears > 5) return fail('INVALID_CONTRACT_MONEY', 'بيانات قيمة الانتقال أو الراتب أو مدة العقد غير صالحة.');
    if (!Number.isSafeInteger(offer.fee + bonus)) return fail('BUDGET_OVERFLOW', 'إجمالي تكلفة الصفقة يتجاوز النطاق المالي المسموح.');
    if (!money(x.budget)) return fail('INVALID_BUDGET', 'ميزانية النادي غير صالحة.');
    if (x.budget < offer.fee + bonus) return fail('INSUFFICIENT_BUDGET', 'الميزانية لا تكفي لقيمة الانتقال ومكافأة التوقيع.');
    if (!x.transferSystem || typeof x.transferSystem.completePurchase !== 'function') return fail('TRANSFER_SYSTEM_MISSING', 'نظام تنفيذ الانتقالات غير متاح.');
    const transfer = x.transferSystem.completePurchase({
      players: x.players,
      playerId: offer.playerId,
      buyerClubId: offer.buyerClubId,
      sellerClubId: offer.sellerClubId,
      fee: offer.fee,
      budget: x.budget,
      contractYears: offer.contractYears,
      weeklyWage: offer.weeklyWage,
      season: offer.season,
      loans: x.loans || []
    });
    if (!transfer.ok) return transfer;
    return {
      ok: true,
      players: transfer.players,
      budget: transfer.budget - (offer.signingBonus || 0),
      offer: { ...offer, status: 'completed' },
      transfer: { ...transfer.transfer, signingBonus: offer.signingBonus || 0, weeklyWage: offer.weeklyWage, contractYears: offer.contractYears }
    };
  }

  return Object.freeze({
    RULES,
    createOffer,
    evaluateClubOffer,
    submitCounterOffer,
    acceptClubCounter,
    evaluatePlayerContract,
    acceptPlayerCounter,
    expireAtSeasonEnd,
    finalizeDeal
  });
});
