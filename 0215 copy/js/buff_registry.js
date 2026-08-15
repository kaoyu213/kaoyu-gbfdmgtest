// ==========================================
//  GBF 模拟器 - Buff 注册器模块
//  三级存储：buffType → subtype → zone → [{ sourceId, value }]
//  聚合规则由 BUFF_TYPE_ZONE_RULES 驱动
// ==========================================

// Node.js 兼容：从依赖模块引入（浏览器中已是全局变量加载）
if (typeof module !== 'undefined' && module.exports) {
  try {
    const dir = require('./buff_directory.js');
    if (typeof parseBuffProp === 'undefined') globalThis.parseBuffProp = dir.parseBuffProp;
  } catch (e) { /* skip */ }
  try {
    const zones = require('./buff_zones.js');
    if (typeof BUFF_TYPE_ZONE_RULES === 'undefined') globalThis.BUFF_TYPE_ZONE_RULES = zones.BUFF_TYPE_ZONE_RULES;
    if (typeof getZoneRule === 'undefined') globalThis.getZoneRule = zones.getZoneRule;
    if (typeof getZoneCap === 'undefined') globalThis.getZoneCap = zones.getZoneCap;
  } catch (e) { /* skip */ }
}

class BuffRegistry {
  constructor() {
    // store[buffType][subtype][zone] = [{ sourceId, value }]
    // subtype 用字符串表示，null 表示无 subtype
    this.store = {};
  }

  /** 注册一条 buff 值
   * @param {string} buffType - 乘区类型，如 "normal_atk", "bonus_na"
   * @param {string|null} subtype - 子类型，如 "dark", "fire", null
   * @param {string} zone - 冲突分区，如 "weapon_grid", "A2", "chara_skill"
   * @param {string} sourceId - 来源标识（如 STAT_CONFIG.key 或 charabuff.id）
   * @param {number} value - 效果值
   */
  add(buffType, subtype, zone, sourceId, value) {
    if (buffType == null || zone == null) return;
    if (typeof value !== 'number' || isNaN(value)) return;
    if (value === 0) return; // 零值不注册，节省存储

    const stKey = subtype == null ? '__null__' : String(subtype);

    if (!this.store[buffType]) {
      this.store[buffType] = {};
    }
    if (!this.store[buffType][stKey]) {
      this.store[buffType][stKey] = {};
    }
    if (!this.store[buffType][stKey][zone]) {
      this.store[buffType][stKey][zone] = [];
    }

    this.store[buffType][stKey][zone].push({
      sourceId: String(sourceId || ''),
      value: value
    });
  }

  /** 便捷方法：通过 prop 字符串自动解析 buffType/subtype
   * @param {string} prop - 如 "bonus_na_dark", "dmg_supp"
   * @param {string} zone - 冲突分区
   * @param {string} sourceId
   * @param {number} value
   */
  addByProp(prop, zone, sourceId, value) {
    if (typeof parseBuffProp === 'function') {
      const { buffType, subtype } = parseBuffProp(prop);
      this.add(buffType, subtype, zone, sourceId, value);
    } else {
      // 兜底：整个 prop 作为 buffType
      this.add(prop, null, zone, sourceId, value);
    }
  }

  /** 清空所有注册 */
  clear() {
    this.store = {};
  }

  /** 获取某个 buffType 下某个 zone 内所有条目的列表
   * @returns {Array<{sourceId, value}>}
   */
  getEntries(buffType, subtype, zone) {
    const stKey = subtype == null ? '__null__' : String(subtype);
    const typeStore = this.store[buffType];
    if (!typeStore) return [];
    const subStore = typeStore[stKey];
    if (!subStore) return [];
    return subStore[zone] || [];
  }

  /**
   * 对某个 buff_type，按 zone 规则聚合所有 subtype，zone 间加算，返回最终值
   * @param {string} buffType
   * @returns {number} 最终统合值
   */
  getTotal(buffType) {
    const typeStore = this.store[buffType];
    const rules = (typeof BUFF_TYPE_ZONE_RULES !== 'undefined')
      ? BUFF_TYPE_ZONE_RULES[buffType]
      : null;

    if (!typeStore) return 0;

    // 收集该 buffType 下所有出现过的 zone（包括规则中定义的和实际注册的）
    const allZones = new Set();
    const ruleZones = rules ? Object.keys(rules.zones) : [];
    ruleZones.forEach(z => allZones.add(z));

    Object.values(typeStore).forEach(subStore => {
      Object.keys(subStore).forEach(z => allZones.add(z));
    });

    let total = 0;

    // 对每个 subtype 独立聚合
    for (const [stKey, subStore] of Object.entries(typeStore)) {
      const subtype = stKey === '__null__' ? null : stKey;
      let subtypeTotal = 0;

      for (const zone of allZones) {
        const entries = subStore[zone] || [];
        if (entries.length === 0) continue;

        // 获取该 zone 的裁决规则
        const rule = (typeof getZoneRule === 'function')
          ? getZoneRule(buffType, zone)
          : 'sum';

        let zoneValue = 0;
        switch (rule) {
          case 'max':
            zoneValue = Math.max(...entries.map(e => e.value));
            break;
          case 'override':
            // 最后注册者覆盖
            zoneValue = entries[entries.length - 1].value;
            break;
          case 'sum':
          default:
            zoneValue = entries.reduce((s, e) => s + e.value, 0);
            break;
        }

        // zone 级 cap
        const cap = (typeof getZoneCap === 'function')
          ? getZoneCap(buffType, zone)
          : null;
        if (cap !== null && zoneValue > cap) {
          zoneValue = cap;
        }

        subtypeTotal += zoneValue;
      }

      total += subtypeTotal;
    }

    return total;
  }

  /**
   * 返回所有已注册的 buff_type 列表
   */
  getRegisteredTypes() {
    return Object.keys(this.store);
  }

  /**
   * 获取某个 buff_type 的详细分解（用于 debug/UI 展示）
   * @returns {object} { subtypeKey: { zone: { entries, zoneValue, rule } } }
   */
  getDetail(buffType) {
    const typeStore = this.store[buffType];
    if (!typeStore) return {};

    const rules = (typeof BUFF_TYPE_ZONE_RULES !== 'undefined')
      ? BUFF_TYPE_ZONE_RULES[buffType]
      : null;

    const allZones = new Set();
    if (rules) Object.keys(rules.zones).forEach(z => allZones.add(z));
    Object.values(typeStore).forEach(subStore => {
      Object.keys(subStore).forEach(z => allZones.add(z));
    });

    const detail = {};

    for (const [stKey, subStore] of Object.entries(typeStore)) {
      const subtypeLabel = stKey === '__null__' ? '(无)' : stKey;
      detail[subtypeLabel] = {};

      for (const zone of allZones) {
        const entries = subStore[zone] || [];
        if (entries.length === 0) continue;

        const rule = (typeof getZoneRule === 'function')
          ? getZoneRule(buffType, zone)
          : 'sum';

        let zoneValue = 0;
        switch (rule) {
          case 'max':
            zoneValue = Math.max(...entries.map(e => e.value));
            break;
          case 'override':
            zoneValue = entries[entries.length - 1].value;
            break;
          default:
            zoneValue = entries.reduce((s, e) => s + e.value, 0);
            break;
        }

        const cap = (typeof getZoneCap === 'function')
          ? getZoneCap(buffType, zone)
          : null;
        const capped = (cap !== null && zoneValue > cap);

        detail[subtypeLabel][zone] = {
          entries: entries.slice(),
          zoneValue,
          cap: cap,
          capped,
          rule
        };
      }
    }

    return detail;
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BuffRegistry };
}