// ==========================================
//  GBF 模拟器 - 手动回合自定义技能
//  用户表单 -> 标准 charaskill.steps，并保存在浏览器本地。
// ==========================================
(function (global) {
    'use strict';

    const STORAGE_KEY = 'gbf_manual_custom_skills_v1';
    const TARGETS = Object.freeze(['self', 'ally_party', 'ally_all', 'ally_slots', 'enemy']);
    const DURATION_TYPES = Object.freeze(['turns', 'action', 'hit', 'permanent']);
    const FIXED_BUFF_TYPES = new Set([
        'dmg_supp',
        'na_dmg_supp',
        'skill_dmg_supp',
        'ca_dmg_supp',
        'counter_dmg_supp',
        'cb_dmg_supp',
        'double_strike',
        'triple_strike',
        'na_ranshu',
        'base_atk',
        'base_hp',
        'dmg_taken_lowered'
    ]);
    const COUNT_BUFF_TYPES = new Set(['double_strike', 'triple_strike', 'na_ranshu']);

    let nodeDirectoryApi = null;
    let nodeZoneApi = null;
    if (typeof module !== 'undefined' && module.exports) {
        nodeDirectoryApi = require('../buff_directory.js');
        nodeZoneApi = require('../buff_zones.js');
    }

    let memory = [];
    let loaded = false;

    function cloneJson(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function getDirectory() {
        if (nodeDirectoryApi) return nodeDirectoryApi.BUFF_DIRECTORY || {};
        if (typeof BUFF_DIRECTORY !== 'undefined') return BUFF_DIRECTORY;
        return {};
    }

    function callDirectory(name, args, fallback) {
        if (nodeDirectoryApi && typeof nodeDirectoryApi[name] === 'function') {
            return nodeDirectoryApi[name].apply(null, args || []);
        }
        if (name === 'buildBuffProp' && typeof buildBuffProp === 'function') return buildBuffProp.apply(null, args || []);
        if (name === 'getBuffElementLabel' && typeof getBuffElementLabel === 'function') return getBuffElementLabel.apply(null, args || []);
        if (name === 'getBuffDisplayMeta' && typeof getBuffDisplayMeta === 'function') return getBuffDisplayMeta.apply(null, args || []);
        return fallback;
    }

    function callZone(name, args, fallback) {
        if (nodeZoneApi && typeof nodeZoneApi[name] === 'function') {
            return nodeZoneApi[name].apply(null, args || []);
        }
        if (name === 'getZoneNames' && typeof getZoneNames === 'function') return getZoneNames.apply(null, args || []);
        if (name === 'getZoneRule' && typeof getZoneRule === 'function') return getZoneRule.apply(null, args || []);
        if (name === 'getZoneCap' && typeof getZoneCap === 'function') return getZoneCap.apply(null, args || []);
        if (name === 'getZoneLabel' && typeof getZoneLabel === 'function') return getZoneLabel.apply(null, args || []);
        return fallback;
    }

    function getStorage(storage) {
        if (storage) return storage;
        try {
            return global && global.localStorage ? global.localStorage : null;
        } catch (error) {
            return null;
        }
    }

    function normalizeStoredList(value) {
        return (Array.isArray(value) ? value : []).filter((skill) => (
            skill && skill.id && skill.name && Array.isArray(skill.steps)
        ));
    }

    function load(storage) {
        const store = getStorage(storage);
        if (!store || typeof store.getItem !== 'function') {
            if (!loaded) memory = [];
            loaded = true;
            return list();
        }
        try {
            const raw = store.getItem(STORAGE_KEY);
            memory = normalizeStoredList(raw ? JSON.parse(raw) : []);
        } catch (error) {
            console.warn('[ManualCustomSkills] 本地技能库读取失败，已使用空技能库。', error);
            memory = [];
        }
        loaded = true;
        return list();
    }

    function ensureLoaded() {
        if (!loaded) load();
    }

    function persist(storage) {
        const store = getStorage(storage);
        if (!store || typeof store.setItem !== 'function') return false;
        store.setItem(STORAGE_KEY, JSON.stringify(memory));
        return true;
    }

    function list() {
        ensureLoaded();
        return cloneJson(memory);
    }

    function get(skillId) {
        ensureLoaded();
        const id = String(skillId || '');
        return cloneJson(memory.find((skill) => String(skill.id) === id) || null);
    }

    function createId() {
        return `manual_custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function getBuffCatalog() {
        const directory = getDirectory();
        return Object.keys(directory).map((buffType) => {
            const entry = directory[buffType] || {};
            const zones = (callZone('getZoneNames', [buffType], []) || [])
                .filter((zone) => zone !== 'testbuff')
                .map((zone) => ({
                    id: zone,
                    label: callZone('getZoneLabel', [zone], zone),
                    rule: callZone('getZoneRule', [buffType, zone], 'sum'),
                    cap: callZone('getZoneCap', [buffType, zone], null)
                }));
            return {
                buffType,
                label: entry.label || buffType,
                icon: entry.icon || '',
                subtypes: Array.isArray(entry.subtypes) ? entry.subtypes.slice() : [],
                zones
            };
        }).filter((entry) => entry.zones.length > 0);
    }

    function getBuffType(buffType) {
        return getBuffCatalog().find((entry) => entry.buffType === String(buffType || '')) || null;
    }

    function resolveBuffFormat(buffType, prop, zone) {
        if (FIXED_BUFF_TYPES.has(buffType)) return 'fixed';
        const meta = callDirectory('getBuffDisplayMeta', [prop, zone, null], null);
        return meta && meta.format ? String(meta.format) : 'percent';
    }

    function getValueUnit(buffType, format) {
        if (COUNT_BUFF_TYPES.has(buffType)) return '次';
        return format === 'fixed' ? '点' : '%';
    }

    function normalizeInputValue(value, format) {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error('加成数值必须是有效数字。');
        return format === 'percent' || format === 'ta_rate_bonus' ? number / 100 : number;
    }

    function normalizeDuration(effect) {
        const type = String(effect.durationType || effect.duration_type || 'turns');
        if (!DURATION_TYPES.includes(type)) throw new Error(`不支持的持续时间类型：${type}`);
        if (type === 'permanent') return { type: 'permanent' };
        const value = Math.floor(Number(effect.durationValue != null ? effect.durationValue : effect.duration_value));
        if (!Number.isFinite(value) || value < 1) throw new Error('持续时间必须是大于0的整数。');
        return {
            type,
            value,
            tick: type === 'turns' ? 'turn_end' : type === 'action' ? 'attack_action_end' : 'damage_hit_end'
        };
    }

    function normalizeTarget(effect) {
        const target = String(effect.target || 'self');
        if (!TARGETS.includes(target)) throw new Error(`不支持的效果对象：${target}`);
        const targetSlots = target === 'ally_slots'
            ? Array.from(new Set((Array.isArray(effect.targetSlots) ? effect.targetSlots : [])
                .map(Number)
                .filter((slot) => Number.isInteger(slot) && slot >= 0 && slot <= 5)))
            : [];
        if (target === 'ally_slots' && targetSlots.length === 0) {
            throw new Error('选择“指定角色”时，至少需要选择一个位置。');
        }
        return { target, targetSlots };
    }

    function formatEffectName(catalogEntry, subtype, rawValue, unit) {
        const subtypeLabel = subtype
            ? callDirectory('getBuffElementLabel', [subtype], subtype)
            : '';
        return `${subtypeLabel || ''}${catalogEntry.label}${Number(rawValue) >= 0 ? '+' : ''}${rawValue}${unit}`;
    }

    function normalizeBuffEffect(effect, skillId, index) {
        const buffType = String(effect.buffType || effect.buff_type || '');
        const catalogEntry = getBuffType(buffType);
        if (!catalogEntry) throw new Error(`未找到可用的 Buff 类别：${buffType || '(空)'}`);

        const subtype = String(effect.subtype || '');
        if (catalogEntry.subtypes.length > 0 && !catalogEntry.subtypes.includes(subtype)) {
            throw new Error(`${catalogEntry.label}需要选择有效的子类型。`);
        }
        const zone = String(effect.zone || '');
        if (!catalogEntry.zones.some((entry) => entry.id === zone)) {
            throw new Error(`${catalogEntry.label}不支持分区 ${zone || '(空)'}。`);
        }

        const prop = callDirectory('buildBuffProp', [buffType, subtype], subtype ? `${buffType}_${subtype}` : buffType);
        const displayMeta = callDirectory('getBuffDisplayMeta', [prop, zone, null], null);
        const format = resolveBuffFormat(buffType, prop, zone);
        const rawValue = Number(effect.value);
        const value = normalizeInputValue(rawValue, format);
        const duration = normalizeDuration(effect);
        const targetInfo = normalizeTarget(effect);
        const unit = getValueUnit(buffType, format);
        const step = {
            do: 'buff',
            id: `${skillId}_effect_${index + 1}`,
            target: targetInfo.target,
            name: String(effect.name || formatEffectName({
                label: displayMeta && displayMeta.label ? displayMeta.label : catalogEntry.label
            }, subtype, rawValue, unit)),
            icon: String(effect.icon || displayMeta && displayMeta.icon || catalogEntry.icon || ''),
            prop,
            zone,
            value,
            format,
            duration
        };
        if (targetInfo.targetSlots.length) step.target_slots = targetInfo.targetSlots;
        return {
            step,
            definition: {
                target: targetInfo.target,
                targetSlots: targetInfo.targetSlots,
                buffType,
                subtype,
                zone,
                value: rawValue,
                durationType: duration.type,
                durationValue: duration.type === 'permanent' ? null : duration.value
            }
        };
    }

    function requireName(definition) {
        const name = String(definition && definition.name || '').trim();
        if (!name) throw new Error('请填写技能名。');
        return name;
    }

    function buildBuffSkill(definition, existing) {
        const source = definition || {};
        const name = requireName(source);
        const effects = Array.isArray(source.effects) ? source.effects : [];
        if (effects.length === 0) throw new Error('强化技能至少需要一个效果。');
        const id = String(source.id || existing && existing.id || createId());
        const normalized = effects.map((effect, index) => normalizeBuffEffect(effect, id, index));
        const now = new Date().toISOString();
        return {
            id,
            owner_type: 'manual_custom',
            owner_id: 'local',
            kind: 'active',
            custom_type: 'buff',
            typeLabel: '自定义强化技能',
            name,
            desc: String(source.desc || source.description || '').trim(),
            icon: String(source.icon || '').trim(),
            show_icon: false,
            steps: normalized.map((item) => item.step),
            manual_definition: {
                type: 'buff',
                name,
                desc: String(source.desc || source.description || '').trim(),
                icon: String(source.icon || '').trim(),
                effects: normalized.map((item) => item.definition)
            },
            created_at: existing && existing.created_at ? existing.created_at : now,
            updated_at: now
        };
    }

    function buildDamageSkill(definition, existing) {
        const source = definition || {};
        const name = requireName(source);
        const multiplier = Number(source.multiplier != null ? source.multiplier : source.mult);
        const hits = Math.floor(Number(source.hits));
        if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error('单hit倍率必须大于0。');
        if (!Number.isFinite(hits) || hits < 1 || hits > 999) throw new Error('hit数必须是1至999之间的整数。');

        const decayMode = String(source.decayMode || source.decay_mode || 'fuzzy');
        if (decayMode !== 'exact' && decayMode !== 'fuzzy') throw new Error('衰减方式必须是精确表或模糊上限。');
        const thresholdTable = String(source.thresholdTable || source.threshold_table || '').trim();
        const cap = Number(source.cap);
        if (decayMode === 'exact' && !thresholdTable) throw new Error('请选择精确衰减表。');
        if (decayMode === 'fuzzy' && (!Number.isFinite(cap) || cap <= 0)) {
            throw new Error('单hit模糊衰减上限必须大于0。');
        }

        const id = String(source.id || existing && existing.id || createId());
        const step = {
            do: 'damage',
            target: 'enemy',
            damage_type: 'skill',
            mult: multiplier,
            hits
        };
        if (decayMode === 'exact') step.threshold_table = thresholdTable;
        else step.cap = cap;

        const now = new Date().toISOString();
        return {
            id,
            owner_type: 'manual_custom',
            owner_id: 'local',
            kind: 'active',
            custom_type: 'damage',
            typeLabel: '自定义伤害技能',
            name,
            desc: String(source.desc || source.description || '').trim(),
            icon: String(source.icon || '').trim(),
            show_icon: true,
            steps: [step],
            manual_definition: {
                type: 'damage',
                name,
                desc: String(source.desc || source.description || '').trim(),
                icon: String(source.icon || '').trim(),
                multiplier,
                hits,
                decayMode,
                thresholdTable: decayMode === 'exact' ? thresholdTable : '',
                cap: decayMode === 'fuzzy' ? cap : null
            },
            created_at: existing && existing.created_at ? existing.created_at : now,
            updated_at: now
        };
    }

    function buildSkill(definition, existing) {
        const type = String(definition && (definition.type || definition.customType || definition.custom_type) || 'buff');
        return type === 'damage'
            ? buildDamageSkill(definition, existing || null)
            : buildBuffSkill(definition, existing || null);
    }

    function save(definition, storage) {
        ensureLoaded();
        const requestedId = definition && definition.id ? String(definition.id) : '';
        const index = requestedId ? memory.findIndex((skill) => String(skill.id) === requestedId) : -1;
        const existing = index >= 0 ? memory[index] : null;
        const skill = buildSkill(definition, existing);
        if (index >= 0) memory[index] = skill;
        else memory.push(skill);
        persist(storage);
        return cloneJson(skill);
    }

    function remove(skillId, storage) {
        ensureLoaded();
        const id = String(skillId || '');
        const before = memory.length;
        memory = memory.filter((skill) => String(skill.id) !== id);
        if (memory.length === before) return false;
        persist(storage);
        return true;
    }

    function duplicate(skillId, storage) {
        const source = get(skillId);
        if (!source) return null;
        const definition = cloneJson(source.manual_definition || {});
        definition.name = `${source.name} 副本`;
        delete definition.id;
        return save(definition, storage);
    }

    const api = {
        STORAGE_KEY,
        load,
        list,
        get,
        save,
        remove,
        duplicate,
        buildSkill,
        getBuffCatalog,
        getBuffType,
        resolveBuffFormat,
        getValueUnit
    };

    global.ManualCustomSkills = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
