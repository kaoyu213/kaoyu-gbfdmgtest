// ==========================================
//  GBF 模拟器 - Charabuff 注册表 / 场景适配器
// ==========================================
(function (global) {
    'use strict';

    const VALID_TARGETS = new Set([
        'self',
        'ally_party',
        'ally_all',
        'enemy_single',
        'enemy_all',
        'field'
    ]);
    const VALID_CONTEXTS = new Set(['static', 'battle']);
    let entries = [];
    let byId = new Map();
    let diagnostics = [];

    function cloneJson(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function normalizeTarget(target) {
        const value = String(target == null ? 'self' : target).trim().toLowerCase();
        if (value === 'party') return 'ally_party';
        if (value === 'allies') return 'ally_all';
        if (value === 'enemy') return 'enemy_single';
        return value || 'self';
    }

    function normalizeContexts(row) {
        const source = Array.isArray(row && row.contexts)
            ? row.contexts
            : row && row.context
                ? [row.context]
                : ['static'];
        return Array.from(new Set(source.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)));
    }

    function parseScalar(value) {
        if (typeof value === 'string') {
            const text = value.trim();
            if (!text) return 0;
            if (text.endsWith('%')) {
                const percent = Number(text.slice(0, -1));
                return Number.isFinite(percent) ? percent / 100 : 0;
            }
        }
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function getEffectBehavior(effect) {
        if (!effect || typeof effect !== 'object') return '';
        return String(effect.effect || effect.effect_type || effect.prop || '').trim().toLowerCase();
    }

    function isEnemyDefenseDownEffect(effect) {
        const behavior = getEffectBehavior(effect);
        return behavior === 'enemy_defense_down'
            || behavior === 'defense_down'
            || behavior === 'def_down';
    }

    function normalizeDefenseDownZone(zone) {
        const value = String(zone == null ? 'normal' : zone).trim().toLowerCase();
        if (value === 'unique' || value === 'independent_def_down') return 'independent';
        if (value === 'independent') return 'independent';
        if (value === 'both_sided' || value === 'double_sided' || value === 'double-sided' || value === '双面区') {
            return 'both_sided';
        }
        if (value === 'cumulative' || value === 'stack' || value === 'stacking' || value === '累积区') {
            return 'cumulative';
        }
        // 兼容旧 charabuff 的 normal / weapon_grid 写法，统一视为片面区。
        return 'one_sided';
    }

    function getBuffRegistryConstructor() {
        if (typeof BuffRegistry === 'function') return BuffRegistry;
        if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
            try {
                const api = require('./buff_registry.js');
                if (api && typeof api.BuffRegistry === 'function') return api.BuffRegistry;
            } catch (error) { /* 由下方兜底聚合器处理 */ }
        }
        return null;
    }

    function isDoubleStrikeEffect(effect) {
        const behavior = getEffectBehavior(effect);
        return behavior === 'double_strike'
            || behavior === 'extra_attack'
            || behavior === 'charabuff_double_strike';
    }

    function findStatConfig(effect) {
        if (!effect || !effect.prop) return null;
        let key = String(effect.prop).trim();
        if (typeof resolveCharabuffStatKey === 'function') {
            key = resolveCharabuffStatKey(effect.prop, effect.type) || key;
        }
        if (typeof STAT_CONFIG === 'undefined' || !Array.isArray(STAT_CONFIG)) return null;
        return STAT_CONFIG.find((item) => item && item.key === key) || null;
    }

    function normalizeBattleEffect(effect) {
        if (!effect || typeof effect !== 'object') return null;
        if (isEnemyDefenseDownEffect(effect)) {
            return {
                effect: 'enemy_defense_down',
                prop: 'def_down',
                zone: normalizeDefenseDownZone(effect.zone),
                value: Math.max(0, parseScalar(effect.value)),
                format: 'percent'
            };
        }
        if (isDoubleStrikeEffect(effect)) {
            return {
                effect: 'double_strike',
                value: Math.max(1, Math.floor(Number(effect.value) || 1))
            };
        }
        if (effect.prop && effect.zone) {
            return {
                prop: String(effect.prop),
                zone: String(effect.zone),
                value: parseScalar(effect.value),
                format: effect.format
            };
        }
        const statConfig = findStatConfig(effect);
        if (statConfig && statConfig.prop && statConfig.zone) {
            return {
                prop: String(statConfig.prop),
                zone: String(statConfig.zone),
                value: parseScalar(effect.value),
                format: statConfig.format
            };
        }
        return null;
    }

    function validate(list) {
        const messages = [];
        const seen = new Set();
        (Array.isArray(list) ? list : []).forEach((row, index) => {
            const path = `charabuff[${index}]`;
            if (!row || typeof row !== 'object') {
                messages.push({ level: 'error', path, message: '条目必须是对象。' });
                return;
            }
            const id = String(row.id || '').trim();
            if (!id) messages.push({ level: 'error', path, message: '缺少 id。' });
            else if (seen.has(id)) messages.push({ level: 'error', path, message: `id 重复：${id}` });
            else seen.add(id);

            const target = normalizeTarget(row.target);
            if (!VALID_TARGETS.has(target)) {
                messages.push({ level: 'error', path: `${path}.target`, message: `不支持的目标：${target}` });
            }
            normalizeContexts(row).forEach((context) => {
                if (!VALID_CONTEXTS.has(context)) {
                    messages.push({ level: 'error', path: `${path}.contexts`, message: `不支持的使用场景：${context}` });
                }
            });
            if (!Array.isArray(row.effects) || row.effects.length === 0) {
                messages.push({ level: 'warning', path: `${path}.effects`, message: '没有可执行 effects。' });
            }
            if (normalizeContexts(row).includes('battle')) {
                (Array.isArray(row.effects) ? row.effects : []).forEach((effect, effectIndex) => {
                    if (!normalizeBattleEffect(effect)) {
                        messages.push({
                            level: 'warning',
                            path: `${path}.effects[${effectIndex}]`,
                            message: '该效果暂时不能转换为回合模拟步骤。'
                        });
                    }
                });
            }
        });
        return messages;
    }

    function load(list) {
        const source = Array.isArray(list) ? list : [];
        diagnostics = validate(source);
        entries = source.filter((row) => row && row.id).map(cloneJson);
        byId = new Map();
        entries.forEach((row) => {
            if (!byId.has(String(row.id))) byId.set(String(row.id), row);
        });
        diagnostics.forEach((item) => {
            const logger = item.level === 'error' ? console.error : console.warn;
            logger(`[charabuff_registry] ${item.path}: ${item.message}`);
        });
        return getDiagnostics();
    }

    function get(id) {
        const row = byId.get(String(id));
        return row ? cloneJson(row) : null;
    }

    function supportsContext(rowOrId, context) {
        const row = typeof rowOrId === 'string' ? byId.get(rowOrId) : rowOrId;
        if (!row) return false;
        return normalizeContexts(row).includes(String(context || '').trim().toLowerCase());
    }

    function toBattleSkill(rowOrId) {
        const row = typeof rowOrId === 'string' ? byId.get(rowOrId) : rowOrId;
        if (!row || !supportsContext(row, 'battle')) return null;
        const effects = (Array.isArray(row.effects) ? row.effects : [])
            .map(normalizeBattleEffect)
            .filter(Boolean);
        if (effects.length === 0) return null;
        const duration = row.duration && typeof row.duration === 'object'
            ? cloneJson(row.duration)
            : { type: 'permanent' };
        const target = normalizeTarget(row.target);
        return {
            id: String(row.id),
            name: row.name || row.id,
            kind: 'charabuff',
            typeLabel: 'Buff图鉴',
            description: row.description || '',
            image: row.image || '',
            steps: [{
                do: 'buff',
                target,
                unique: true,
                id: `charabuff_status_${row.id}`,
                name: row.status_name || row.name || row.id,
                icon: row.status_icon || row.image || '',
                duration,
                effects
            }]
        };
    }

    function getBattleItems() {
        return entries.filter((row) => supportsContext(row, 'battle')).map((row) => ({
            row: cloneJson(row),
            skill: toBattleSkill(row)
        })).filter((item) => item.skill);
    }

    function resolveEnemyDefenseDownEffects(effectItems) {
        const normalized = (Array.isArray(effectItems) ? effectItems : []).map((item, index) => {
            const effect = item && item.definition ? item.definition : item;
            if (!isEnemyDefenseDownEffect(effect)) return null;
            return {
                sourceId: item && item.sourceId ? String(item.sourceId) : `enemy_def_down_${index}`,
                zone: normalizeDefenseDownZone(effect.zone),
                value: Math.max(0, parseScalar(effect.value))
            };
        }).filter((item) => item && item.value > 0);

        const Registry = getBuffRegistryConstructor();
        if (Registry) {
            const registry = new Registry();
            normalized.forEach((item) => {
                registry.addByProp('def_down', item.zone, item.sourceId, item.value);
            });
            const detail = registry.getDetail('def_down');
            const noSubtype = detail['(无)'] || {};
            const oneSided = noSubtype.one_sided ? Number(noSubtype.one_sided.zoneValue) || 0 : 0;
            const bothSided = noSubtype.both_sided ? Number(noSubtype.both_sided.zoneValue) || 0 : 0;
            const cumulative = noSubtype.cumulative ? Number(noSubtype.cumulative.zoneValue) || 0 : 0;
            const independent = noSubtype.independent ? Number(noSubtype.independent.zoneValue) || 0 : 0;
            const ordinaryRaw = oneSided + bothSided + cumulative;
            const normal = Math.min(0.5, ordinaryRaw);
            return {
                normal,
                ordinaryRaw,
                oneSided,
                bothSided,
                cumulative,
                independent,
                total: Math.min(0.99, normal + independent),
                detail
            };
        }

        const maxZone = (zone) => normalized
            .filter((item) => item.zone === zone)
            .reduce((max, item) => Math.max(max, item.value), 0);
        const oneSided = maxZone('one_sided');
        const bothSided = maxZone('both_sided');
        const cumulative = normalized
            .filter((item) => item.zone === 'cumulative')
            .reduce((sum, item) => sum + item.value, 0);
        const ordinaryRaw = oneSided + bothSided + cumulative;
        const normal = Math.min(0.5, ordinaryRaw);
        const independent = normalized
            .filter((item) => item.zone === 'independent')
            .reduce((sum, item) => sum + item.value, 0);
        return {
            normal,
            ordinaryRaw,
            oneSided,
            bothSided,
            cumulative,
            independent,
            total: Math.min(0.99, normal + independent),
            detail: {}
        };
    }

    function getStaticEnemyDefenseDownBreakdown(rows, manualNormalValue) {
        const effects = [];
        (Array.isArray(rows) ? rows : []).forEach((rowEntry) => {
            const row = rowEntry && rowEntry.template ? rowEntry.template : rowEntry;
            if (!row || !supportsContext(row, 'static')) return;
            const target = normalizeTarget(row.target);
            if (target !== 'enemy_single' && target !== 'enemy_all') return;
            (Array.isArray(row.effects) ? row.effects : []).forEach((effect, effectIndex) => {
                if (!isEnemyDefenseDownEffect(effect)) return;
                effects.push({
                    definition: effect,
                    sourceId: `${row.id || 'charabuff'}:${effectIndex}`
                });
            });
        });
        const manual = Math.max(0, Number(manualNormalValue) || 0);
        if (manual > 0) {
            effects.push({
                definition: { prop: 'def_down', zone: 'normal', value: manual },
                sourceId: 'static_manual_def_down'
            });
        }
        return resolveEnemyDefenseDownEffects(effects);
    }

    function getStaticEnemyDefenseDown(rows, manualNormalValue) {
        return getStaticEnemyDefenseDownBreakdown(rows, manualNormalValue).total;
    }

    function getDiagnostics() {
        return diagnostics.map((item) => Object.assign({}, item));
    }

    const api = {
        load,
        get,
        getAll: () => entries.map(cloneJson),
        validate,
        getDiagnostics,
        normalizeTarget,
        normalizeContexts,
        parseScalar,
        supportsContext,
        toBattleSkill,
        getBattleItems,
        getStaticEnemyDefenseDown,
        getStaticEnemyDefenseDownBreakdown,
        resolveEnemyDefenseDownEffects,
        isEnemyDefenseDownEffect,
        isDoubleStrikeEffect
    };

    global.CharabuffRegistry = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
