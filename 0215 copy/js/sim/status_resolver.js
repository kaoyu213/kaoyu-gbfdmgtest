// ==========================================
//  GBF 模拟器 - Status / skill actions 解析工具
// ==========================================
(function (global) {
    'use strict';

    function cloneJson(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function copyConditions(source, target) {
        if (!source || !target) return target;
        if (source.conditions != null) target.conditions = cloneJson(source.conditions);
        else if (source.condition != null) target.conditions = cloneJson(source.condition);
        return target;
    }

    function copyStatusDisplay(source, target) {
        if (!source || !target) return target;
        if (source.status_display && typeof source.status_display === 'object') {
            target.status_display = cloneJson(source.status_display);
        }
        if (source.display_detail) target.display_detail = String(source.display_detail);
        return target;
    }

    function normalizeStepTarget(target) {
        const t = target == null ? '' : String(target).trim();
        if (t === 'enemy') return 'enemy_single';
        if (t === 'party') return 'ally_party';
        return t || 'self';
    }

    function normalizeSimpleEffect(effect) {
        if (!effect || typeof effect !== 'object') return null;

        if (effect.effect === 'enemy_defense_down') {
            const value = Math.max(0, Number(effect.value) || 0);
            return copyConditions(effect, {
                effect_type: 'enemy_defense_down',
                prop: effect.prop || 'def_down',
                zone: effect.zone || 'normal',
                value,
                format: effect.format || 'percent'
            });
        }

        if (effect.prop && effect.zone) {
            const value = Number(effect.value);
            if (!Number.isFinite(value) || value === 0) return null;
            return copyConditions(effect, {
                effect_type: effect.effect_type || effect.effect || 'stat_mod',
                value,
                formula: {
                    prop: String(effect.prop),
                    zone: String(effect.zone),
                    value,
                    format: effect.format
                }
            });
        }

        if (effect.effect === 'double_strike') {
            const value = Number(effect.value) || 1;
            return copyConditions(effect, {
                effect_type: 'extra_attack',
                mode: 'double_strike',
                count: value,
                formula: {
                    prop: 'double_strike',
                    zone: effect.zone || 'chara_skill',
                    value
                }
            });
        }

        if (effect.event === 'turn_hp_loss') {
            return copyConditions(effect, {
                effect_type: 'turn_hp_loss',
                timing: effect.timing || 'turn_start',
                percent_max_hp: Number(effect.value) || 0,
                can_reduce_to_zero: effect.can_reduce_to_zero === true
            });
        }

        return cloneJson(effect);
    }

    function normalizeDuration(step) {
        if (step && step.duration && typeof step.duration === 'object') {
            const duration = cloneJson(step.duration);
            duration.type = duration.type || 'turns';
            if (duration.value != null) duration.value = Math.max(0, Number(duration.value) || 0);
            if (!duration.tick) duration.tick = duration.type === 'action' ? 'attack_action_end' : 'turn_end';
            return duration;
        }
        if (step && step.duration_type === 'action') {
            return {
                type: 'action',
                value: Math.max(1, Number(step.actions) || 1),
                tick: step.duration_tick || 'attack_action_end'
            };
        }
        return step && step.turns != null ? {
            type: 'turns',
            value: Number(step.turns) || 0,
            tick: 'turn_end'
        } : null;
    }

    function normalizeDamageStep(step, context) {
        return {
            type: 'damage',
            target: normalizeStepTarget(step.target || 'enemy'),
            damage: {
                damage_type: step.damage_type || 'skill',
                element: step.element || (context && context.element) || null,
                multiplier: Number(step.mult) || 0,
                hits: Math.max(1, Math.floor(Number(step.hits) || 1)),
                threshold_table: step.threshold_table || null,
                cap_per_hit: Number(step.cap) || 0
            }
        };
    }

    function normalizeCaStep(step) {
        return {
            type: 'damage',
            target: normalizeStepTarget(step.target || 'enemy'),
            damage: {
                damage_type: 'ca',
                multiplier: step.mult == null ? null : Number(step.mult),
                fixed: step.fixed == null ? null : Number(step.fixed)
            }
        };
    }

    function normalizeNaStep(step) {
        return {
            type: 'damage',
            target: normalizeStepTarget(step.target || 'enemy'),
            damage: {
                damage_type: 'normal_attack',
                rounds: 1
            }
        };
    }

    function normalizeBuffStep(step, context, idx) {
        if (step.prop && step.zone) {
            const value = Number(step.value);
            if (!Number.isFinite(value) || value === 0) return null;
            const displayMeta = typeof getBuffIconMeta === 'function'
                ? getBuffIconMeta(step.prop, step.zone)
                : null;
            const statusId = step.id || [
                'status',
                context && context.skillId ? context.skillId : 'skill',
                idx
            ].join('_');
            const normalized = {
                type: 'apply_status',
                target: normalizeStepTarget(step.target),
                target_slots: Array.isArray(step.target_slots) ? step.target_slots.map(Number) : undefined,
                status: {
                    status_id: statusId,
                    kind: step.unique ? 'unique' : 'generic',
                    name: step.name || (displayMeta && displayMeta.title) || statusId,
                    icon: step.icon || (displayMeta && displayMeta.icon) || '',
                    source_display: step.source_display || (context && context.skillName) || '',
                    duration: normalizeDuration(step),
                    triggers: Array.isArray(step.triggers) ? cloneJson(step.triggers) : undefined,
                    stacking: step.stacking && typeof step.stacking === 'object' ? cloneJson(step.stacking) : null,
                    stacks: step.stacking ? Math.max(1, Number(step.stacks) || 1) : null,
                    flags: step.dispel_immune != null ? { dispel_immune: step.dispel_immune === true } : {},
                    effects: [
                        copyConditions(step, {
                            effect_type: step.effect_type || 'stat_mod',
                            value,
                            formula: {
                                prop: String(step.prop),
                                zone: String(step.zone),
                                value,
                                format: step.format
                            }
                        })
                    ]
                }
            };
            copyStatusDisplay(step, normalized.status);
            return normalized;
        }

        const statusId = step.id || [
            step.unique ? 'unique' : 'status',
            context && context.skillId ? context.skillId : 'skill',
            idx
        ].join('_');
        const status = {
            status_id: statusId,
            kind: step.unique ? 'unique' : 'generic',
            name: step.name || statusId,
            icon: step.icon || '',
            source_display: step.source_display || (context && context.skillName) || '',
            duration: normalizeDuration(step),
            triggers: Array.isArray(step.triggers) ? cloneJson(step.triggers) : undefined,
            stacking: step.stacking && typeof step.stacking === 'object' ? cloneJson(step.stacking) : null,
            stacks: step.stacking ? Math.max(1, Number(step.stacks) || 1) : null,
            flags: step.dispel_immune != null ? { dispel_immune: step.dispel_immune === true } : {},
            effects: (Array.isArray(step.effects) ? step.effects : [])
                .map((effect) => normalizeSimpleEffect(effect))
                .filter(Boolean)
        };
        copyStatusDisplay(step, status);
        if (Array.isArray(step.omitted)) {
            status.omitted_effects = step.omitted.map((description) => ({
                description: String(description)
            }));
        }
        return {
            type: 'apply_status',
            target: normalizeStepTarget(step.target),
            target_slots: Array.isArray(step.target_slots) ? step.target_slots.map(Number) : undefined,
            status
        };
    }

    const STEP_HANDLERS = Object.create(null);

    function registerStepHandler(behavior, handler) {
        const key = String(behavior || '').trim();
        if (!key || typeof handler !== 'function') {
            throw new Error('技能步骤处理器需要 behavior 和处理函数');
        }
        STEP_HANDLERS[key] = handler;
        return handler;
    }

    function hasStepHandler(behavior) {
        return typeof STEP_HANDLERS[String(behavior || '').trim()] === 'function';
    }

    function normalizeExtensibleStep(step) {
        const command = cloneJson(step) || {};
        command.type = String(command.do || '').trim();
        command.target = normalizeStepTarget(command.target);
        delete command.do;
        return command;
    }

    Object.entries({
        damage: normalizeDamageStep,
        buff: normalizeBuffStep,
        ca: normalizeCaStep,
        na: normalizeNaStep
    }).forEach(([behavior, handler]) => registerStepHandler(behavior, handler));

    [
        'counter',
        'set_flag',
        'remove_status',
        'extend_status',
        'reduce_cooldown',
        'schedule_action',
        'cancel_action',
        'replace_action',
        'emit_event'
    ].forEach((behavior) => registerStepHandler(behavior, normalizeExtensibleStep));

    function normalizeStepToAction(step, context, idx) {
        if (!step || typeof step !== 'object') return null;
        const behavior = typeof step.do === 'string' ? step.do.trim() : '';
        const handler = STEP_HANDLERS[behavior];
        if (!handler) {
            console.warn('[status_resolver] 未支持的技能行为:', behavior || '(empty)', step);
            return null;
        }
        return handler(step, context || {}, idx);
    }

    function getSkillActions(skill, context) {
        if (!skill) return [];
        if (Array.isArray(skill.steps)) {
            return skill.steps
                .map((step, idx) => normalizeStepToAction(step, context || {}, idx))
                .filter(Boolean);
        }
        return [];
    }

    function getStatusFromAction(action, context) {
        if (!action || action.type !== 'apply_status') return null;
        if (!action.status || typeof action.status !== 'object') return null;
        const status = cloneJson(action.status);
        status.target = action.target || status.target || null;
        status.target_slots = Array.isArray(action.target_slots) ? action.target_slots.slice() : status.target_slots;
        status.source_skill_id = context && context.skillId ? context.skillId : status.source_skill_id;
        return status;
    }

    function getStatusesFromSkillActions(skill, context) {
        const actions = getSkillActions(skill, context || {});
        return actions
            .map((action) => getStatusFromAction(action, context || {}))
            .filter(Boolean);
    }

    function effectConditionsMatch(effect, context) {
        const conditions = effect && effect.conditions != null ? effect.conditions : effect && effect.condition;
        if (conditions == null) return true;
        const evaluator = global.BattleConditions && global.BattleConditions.evaluator;
        return !!(evaluator && typeof evaluator.evaluate === 'function' && evaluator.evaluate(conditions, context || {}));
    }

    // 只投影当前层数的效果，不改写定义，供每hit结算和图标提示共用。
    function getEffectiveStatusEffects(status) {
        const stacks = Math.max(1, Number(status && status.stacks) || 1);
        const multiplier = status && status.stacking && status.stacking.scale_effects === true ? stacks : 1;
        return (Array.isArray(status && status.effects) ? status.effects : [])
            .filter((effect) => effect && (effect.min_stacks == null || stacks >= Number(effect.min_stacks)))
            .map((effect) => {
                if (multiplier === 1) return effect;
                const resolved = cloneJson(effect);
                if (resolved.formula && resolved.formula.value != null) resolved.formula.value = Number(resolved.formula.value) * multiplier;
                if (resolved.value != null) resolved.value = Number(resolved.value) * multiplier;
                return resolved;
            });
    }

    function statusEffectToZoneEntry(status, effect, idx, context) {
        if (!status || !effect) return null;
        if (!effectConditionsMatch(effect, context)) return null;
        const formula = effect.formula && typeof effect.formula === 'object' ? effect.formula : null;
        if (!formula || !formula.prop || !formula.zone) return null;
        const value = Number(formula.value);
        if (!Number.isFinite(value) || value === 0) return null;
        const meta = typeof getBuffDisplayMeta === 'function'
            ? getBuffDisplayMeta(formula.prop, formula.zone, {
                label: effect.label || formula.label,
                format: formula.format || effect.format
            })
            : null;
        return {
            prop: String(formula.prop).trim(),
            zone: String(formula.zone).trim(),
            value,
            sourceId: (status.source_skill_id || status.status_id || 'status') + ':' + (status.status_id || 'status') + ':' + idx,
            label: (meta && meta.label) || effect.label || formula.label || formula.prop,
            format: (meta && meta.format) || formula.format || effect.format || (Math.abs(value) <= 10 ? 'percent' : 'fixed'),
            source: status.kind === 'unique' ? 'unique_status' : 'generic_status'
        };
    }

    function collectZoneEntriesFromStatuses(statuses, context) {
        const entries = [];
        (Array.isArray(statuses) ? statuses : []).forEach((status) => {
            const effects = getEffectiveStatusEffects(status);
            effects.forEach((effect, idx) => {
                const entry = statusEffectToZoneEntry(status, effect, idx, context || {});
                if (entry) entries.push(entry);
            });
        });
        return entries;
    }

    function isStatusDisplayActive(status, context) {
        const effects = Array.isArray(status && status.effects) ? status.effects : [];
        const conditionalEffects = effects.filter((effect) => effect && (effect.conditions != null || effect.condition != null));
        if (conditionalEffects.length === 0) return true;
        return conditionalEffects.some((effect) => effectConditionsMatch(effect, context || {}));
    }

    function statusToPartyBuffDisplay(status) {
        if (!status) return null;
        const name = status.name || status.status_id || '';
        const durationValue = status.remaining_turns != null
            ? Number(status.remaining_turns)
            : status.duration && status.duration.value != null
                ? Number(status.duration.value)
                : null;
        const duration = durationValue != null && durationValue > 0 ? `，剩余${durationValue}回合` : '';
        const stacks = status.stacks != null ? `，${Math.max(1, Number(status.stacks) || 1)}层` : '';
        const subs = (Array.isArray(status.effects) ? status.effects : [])
            .map((effect) => {
                if (!effect) return '';
                if (effect.effect_type === 'bonus_damage') {
                    const pct = Number(effect.value || 0);
                    const zone = effect.zone ? String(effect.zone) : '';
                    return `追击${pct ? ' +' + (pct * 100).toFixed(0) + '%' : ''}${zone ? ' ' + zone : ''}`;
                }
                if (effect.effect_type === 'multiattack') return effect.mode || 'multiattack';
                if (effect.effect_type === 'extra_attack') return '再攻击';
                if (effect.effect_type === 'enemy_defense_down') {
                    const zone = effect.zone === 'independent' ? '（独立）' : '';
                    return `防御下降${zone}${((Number(effect.value) || 0) * 100).toFixed(0)}%`;
                }
                if (effect.effect_type === 'turn_hp_loss') return `每回合损失${((Number(effect.percent_max_hp) || 0) * 100).toFixed(0)}%HP`;
                return effect.effect_type || '';
            })
            .filter(Boolean);
        return {
            icon: status.icon || '',
            title: name,
            abbrev: name.slice(0, 2) || '?',
            tooltip: `${name}${stacks}${duration}${subs.length ? '\n' + subs.join('；') : ''}`
        };
    }

    const api = {
        getSkillActions,
        getStatusesFromSkillActions,
        collectZoneEntriesFromStatuses,
        getEffectiveStatusEffects,
        isStatusDisplayActive,
        statusToPartyBuffDisplay,
        normalizeStepToAction,
        registerStepHandler,
        hasStepHandler
    };
    global.StatusResolver = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);
