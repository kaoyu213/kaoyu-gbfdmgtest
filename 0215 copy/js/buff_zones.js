// ==========================================
//  GBF 模拟器 - Buff 分区规则模块
//  定义每个 buff_type 下各 zone 的冲突规则
// ==========================================

const BUFF_TYPE_ZONE_RULES = {
  // ==================== 攻刃类 ====================
  normal_atk: {
    label: '普刃',
    zones: {
      weapon_grid:  { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      summon:       { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  omega_atk: {
    label: 'M攻刃',
    zones: {
      weapon_grid:  { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      summon:       { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  ex_atk: {
    label: 'EX攻刃',
    zones: {
      weapon_grid:  { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  odious_atk: {
    label: 'OD攻刃',
    zones: {
      weapon_grid:  { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  stamina: {
    label: '浑身',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  stamina_omega: {
    label: 'M浑身',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  enmity: {
    label: '背水',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  enmity_omega: {
    label: 'M背水',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  element_atk: {
    label: '属性攻击',
    zones: {
      weapon_grid:  { rule: 'sum' },
      summon:       { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  perpetuity_atk: {
    label: '独立攻刃(久远)',
    zones: {
      charabonus:    { rule: 'sum' },
      chara_skill:   { rule: 'max' },
      independent:   { rule: 'sum' }
    }
  },

  // ==================== 予伤 ====================
  dmg_supp: {
    label: '全伤害上升',
    zones: {
      chara_skill:  { rule: 'max' },
      enemy_db:     { rule: 'sum' },
      weapon_grid:  { rule: 'sum' },
      summon:       { rule: 'sum' },
      earring:      { rule: 'sum' },
      artifacts:    { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  na_dmg_supp: {
    label: '平A伤害上升',
    zones: {
      weapon_grid:  { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  skill_dmg_supp: {
    label: '技伤伤害上升',
    zones: {
      weapon_grid:  { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  ca_dmg_supp: {
    label: '奥义伤害上升',
    zones: {
      weapon_grid:  { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  // ==================== DA/TA ====================
  da_rate: {
    label: 'DA率',
    zones: {
      weapon_grid:      { rule: 'sum', cap: 0.75 },
      charabonus:       { rule: 'sum' },
      chara_skill:      { rule: 'max' },
      chara_skill_must: { rule: 'override' },
      independent:      { rule: 'sum' }
    }
  },

  ta_rate: {
    label: 'TA率',
    zones: {
      weapon_grid:      { rule: 'sum', cap: 0.75 },
      charabonus:       { rule: 'sum' },
      chara_skill:      { rule: 'max' },
      chara_skill_must: { rule: 'override' },
      independent:      { rule: 'sum' }
    }
  },

  // ==================== 追伤（subtype = 属性/克属） ====================
  // 所有 subtype 共享同一套 zone 规则：同 zone 内 max，不同 zone 独立生效
  bonus_na: {
    label: '平A追伤',
    zones: {
      weapon_grid: { rule: 'max' },
      A1: { rule: 'max' },
      A2: { rule: 'max' },
      Q:  { rule: 'max' },
      E:  { rule: 'max' },
      P:  { rule: 'max' },
      SP: { rule: 'max' },
      independent: { rule: 'sum' }
    }
  },

  bonus_ca: {
    label: '奥义追伤',
    zones: {
      weapon_grid: { rule: 'max' },
      A1: { rule: 'max' },
      A2: { rule: 'max' },
      Q:  { rule: 'max' },
      independent: { rule: 'sum' }
    }
  },

  bonus_skill: {
    label: '技能追伤',
    zones: {
      weapon_grid: { rule: 'max' },
      A1: { rule: 'max' },
      A2: { rule: 'max' },
      Q:  { rule: 'max' },
      independent: { rule: 'sum' }
    }
  },

  // ==================== 伤害上限 ====================
  dmg_cap: {
    label: '全上限',
    zones: {
      weapon_grid:  { rule: 'sum' },
      summon:       { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      job_passive_extra: { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  na_dmg_cap: {
    label: '平A上限',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  skill_dmg_cap: {
    label: '技伤上限',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  ca_dmg_cap: {
    label: '奥义上限',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  // ==================== 伤害增幅 ====================
  dmg_amp: {
    label: '全伤害增幅',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  na_dmg_amp: {
    label: '平A伤害增幅',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  skill_dmg_amp: {
    label: '技伤伤害增幅',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  ca_dmg_amp: {
    label: '奥义伤害增幅',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  // ==================== 其他 ====================
  double_strike: {
    label: '再攻击',
    zones: {
      chara_skill: { rule: 'sum' },
      independent: { rule: 'sum' }
    }
  },

  triple_strike: {
    label: '三回攻击',
    zones: {
      chara_skill: { rule: 'sum' },
      independent: { rule: 'sum' }
    }
  },

  critical_hit: {
    label: '暴击率',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  def_ignore: {
    label: '无视防御',
    zones: {
      weapon_grid:  { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  dmg_reduce: {
    label: '伤害减轻',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  heal_cap: {
    label: '回复上限',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  charge_gain: {
    label: '奥义值上升量',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  debuff_success: {
    label: '弱体成功率',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  debuff_resist: {
    label: '弱体耐性',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  dodge_rate: {
    label: '回避率',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  hostility: {
    label: '敌对心',
    zones: {
      weapon_grid:  { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  counter_rate: {
    label: '反击发生率',
    zones: {
      weapon_grid:  { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  counter_dmg: {
    label: '反击伤害',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  skill_dmg: {
    label: '技能伤害',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      job_passive_extra: { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  dmg_to_elemental_amp: {
    label: '对克制伤害增幅',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  anti_element_reduce: {
    label: '受克制伤害减轻',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  ca_dmg: {
    label: '奥义伤害',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  cb_dmg: {
    label: '奥义连锁伤害',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  cb_dmg_cap: {
    label: '奥义连锁上限',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  cb_dmg_amp: {
    label: '奥义连锁增幅',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  cb_dmg_supp: {
    label: '奥义连锁伤害上升',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  fc_dmg_cap: {
    label: '致命连锁上限',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  fc_dmg_amp: {
    label: '致命连锁增幅',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  ca_special_dmg_cap: {
    label: '奥义特殊上限',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  critical_dmg_amp: {
    label: '暴击时伤害增幅',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  critical_dmg_cap: {
    label: '暴击时上限',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  normal_dmg_amp: {
    label: '通常伤害增幅',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  na_ranshu: {
    label: '平A乱击段数',
    zones: {
      weapon_grid:  { rule: 'max' },
      charabonus:   { rule: 'max' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'max' }
    }
  },

  dmg_to_non_elemental_amp: {
    label: '对无属性伤害增幅',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  },

  counter_dmg_supp: {
    label: '反击伤害上升',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  skill_hit_rate: {
    label: '技能命中率',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  hp_cut: {
    label: 'HP减少',
    zones: {
      weapon_grid:  { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  hp_dmg: {
    label: '开局HP减少',
    zones: {
      weapon_grid:  { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  turn_dmg: {
    label: '每回合HP减少',
    zones: {
      weapon_grid:  { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  heal_mod: {
    label: '回复力',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  def_down: {
    label: '防御下降',
    zones: {
      weapon_grid:  { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  element_reduce: {
    label: '属性伤害减轻',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  dodge_all: {
    label: '全回避发生率',
    zones: {
      weapon_grid:  { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  turn_dmg_reduce: {
    label: '回合类伤害减轻',
    zones: {
      weapon_grid:  { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  optimus_boost: {
    label: '神石加护',
    zones: {
      weapon_grid:  { rule: 'sum' },
      summon:       { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  omega_boost: {
    label: '方阵加护',
    zones: {
      weapon_grid:  { rule: 'sum' },
      summon:       { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  base_atk: {
    label: '额外攻击力白值',
    zones: {
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  base_hp: {
    label: '额外HP白值',
    zones: {
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  exp_gain: {
    label: '经验加成',
    zones: {
      weapon_grid:  { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  rupie_gain: {
    label: '卢布获取量加成',
    zones: {
      weapon_grid:  { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  indep_special_atk: {
    label: '独立特殊攻刃',
    zones: {
      independent:  { rule: 'sum' }
    }
  },

  hp_mod: {
    label: 'HP加成',
    zones: {
      weapon_grid:  { rule: 'sum' },
      summon:       { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      independent:  { rule: 'sum' }
    }
  },

  def_mod: {
    label: '防御力',
    zones: {
      weapon_grid:  { rule: 'sum' },
      charabonus:   { rule: 'sum' },
      chara_skill:  { rule: 'max' },
      independent:  { rule: 'sum' }
    }
  }
};

[
  'normal_atk',
  'stamina',
  'enmity',
  'element_atk',
  'perpetuity_atk',
  'indep_cumulative_atk',
  'indep_unjudged_atk',
  'indep_special_enmity_atk',
  'indep_special_atk',
  'dmg_cap',
  'dmg_amp',
  'ca_dmg',
  'ca_dmg_cap',
  'dmg_supp',
  'ca_dmg_supp',
  'taken_dmg_amp'
].forEach(function(buffType) {
  if (!BUFF_TYPE_ZONE_RULES[buffType]) {
    BUFF_TYPE_ZONE_RULES[buffType] = { label: buffType, zones: {} };
  }
  BUFF_TYPE_ZONE_RULES[buffType].zones.testbuff = { rule: 'sum' };
});

/**
 * 获取某个 buff_type 的 zone 规则配置
 * @param {string} buffType - 如 "normal_atk", "dmg_supp", "bonus_na"
 * @returns {object|null} - { label, zones: { zoneName: { rule, cap? } } }
 */
function getZoneRules(buffType) {
  return BUFF_TYPE_ZONE_RULES[buffType] || null;
}

/**
 * 获取某个 buff_type 的所有 zone 名称列表
 */
function getZoneNames(buffType) {
  const rules = BUFF_TYPE_ZONE_RULES[buffType];
  return rules ? Object.keys(rules.zones) : [];
}

/**
 * 获取某个 buff_type 下某个 zone 的裁决规则
 * @returns {string} 'sum' | 'max' | 'override'
 */
function getZoneRule(buffType, zone) {
  const rules = BUFF_TYPE_ZONE_RULES[buffType];
  if (!rules || !rules.zones[zone]) return 'sum'; // 兜底：加算
  return rules.zones[zone].rule || 'sum';
}

/**
 * 获取某个 buff_type 下某个 zone 的上限值（如有）
 * @returns {number|null}
 */
function getZoneCap(buffType, zone) {
  const rules = BUFF_TYPE_ZONE_RULES[buffType];
  if (!rules || !rules.zones[zone]) return null;
  return rules.zones[zone].cap != null ? rules.zones[zone].cap : null;
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BUFF_TYPE_ZONE_RULES,
    getZoneRules,
    getZoneNames,
    getZoneRule,
    getZoneCap
  };
}
