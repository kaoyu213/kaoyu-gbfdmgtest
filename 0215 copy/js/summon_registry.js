// ==========================================
//  GBF 模拟器 - 召唤石注册表 / 技能引用解析
// ==========================================
(function (global) {
    'use strict';

    const summonsById = new Map();

    function cloneJson(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function load(summons) {
        summonsById.clear();
        (Array.isArray(summons) ? summons : []).forEach((summon) => {
            if (!summon || summon.id == null || String(summon.id).trim() === '') return;
            summonsById.set(String(summon.id), summon);
        });
        return api;
    }

    function get(id) {
        if (id == null) return null;
        return summonsById.get(String(id)) || null;
    }

    function getSlotRole(slotIndex) {
        const slot = Number(slotIndex);
        if (slot === 0) return 'main';
        if (slot === 1) return 'friend';
        return 'sub';
    }

    function getSelectedLevel(summon) {
        if (!summon) return 0;
        const selected = Number(summon.selectedLevel);
        if (Number.isFinite(selected) && selected > 0) return selected;
        const levels = Array.isArray(summon.availableLevels)
            ? summon.availableLevels.map(Number).filter(Number.isFinite)
            : [];
        if (levels.length > 0) return Math.max(...levels);
        return Math.max(0, Number(summon.maxLevel) || 0);
    }

    function getLevelData(summon, branchName, selectedLevel) {
        const branch = summon && summon.effects && summon.effects[branchName];
        if (!branch || typeof branch !== 'object') return null;
        const targetLevel = Number(selectedLevel) || getSelectedLevel(summon);
        const levels = Object.keys(branch)
            .map(Number)
            .filter(Number.isFinite)
            .sort((a, b) => a - b);
        let matched = null;
        levels.forEach((level) => {
            if (level <= targetLevel) matched = branch[level];
        });
        return matched || null;
    }

    function normalizeRefs(value) {
        if (Array.isArray(value)) return value.map(String).filter(Boolean);
        if (typeof value === 'string' && value.trim()) return [value.trim()];
        return [];
    }

    function normalizeEffectValue(value) {
        if (typeof value === 'string') {
            const text = value.trim();
            if (text.endsWith('%')) return (Number.parseFloat(text.slice(0, -1)) || 0) / 100;
            return Number.parseFloat(text) || 0;
        }
        return Number(value) || 0;
    }

    function normalizeLegacyStatKey(key) {
        const aliases = {
            element_optiums: 'summon_optimus',
            element_optimus: 'summon_optimus',
            element_magna: 'summon_magna',
            summon_damage_cap: 'summon_dmg_cap'
        };
        const normalized = String(key || '').trim();
        return aliases[normalized] || normalized;
    }

    function parseLegacyBuildEffects(effectText) {
        return String(effectText || '').split(';').map((part) => {
            const separator = part.indexOf(':');
            if (separator < 0) return null;
            const statKey = normalizeLegacyStatKey(part.slice(0, separator));
            const value = normalizeEffectValue(part.slice(separator + 1));
            if (!statKey || !Number.isFinite(value) || value === 0) return null;
            return { stat_key: statKey, value };
        }).filter(Boolean);
    }

    function getBuildEffectEntries(summon, slotIndex) {
        if (!summon) return [];
        const role = getSlotRole(slotIndex);
        const levelData = getLevelData(summon, role, getSelectedLevel(summon));
        if (!levelData) return [];
        const structured = Array.isArray(levelData.stats) ? levelData.stats : [];
        const definitions = structured.length > 0
            ? structured
            : parseLegacyBuildEffects(levelData.effect);
        return definitions.map((definition, index) => {
            const value = normalizeEffectValue(definition.value);
            const statKey = normalizeLegacyStatKey(definition.stat_key || definition.key);
            if (!statKey || !Number.isFinite(value) || value === 0) return null;
            return {
                stat_key: statKey,
                prop: definition.prop || null,
                zone: definition.zone || 'summon',
                value,
                target: definition.target || 'ally_all',
                sourceId: `summon:${summon.id || slotIndex}:${role}:${statKey}:${index}`,
                summonId: summon.id || null,
                summonSlot: Number(slotIndex),
                role
            };
        }).filter(Boolean);
    }

    function collectBuildEffects(equippedSummons) {
        const entries = [];
        const uniqueIds = { main: new Set(), friend: new Set(), sub: new Set() };
        (Array.isArray(equippedSummons) ? equippedSummons : []).forEach((summon, summonSlot) => {
            if (!summon) return;
            const role = getSlotRole(summonSlot);
            const unique = role === 'main' ? summon.mainonly : role === 'friend' ? summon.friendonly : summon.subonly;
            const summonId = String(summon.id || '');
            if (unique === true && uniqueIds[role].has(summonId)) return;
            if (unique === true) uniqueIds[role].add(summonId);
            entries.push(...getBuildEffectEntries(summon, summonSlot));
        });
        return entries;
    }

    function isRoleAllowed(allowed, slotIndex, fallbackRoles) {
        const values = Array.isArray(allowed) && allowed.length > 0 ? allowed : fallbackRoles;
        const role = getSlotRole(slotIndex);
        return values.some((value) => (
            Number.isInteger(Number(value)) && Number(value) === Number(slotIndex)
        ) || String(value) === role);
    }

    function getCallSkillRef(summon, slotIndex) {
        if (!summon || !isRoleAllowed(summon.callable_slots, slotIndex, ['main', 'friend', 'sub'])) return null;
        const roleData = getLevelData(summon, getSlotRole(slotIndex), getSelectedLevel(summon));
        const refs = normalizeRefs(
            (roleData && (roleData.call_skill_ref || roleData.active_skill_ref))
            || summon.call_skill_ref
            || (summon.skill_refs && (summon.skill_refs.call || summon.skill_refs.active))
        );
        return refs[0] || null;
    }

    function getSubPassiveRefs(summon, slotIndex) {
        if (!summon || !isRoleAllowed(summon.passive_slots, slotIndex, ['sub'])) return [];
        const roleData = getLevelData(summon, getSlotRole(slotIndex), getSelectedLevel(summon));
        return normalizeRefs(
            (roleData && (roleData.passive_skill_refs || roleData.sub_passive_refs))
            || summon.sub_passive_refs
            || (summon.skill_refs && (summon.skill_refs.passive || summon.skill_refs.sub_passive))
        );
    }

    function resolveSkill(ref, skillRegistry) {
        if (!ref || !skillRegistry || typeof skillRegistry.get !== 'function') return null;
        return skillRegistry.get(ref);
    }

    function collectActiveSkills(equippedSummons, skillRegistry) {
        const entries = [];
        (Array.isArray(equippedSummons) ? equippedSummons : []).forEach((summon, summonSlot) => {
            if (!summon) return;
            const ref = getCallSkillRef(summon, summonSlot);
            const skill = resolveSkill(ref, skillRegistry);
            if (!skill || String(skill.kind || 'active').toLowerCase() === 'passive') return;
            const runtimeSkillId = `summon_slot_${summonSlot}_${skill.id || ref}`;
            const runtimeSkill = cloneJson(skill);
            runtimeSkill.runtime_source_skill_id = skill.id || ref;
            runtimeSkill.runtime_summon_slot = summonSlot;
            runtimeSkill.typeLabel = getSlotRole(summonSlot) === 'main'
                ? '主召'
                : getSlotRole(summonSlot) === 'friend'
                    ? '友召'
                    : `副召 ${summonSlot - 1}`;
            entries.push({
                summon,
                summonSlot,
                ownerSlot: 0,
                source: 'summon',
                skillId: runtimeSkillId,
                sourceSkillId: skill.id || ref,
                skill: runtimeSkill
            });
        });
        return entries;
    }

    function collectPassiveSkills(equippedSummons, skillRegistry) {
        const entries = [];
        const uniqueRefs = new Set();
        (Array.isArray(equippedSummons) ? equippedSummons : []).forEach((summon, summonSlot) => {
            if (!summon) return;
            getSubPassiveRefs(summon, summonSlot).forEach((ref) => {
                const uniqueKey = `${summon.id || ''}|${ref}`;
                if (summon.subonly === true && uniqueRefs.has(uniqueKey)) return;
                if (summon.subonly === true) uniqueRefs.add(uniqueKey);
                const skill = resolveSkill(ref, skillRegistry);
                if (!skill || String(skill.kind || '').toLowerCase() !== 'passive') return;
                entries.push({
                    summon,
                    summonSlot,
                    ownerSlot: 0,
                    source: 'summon_passive',
                    skillId: skill.id || ref,
                    skill
                });
            });
        });
        return entries;
    }

    const api = {
        load,
        get,
        getSlotRole,
        getSelectedLevel,
        getLevelData,
        getBuildEffectEntries,
        collectBuildEffects,
        getCallSkillRef,
        getSubPassiveRefs,
        collectActiveSkills,
        collectPassiveSkills
    };

    global.SummonRegistry = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
