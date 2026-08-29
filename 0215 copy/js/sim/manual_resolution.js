// ==========================================
//  GBF 模拟器 - 手动回合模拟专用结算底层
//  不参与自动模拟；所有伤害以单个 hit 为最小结算单位。
// ==========================================
(function (global) {
    'use strict';

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

    function consumeDuration(statuses, durationType, amount) {
        const type = canonicalDurationType(durationType);
        const consumed = [];
        const expired = [];
        const next = (Array.isArray(statuses) ? statuses : []).filter((status) => {
            if (!status || !status.duration || canonicalDurationType(status.duration.type) !== type) return true;
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

    function finishAction(state, actorSlot) {
        const actor = getActor(state, actorSlot);
        const actorResult = consumeDuration(actor && actor.statuses, 'action', 1);
        if (actor) actor.statuses = actorResult.statuses;
        const enemyResult = consumeDuration(state.enemy.statuses, 'action', 1);
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

    function resolveDamageHits(state, hits, options) {
        const opts = options || {};
        const calculator = typeof opts.calculateHit === 'function'
            ? opts.calculateHit
            : (hit) => Number(hit.damage) || 0;
        const resolved = [];
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
            const damage = normalizeDamageValue(calculator(hit, context));
            if (typeof opts.afterHit === 'function') opts.afterHit(hit, damage, context);
            const durationChanges = consumeHitDurations(state, hit.actorSlot);
            resolved.push({
                hit,
                damage,
                actorStatusIds: snapshot.actorStatuses.map((status) => status.status_id),
                enemyStatusIds: snapshot.enemyStatuses.map((status) => status.status_id),
                durationChanges
            });
            totalDamage += damage;
        });

        return { hits: resolved, hitCount: resolved.length, totalDamage };
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
            (Array.isArray(status.effects) ? status.effects : []).forEach((effect, index) => {
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
            }], Object.assign({}, options, { actorSlot })));

            const bonusSources = Array.isArray(spec.bonusHits)
                ? cloneJson(spec.bonusHits)
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
                }], Object.assign({}, options, { actorSlot })));
            });
        }

        if (spec.consumeActionDuration !== false) result.actionDurationChanges = finishAction(state, actorSlot);
        return result;
    }

    function createStatusFromBuffStep(step, context, index) {
        const source = step || {};
        const skillId = context && context.skillId ? context.skillId : 'manual_skill';
        const effects = source.prop && source.zone
            ? [{
                prop: String(source.prop),
                zone: String(source.zone),
                value: Number(source.value) || 0,
                format: source.format,
                conditions: cloneJson(source.conditions != null ? source.conditions : source.condition)
            }]
            : cloneJson(Array.isArray(source.effects) ? source.effects : []);
        return {
            status_id: source.id || `${skillId}_status_${index}`,
            name: source.name || source.id || `${skillId}效果`,
            icon: source.icon || '',
            duration: normalizeDuration(source),
            effects,
            stacking: cloneJson(source.stacking || null),
            stacks: source.stacks == null ? null : Math.max(1, Number(source.stacks) || 1),
            conditions: cloneJson(source.conditions != null ? source.conditions : source.condition),
            flags: source.dispel_immune == null ? {} : { dispel_immune: source.dispel_immune === true }
        };
    }

    function resolveSkillDamage(state, action, options) {
        const spec = action || {};
        const damage = spec.damage && typeof spec.damage === 'object' ? spec.damage : spec;
        const actorSlot = Number(spec.actorSlot == null ? 0 : spec.actorSlot);
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
        return result;
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

        (Array.isArray(source.steps) ? source.steps : []).forEach((step, index) => {
            if (!step || !step.do) return;
            if (step.do === 'buff') {
                const applied = applyStatus(state, {
                    ownerSlot: actorSlot,
                    target: step.target || 'self',
                    target_slots: step.target_slots,
                    status: createStatusFromBuffStep(step, {
                        skillId: source.id || runtime.skillId || 'manual_skill'
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
                }, step), options);
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
        return result;
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
        resolveSkill
    };

    global.ManualBattleResolution = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
