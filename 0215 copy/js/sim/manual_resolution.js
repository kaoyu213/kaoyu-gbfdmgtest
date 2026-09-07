// ==========================================
//  GBF 模拟器 - 手动回合模拟专用结算底层
//  不参与自动模拟；所有伤害以单个 hit 为最小结算单位。
// ==========================================
(function (global) {
    'use strict';

    const nodeBonusApi = typeof module !== 'undefined' && module.exports ? require('../bonus_dmg.js') : null;
    const nodeStatusApi = typeof module !== 'undefined' && module.exports ? require('./status_resolver.js') : null;

    const FRONTLINE_SLOTS = Object.freeze([0, 1, 2, 3]);
    const DURATION_TYPE_ALIASES = Object.freeze({
        turn: 'turns',
        turns: 'turns',
        action: 'action',
        actions: 'action',
        hit: 'hit',
        hits: 'hit',
        count: 'hit',
        counts: 'hit',
        permanent: 'permanent'
    });
    const REMAINING_FIELDS = Object.freeze({
        turns: 'remaining_turns',
        action: 'remaining_actions',
        hit: 'remaining_hits'
    });

    function cloneJson(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function toPositiveInteger(value, fallback) {
        const number = Math.floor(Number(value));
        if (Number.isFinite(number) && number >= 0) return number;
        return fallback == null ? 0 : fallback;
    }

    function canonicalDurationType(type) {
        const key = String(type == null ? '' : type).trim().toLowerCase();
        return DURATION_TYPE_ALIASES[key] || '';
    }

    /**
     * 手动模拟持续时间：
     * - turns：规则与旧 turns 字段完全一致，在回合结束时扣除。
     * - action：一次完整的 SA/DA/TA/奥义行动结束后扣除一次。
     * - hit：每一个实际伤害 hit 结算完成后扣除一次。
     */
    function normalizeDuration(definition) {
        if (!definition || typeof definition !== 'object') return null;
        let source = null;
        if (definition.duration && typeof definition.duration === 'object') {
            source = definition.duration;
        } else if (definition.turns != null) {
            source = { type: 'turns', value: definition.turns };
        } else if (definition.duration_type) {
            const requestedType = canonicalDurationType(definition.duration_type);
            const value = requestedType === 'action'
                ? definition.actions
                : requestedType === 'hit'
                    ? (definition.duration_hits != null ? definition.duration_hits : definition.counts)
                    : definition.turns;
            source = { type: requestedType, value };
        } else if (definition.type) {
            source = definition;
        }
        if (!source) return null;

        const type = canonicalDurationType(source.type || 'turns') || 'turns';
        if (type === 'permanent') return { type: 'permanent' };
        return {
            type,
            value: toPositiveInteger(source.value, 0),
            tick: source.tick || (type === 'turns'
                ? 'turn_end'
                : type === 'action'
                    ? 'attack_action_end'
                    : 'damage_hit_end')
        };
    }

    function getRemainingField(type) {
        return REMAINING_FIELDS[canonicalDurationType(type)] || '';
    }

    function getStatusRemaining(status) {
        if (!status || !status.duration) return null;
        const type = canonicalDurationType(status.duration.type);
        if (!type || type === 'permanent') return null;
        const field = getRemainingField(type);
        if (field && status[field] != null) return Math.max(0, Number(status[field]) || 0);
        if (status.remaining != null) return Math.max(0, Number(status.remaining) || 0);
        return Math.max(0, Number(status.duration.value) || 0);
    }

    function setStatusRemaining(status, value) {
        if (!status || !status.duration) return status;
        const type = canonicalDurationType(status.duration.type);
        const field = getRemainingField(type);
        if (!field) return status;
        const remaining = Math.max(0, toPositiveInteger(value, 0));
        status.remaining = remaining;
        status[field] = remaining;
        return status;
    }

    function createRuntimeStatus(definition, metadata) {
        const status = Object.assign({}, cloneJson(definition || {}), cloneJson(metadata || {}));
        status.status_id = String(status.status_id || status.id || `manual_status_${Date.now()}`);
        if (status.stacking) {
            status.stacks = Math.min(Math.max(1, Number(status.stacking.max) || Number.MAX_SAFE_INTEGER),
                Math.max(1, Number(status.stacks) || Number(status.stacking.add) || 1));
        }
        status.duration = normalizeDuration(status);
        if (status.duration && status.duration.type !== 'permanent') {
            const field = getRemainingField(status.duration.type);
            const initial = field && status[field] != null
                ? status[field]
                : status.remaining != null
                    ? status.remaining
                    : status.duration.value;
            setStatusRemaining(status, initial);
        }
        return status;
    }

    function normalizeActor(slot, actor) {
        const normalized = Object.assign({ slot, statuses: [] }, cloneJson(actor || {}));
        normalized.slot = Number(slot);
        normalized.statuses = (Array.isArray(normalized.statuses) ? normalized.statuses : [])
            .map((status) => createRuntimeStatus(status));
        return normalized;
    }

    function createState(options) {
        const source = options || {};
        const actorCount = Math.max(1, toPositiveInteger(source.actorCount, 6));
        const actors = {};
        for (let slot = 0; slot < actorCount; slot++) {
            const actor = Array.isArray(source.actors)
                ? source.actors[slot]
                : source.actors && source.actors[slot];
            actors[slot] = normalizeActor(slot, actor);
        }
        const enemy = Object.assign({ statuses: [] }, cloneJson(source.enemy || {}));
        enemy.statuses = (Array.isArray(enemy.statuses) ? enemy.statuses : [])
            .map((status) => createRuntimeStatus(status));
        return {
            turn: Math.max(1, toPositiveInteger(source.turn, 1)),
            actorCount,
            actors,
            enemy,
            hitSequence: Math.max(0, toPositiveInteger(source.hitSequence, 0)),
            actionSequence: Math.max(0, toPositiveInteger(source.actionSequence, 0))
        };
    }

    function getActor(state, slot) {
        if (!state || !state.actors) return null;
        const key = Number(slot);
        return state.actors[key] || null;
    }

    function resolveTargetSlots(state, target, ownerSlot, targetSlots) {
        const normalizedTarget = String(target || 'self');
        if (normalizedTarget === 'self') return ownerSlot == null ? [] : [Number(ownerSlot)];
        if (normalizedTarget === 'ally_party' || normalizedTarget === 'party') return FRONTLINE_SLOTS.slice();
        if (normalizedTarget === 'ally_all') {
            return Array.from({ length: state.actorCount }, (_, index) => index);
        }
        if (normalizedTarget === 'ally_slots' && Array.isArray(targetSlots)) {
            return Array.from(new Set(targetSlots.map(Number).filter((slot) => (
                Number.isInteger(slot) && slot >= 0 && slot < state.actorCount
            ))));
        }
        return [];
    }

    function mergeStatusIntoList(statuses, incoming) {
        const list = Array.isArray(statuses) ? statuses : [];
        const index = list.findIndex((status) => status && status.status_id === incoming.status_id);
        if (index < 0) {
            list.push(incoming);
            return incoming;
        }

        const existing = list[index];
        if (incoming.stacking && incoming.stacking.mode === 'add') {
            const add = Math.max(1, Number(incoming.stacking.add) || Number(incoming.stacks) || 1);
            const max = Math.max(1, Number(incoming.stacking.max) || Number.MAX_SAFE_INTEGER);
            incoming.stacks = Math.min(max, Math.max(1, Number(existing.stacks) || 1) + add);
            if (incoming.stacking.refresh_duration === false) {
                incoming.remaining = existing.remaining;
                Object.values(REMAINING_FIELDS).forEach((field) => {
                    if (existing[field] != null) incoming[field] = existing[field];
                });
            }
        }
        list[index] = incoming;
        return incoming;
    }

    function applyStatus(state, spec) {
        const definition = spec && (spec.status || spec.definition) ? spec.status || spec.definition : spec;
        if (!state || !definition) return [];
        const ownerSlot = spec && spec.ownerSlot != null ? Number(spec.ownerSlot) : null;
        const target = spec && spec.target ? spec.target : definition.target;
        const targetSlots = spec && spec.target_slots ? spec.target_slots : definition.target_slots;
        const normalizedTarget = String(target || 'self');
        const applied = [];

        if (normalizedTarget === 'enemy' || normalizedTarget === 'enemy_single' || normalizedTarget === 'enemy_all') {
            const status = createRuntimeStatus(definition, { target: 'enemy', owner_slot: ownerSlot });
            mergeStatusIntoList(state.enemy.statuses, status);
            applied.push(status);
            return applied;
        }

        resolveTargetSlots(state, normalizedTarget, ownerSlot, targetSlots).forEach((slot) => {
            const actor = getActor(state, slot);
            if (!actor) return;
            const status = createRuntimeStatus(definition, { target: normalizedTarget, target_slot: slot, owner_slot: ownerSlot });
            mergeStatusIntoList(actor.statuses, status);
            applied.push(status);
        });
        return applied;
    }

    function consumeDuration(statuses, durationType, amount, eligibleStatusIds) {
        const type = canonicalDurationType(durationType);
        const eligible = eligibleStatusIds == null
            ? null
            : eligibleStatusIds instanceof Set
                ? eligibleStatusIds
                : new Set(Array.isArray(eligibleStatusIds) ? eligibleStatusIds : []);
        const consumed = [];
        const expired = [];
        const next = (Array.isArray(statuses) ? statuses : []).filter((status) => {
            if (!status || !status.duration || canonicalDurationType(status.duration.type) !== type) return true;
            if (eligible && !eligible.has(status.status_id)) return true;
            const before = getStatusRemaining(status);
            if (before == null) return true;
            const after = Math.max(0, before - Math.max(1, Number(amount) || 1));
            setStatusRemaining(status, after);
            consumed.push({ statusId: status.status_id, before, after });
            if (after > 0) return true;
            expired.push(status.status_id);
            return false;
        });
        return { statuses: next, consumed, expired };
    }

    function consumeHitDurations(state, actorSlot) {
        const actor = getActor(state, actorSlot);
        const actorResult = consumeDuration(actor && actor.statuses, 'hit', 1);
        if (actor) actor.statuses = actorResult.statuses;
        const enemyResult = consumeDuration(state.enemy.statuses, 'hit', 1);
        state.enemy.statuses = enemyResult.statuses;
        return { actor: actorResult, enemy: enemyResult };
    }

    function finishAction(state, actorSlot, eligibility) {
        const limits = eligibility || {};
        const actor = getActor(state, actorSlot);
        const actorResult = consumeDuration(actor && actor.statuses, 'action', 1, limits.actorStatusIds);
        if (actor) actor.statuses = actorResult.statuses;
        const enemyResult = consumeDuration(state.enemy.statuses, 'action', 1, limits.enemyStatusIds);
        state.enemy.statuses = enemyResult.statuses;
        state.actionSequence += 1;
        return { actor: actorResult, enemy: enemyResult };
    }

    function finishTurn(state) {
        const actors = {};
        Object.keys(state.actors).forEach((slot) => {
            const actor = state.actors[slot];
            const result = consumeDuration(actor.statuses, 'turns', 1);
            actor.statuses = result.statuses;
            actors[slot] = result;
        });
        const enemy = consumeDuration(state.enemy.statuses, 'turns', 1);
        state.enemy.statuses = enemy.statuses;
        state.turn += 1;
        return { actors, enemy };
    }

    function getStatusSnapshot(state, actorSlot) {
        const actor = getActor(state, actorSlot);
        return {
            actorStatuses: cloneJson(actor && actor.statuses ? actor.statuses : []),
            enemyStatuses: cloneJson(state && state.enemy && state.enemy.statuses ? state.enemy.statuses : [])
        };
    }

    function normalizeDamageValue(calculated) {
        if (calculated && typeof calculated === 'object') {
            const value = calculated.damage != null ? calculated.damage : calculated.value;
            return Math.max(0, Number(value) || 0);
        }
        return Math.max(0, Number(calculated) || 0);
    }

    function normalizeResolvedHitCount(calculated) {
        if (!calculated || typeof calculated !== 'object') return 1;
        const value = calculated.hitCount != null ? calculated.hitCount : calculated.hits;
        return Math.max(1, toPositiveInteger(value, 1));
    }

    function resolveDamageHits(state, hits, options) {
        const opts = options || {};
        const calculator = typeof opts.calculateHit === 'function'
            ? opts.calculateHit
            : (hit) => Number(hit.damage) || 0;
        const resolved = [];
        let hitCount = 0;
        let totalDamage = 0;

        (Array.isArray(hits) ? hits : []).forEach((definition, index) => {
            const hit = Object.assign({}, cloneJson(definition || {}));
            hit.actorSlot = Number(hit.actorSlot == null ? opts.actorSlot : hit.actorSlot);
            hit.sequence = ++state.hitSequence;
            hit.hitIndex = hit.hitIndex == null ? index + 1 : hit.hitIndex;
            let snapshot = getStatusSnapshot(state, hit.actorSlot);
            const context = {
                state,
                hit,
                actor: getActor(state, hit.actorSlot),
                enemy: state.enemy,
                actorStatuses: snapshot.actorStatuses,
                enemyStatuses: snapshot.enemyStatuses
            };
            if (typeof opts.beforeHit === 'function') opts.beforeHit(hit, context);
            snapshot = getStatusSnapshot(state, hit.actorSlot);
            context.actor = getActor(state, hit.actorSlot);
            context.enemy = state.enemy;
            context.actorStatuses = snapshot.actorStatuses;
            context.enemyStatuses = snapshot.enemyStatuses;
            const calculated = calculator(hit, context);
            const damage = normalizeDamageValue(calculated);
            const resolvedHitCount = normalizeResolvedHitCount(calculated);
            if (typeof opts.afterHit === 'function') opts.afterHit(hit, damage, context);
            const durationChanges = consumeHitDurations(state, hit.actorSlot);
            resolved.push({
                hit,
                damage,
                hitCount: resolvedHitCount,
                actorStatusIds: snapshot.actorStatuses.map((status) => status.status_id),
                enemyStatusIds: snapshot.enemyStatuses.map((status) => status.status_id),
                durationChanges
            });
            hitCount += resolvedHitCount;
            totalDamage += damage;
        });

        return { hits: resolved, hitCount, totalDamage };
    }

    function isBonusNormalEffect(effect) {
        if (!effect || typeof effect !== 'object') return false;
        if (effect.effect_type === 'bonus_damage' || effect.effect === 'bonus_damage') return true;
        const prop = effect.formula && effect.formula.prop ? effect.formula.prop : effect.prop;
        return String(prop || '').indexOf('bonus_na_') === 0;
    }

    function collectBonusHitSources(state, actorSlot) {
        const actor = getActor(state, actorSlot);
        const result = [];
        (actor && Array.isArray(actor.statuses) ? actor.statuses : []).forEach((status) => {
            getEffectiveStatusEffects(status).forEach((effect, index) => {
                if (!isBonusNormalEffect(effect)) return;
                const formula = effect.formula && typeof effect.formula === 'object' ? effect.formula : effect;
                result.push({
                    id: `${status.status_id}:${index}`,
                    sourceStatusId: status.status_id,
                    value: Number(formula.value != null ? formula.value : effect.value) || 0,
                    zone: formula.zone || effect.zone || '',
                    element: effect.element || null
                });
            });
        });
        return result;
    }

    function appendResolution(target, partial) {
        partial.hits.forEach((hit) => target.hits.push(hit));
        target.hitCount += partial.hitCount;
        target.totalDamage += partial.totalDamage;
    }

    function resolveNormalAttack(state, action, options) {
        const spec = action || {};
        const opts = options || {};
        const mode = String(spec.mode || spec.actionMode || 'sa').toLowerCase();
        const baseHitCount = mode === 'ta' ? 3 : mode === 'da' ? 2 : 1;
        const actorSlot = Number(spec.actorSlot == null ? 0 : spec.actorSlot);
        const result = { type: 'normal_attack', mode, actorSlot, hits: [], hitCount: 0, totalDamage: 0 };

        for (let baseIndex = 1; baseIndex <= baseHitCount; baseIndex++) {
            appendResolution(result, resolveDamageHits(state, [{
                actorSlot,
                actionId: spec.id || null,
                damageType: 'normal_attack',
                kind: 'base',
                baseHitIndex: baseIndex,
                multiplier: 1
            }], Object.assign({}, opts, { actorSlot })));

            const bonusSources = Array.isArray(spec.bonusHits)
                ? cloneJson(spec.bonusHits)
                : typeof opts.getBonusHits === 'function'
                    ? cloneJson(opts.getBonusHits(state, actorSlot, {
                        action: spec,
                        baseHitIndex: baseIndex
                    }) || [])
                    : collectBonusHitSources(state, actorSlot);
            bonusSources.forEach((source, bonusIndex) => {
                if (source.sourceStatusId) {
                    const actor = getActor(state, actorSlot);
                    const sourceStillActive = actor && actor.statuses.some((status) => (
                        status && status.status_id === source.sourceStatusId
                    ));
                    if (!sourceStillActive) return;
                }
                appendResolution(result, resolveDamageHits(state, [{
                    actorSlot,
                    actionId: spec.id || null,
                    damageType: 'normal_attack',
                    kind: 'bonus',
                    baseHitIndex: baseIndex,
                    bonusIndex: bonusIndex + 1,
                    multiplier: Number(source.value != null ? source.value : source.multiplier) || 0,
                    bonusSource: cloneJson(source)
                }], Object.assign({}, opts, { actorSlot })));
            });
        }

        if (spec.consumeActionDuration !== false) result.actionDurationChanges = finishAction(state, actorSlot);
        return result;
    }

    function createStatusFromBuffStep(step, context, index) {
        const source = step || {};
        const skillId = context && context.skillId ? context.skillId : 'manual_skill';
        const conditions = cloneJson(source.conditions != null ? source.conditions : source.condition);
        const effects = source.prop && source.zone
            ? [{
                effect_type: source.effect_type || 'stat_mod',
                conditions,
                formula: {
                    prop: String(source.prop),
                    zone: String(source.zone),
                    value: Number(source.value) || 0,
                    format: source.format
                }
            }]
            : cloneJson(Array.isArray(source.effects) ? source.effects : []);
        const iconMeta = source.prop && source.zone && typeof getBuffIconMeta === 'function'
            ? getBuffIconMeta(source.prop, source.zone)
            : null;
        return {
            status_id: source.id || `${skillId}_status_${index}`,
            kind: source.unique ? 'unique' : 'generic',
            name: source.name || source.id || `${skillId}效果`,
            icon: source.icon || iconMeta && iconMeta.icon || '',
            source_display: source.source_display || (context && context.skillName) || '',
            status_display: cloneJson(source.status_display || null),
            display_detail: source.display_detail ? String(source.display_detail) : '',
            duration: normalizeDuration(source),
            effects,
            stacking: cloneJson(source.stacking || null),
            stacks: source.stacks == null ? null : Math.max(1, Number(source.stacks) || 1),
            conditions,
            flags: source.dispel_immune == null ? {} : { dispel_immune: source.dispel_immune === true }
        };
    }

    function trimDisplayNumber(value) {
        const number = Number(value) || 0;
        return String(Number(number.toFixed(2)));
    }

    function formatFormulaValue(value, format) {
        const number = Number(value) || 0;
        const prefix = number >= 0 ? '+' : '';
        if (format === 'fixed') return `${prefix}${Math.round(number).toLocaleString('zh-CN')}点`;
        return `${prefix}${trimDisplayNumber(number * 100)}%`;
    }

    function getStatusDurationText(status) {
        if (!status || !status.duration) return '';
        const type = canonicalDurationType(status.duration.type);
        if (type === 'permanent') return '永久';
        const remaining = getStatusRemaining(status);
        if (remaining == null) return '';
        const unit = type === 'action' ? '次行动' : type === 'hit' ? '次命中' : '回合';
        return `剩余${remaining}${unit}`;
    }

    function getEffectiveStatusEffects(status) {
        const resolver = global.StatusResolver || nodeStatusApi;
        return resolver && typeof resolver.getEffectiveStatusEffects === 'function'
            ? resolver.getEffectiveStatusEffects(status)
            : (Array.isArray(status && status.effects) ? status.effects : []);
    }

    function getStatusEffectDetails(status) {
        if (!status) return [];
        if (status.display_detail && !status.stacking) return [String(status.display_detail)];
        return getEffectiveStatusEffects(status).map((effect) => {
            if (!effect) return '';
            const formula = effect.formula && typeof effect.formula === 'object'
                ? effect.formula
                : effect.prop && effect.zone ? effect : null;
            if (formula && formula.prop) {
                const meta = typeof getBuffDisplayMeta === 'function'
                    ? getBuffDisplayMeta(formula.prop, formula.zone, {
                        label: effect.label || formula.label,
                        format: formula.format || effect.format
                    })
                    : null;
                const label = meta && meta.label || effect.label || formula.label || formula.prop;
                const format = meta && meta.format || formula.format || effect.format || 'percent';
                return `${label} ${formatFormulaValue(Number(formula.value), format)}`;
            }
            if (effect.effect_type === 'bonus_damage') {
                return `追击 ${formatFormulaValue(Number(effect.value), 'percent')}`;
            }
            if (effect.effect_type === 'extra_attack') return '再攻击';
            if (effect.effect_type === 'multiattack') return String(effect.mode || '连击率提升');
            return effect.label || effect.effect_type || '';
        }).filter(Boolean);
    }

    function normalizeTooltipLine(value) {
        const text = String(value || '');
        const normalized = typeof text.normalize === 'function' ? text.normalize('NFKC') : text;
        return normalized.replace(/\s+/g, '');
    }

    function appendUniqueTooltipLine(lines, value) {
        const line = String(value || '').trim();
        if (!line) return;
        const key = normalizeTooltipLine(line);
        if (lines.some((existing) => normalizeTooltipLine(existing) === key)) return;
        lines.push(line);
    }

    function projectStatusBuffs(statuses) {
        const result = [];
        const largeGroups = new Map();
        (Array.isArray(statuses) ? statuses : []).forEach((status) => {
            if (!status) return;
            const display = status.status_display && typeof status.status_display === 'object'
                ? status.status_display
                : null;
            const duration = getStatusDurationText(status);
            const details = getStatusEffectDetails(status);
            if (display && display.mode === 'large') {
                const groupId = String(display.group_id || status.status_id || 'large_buff');
                let entry = largeGroups.get(groupId);
                if (!entry) {
                    const label = String(display.label || status.source_display || status.name || '专属Buff');
                    entry = {
                        statusId: groupId,
                        name: label,
                        icon: '',
                        initial: String(display.initial || Array.from(label)[0] || '强'),
                        displayMode: 'large',
                        stacks: status.stacking ? status.stacks : null,
                        detailLines: []
                    };
                    largeGroups.set(groupId, entry);
                    result.push(entry);
                }
                if (status.stacking) {
                    appendUniqueTooltipLine(entry.detailLines, `当前${status.stacks}层 / 上限${status.stacking.max}层`);
                }
                (details.length ? details : [status.stacking ? '尚未解锁加成' : status.name || '效果']).forEach((detail) => {
                    const line = duration ? `${detail}（${duration}）` : detail;
                    appendUniqueTooltipLine(entry.detailLines, line);
                });
                return;
            }

            const name = status.name || status.status_id || 'Buff';
            const tooltipLines = [name];
            details.forEach((detail) => appendUniqueTooltipLine(tooltipLines, detail));
            appendUniqueTooltipLine(tooltipLines, duration);
            result.push({
                statusId: status.status_id,
                name,
                icon: status.icon || '',
                displayMode: 'small',
                tooltip: tooltipLines.join('\n')
            });
        });
        result.forEach((entry) => {
            if (entry.displayMode === 'large') {
                entry.tooltip = [entry.name].concat(entry.detailLines || []).join('\n');
                delete entry.detailLines;
            }
        });
        return result;
    }

    function getSkillChaseEffects(state, actorSlot, options) {
        const opts = options || {};
        if (typeof opts.getSkillChaseEffects === 'function') return opts.getSkillChaseEffects(state, actorSlot) || [];
        const bonus = global.BonusDmgCalc || nodeBonusApi;
        const statuses = global.StatusResolver || nodeStatusApi;
        const actor = getActor(state, actorSlot);
        if (!bonus || !statuses || !actor) return [];
        return bonus.resolveSkillChaseEffects({
            stats: actor.stats || {},
            actorElement: actor.element,
            dynamicBuffEntries: statuses.collectZoneEntriesFromStatuses(actor.statuses, {
                actor, owner: actor, state, hpPercent: actor.hpPercent
            })
        });
    }

    function appendSkillChase(state, result, effects) {
        const bonus = global.BonusDmgCalc || nodeBonusApi;
        const chaseHits = bonus ? bonus.calcSkillChaseDamage(result.baseSkillDamage, effects) : [];
        result.skillChaseHits = chaseHits;
        result.skillChaseDamage = 0;
        chaseHits.forEach((chase) => {
            const snapshot = getStatusSnapshot(state, result.actorSlot);
            // 冴手只追加结算记录，不经过 calculateHit / afterHit / consumeHitDurations。
            state.hitSequence = (Number(state.hitSequence) || 0) + 1;
            result.hits.push({
                hit: Object.assign({}, chase, { actorSlot: result.actorSlot, sequence: state.hitSequence }),
                damage: chase.damage, hitCount: 1,
                actorStatusIds: snapshot.actorStatuses.map((status) => status.status_id),
                enemyStatusIds: snapshot.enemyStatuses.map((status) => status.status_id),
                durationChanges: null
            });
            result.hitCount += 1;
            result.totalDamage += chase.damage;
            result.skillChaseDamage += chase.damage;
        });
        return result;
    }

    function resolveSkillDamage(state, action, options) {
        const spec = action || {};
        const damage = spec.damage && typeof spec.damage === 'object' ? spec.damage : spec;
        const actorSlot = Number(spec.actorSlot == null ? 0 : spec.actorSlot);
        const opts = options || {};
        const bonus = global.BonusDmgCalc || nodeBonusApi;
        const eligible = bonus && bonus.isElementalSkillDamage(damage);
        const chaseEffects = eligible ? getSkillChaseEffects(state, actorSlot, opts) : [];
        const count = Math.max(1, toPositiveInteger(damage.hits, 1));
        const hits = Array.from({ length: count }, (_, index) => ({
            actorSlot,
            actionId: spec.id || null,
            damageType: damage.damage_type || damage.damageType || 'skill',
            kind: 'skill',
            skillHitIndex: index + 1,
            multiplier: Number(damage.mult != null ? damage.mult : damage.multiplier) || 0,
            capPerHit: Number(damage.cap != null ? damage.cap : damage.cap_per_hit) || 0,
            thresholdTableId: damage.threshold_table || damage.thresholdTableId || null,
            element: damage.element || null
        }));
        const result = resolveDamageHits(state, hits, Object.assign({}, options, { actorSlot }));
        result.type = 'skill_damage';
        result.actorSlot = actorSlot;
        result.baseSkillDamage = eligible ? result.totalDamage : 0;
        result.skillChaseEligible = !!eligible;
        result.skillChaseEffects = chaseEffects;
        return opts.deferSkillChase ? result : appendSkillChase(state, result, chaseEffects);
    }

    function resolveChargeAttack(state, action, options) {
        const spec = action || {};
        const actorSlot = Number(spec.actorSlot == null ? 0 : spec.actorSlot);
        const count = Math.max(1, toPositiveInteger(spec.hits, 1));
        const hits = Array.from({ length: count }, (_, index) => ({
            actorSlot,
            actionId: spec.id || null,
            damageType: 'ca',
            kind: 'ca',
            caHitIndex: index + 1,
            multiplier: spec.mult == null ? null : Number(spec.mult),
            fixed: spec.fixed == null ? null : Number(spec.fixed)
        }));
        const result = resolveDamageHits(state, hits, Object.assign({}, options, { actorSlot }));
        result.type = 'charge_attack';
        result.actorSlot = actorSlot;
        if (spec.consumeActionDuration !== false) result.actionDurationChanges = finishAction(state, actorSlot);
        return result;
    }

    function resolveAction(state, action, options) {
        const spec = action || {};
        const mode = String(spec.mode || spec.actionMode || '').toLowerCase();
        const type = String(spec.type || spec.damageType || spec.damage_type || '').toLowerCase();
        if (mode === 'none') {
            return {
                type: 'no_action',
                mode,
                actorSlot: Number(spec.actorSlot == null ? 0 : spec.actorSlot),
                hits: [],
                hitCount: 0,
                totalDamage: 0
            };
        }
        if (mode === 'ca' || type === 'ca' || type === 'charge_attack') {
            return resolveChargeAttack(state, spec, options);
        }
        if (['sa', 'da', 'ta'].includes(mode) || type === 'normal_attack' || type === 'actor_action' || type === 'extra_action') {
            return resolveNormalAttack(state, spec, options);
        }
        return resolveSkillDamage(state, spec, options);
    }

    /** 按 charaskills.json 的 steps 顺序执行，仅供手动模拟使用。 */
    function resolveSkill(state, skill, context, options) {
        const source = skill || {};
        const runtime = context || {};
        const actorSlot = Number(runtime.ownerSlot == null ? runtime.actorSlot || 0 : runtime.ownerSlot);
        const result = {
            type: 'skill',
            skillId: source.id || runtime.skillId || '',
            actorSlot,
            steps: [],
            hits: [],
            hitCount: 0,
            totalDamage: 0,
            appliedStatuses: []
        };
        let chaseEffects = null;
        result.baseSkillDamage = 0;

        (Array.isArray(source.steps) ? source.steps : []).forEach((step, index) => {
            if (!step || !step.do) return;
            if (step.do === 'buff') {
                const applied = applyStatus(state, {
                    ownerSlot: actorSlot,
                    target: step.target || 'self',
                    target_slots: step.target_slots,
                    status: createStatusFromBuffStep(step, {
                        skillId: source.id || runtime.skillId || 'manual_skill',
                        skillName: source.name || runtime.skillName || ''
                    }, index)
                });
                result.appliedStatuses.push(...applied);
                result.steps.push({ do: 'buff', applied });
                return;
            }

            let partial = null;
            if (step.do === 'damage') {
                partial = resolveSkillDamage(state, Object.assign({
                    id: `${source.id || 'manual_skill'}_${index}`,
                    actorSlot
                }, step), Object.assign({}, options, { deferSkillChase: true }));
                result.baseSkillDamage += partial.baseSkillDamage;
                if (chaseEffects === null && partial.skillChaseEligible) chaseEffects = partial.skillChaseEffects;
            } else if (step.do === 'na') {
                partial = resolveNormalAttack(state, {
                    id: `${source.id || 'manual_skill'}_${index}`,
                    actorSlot,
                    mode: step.mode || runtime.actionMode || 'sa',
                    bonusHits: step.bonusHits
                }, options);
            } else if (step.do === 'ca') {
                partial = resolveChargeAttack(state, Object.assign({
                    id: `${source.id || 'manual_skill'}_${index}`,
                    actorSlot
                }, step), options);
            }
            if (!partial) return;
            result.steps.push({ do: step.do, result: partial });
            appendResolution(result, partial);
        });
        return appendSkillChase(state, result, chaseEffects || []);
    }

    /**
     * 依据手动时间轴顺序生成每个角色行动开始时的 Buff 图标快照。
     * 这是 UI 投影：状态仍由标准 skill.steps 创建，持续回合/行动/hit 由本模块推进，
     * 不把任何特定技能或图标硬编码进行动块。
     */
    function resolveTimeline(turns, options) {
        const opts = options || {};
        const getSkillById = typeof opts.getSkillById === 'function' ? opts.getSkillById : null;
        const runtimeState = createState({ actorCount: Math.max(4, Number(opts.actorCount) || 4) });
        const buffsByBlockId = {};
        const damageByBlockId = {};
        const hitCountByBlockId = {};
        const byCharacter = {};
        let enemyBuffs = [];
        let totalDamage = 0;
        const calculateHit = typeof opts.calculateHit === 'function' ? opts.calculateHit : () => 0;
        const resolutionOptions = {
            calculateHit,
            getBonusHits: typeof opts.getBonusHits === 'function' ? opts.getBonusHits : null,
            getSkillChaseEffects: typeof opts.getSkillChaseEffects === 'function' ? opts.getSkillChaseEffects : null
        };

        function recordDamage(blockId, actorSlot, value, hitCount) {
            const damage = Math.max(0, Number(value) || 0);
            damageByBlockId[blockId] = damage;
            hitCountByBlockId[blockId] = Math.max(0, Math.floor(Number(hitCount) || 0));
            if (!byCharacter[actorSlot]) byCharacter[actorSlot] = 0;
            byCharacter[actorSlot] += damage;
            totalDamage += damage;
        }

        (Array.isArray(turns) ? turns : []).forEach((turn) => {
            if (typeof opts.getActorHpPercent === 'function') {
                Object.keys(runtimeState.actors).forEach((slot) => {
                    const hp = Number(opts.getActorHpPercent(turn, Number(slot)));
                    runtimeState.actors[slot].hpPercent = Number.isFinite(hp)
                        ? Math.max(0, Math.min(100, hp)) : 100;
                });
            }
            (turn && Array.isArray(turn.blocks) ? turn.blocks : []).forEach((block) => {
                if (!block || !block.id) return;
                const actorSlot = Number(block.actorSlot == null ? 0 : block.actorSlot);
                const isActorAction = block.type === 'actor_action' || block.type === 'extra_action';

                if (isActorAction) {
                    const actor = getActor(runtimeState, actorSlot);
                    buffsByBlockId[block.id] = projectStatusBuffs(cloneJson((actor && actor.statuses) || []));
                    const actionResult = resolveAction(runtimeState, {
                        id: block.id,
                        actorSlot,
                        mode: block.actionMode || block.mode || 'ta',
                        type: block.type
                    }, resolutionOptions);
                    recordDamage(block.id, actorSlot, actionResult.totalDamage, actionResult.hitCount);
                    enemyBuffs = projectStatusBuffs(cloneJson(runtimeState.enemy.statuses || []));
                    return;
                }

                // 技能方块以 skillId 为权威引用。旧存档中的 steps 只作为技能已不存在时的兜底，
                // 避免用户编辑本地技能后仍按放置时的旧快照结算。
                const currentSkill = getSkillById && block.skillId
                    ? getSkillById(block.skillId)
                    : null;
                const currentSteps = currentSkill && Array.isArray(currentSkill.steps)
                    ? currentSkill.steps
                    : block.steps;
                if (!Array.isArray(currentSteps) || currentSteps.length === 0) {
                    if (block.type === 'damage') recordDamage(block.id, actorSlot, 0, 0);
                    return;
                }
                const actorBeforeSkill = getActor(runtimeState, actorSlot);
                const actorStatusIdsBeforeSkill = new Set((actorBeforeSkill && actorBeforeSkill.statuses || [])
                    .map((status) => status && status.status_id).filter(Boolean));
                const enemyStatusIdsBeforeSkill = new Set((runtimeState.enemy.statuses || [])
                    .map((status) => status && status.status_id).filter(Boolean));
                const result = resolveSkill(runtimeState, {
                    id: block.skillId || block.id,
                    steps: currentSteps
                }, { ownerSlot: actorSlot }, resolutionOptions);
                if (result.hitCount > 0 || block.type === 'damage') {
                    recordDamage(block.id, actorSlot, result.totalDamage, result.hitCount);
                }

                // 纯 do=damage 技能是一次完整伤害行动；resolveSkill 内的 do=na/do=ca
                // 已由各自结算器推进，因此这里只补直接技伤的行动结束时点。
                const hasDirectDamage = currentSteps.some((step) => step && step.do === 'damage');
                const hasNestedAttack = currentSteps.some((step) => step && (step.do === 'na' || step.do === 'ca'));
                if (result.hitCount > 0 && hasDirectDamage && !hasNestedAttack) {
                    // 只扣除直接伤害发生时已经存在的行动持续状态。伤害后才获得的Buff
                    // 不应被本次已经完成的伤害行动立即消耗；同ID刷新也按新状态处理。
                    const lastDamageIndex = result.steps.reduce((latest, step, index) => (
                        step && step.do === 'damage' ? index : latest
                    ), -1);
                    result.steps.slice(0, lastDamageIndex + 1).forEach((step) => {
                        if (!step || step.do !== 'buff' || !Array.isArray(step.applied)) return;
                        step.applied.forEach((status) => {
                            if (!status || !status.status_id) return;
                            if (status.target === 'enemy') enemyStatusIdsBeforeSkill.add(status.status_id);
                            if (Number(status.target_slot) === actorSlot) actorStatusIdsBeforeSkill.add(status.status_id);
                        });
                    });
                    result.steps.slice(lastDamageIndex + 1).forEach((step) => {
                        if (!step || step.do !== 'buff' || !Array.isArray(step.applied)) return;
                        step.applied.forEach((status) => {
                            if (!status || !status.status_id) return;
                            // 不刷新持续时间的叠层仍是原状态，本次伤害使用过它，
                            // 必须继续消耗其原有的行动次数；首次获得则仍不消耗。
                            if (status.stacking && status.stacking.refresh_duration === false) return;
                            if (status.target === 'enemy') enemyStatusIdsBeforeSkill.delete(status.status_id);
                            if (Number(status.target_slot) === actorSlot) actorStatusIdsBeforeSkill.delete(status.status_id);
                        });
                    });
                    finishAction(runtimeState, actorSlot, {
                        actorStatusIds: actorStatusIdsBeforeSkill,
                        enemyStatusIds: enemyStatusIdsBeforeSkill
                    });
                }
                enemyBuffs = projectStatusBuffs(cloneJson(runtimeState.enemy.statuses || []));
            });
            finishTurn(runtimeState);
        });

        return {
            buffsByBlockId,
            damageByBlockId,
            hitCountByBlockId,
            totalDamage,
            byCharacter,
            enemyBuffs,
            state: runtimeState
        };
    }

    function projectTimelineBuffs(turns, options) {
        return resolveTimeline(turns, options).buffsByBlockId;
    }

    const api = {
        normalizeDuration,
        createRuntimeStatus,
        createState,
        getActor,
        getStatusRemaining,
        applyStatus,
        finishAction,
        finishTurn,
        resolveDamageHits,
        collectBonusHitSources,
        resolveNormalAttack,
        resolveSkillDamage,
        resolveChargeAttack,
        resolveAction,
        resolveSkill,
        resolveTimeline,
        projectTimelineBuffs,
        projectStatusBuffs
    };

    global.ManualBattleResolution = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
