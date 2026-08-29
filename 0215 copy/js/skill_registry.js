// ==========================================
//  GBF 模拟器 - 角色 / 主角技能注册表
// ==========================================
(function (global) {
    'use strict';

    const skillsById = new Map();
    const skillsByOwner = new Map();
    const legacyAliases = new Map();

    function normalizeOwnerType(skill) {
        if (skill && skill.owner_type) return String(skill.owner_type);
        if (skill && skill.character_id != null) return 'character';
        return 'unassigned';
    }

    function normalizeOwnerId(skill) {
        if (skill && skill.owner_id != null) return String(skill.owner_id);
        if (skill && skill.character_id != null) return String(skill.character_id);
        return '';
    }

    function ownerKey(ownerType, ownerId) {
        return `${String(ownerType || 'unassigned')}::${String(ownerId == null ? '' : ownerId)}`;
    }

    function load(skills) {
        skillsById.clear();
        skillsByOwner.clear();
        legacyAliases.clear();

        (Array.isArray(skills) ? skills : []).forEach((skill) => {
            if (!skill || skill.id == null || String(skill.id).trim() === '') return;
            const id = String(skill.id);
            if (skillsById.has(id)) {
                console.warn(`[SkillRegistry] 重复技能 id，后一个定义覆盖前一个：${id}`);
            }
            skillsById.set(id, skill);

            const key = ownerKey(normalizeOwnerType(skill), normalizeOwnerId(skill));
            if (!skillsByOwner.has(key)) skillsByOwner.set(key, []);
            skillsByOwner.get(key).push(skill);

            if (skill.character_id != null && skill.slot != null) {
                legacyAliases.set(`${skill.character_id}_${skill.slot}`, id);
            }
        });
        return api;
    }

    function get(id) {
        if (id == null) return null;
        const key = String(id);
        const canonicalId = legacyAliases.get(key) || key;
        return skillsById.get(canonicalId) || null;
    }

    function getMany(ids) {
        return (Array.isArray(ids) ? ids : []).map(get).filter(Boolean);
    }

    function getByOwner(ownerType, ownerId, options) {
        const opts = options || {};
        return (skillsByOwner.get(ownerKey(ownerType, ownerId)) || []).filter((skill) => {
            if (opts.kind && String(skill.kind || 'active') !== String(opts.kind)) return false;
            return true;
        });
    }

    function resolveRefs(refs) {
        if (!refs) return [];
        if (Array.isArray(refs)) return getMany(refs);
        if (typeof refs === 'string') return getMany([refs]);
        return [];
    }

    function getLegacyMap() {
        const out = {};
        skillsById.forEach((skill, id) => { out[id] = skill; });
        legacyAliases.forEach((id, alias) => { out[alias] = skillsById.get(id); });
        return out;
    }

    const api = {
        load,
        get,
        getMany,
        getByOwner,
        resolveRefs,
        getLegacyMap
    };

    global.SkillRegistry = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
