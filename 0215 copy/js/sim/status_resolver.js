// ==========================================
//  GBF 模拟器 - Status / skill actions 解析工具
// ==========================================
(function () {
    'use strict';

    function cloneJson(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function normalizeStepTarget(target) {
        const t = target == null ? '' : String(target).trim();
        if (t === 'enemy') return 'enemy_single';
        if (t === 'party') return 'ally_party';
        return t || 'self';
    }

    function normalizeSimpleEffect(effect) {
        if (!effect || typeof effect !== 'object') return null;

        if (effect.prop && effect.zone) {
            const value = Number(effect.value);
            if (!Number.isFinite(value) || value === 0) return null;
            return {
                effect_type: effect.effect_type || effect.effect || 'stat_mod',
                value,
                formula: {
                    prop: String(effect.prop),
                    zone: String(effect.zone),
                    value,
                    format: effect.format
                }
            };
        }

        if (effect.effect === 'double_strike') {
            const value = Number(effect.value) || 1;
            return {
                effect_type: 'extra_attack',
                mode: 'double_strike',
                count: value,
                formula: {
                    prop: 'double_strike',
                    zone: effect.zone || 'chara_skill',
                    value
                }
            };
        }

        if (effect.event === 'turn_hp_loss') {
            return {
                effect_type: 'turn_hp_loss',
                timing: effect.timing || 'turn_start',
                percent_max_hp: Number(effect.value) || 0,
                can_reduce_to_zero: effect.can_reduce_to_zero === true
            };
        }

        return cloneJson(effect);
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
            return {
                type: 'apply_status',
                target: normalizeStepTarget(step.target),
                status: {
                    status_id: statusId,
                    kind: 'generic',
                    name: step.name || (displayMeta && displayMeta.title) || statusId,
                    icon: step.icon || (displayMeta && displayMeta.icon) || '',
                    source_display: step.source_display || (context && context.skillName) || '',
                    duration: step.turns != null ? {
                        type: 'turns',
                        value: Number(step.turns) || 0,
                        tick: 'turn_end'
                    } : null,
                    effects: [
                        {
                            effect_type: step.effect_type || 'stat_mod',
                            value,
                            formula: {
                                prop: String(step.prop),
                                zone: String(step.zone),
                                value,
                                format: step.format
                            }
                        }
                    ]
                }
            };
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
            duration: step.turns != null ? {
                type: 'turns',
                value: Number(step.turns) || 0,
                tick: 'turn_end'
            } : null,
            flags: step.dispel_immune != null ? { dispel_immune: step.dispel_immune === true } : {},
            effects: (Array.isArray(step.effects) ? step.effects : [])
                .map((effect) => normalizeSimpleEffect(effect))
                .filter(Boolean)
        };
        if (Array.isArray(step.omitted)) {
            status.omitted_effects = step.omitted.map((description) => ({
                description: String(description)
            }));
        }
        return {
            type: 'apply_status',
            target: normalizeStepTarget(step.target),
            status
        };
    }

    const STEP_HANDLERS = {
        damage: normalizeDamageStep,
        buff: normalizeBuffStep,
        ca: normalizeCaStep,
        na: normalizeNaStep
    };

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
        status.source_skill_id = context && context.skillId ? context.skillId : status.source_skill_id;
        return status;
    }

    function getStatusesFromSkillActions(skill, context) {
        const actions = getSkillActions(skill, context || {});
        return actions
            .map((action) => getStatusFromAction(action, context || {}))
            .filter(Boolean);
    }

    function statusEffectToZoneEntry(status, effect, idx) {
        if (!status || !effect) return null;
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

    function collectZoneEntriesFromStatuses(statuses) {
        const entries = [];
        (Array.isArray(statuses) ? statuses : []).forEach((status) => {
            const effects = Array.isArray(status.effects) ? status.effects : [];
            effects.forEach((effect, idx) => {
                const entry = statusEffectToZoneEntry(status, effect, idx);
                if (entry) entries.push(entry);
            });
        });
        return entries;
    }

    function statusToPartyBuffDisplay(status) {
        if (!status) return null;
        const name = status.name || status.status_id || '';
        const duration = status.duration && status.duration.value ? `，持续${status.duration.value}回合` : '';
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
                if (effect.effect_type === 'turn_hp_loss') return `每回合损失${((Number(effect.percent_max_hp) || 0) * 100).toFixed(0)}%HP`;
                return effect.effect_type || '';
            })
            .filter(Boolean);
        return {
            icon: status.icon || '',
            title: name,
            abbrev: name.slice(0, 2) || '?',
            tooltip: `${name}${duration}${subs.length ? '\n' + subs.join('；') : ''}`
        };
    }

    window.StatusResolver = {
        getSkillActions,
        getStatusesFromSkillActions,
        collectZoneEntriesFromStatuses,
        statusToPartyBuffDisplay
    };
})();
