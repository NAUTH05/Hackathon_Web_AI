/**
 * Salary Engine — phân tách rõ ràng 4 giai đoạn tính lương:
 *
 *   Phase 1: EARNINGS  → basePay + OT + allowances = grossSalary
 *   Phase 2: RULES     → late_policy, min_hours, repeat_late → adjust grossSalary
 *   Phase 3: DEDUCTIONS → thuế, BHXH, phạt, khấu trừ → tổng khấu trừ
 *   Phase 4: NET       → netSalary = grossSalary - totalDeductions
 *
 * Mỗi phase có input/output rõ ràng, không trộn lẫn.
 * Formula builder (customExpression / formulaNodes) CHỈ tính earnings (Phase 1).
 * Thuế, BHXH, phạt LUÔN nằm ở Phase 3, không bao giờ ảnh hưởng gross.
 */

const { applyRules, applyFinancialRules } = require('./salaryRuleEngine');

// ─── Phase 1: Earnings ──────────────────────────────────────────────────────
// Tính lương gộp (gross) = basePay + OT + allowances
// Formula chỉ tính basePay phần earnings. Nếu formula chứa OT/allowances thì
// không cộng thêm để tránh tính trùng.

function calculateEarnings({ config, formulaVars, evaluateExpression, evaluateFormula, baseSalary, allowances, totalOtHours, hourlyRate, presentDays, actualWorkedHours, standardHoursPerDay, coeffMap }) {
  let basePay = 0;
  let otPay = 0;
  let allowancePay = 0;
  let formulaMode = 'legacy'; // 'expression' | 'blocks' | 'legacy'
  let hasOT = false, hasAllowances = false;
  let hasLatePenalty = false, hasDeductions = false;

  if (config.customExpression) {
    formulaMode = 'expression';
    basePay = evaluateExpression(config.customExpression, formulaVars);
    hasOT = /ot_hours/.test(config.customExpression);
    hasAllowances = /allowances/.test(config.customExpression);
    hasLatePenalty = /late_days|late_penalty_rate/.test(config.customExpression);
    hasDeductions = /\bdeductions\b/.test(config.customExpression);
  } else if (config.formulaNodes && config.formulaNodes.length > 0) {
    formulaMode = 'blocks';
    basePay = evaluateFormula(config.formulaNodes, formulaVars);
    hasOT = config.formulaNodes.some(n => n.blockId === 'ot_hours');
    hasAllowances = config.formulaNodes.some(n => n.blockId === 'allowances');
    hasLatePenalty = config.formulaNodes.some(n => n.blockId === 'late_days' || n.blockId === 'late_penalty_rate');
    hasDeductions = config.formulaNodes.some(n => n.blockId === 'deductions');
  } else {
    // Legacy salaryBasis mode
    if (config.salaryBasis === 'daily') {
      basePay = presentDays * (hourlyRate * standardHoursPerDay);
    } else if (config.salaryBasis === 'fixed') {
      basePay = baseSalary;
    } else {
      const workedHours = actualWorkedHours > 0 ? actualWorkedHours : (presentDays * standardHoursPerDay);
      basePay = workedHours * hourlyRate;
    }
  }

  // OT: only add if formula didn't already include it
  if (!hasOT && config.includeOT) {
    const otMultiplier = coeffMap.get('overtime') || config.otMultiplier;
    otPay = totalOtHours * hourlyRate * otMultiplier;
  }

  // Allowances: only add if formula didn't already include it
  if (!hasAllowances && config.includeAllowances) {
    allowancePay = allowances;
  }

  const grossSalary = Math.round(basePay + otPay + allowancePay);

  return {
    basePay: Math.round(basePay), otPay: Math.round(otPay), allowancePay: Math.round(allowancePay), grossSalary, formulaMode,
    formulaIncludesLatePenalty: hasLatePenalty,
    formulaIncludesDeductions: hasDeductions,
  };
}

// ─── Phase 2: Rules ─────────────────────────────────────────────────────────
// Áp dụng rule engine (late_policy → adjust effective_hours, min_hours → penalty_rate, repeat_late)
// NOTE: Phase 2 đã được thực hiện TRƯỚC Phase 1 (để effective_hours được feed vào formulaVars).
// Phần financial rules (min_hours_policy giảm gross, repeat_late_policy phạt thêm) chạy SAU Phase 1.

function applyRuleAdjustments(grossSalary, adjustedData, appliedRules) {
  const financial = applyFinancialRules(grossSalary, adjustedData);
  // min_hours_policy reduces grossSalary directly. That reduction is already
  // reflected in financial.grossSalary, so do NOT count it again as a deduction.
  // Only actual penalty amounts (repeat_late) go to Phase 3.
  const grossReduction = grossSalary - financial.grossSalary;
  const penaltyDeductions = Math.max(0, financial.netDeductions - grossReduction);

  return {
    grossSalary: financial.grossSalary,
    ruleDeductions: penaltyDeductions,
    ruleDescriptions: [
      ...appliedRules.map(r => r.description),
      ...financial.descriptions,
    ],
  };
}

// ─── Phase 3: Deductions ────────────────────────────────────────────────────
// Tất cả khoản trừ: thuế, BHXH, phạt trễ, khấu trừ vi phạm, phạt rule engine
// Mỗi khoản trừ tách riêng, có mô tả rõ ràng.

/**
 * @param {object} params
 * @param {number} params.grossSalary - lương gộp sau rule adjustment
 * @param {object} params.config - preset config
 * @param {number} params.lateDays - số ngày trễ
 * @param {number} params.rawDeductions - tổng phạt vi phạm từ penalties table
 * @param {number} params.ruleDeductions - phạt từ rule engine (min_hours, repeat_late)
 * @param {Array} params.deductionItems - custom deduction items from DB (future extensible)
 * @returns {{ totalDeductions, latePenalty, deductionsPay, taxAmount, insuranceAmount, items }}
 */
function calculateDeductions({ grossSalary, config, lateDays, rawDeductions, ruleDeductions, deductionItems = [], formulaIncludesLatePenalty = false, formulaIncludesDeductions = false }) {
  const items = [];

  // Late penalty (old-style per-day penalty — still supported alongside rule engine)
  // Skip if formula already includes late_days/late_penalty_rate to avoid double-counting
  let latePenalty = 0;
  if (config.includeLatePenalty && !formulaIncludesLatePenalty) {
    latePenalty = lateDays * config.latePenaltyPerDay;
    if (latePenalty > 0) {
      items.push({ type: 'late_penalty', label: `Phạt trễ (${lateDays} ngày × ${config.latePenaltyPerDay.toLocaleString('vi-VN')}đ)`, amount: latePenalty });
    }
  }

  // Violation deductions from penalties table
  // Skip if formula already includes deductions block to avoid double-counting
  let deductionsPay = 0;
  if (config.includeDeductions && !formulaIncludesDeductions) {
    deductionsPay = rawDeductions;
    if (deductionsPay > 0) {
      items.push({ type: 'violations', label: 'Khấu trừ vi phạm', amount: deductionsPay });
    }
  }

  // Rule engine deductions (min_hours_penalty, repeat_late_penalty)
  if (ruleDeductions > 0) {
    items.push({ type: 'rule_penalty', label: 'Phạt ràng buộc', amount: ruleDeductions });
  }

  // Custom deduction items (future: tax, insurance from deduction_items table)
  for (const item of deductionItems) {
    let amount = 0;
    if (item.calc_type === 'fixed') {
      amount = parseFloat(item.amount) || 0;
    } else if (item.calc_type === 'percentage') {
      amount = Math.round(grossSalary * (parseFloat(item.rate) || 0));
    }
    if (amount > 0) {
      items.push({ type: item.type, label: item.label, amount });
    }
  }

  const totalDeductions = Math.round(
    latePenalty + deductionsPay + ruleDeductions +
    items.filter(i => i.type !== 'late_penalty' && i.type !== 'violations' && i.type !== 'rule_penalty')
      .reduce((sum, i) => sum + i.amount, 0)
  );

  return {
    totalDeductions,
    latePenalty: Math.round(latePenalty),
    deductionsPay: Math.round(deductionsPay),
    ruleDeductions: Math.round(ruleDeductions),
    items,
  };
}

// ─── Phase 4: Net ───────────────────────────────────────────────────────────

function calculateNet(grossSalary, totalDeductions) {
  return Math.round(Math.max(0, grossSalary - totalDeductions));
}

// ─── Orchestrator ───────────────────────────────────────────────────────────
// Main entry point that runs all 4 phases in order.

/**
 * @param {object} params - all data needed for one employee
 * @returns {object} complete salary breakdown
 */
function calculateSalary({
  // Employee & preset
  config, baseSalary, allowances,
  // Attendance
  actualWorkedHours, presentDays, totalOtHours, lateDays, standardHoursPerDay,
  // Rules
  adjustedData, appliedRules, effectiveHours,
  // Existing deductions
  rawDeductions,
  // Custom deduction items (tax, insurance, etc.)
  deductionItems,
  // Functions & maps
  evaluateExpression, evaluateFormula, formulaVars, coeffMap,
}) {
  // Phase 1: Earnings
  const earnings = calculateEarnings({
    config, formulaVars, evaluateExpression, evaluateFormula,
    baseSalary, allowances, totalOtHours, hourlyRate: formulaVars.hourly_rate,
    presentDays, actualWorkedHours, standardHoursPerDay, coeffMap,
  });

  // Phase 2: Rule adjustments on gross
  const ruleResult = applyRuleAdjustments(earnings.grossSalary, adjustedData, appliedRules);

  // Phase 3: Deductions (KHÔNG ảnh hưởng gross)
  const deductions = calculateDeductions({
    grossSalary: ruleResult.grossSalary,
    config, lateDays, rawDeductions,
    ruleDeductions: ruleResult.ruleDeductions,
    deductionItems: deductionItems || [],
    formulaIncludesLatePenalty: earnings.formulaIncludesLatePenalty,
    formulaIncludesDeductions: earnings.formulaIncludesDeductions,
  });

  // Phase 4: Net
  const netSalary = calculateNet(ruleResult.grossSalary, deductions.totalDeductions);

  return {
    // Phase 1 output
    basePay: earnings.basePay,
    otPay: earnings.otPay,
    allowancePay: earnings.allowancePay,
    grossSalary: ruleResult.grossSalary,
    formulaMode: earnings.formulaMode,
    // Phase 2 output
    ruleDeductions: ruleResult.ruleDeductions,
    ruleDescriptions: ruleResult.ruleDescriptions,
    // Phase 3 output
    latePenalty: deductions.latePenalty,
    deductionsPay: deductions.deductionsPay,
    totalDeductions: deductions.totalDeductions,
    deductionItems: deductions.items,
    // Phase 4 output
    netSalary,
  };
}

module.exports = { calculateEarnings, applyRuleAdjustments, calculateDeductions, calculateNet, calculateSalary };
