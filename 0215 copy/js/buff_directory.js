// ==========================================
//  GBF 模拟器 - Buff 目录模块
//  列出 constants.js / buff_zones.js 已注册的全部小 Buff 类型。
//  icon 相对 images/；暂时留空，后续可直接在对应条目中填写。
//  数值计算和共存规则仍分别以 constants.js / buff_zones.js 为准。
// ==========================================

const BUFF_DIRECTORY = {
  // ========== 攻刃类 ==========
  normal_atk:      { label: '普刃',               icon: '', hasSubtype: false },
  omega_atk:       { label: 'M攻刃',              icon: '', hasSubtype: false },
  ex_atk:          { label: 'EX攻刃',             icon: '', hasSubtype: false },
  odious_atk:      { label: 'OD攻刃',             icon: '', hasSubtype: false },
  stamina:         { label: '浑身',               icon: '', hasSubtype: false },
  stamina_omega:   { label: 'M浑身',              icon: '', hasSubtype: false },
  enmity:          { label: '背水',               icon: '', hasSubtype: false },
  enmity_omega:    { label: 'M背水',              icon: '', hasSubtype: false },
  element_atk:     { label: '属性攻击',           icon: '', hasSubtype: false },
  perpetuity_atk:  { label: '独立攻刃【久远乘区】', icon: '', hasSubtype: false },
  indep_cumulative_atk: { label: '独立攻刃【累积】', icon: '', hasSubtype: false },
  indep_unjudged_atk: { label: '独立攻刃【未判定】', icon: '', hasSubtype: false },
  indep_special_enmity_atk: { label: '独立攻刃【特殊背水】', icon: '', hasSubtype: false },

  // ========== 予伤 ==========
  dmg_supp:        { label: '全伤害上升',         icon: 'buff icon/dmg_supp.png', hasSubtype: false },
  na_dmg_supp:     { label: '平A伤害上升',        icon: '', hasSubtype: false },
  skill_dmg_supp:  { label: '技伤伤害上升',       icon: '', hasSubtype: false },
  ca_dmg_supp:     { label: '奥义伤害上升',       icon: '', hasSubtype: false },
  dmg_to_elemental_amp: { label: '对克制伤害增幅', icon: '', hasSubtype: false },
  anti_element_reduce: { label: '受克制伤害减轻', icon: '', hasSubtype: false },

  // ========== DA/TA ==========
  da_rate:         { label: 'DA率',               icon: '', hasSubtype: false },
  ta_rate:         { label: 'ta',                 icon: 'buff icon/ta.png', hasSubtype: false },

  // ========== 追伤（有 subtype） ==========
  bonus_na: {
    label: '平A追伤',
    icon: 'buff icon/bonus_na_dmg.png', hasSubtype: true,
    subtypes: ['fire', 'water', 'earth', 'wind', 'light', 'dark', 'destruction', 'own_element', 'advantage']
  },
  bonus_ca: {
    label: '奥义追伤',
    icon: '', hasSubtype: true,
    subtypes: ['fire', 'water', 'earth', 'wind', 'light', 'dark', 'destruction', 'own_element', 'advantage']
  },
  bonus_skill: {
    label: '技能追伤',
    icon: '', hasSubtype: true,
    subtypes: ['fire', 'water', 'earth', 'wind', 'light', 'dark', 'destruction', 'own_element', 'advantage']
  },

  // ========== 伤害上限 ==========
  dmg_cap:         { label: '全上限',             icon: '', hasSubtype: false },
  dmg_cap_relaxation: { label: 'D上限缓和',       icon: '', hasSubtype: false },
  na_dmg_cap:      { label: '平A上限',            icon: '', hasSubtype: false },
  skill_dmg_cap:   { label: '技伤上限',           icon: '', hasSubtype: false },
  ca_dmg_cap:      { label: '奥义上限',           icon: '', hasSubtype: false },

  // ========== 伤害增幅 ==========
  dmg_amp:         { label: '全伤害增幅',         icon: '', hasSubtype: false },
  na_dmg_amp:      { label: '平A伤害增幅',        icon: '', hasSubtype: false },
  skill_dmg_amp:   { label: '技伤伤害增幅',       icon: '', hasSubtype: false },
  ca_dmg_amp:      { label: '奥义伤害增幅',       icon: '', hasSubtype: false },

  // ========== 其他 ==========
  double_strike:   { label: '再攻击',             icon: 'buff icon/double_strike.png', hasSubtype: false },
  triple_strike:   { label: '三回攻击',           icon: '', hasSubtype: false },
  critical_hit:    { label: '暴击率',             icon: '', hasSubtype: false },
  def_ignore:      { label: '无视防御',           icon: '', hasSubtype: false },
  dmg_reduce:      { label: '伤害减轻',           icon: '', hasSubtype: false },
  heal_cap:        { label: '回复上限',           icon: '', hasSubtype: false },
  charge_gain:     { label: '奥义值上升量',       icon: '', hasSubtype: false },
  debuff_success:  { label: '弱体成功率',         icon: '', hasSubtype: false },
  debuff_resist:   { label: '弱体耐性',           icon: '', hasSubtype: false },
  dodge_rate:      { label: '回避率',             icon: '', hasSubtype: false },
  hostility:       { label: '敌对心',             icon: '', hasSubtype: false },
  counter_rate:    { label: '反击发生率',         icon: '', hasSubtype: false },
  counter_dmg:     { label: '反击伤害',           icon: '', hasSubtype: false },
  counter_dmg_supp:{ label: '反击伤害上升',       icon: '', hasSubtype: false },
  skill_dmg:       { label: '技能伤害',           icon: '', hasSubtype: false },
  ca_dmg:          { label: '奥义伤害',           icon: '', hasSubtype: false },
  cb_dmg:          { label: '奥义连锁伤害',       icon: '', hasSubtype: false },
  cb_dmg_cap:      { label: '奥义连锁上限',       icon: '', hasSubtype: false },
  cb_dmg_amp:      { label: '奥义连锁增幅',       icon: '', hasSubtype: false },
  cb_dmg_supp:     { label: '奥义连锁伤害上升',   icon: '', hasSubtype: false },
  fc_dmg_cap:      { label: '致命连锁上限',       icon: '', hasSubtype: false },
  fc_dmg_amp:      { label: '致命连锁增幅',       icon: '', hasSubtype: false },
  ca_special_dmg_cap: { label: '奥义特殊上限',    icon: '', hasSubtype: false },
  critical_dmg_amp:{ label: '暴击时伤害增幅',     icon: '', hasSubtype: false },
  critical_dmg_cap:{ label: '暴击时上限',         icon: '', hasSubtype: false },
  normal_dmg_amp:  { label: '通常伤害增幅',       icon: '', hasSubtype: false },
  taken_dmg_amp:   { label: '承受伤害增幅',       icon: '', hasSubtype: false },
  na_ranshu:       { label: '平A乱击段数',        icon: '', hasSubtype: false },
  dmg_to_non_elemental_amp: { label: '对无属性伤害增幅', icon: '', hasSubtype: false },
  skill_hit_rate:  { label: '技能命中率',         icon: '', hasSubtype: false },
  hp_cut:          { label: 'HP减少',             icon: '', hasSubtype: false },
  hp_dmg:          { label: '开局HP减少',         icon: '', hasSubtype: false },
  turn_dmg:        { label: '每回合HP减少',       icon: '', hasSubtype: false },
  heal_mod:        { label: '回复力',             icon: '', hasSubtype: false },
  def_down:        { label: '防御下降',           icon: '', hasSubtype: false },
  element_reduce:  { label: '属性伤害减轻',       icon: '', hasSubtype: false },
  dodge_all:       { label: '全回避发生率',       icon: '', hasSubtype: false },
  turn_dmg_reduce: { label: '回合类伤害减轻',     icon: '', hasSubtype: false },
  optimus_boost:   { label: '神石加护',           icon: '', hasSubtype: false },
  omega_boost:     { label: '方阵加护',           icon: '', hasSubtype: false },
  indep_special_atk: { label: '独立攻刃【特殊】', icon: '', hasSubtype: false },
  base_atk:        { label: '额外攻击力白值',     icon: '', hasSubtype: false },
  base_hp:         { label: '额外HP白值',         icon: '', hasSubtype: false },
  exp_gain:        { label: '经验加成',           icon: '', hasSubtype: false },
  rupie_gain:      { label: '卢布获取量加成',     icon: '', hasSubtype: false },
  hp_mod:          { label: 'HP加成',             icon: '', hasSubtype: false },
  
  
  
  
   // ========== 防御 ==========
  def_mod:         { label: '防御力',                 icon: '', hasSubtype: false },
  dmg_taken_lowered:         { label: '承受伤害减少固定值',  icon: 'status_7343.png', hasSubtype: false },
  lowering_dmg_taken:         { label: '格挡',                 icon: 'status_6083.png', hasSubtype: false },
  element_dmg_cut:         { label: '属性伤害减免',       icon: '', hasSubtype: ['fire', 'water', 'earth', 'wind', 'light', 'dark'] },
  element_dmg_lowered:         { label: '属性伤害减轻',                 icon: 'status_1420.png', hasSubtype: ['fire', 'water', 'earth', 'wind', 'light', 'dark']}
};

/**
 * 解析 prop 字符串，提取 buff_type 和 subtype
 * - 无 subtype 的 prop（如 "normal_atk", "dmg_supp"）→ { buffType: "normal_atk", subtype: null }
 * - 有 subtype 的 prop（如 "bonus_na_dark"）→ 查 BUFF_DIRECTORY.bonus_na.subtypes，
 *   若 "dark" 在列表中 → { buffType: "bonus_na", subtype: "dark" }
 *   若不在列表中 → { buffType: "bonus_na_dark", subtype: null }（兜底）
 */
function parseBuffProp(prop) {
  if (!prop || typeof prop !== 'string') return { buffType: null, subtype: null };

  // 先尝试精确匹配（如 "dmg_supp"）
  if (BUFF_DIRECTORY[prop] && !BUFF_DIRECTORY[prop].hasSubtype) {
    return { buffType: prop, subtype: null };
  }

  // 对于 hasSubtype 的 prop，尝试按最后一段分割
  // 例如 "bonus_na_dark" → 看 BUFF_DIRECTORY["bonus_na"] 的 subtypes 是否包含 "dark"
  for (const prefix in BUFF_DIRECTORY) {
    const entry = BUFF_DIRECTORY[prefix];
    if (!entry || !entry.hasSubtype || !Array.isArray(entry.subtypes)) continue;
    const head = prefix + '_';
    if (prop.indexOf(head) !== 0) continue;
    const suffix = prop.slice(head.length);
    if (entry.subtypes.includes(suffix)) {
      return { buffType: prefix, subtype: suffix };
    }
  }

  // 兜底：整个 prop 作为 buff_type，无 subtype
  return { buffType: prop, subtype: null };
}

/**
 * 根据 buffType 和可选的 subtype 构建完整的 prop 名
 */
function buildBuffProp(buffType, subtype) {
  if (!buffType) return '';
  if (!subtype) return buffType;
  return `${buffType}_${subtype}`;
}

function getBuffElementLabel(subtype) {
  const map = {
    fire: '火',
    water: '水',
    earth: '土',
    wind: '风',
    light: '光',
    dark: '暗',
    destruction: '破坏',
    own_element: '自属性',
    advantage: '有利'
  };
  return map[subtype] || subtype || '';
}

function findStatConfigForBuffDisplay(prop, zone) {
  if (typeof STAT_CONFIG === 'undefined' || !Array.isArray(STAT_CONFIG)) return null;
  const parsed = parseBuffProp(prop);
  const z = zone == null ? '' : String(zone);
  return STAT_CONFIG.find((cfg) => {
    if (!cfg || !cfg.prop) return false;
    if (z && cfg.zone && String(cfg.zone) !== z) return false;
    if (cfg.prop === prop) return true;
    return parsed.buffType && cfg.prop === parsed.buffType;
  }) || null;
}

function getBuffDisplayMeta(prop, zone, entry) {
  const p = prop == null ? '' : String(prop).trim();
  const z = zone == null ? '' : String(zone).trim();
  const parsed = parseBuffProp(p);
  const buffType = parsed.buffType || p;
  const subtype = parsed.subtype || null;
  const statCfg = findStatConfigForBuffDisplay(p, z);
  const dirCfg = BUFF_DIRECTORY[buffType] || null;
  const zoneCfg = (typeof BUFF_TYPE_ZONE_RULES !== 'undefined' && BUFF_TYPE_ZONE_RULES[buffType])
    ? BUFF_TYPE_ZONE_RULES[buffType]
    : null;

  let label = '';
  if (buffType === 'bonus_na') {
    label = `${getBuffElementLabel(subtype)}属性追击`;
  } else if (buffType === 'bonus_ca') {
    label = `${getBuffElementLabel(subtype)}奥义追击`;
  } else if (buffType === 'bonus_skill') {
    label = `${getBuffElementLabel(subtype)}技能追击`;
  } else {
    label = (dirCfg && dirCfg.label) || (zoneCfg && zoneCfg.label) || (statCfg && statCfg.label) || p;
  }

  if (entry && entry.label && !label) label = String(entry.label);

  return {
    label,
    icon: (entry && entry.icon) || (dirCfg && dirCfg.icon) || '',
    format: (entry && entry.format) || (dirCfg && dirCfg.format) || (statCfg && statCfg.format) || 'percent',
    buffType,
    subtype,
    zone: z
  };
}

/**
 * 小 Buff UI 信息统一入口。
 * 旧 buff_icons.json 精确配置优先，未配置时回退到 BUFF_DIRECTORY。
 */
function getBuffIconMeta(prop, zone) {
  const p = prop == null ? '' : String(prop).trim();
  const parsed = parseBuffProp(p);
  const buffType = parsed.buffType || p;
  const legacyMap = typeof globalBuffIconsMap !== 'undefined' && globalBuffIconsMap
    ? globalBuffIconsMap
    : {};
  const legacy = legacyMap[p] || legacyMap[buffType] || null;
  const display = getBuffDisplayMeta(p, zone, null);
  const label = (legacy && legacy.title) || display.label || p;
  return {
    icon: (legacy && legacy.icon) || display.icon || '',
    title: label,
    abbrev: (legacy && legacy.abbrev) || label.slice(0, 3)
  };
}

/**
 * 检查目录是否覆盖 buff_zones 和 constants 中的可结算 prop。
 * special 是基础攻击/HP等内部占位，不属于 BuffRegistry，因此不要求登记。
 */
function validateBuffDirectoryCoverage() {
  const missingZoneTypes = [];
  const missingConstantProps = [];

  if (typeof BUFF_TYPE_ZONE_RULES !== 'undefined') {
    Object.keys(BUFF_TYPE_ZONE_RULES).forEach((buffType) => {
      if (!BUFF_DIRECTORY[buffType]) missingZoneTypes.push(buffType);
    });
  }

  if (typeof STAT_CONFIG !== 'undefined' && Array.isArray(STAT_CONFIG)) {
    const seen = new Set();
    STAT_CONFIG.forEach((cfg) => {
      const prop = cfg && cfg.prop ? String(cfg.prop).trim() : '';
      if (!prop || prop === 'special' || seen.has(prop)) return;
      seen.add(prop);
      const parsed = parseBuffProp(prop);
      if (!parsed.buffType || !BUFF_DIRECTORY[parsed.buffType]) {
        missingConstantProps.push(prop);
      }
    });
  }

  if (missingZoneTypes.length || missingConstantProps.length) {
    console.warn('[BuffDirectory] 目录覆盖不完整', {
      missingZoneTypes,
      missingConstantProps
    });
  }

  return {
    valid: missingZoneTypes.length === 0 && missingConstantProps.length === 0,
    missingZoneTypes,
    missingConstantProps
  };
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BUFF_DIRECTORY,
    parseBuffProp,
    buildBuffProp,
    getBuffElementLabel,
    getBuffDisplayMeta,
    getBuffIconMeta,
    validateBuffDirectoryCoverage
  };
}
