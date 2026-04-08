/**
 * Salary Rule Engine
 *
 * Applies configurable payroll rules (late deduction, min hours, repeat penalty)
 * in priority order. Rules are loaded from the `payroll_rules` database table.
 *
 * Usage:
 *   const engine = require('./salaryRuleEngine');
 *   const { adjustedData, appliedRules } = engine.applyRules(employeeData, rules);
 */

// ─── Rule Handlers ───────────────────────────────────────────────────────────
// Each handler receives (data, config) and returns { data, description } or null.
// `data` is mutated in-place for chaining; `description` is the human-readable result.

const ruleHandlers = {
    /**
     * Late Policy: convert late minutes → deducted working hours
     * Config: { grace_minutes, conversion_rate, description_template }
     */
    late_policy(data, config) {
        const graceMinutes = parseFloat(config.grace_minutes) || 0;
        const conversionRate = parseFloat(config.conversion_rate) || 1;

        // Sum all late_minutes from attendance records, applying grace per-day
        let totalDeductMinutes = 0;
        if (Array.isArray(data.daily_late_minutes)) {
            for (const mins of data.daily_late_minutes) {
                const effective = Math.max(0, mins - graceMinutes);
                totalDeductMinutes += effective;
            }
        } else {
            // Fallback: use aggregate total_late_minutes
            const rawMinutes = data.total_late_minutes || 0;
            // If we only have the aggregate, subtract grace_minutes × late_count
            const graceTotal = graceMinutes * (data.late_count || 0);
            totalDeductMinutes = Math.max(0, rawMinutes - graceTotal);
        }

        const deductedHours = parseFloat(((totalDeductMinutes / 60) * conversionRate).toFixed(2));
        data.late_hours_deducted = deductedHours;
        data.effective_hours = parseFloat(Math.max(0, data.working_hours - deductedHours).toFixed(2));

        if (deductedHours <= 0) return null; // no impact, skip description

        const desc = formatTemplate(config.description_template || 'Trễ {late_minutes} phút → trừ {deducted_hours}h làm', {
            late_minutes: totalDeductMinutes,
            deducted_hours: deductedHours,
            grace_minutes: graceMinutes,
        });

        return { data, description: desc };
    },

    /**
     * Minimum Hours Policy: apply penalty rate if below threshold
     * Config: { required_hours, penalty_rate, description_template }
     */
    min_hours_policy(data, config) {
        const requiredHours = parseFloat(config.required_hours) || 160;
        const penaltyRate = parseFloat(config.penalty_rate) || 0.7;

        const effectiveHours = data.effective_hours ?? data.working_hours;

        if (effectiveHours >= requiredHours) return null; // met threshold

        data.min_hours_penalty_rate = penaltyRate;

        const desc = formatTemplate(config.description_template || 'Chỉ làm {effective_hours}h / {required_hours}h → lương ×{penalty_rate}', {
            effective_hours: effectiveHours,
            required_hours: requiredHours,
            penalty_rate: penaltyRate,
        });

        return { data, description: desc };
    },

    /**
     * Repeat Late Policy: extra penalty when late count exceeds threshold
     * Config: { max_late_count, penalty_type, penalty_amount, penalty_percentage, description_template }
     */
    repeat_late_policy(data, config) {
        const maxLateCount = parseInt(config.max_late_count) || 5;
        const lateCount = data.late_count || 0;

        if (lateCount <= maxLateCount) return null; // within threshold

        const penaltyType = config.penalty_type || 'fixed'; // 'fixed' | 'percentage'
        const penaltyAmount = parseFloat(config.penalty_amount) || 0;
        const penaltyPercentage = parseFloat(config.penalty_percentage) || 0;

        if (penaltyType === 'fixed') {
            data.repeat_late_penalty = penaltyAmount;
        } else {
            // percentage: will be applied to gross salary later
            data.repeat_late_penalty_pct = penaltyPercentage;
        }

        const desc = formatTemplate(config.description_template || 'Đi trễ {late_count} lần (>{max_late_count}) → phạt {penalty_amount}đ', {
            late_count: lateCount,
            max_late_count: maxLateCount,
            penalty_amount: penaltyAmount,
            penalty_percentage: (penaltyPercentage * 100).toFixed(0) + '%',
        });

        return { data, description: desc };
    },
};

// ─── Main entry ──────────────────────────────────────────────────────────────

/**
 * Apply all active rules to an employee's payroll data.
 *
 * @param {object} employeeData - mutable object with:
 *   - working_hours: total actual hours worked
 *   - total_late_minutes: sum of all late minutes (from attendance)
 *   - late_count: number of days marked 'late'
 *   - daily_late_minutes: array of per-day late minutes (optional, more accurate)
 * @param {Array} rules - sorted by priority, each { id, rule_type, config (parsed object), is_active }
 * @returns {{ adjustedData: object, appliedRules: Array<{ ruleId, ruleName, ruleType, description }> }}
 */
function applyRules(employeeData, rules) {
    const appliedRules = [];

    // Ensure effective_hours starts as working_hours if not set by a rule
    if (employeeData.effective_hours == null) {
        employeeData.effective_hours = employeeData.working_hours;
    }

    for (const rule of rules) {
        if (!rule.is_active) continue;

        const handler = ruleHandlers[rule.rule_type];
        if (!handler) continue;

        const config = typeof rule.config === 'string' ? JSON.parse(rule.config) : rule.config;
        const result = handler(employeeData, config);

        if (result) {
            appliedRules.push({
                ruleId: rule.id,
                ruleName: rule.name,
                ruleType: rule.rule_type,
                description: result.description,
            });
        }
    }

    return { adjustedData: employeeData, appliedRules };
}

/**
 * After base salary is calculated, apply financial adjustments from rules.
 *
 * @param {number} grossSalary - pre-rule gross salary
 * @param {object} employeeData - data after applyRules
 * @returns {{ grossSalary: number, netDeductions: number, descriptions: string[] }}
 */
function applyFinancialRules(grossSalary, employeeData) {
    let adjusted = grossSalary;
    let netDeductions = 0;
    const descriptions = [];

    // min_hours_policy: multiply gross by penalty_rate
    if (employeeData.min_hours_penalty_rate != null && employeeData.min_hours_penalty_rate < 1) {
        const reduction = adjusted * (1 - employeeData.min_hours_penalty_rate);
        adjusted = adjusted * employeeData.min_hours_penalty_rate;
        netDeductions += Math.round(reduction);
        descriptions.push(`Không đạt giờ tối thiểu → lương ×${employeeData.min_hours_penalty_rate} (giảm ${Math.round(reduction).toLocaleString('vi-VN')}đ)`);
    }

    // repeat_late_policy: fixed amount deduction
    if (employeeData.repeat_late_penalty > 0) {
        netDeductions += employeeData.repeat_late_penalty;
        descriptions.push(`Phạt tái phạm đi trễ: ${Math.round(employeeData.repeat_late_penalty).toLocaleString('vi-VN')}đ`);
    }

    // repeat_late_policy: percentage deduction
    if (employeeData.repeat_late_penalty_pct > 0) {
        const pctAmount = adjusted * employeeData.repeat_late_penalty_pct;
        netDeductions += Math.round(pctAmount);
        descriptions.push(`Phạt tái phạm: ${(employeeData.repeat_late_penalty_pct * 100).toFixed(0)}% (${Math.round(pctAmount).toLocaleString('vi-VN')}đ)`);
    }

    return {
        grossSalary: Math.round(adjusted),
        netDeductions: Math.round(netDeductions),
        descriptions,
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Simple template formatter: replaces {key} with values[key]
 */
function formatTemplate(template, values) {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
        const val = values[key];
        if (val == null) return `{${key}}`;
        if (typeof val === 'number') return Number.isInteger(val) ? val.toLocaleString('vi-VN') : val;
        return String(val);
    });
}

module.exports = { applyRules, applyFinancialRules };
