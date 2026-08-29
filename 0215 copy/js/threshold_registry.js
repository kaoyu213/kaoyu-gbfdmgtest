// ==========================================
//  GBF 模拟器 - 阈值表注册表 (Threshold Registry)
// ==========================================
//
// 加载 threshold_tables.json，提供按 type/displayCap/tableId 查找阈值表的能力。
// 匹配优先级：
//   1. tableId 精确匹配
//   2. type + displayCap 匹配（按基础上限找表，倍率不参与匹配）
//   3. type 默认表（isDefault: true）
//

(function () {
    'use strict';

    var THRESHOLD_DATA = null;
    var LOADED = false;
    var LOAD_PROMISE = null;

    function validateStages(name, stages) {
        if (!Array.isArray(stages) || stages.length === 0) {
            throw new Error(name + '.stages 不能为空');
        }
        var previousLimit = 0;
        stages.forEach(function (stage, index) {
            if (!stage || !Number.isFinite(stage.slope) || stage.slope < 0 || stage.slope > 1) {
                throw new Error(name + ' 第 ' + (index + 1) + ' 段 slope 必须在 0~1 之间');
            }
            if (stage.limit === null) {
                if (index !== stages.length - 1) {
                    throw new Error(name + ' 只能在末段使用 limit:null');
                }
                return;
            }
            if (!Number.isFinite(stage.limit) || stage.limit <= previousLimit) {
                throw new Error(name + ' 第 ' + (index + 1) + ' 段 limit 必须严格递增');
            }
            previousLimit = stage.limit;
        });
        if (stages[stages.length - 1].limit !== null) {
            throw new Error(name + ' 末段必须使用 limit:null 表示无穷大');
        }
    }

    function validateThresholdData(data) {
        if (!data || !data.tables || Object.keys(data.tables).length === 0) {
            throw new Error('tables 不能为空');
        }
        var damageLimitTypes = {};
        Object.keys(data.tables).forEach(function (id) {
            var entry = data.tables[id];
            validateStages('tables.' + id, entry.stages);
            if (entry.type === 'skill') {
                if (!Object.prototype.hasOwnProperty.call(entry, 'damage_limit_type')) {
                    throw new Error('tables.' + id + ' 缺少 damage_limit_type 字段');
                }
                if (typeof entry.damage_limit_type !== 'string') {
                    throw new Error('tables.' + id + '.damage_limit_type 必须是字符串');
                }
                if (entry.damage_limit_type) {
                    if (damageLimitTypes[entry.damage_limit_type]) {
                        throw new Error('damage_limit_type ' + entry.damage_limit_type + ' 同时被 ' + damageLimitTypes[entry.damage_limit_type] + ' 和 ' + id + ' 使用');
                    }
                    damageLimitTypes[entry.damage_limit_type] = id;
                }
            }
        });
        Object.keys(data.worldCap || {}).forEach(function (mode) {
            validateStages('worldCap.' + mode, data.worldCap[mode]);
        });
        if (!data.fallbackTableId || !data.tables[data.fallbackTableId]) {
            throw new Error('fallbackTableId 必须指向 tables 中存在的表');
        }
        (data.testPresets || []).forEach(function (preset) {
            var hasTable = Boolean(preset.tableId);
            var hasWorldCap = Boolean(preset.worldCapMode);
            if (!preset.id || hasTable === hasWorldCap) {
                throw new Error('testPresets 每项必须有 id，且只引用 tableId/worldCapMode 中的一种');
            }
            if (hasTable && !data.tables[preset.tableId]) {
                throw new Error('testPresets.' + preset.id + ' 引用了不存在的 tableId');
            }
            if (hasWorldCap && !(data.worldCap || {})[preset.worldCapMode]) {
                throw new Error('testPresets.' + preset.id + ' 引用了不存在的 worldCapMode');
            }
        });
        Object.keys(data.customEditorExample || {}).forEach(function (name) {
            validateStages('customEditorExample.' + name, data.customEditorExample[name]);
        });
        return data;
    }

    /**
     * 从 threshold_tables.json 加载数据
     * @returns {Promise}
     */
    function loadThresholdData() {
        if (LOAD_PROMISE) return LOAD_PROMISE;

        LOAD_PROMISE = fetch('js/threshold_tables.json', { cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) throw new Error('Failed to load threshold_tables.json: ' + res.status);
                return res.json();
            })
            .then(function (data) {
                validateThresholdData(data);
                THRESHOLD_DATA = data;
                LOADED = true;
                console.log('[ThresholdRegistry] Loaded OK, tables:', Object.keys(data.tables || {}).length, 'worldCap modes:', Object.keys(data.worldCap || {}).length);
                return data;
            })
            .catch(function (err) {
                // 加载失败直接报错，让问题暴露出来，而不是静默使用旧数据
                console.error('[ThresholdRegistry] Load failed:', err);
                THRESHOLD_DATA = { tables: {}, worldCap: {} };
                LOADED = true;
                return THRESHOLD_DATA;
            });

        return LOAD_PROMISE;
    }

    /**
     * 确保数据已加载（同步检查，调用前应确保已 await loadThresholdData()）
     */
    function ensureData() {
        if (!THRESHOLD_DATA) {
            console.warn('[ThresholdRegistry] Data not loaded yet, returning empty.');
            THRESHOLD_DATA = { tables: {}, worldCap: {} };
            LOADED = true;
        }
        return THRESHOLD_DATA;
    }

    /**
     * 按 tableId 精确查找
     * @param {string} tableId - 如 "ca_230.5"
     * @returns {object|null} { stages, ...  }
     */
    function getById(tableId) {
        var data = ensureData();
        if (!tableId) return null;
        var entry = data.tables[tableId];
        return entry ? normalizeEntry(entry, tableId) : null;
    }

    /**
     * 按 type + displayCap 查找匹配的表（倍率不参与匹配）
     * @param {string} type - 'na' | 'ca' | 'skill' | 'cb'
     * @param {number} displayCap - 基础上限（单位：万）
     * @returns {object|null}
     */
    function getByDisplayCap(type, displayCap) {
        var data = ensureData();
        var tables = data.tables;
        var best = null;

        Object.keys(tables).forEach(function (id) {
            var entry = tables[id];
            if (entry.type !== type) return;
            if (entry.displayCap == null) return;
            if (Math.abs(entry.displayCap - displayCap) < 1e-4) {
                best = normalizeEntry(entry, id);
            }
        });

        return best || null;
    }

    /**
     * 获取某一类型的默认表
     * @param {string} type - 'na' | 'ca' | 'skill' | 'cb'
     * @returns {object|null}
     */
    function getDefault(type) {
        var data = ensureData();
        var tables = data.tables;

        // 优先找 isDefault && type 匹配
        var best = null;
        Object.keys(tables).forEach(function (id) {
            var entry = tables[id];
            if (entry.type !== type) return;
            if (entry.isDefault) {
                best = normalizeEntry(entry, id);
            }
        });

        // 如果没有标记 isDefault 的，返回该 type 第一张表
        if (!best) {
            Object.keys(tables).some(function (id) {
                var entry = tables[id];
                if (entry.type === type) {
                    best = normalizeEntry(entry, id);
                    return true;
                }
                return false;
            });
        }

        return best || null;
    }

    /**
     * 列出某一伤害类型的所有衰减表，供技能编辑器下拉框使用。
     */
    function getAll(type) {
        var data = ensureData();
        var requestedType = type == null ? '' : String(type);
        return Object.keys(data.tables || {})
            .filter(function (id) {
                return !requestedType || data.tables[id].type === requestedType;
            })
            .map(function (id) { return normalizeEntry(data.tables[id], id); })
            .sort(function (left, right) {
                var leftCap = Number(left.displayCap);
                var rightCap = Number(right.displayCap);
                if (Number.isFinite(leftCap) && Number.isFinite(rightCap) && leftCap !== rightCap) {
                    return leftCap - rightCap;
                }
                return String(left.tableId).localeCompare(String(right.tableId));
            });
    }

    /**
     * 获取配置文件指定的全局兜底表。
     */
    function getFallback() {
        var data = ensureData();
        return getById(data.fallbackTableId) || getDefault('na') || null;
    }

    /**
     * 统一解析入口：type + displayCap + tableId
     * 优先级：tableId 精确 > type+displayCap > type 默认
     * @param {string} type
     * @param {number} displayCap - 基础上限（单位：万）
     * @param {string} tableId
     * @returns {object} { tableId, stages, entry }
     */
    function resolve(type, displayCap, tableId) {
        // 1. 精确 tableId
        if (tableId) {
            var exact = getById(tableId);
            if (exact) return exact;
        }

        // 2. type + displayCap
        if (displayCap != null && Number.isFinite(Number(displayCap))) {
            var byCap = getByDisplayCap(type, Number(displayCap));
            if (byCap) return byCap;
        }

        // 3. type 默认
        var def = getDefault(type);
        if (def) return def;

        // 4. 最终兜底：na 的默认表
        console.warn('[ThresholdRegistry] No table found for type=' + type + ', using configured fallback');
        return getFallback();
    }

    /**
     * 获取世界衰减表
     * @param {string} mode - '660' | '1310'
     * @returns {Array|null}
     */
    function getWorldCap(mode) {
        var data = ensureData();
        var stages = data.worldCap && data.worldCap[String(mode)];
        if (!stages) return null;
        return normalizeStages(stages);
    }

    /**
     * 为独立衰减测试页解析预设项，预设只引用表 ID，不再复制阈值。
     */
    function getTestPresets() {
        var data = ensureData();
        return (data.testPresets || []).map(function (preset) {
            var stages = preset.tableId
                ? (getById(preset.tableId) || {}).stages
                : getWorldCap(preset.worldCapMode);
            return {
                id: preset.id,
                label: preset.label || preset.id,
                tableId: preset.tableId || null,
                worldCapMode: preset.worldCapMode || null,
                isDefault: preset.isDefault === true,
                stages: stages || []
            };
        });
    }

    /**
     * 返回自定义编辑器示例的可序列化副本。
     */
    function getCustomEditorExample() {
        var data = ensureData();
        return JSON.parse(JSON.stringify(data.customEditorExample || {}));
    }

    /**
     * 标准化表条目：展开 limit:null → Infinity
     */
    function normalizeEntry(entry, tableId) {
        return {
            tableId: tableId,
            type: entry.type,
            multiplier: entry.multiplier,
            damage_limit_type: entry.type === 'skill' ? entry.damage_limit_type : null,
            displayCap: entry.displayCap,
            label: entry.label || '',
            stages: normalizeStages(entry.stages || [])
        };
    }

    function normalizeStages(stages) {
        return stages.map(function (s) {
            return { limit: s.limit === null ? Infinity : s.limit, slope: s.slope };
        });
    }

    // 预加载（但允许同步兜底，保证旧代码不崩溃）
    loadThresholdData();

    // 导出到全局
    window.ThresholdRegistry = {
        loadThresholdData: loadThresholdData,
        getById: getById,
        getByDisplayCap: getByDisplayCap,
        getDefault: getDefault,
        getAll: getAll,
        getFallback: getFallback,
        resolve: resolve,
        getWorldCap: getWorldCap,
        getTestPresets: getTestPresets,
        getCustomEditorExample: getCustomEditorExample,
        validateThresholdData: validateThresholdData,
        _ensureData: ensureData
    };
})();
