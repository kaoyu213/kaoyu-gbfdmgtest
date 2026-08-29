// ==========================================
//  GBF 模拟器 - 事件驱动结算栈 / 插入结算内核
// ==========================================
(function (global) {
    'use strict';

    function cloneJson(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    class EffectExecutorRegistry {
        constructor() {
            this.handlers = new Map();
        }

        register(type, handler) {
            if (!type || typeof handler !== 'function') throw new Error('效果执行器需要 type 和处理函数');
            this.handlers.set(String(type), handler);
            return this;
        }

        has(type) {
            return this.handlers.has(String(type));
        }

        execute(command, context) {
            const handler = command && this.handlers.get(String(command.type || ''));
            if (!handler) return { unsupported: true };
            return handler(command, context || {}) || null;
        }
    }

    class TriggerRegistry {
        constructor() {
            this.byEvent = new Map();
            this.sequence = 0;
        }

        register(source) {
            if (!source || !source.trigger || !source.trigger.event) return null;
            const entry = Object.assign({}, source, {
                id: String(source.id || source.skillId || `trigger_${this.sequence + 1}`),
                _sequence: this.sequence++
            });
            const event = String(source.trigger.event);
            if (!this.byEvent.has(event)) this.byEvent.set(event, []);
            this.byEvent.get(event).push(entry);
            return entry.id;
        }

        removeBySource(sourceId) {
            this.byEvent.forEach((entries, event) => {
                this.byEvent.set(event, entries.filter((entry) => entry.sourceId !== sourceId && entry.id !== sourceId));
            });
        }

        list(event) {
            return (this.byEvent.get(String(event)) || []).slice().sort((a, b) => {
                const priorityDiff = Number(b.trigger.priority || 0) - Number(a.trigger.priority || 0);
                if (priorityDiff) return priorityDiff;
                const slotDiff = Number(a.ownerSlot == null ? 999 : a.ownerSlot) - Number(b.ownerSlot == null ? 999 : b.ownerSlot);
                if (slotDiff) return slotDiff;
                const skillDiff = String(a.skillId || a.id).localeCompare(String(b.skillId || b.id));
                return skillDiff || a._sequence - b._sequence;
            });
        }
    }

    class ResolutionEngine {
        constructor(options) {
            const opts = options || {};
            this.state = opts.state || {};
            this.effects = opts.effects || new EffectExecutorRegistry();
            this.triggers = opts.triggers || new TriggerRegistry();
            this.conditions = opts.conditions || (global.BattleConditions && global.BattleConditions.evaluator);
            this.normalizeSteps = typeof opts.normalizeSteps === 'function' ? opts.normalizeSteps : (() => []);
            this.maxDepth = Number(opts.maxDepth) || 32;
            this.maxEvents = Number(opts.maxEvents) || 5000;
            this.maxCommands = Number(opts.maxCommands) || 10000;
            this.trace = [];
            this.deferred = new Map();
            this.eventSequence = 0;
            this.frameSequence = 0;
            this.commandCount = 0;
            this.limitCounts = new Map();
            this.triggerStack = [];
            if (!this.state.counters) this.state.counters = {};
            if (!this.state.flags) this.state.flags = {};
        }

        registerTriggerSource(source) {
            return this.triggers.register(source);
        }

        removeTriggerSource(sourceId) {
            this.triggers.removeBySource(sourceId);
        }

        getTrace() {
            return cloneJson(this.trace);
        }

        resolveAction(spec) {
            const action = spec || {};
            const frame = this._createFrame({
                id: action.id,
                kind: action.kind || 'action',
                source: action.source || null,
                commands: Array.isArray(action.commands) ? action.commands : [],
                context: action.context || {},
                tags: action.tags || [],
                causeEventId: action.causeEventId || null
            });
            this._resolveFrame(frame, 0);
            return frame;
        }

        emitLifecycle(eventType, payload, context) {
            return this._emit(eventType, payload || {}, null, context || {});
        }

        flushDeferred(windowName, context) {
            const key = String(windowName || 'turn_end');
            const frames = this.deferred.get(key) || [];
            this.deferred.delete(key);
            frames.forEach((frame) => {
                frame.context = Object.assign({}, context || {}, frame.context || {});
                this._resolveFrame(frame, 0);
            });
            return frames.length;
        }

        _createFrame(spec) {
            return {
                id: String(spec.id || `frame_${++this.frameSequence}`),
                kind: spec.kind || 'action',
                source: spec.source || null,
                commands: Array.isArray(spec.commands) ? spec.commands.slice() : [],
                context: spec.context || {},
                tags: Array.isArray(spec.tags) ? spec.tags.slice() : [],
                causeEventId: spec.causeEventId || null,
                triggerAncestry: Array.isArray(spec.triggerAncestry) ? spec.triggerAncestry.slice() : [],
                followUps: [],
                cancelled: false
            };
        }

        _resolveFrame(frame, depth) {
            if (!frame || frame.cancelled) return frame;
            if (depth > this.maxDepth) throw new Error(`结算嵌套超过上限 ${this.maxDepth}`);
            this.trace.push({ type: 'frame_start', frameId: frame.id, kind: frame.kind, depth });
            this._emit('action_start', this._framePayload(frame), frame, frame.context, depth);

            for (let index = 0; index < frame.commands.length && !frame.cancelled; index++) {
                if (++this.commandCount > this.maxCommands) throw new Error(`单次模拟命令数超过上限 ${this.maxCommands}`);
                const command = frame.commands[index];
                if (!command || !command.type) continue;
                const commandPayload = Object.assign(this._framePayload(frame), { command, commandIndex: index });
                const beforeEvent = this._emit('before_command', commandPayload, frame, frame.context, depth);
                if (beforeEvent.control.cancelCommand) continue;
                const typedBeforeEvent = this._emit(`before_${command.type}`, commandPayload, frame, frame.context, depth);
                if (typedBeforeEvent.control.cancelCommand) continue;

                const executionContext = Object.assign({}, frame.context, {
                    engine: this,
                    frame,
                    commandIndex: index,
                    event: beforeEvent,
                    battleState: this.state
                });
                const output = this.effects.execute(command, executionContext);
                this.trace.push({ type: 'command', frameId: frame.id, commandType: command.type, index, unsupported: !!(output && output.unsupported) });
                this._consumeExecutorOutput(output, frame, depth);
                this._emit(`after_${command.type}`, Object.assign({}, commandPayload, { output }), frame, frame.context, depth);
                this._emit('after_command', Object.assign({}, commandPayload, { output }), frame, frame.context, depth);
            }

            this._emit('action_end', this._framePayload(frame), frame, frame.context, depth);
            this.trace.push({ type: 'frame_end', frameId: frame.id, kind: frame.kind, depth, cancelled: frame.cancelled });
            while (frame.followUps.length) this._resolveFrame(frame.followUps.shift(), depth + 1);
            return frame;
        }

        _consumeExecutorOutput(output, frame, depth) {
            if (!output || typeof output !== 'object') return;
            if (output.control && output.control.cancelRemaining) frame.cancelled = true;
            (Array.isArray(output.events) ? output.events : []).forEach((event) => {
                if (event && event.type) this._emit(event.type, event.payload || {}, frame, frame.context, depth);
            });
            (Array.isArray(output.followUps) ? output.followUps : []).forEach((followUp) => {
                const child = this._frameFromEffect(followUp, frame.context, null, frame.triggerAncestry);
                if (child) frame.followUps.push(child);
            });
        }

        _emit(eventType, payload, frame, outerContext, depth) {
            if (++this.eventSequence > this.maxEvents) throw new Error(`单次模拟事件数超过上限 ${this.maxEvents}`);
            const event = Object.assign({
                eventId: `evt_${this.eventSequence}`,
                type: String(eventType),
                turn: Number(this.state.turn) || 0,
                phase: this.state.phase || '',
                causeEventId: frame ? frame.causeEventId : null,
                depth: Number(depth) || 0,
                tags: frame ? frame.tags.slice() : [],
                triggerAncestry: frame ? frame.triggerAncestry.slice() : [],
                control: {}
            }, payload || {});
            this.trace.push({ type: 'event', event: cloneJson(event) });
            const entries = this.triggers.list(event.type);
            entries.forEach((entry) => {
                if (!this._canTrigger(entry, event, outerContext || {})) return;
                if (!this._hasLimitCapacity(entry, event)) return;
                if (!this._advanceCounter(entry, event)) return;
                if (!this._consumeLimit(entry, event)) return;
                const child = this._frameFromTrigger(entry, event, outerContext || {});
                if (!child) return;
                const insertion = String(entry.trigger.insertion || 'interrupt');
                this.trace.push({ type: 'trigger', eventId: event.eventId, triggerId: entry.id, insertion });
                if (insertion === 'follow_up' && frame) {
                    frame.followUps.push(child);
                } else if (insertion === 'deferred') {
                    const windowName = String(entry.trigger.window || entry.trigger.defer_until || 'turn_end');
                    if (!this.deferred.has(windowName)) this.deferred.set(windowName, []);
                    this.deferred.get(windowName).push(child);
                } else {
                    if (insertion === 'replace') event.control.cancelCommand = true;
                    this.triggerStack.push(entry.id);
                    try { this._resolveFrame(child, (Number(depth) || 0) + 1); }
                    finally { this.triggerStack.pop(); }
                }
            });
            return event;
        }

        _canTrigger(entry, event, outerContext) {
            if (this.triggerStack.includes(entry.id) && entry.trigger.allow_recursive !== true) return false;
            if (event.triggerAncestry.includes(entry.id) && entry.trigger.allow_recursive !== true) return false;
            const actorSlot = event.actorSlot != null ? Number(event.actorSlot)
                : event.ownerSlot != null ? Number(event.ownerSlot)
                    : event.sourceActor != null ? Number(event.sourceActor) : null;
            const watch = String(entry.trigger.watch || 'any');
            if (watch === 'self' && actorSlot !== Number(entry.ownerSlot)) return false;
            if (watch === 'ally_party' && (actorSlot == null || actorSlot < 0 || actorSlot > 3)) return false;
            if (watch === 'ally_all' && (actorSlot == null || actorSlot < 0 || actorSlot > 5)) return false;
            const conditions = entry.trigger.conditions != null ? entry.trigger.conditions : entry.trigger.condition;
            if (!this.conditions) return conditions == null;
            return this.conditions.evaluate(conditions, {
                event,
                state: this.state,
                source: entry,
                owner: this.state.actors && entry.ownerSlot != null ? this.state.actors[entry.ownerSlot] : null,
                context: outerContext
            });
        }

        _counterKey(entry, counter) {
            const id = String(counter.id || 'counter');
            const scope = String(counter.scope || 'owner');
            if (scope === 'battle_shared' || scope === 'party_shared') return `${scope}|${id}`;
            return `${scope}|${entry.ownerSlot == null ? 'system' : entry.ownerSlot}|${entry.skillId || entry.id}|${id}`;
        }

        _advanceCounter(entry, event) {
            const counter = entry.trigger.counter;
            if (!counter) return true;
            const key = this._counterKey(entry, counter);
            const add = Number(counter.add == null ? 1 : counter.add) || 0;
            const threshold = Math.max(1, Number(counter.threshold) || 1);
            const current = Number(this.state.counters[key]) || 0;
            const next = current + add;
            this.state.counters[key] = next;
            this.trace.push({ type: 'counter', eventId: event.eventId, triggerId: entry.id, key, value: next, threshold });
            if (next < threshold) return false;
            this.state.counters[key] = counter.on_threshold === 'reset' ? 0 : Math.max(0, next - threshold);
            return true;
        }

        _consumeLimit(entry, event) {
            const limits = entry.trigger.limits || {};
            const battleKey = `battle|${entry.id}`;
            const turnKey = `turn|${this.state.turn}|${entry.id}`;
            const battleCount = Number(this.limitCounts.get(battleKey)) || 0;
            const turnCount = Number(this.limitCounts.get(turnKey)) || 0;
            const maxPerBattle = entry.trigger.once === true ? 1 : limits.max_per_battle;
            if (maxPerBattle != null && battleCount >= Number(maxPerBattle)) return false;
            if (limits.max_per_turn != null && turnCount >= Number(limits.max_per_turn)) return false;
            const ignored = Array.isArray(limits.ignore_tags) ? limits.ignore_tags : [];
            if (ignored.some((tag) => event.tags.includes(tag))) return false;
            this.limitCounts.set(battleKey, battleCount + 1);
            this.limitCounts.set(turnKey, turnCount + 1);
            return true;
        }

        _hasLimitCapacity(entry, event) {
            const limits = entry.trigger.limits || {};
            const battleCount = Number(this.limitCounts.get(`battle|${entry.id}`)) || 0;
            const turnCount = Number(this.limitCounts.get(`turn|${this.state.turn}|${entry.id}`)) || 0;
            const maxPerBattle = entry.trigger.once === true ? 1 : limits.max_per_battle;
            if (maxPerBattle != null && battleCount >= Number(maxPerBattle)) return false;
            if (limits.max_per_turn != null && turnCount >= Number(limits.max_per_turn)) return false;
            const ignored = Array.isArray(limits.ignore_tags) ? limits.ignore_tags : [];
            return !ignored.some((tag) => event.tags.includes(tag));
        }

        _frameFromTrigger(entry, event, outerContext) {
            const context = Object.assign({}, outerContext, {
                triggerSource: entry,
                triggerEvent: event,
                ownerSlot: entry.ownerSlot,
                skillId: entry.skillId || entry.id
            });
            context.triggeringAction = outerContext.action || outerContext.triggeringAction || null;
            delete context.action;
            delete context.resultEvent;
            const commands = Array.isArray(entry.commands)
                ? entry.commands
                : this.normalizeSteps(entry.steps || [], context);
            return this._createFrame({
                id: `trigger_${entry.id}_${event.eventId}`,
                kind: 'trigger',
                source: entry,
                commands,
                context,
                tags: (Array.isArray(entry.trigger.tags) ? entry.trigger.tags : []).concat('triggered'),
                causeEventId: event.eventId,
                triggerAncestry: event.triggerAncestry.concat(entry.id)
            });
        }

        _frameFromEffect(effect, outerContext, causeEventId, triggerAncestry) {
            if (!effect) return null;
            const commands = Array.isArray(effect.commands)
                ? effect.commands
                : this.normalizeSteps(effect.steps || [], outerContext || {});
            return this._createFrame({
                id: effect.id,
                kind: effect.kind || 'follow_up',
                source: effect.source || null,
                commands,
                context: Object.assign({}, outerContext || {}, effect.context || {}),
                tags: effect.tags || ['follow_up'],
                causeEventId,
                triggerAncestry
            });
        }

        _framePayload(frame) {
            const source = frame && frame.source ? frame.source : {};
            return {
                frameId: frame ? frame.id : null,
                actionId: source.id || (frame && frame.id),
                skillId: source.skillId || source.skill_id || null,
                ownerSlot: source.ownerSlot != null ? source.ownerSlot : source.owner_slot,
                actorSlot: source.ownerSlot != null ? source.ownerSlot : source.owner_slot,
                actionType: source.type || frame.kind,
                source: source.source || null
            };
        }
    }

    const effectExecutorExtensions = new Map();
    const triggerSourceProviders = [];

    function registerEffectExecutor(type, handler) {
        if (!type || typeof handler !== 'function') throw new Error('扩展效果执行器需要 type 和处理函数');
        effectExecutorExtensions.set(String(type), handler);
        return api;
    }

    function installEffectExecutors(registry) {
        if (!registry || typeof registry.register !== 'function') return registry;
        effectExecutorExtensions.forEach((handler, type) => registry.register(type, handler));
        return registry;
    }

    function registerTriggerSourceProvider(provider) {
        if (typeof provider !== 'function') throw new Error('触发源提供器必须是函数');
        triggerSourceProviders.push(provider);
        return api;
    }

    function collectTriggerSources(context) {
        const sources = [];
        triggerSourceProviders.forEach((provider) => {
            const provided = provider(context || {});
            if (Array.isArray(provided)) sources.push(...provided.filter(Boolean));
        });
        return sources;
    }

    const api = {
        EffectExecutorRegistry,
        TriggerRegistry,
        ResolutionEngine,
        registerEffectExecutor,
        installEffectExecutors,
        registerTriggerSourceProvider,
        collectTriggerSources
    };
    global.BattleResolution = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
