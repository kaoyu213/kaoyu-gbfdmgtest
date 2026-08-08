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

    /**
     * 从 threshold_tables.json 加载数据
     * @returns {Promise}
     */
    function loadThresholdData() {
        if (LOAD_PROMISE) return LOAD_PROMISE;

        LOAD_PROMISE = fetch('js/threshold_tables.json')
            .then(function (res) {
                if (!res.ok) throw new Error('Failed to load threshold_tables.json: ' + res.status);
                return res.json();
            })
            .then(function (data) {
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
        console.warn('[ThresholdRegistry] No table found for type=' + type + ', falling back to na default');
        return getDefault('na') || null;
    }

    /**
     * 获取世界衰减表
     * @param {string} mode - '660' | '1310'
     * @returns {Array|null}
     */
    function getWorldCap(mode) {
        var data = ensureData();
        var stages = data.worldCap && data.worldCap[mode];
        if (!stages) return null;
        // 直接返回 normalized stages（worldCap 无额外元数据）
        return stages.map(function (s) {
            return { limit: s.limit === null ? Infinity : s.limit, slope: s.slope };
        });
    }

    /**
     * 标准化表条目：展开 limit:null → Infinity
     */
    function normalizeEntry(entry, tableId) {
        return {
            tableId: tableId,
            type: entry.type,
            multiplier: entry.multiplier,
            displayCap: entry.displayCap,
            label: entry.label || '',
            stages: (entry.stages || []).map(function (s) {
                return { limit: s.limit === null ? Infinity : s.limit, slope: s.slope };
            })
        };
    }

    // 预加载（但允许同步兜底，保证旧代码不崩溃）
    loadThresholdData();

    // 导出到全局
    window.ThresholdRegistry = {
        loadThresholdData: loadThresholdData,
        getById: getById,
        getByDisplayCap: getByDisplayCap,
        getDefault: getDefault,
        resolve: resolve,
        getWorldCap: getWorldCap,
        _ensureData: ensureData
    };
})();