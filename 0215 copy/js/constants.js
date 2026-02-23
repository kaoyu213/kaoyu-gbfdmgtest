// ==========================================
//  GBF 模拟器 - 常量配置模块
// ==========================================

// 存储键名和配置版本
const STORAGE_KEY = 'gbf_simulator_v5_save';
const CONFIG_VERSION = '5.0.0';

// 自动保存开关
let autoSaveEnabled = true;

// 浑身/背水 曲线计算配置
const SKILL_CURVES = {
    'stamina_normal_medium': { type: 'stamina', coeff: 65.0 },
    'stamina_omega_big3': { type: 'stamina', coeff: 56.4 },
    'magna_m': { type: 'stamina', coeff: 60.4 },
    'magna_l': { type: 'stamina', coeff: 56.4 },
    'normal_l': { type: 'stamina', coeff: 56.4 }
};

// 默认职业加成 (Global Mastery)
const DEFAULT_MASTERY = {
    'chara_atk_passive': 0.22,
    'chara_def_passive': 0.13,
    'chara_hp_passive': 0.20,
    'chara_da_passive': 0.04,
    'chara_ta_passive': 0.03,
    'chara_all_cap_passive': 0.01,
    'chara_skill_dmg_passive': 0.23,
    'chara_skill_dmg_cap_passive': 0.05,
    'chara_debuff_resistance_passive': 0.20,
    'chara_skill_hit_rate_passive': 0.07,
    'chara_def_passive_max_hp': 0.03,
    'chara_all_cap_passive_non_c5': 0.03,
    'chara_def_passive_non_c5': 0.05,
    'chara_heal_cap_passive_non_c5': 0.03,
    'chara_skill_dmg_amp_passive_non_c5': 0.03,
    'chara_na_dmg_amp_passive_non_c5': 0.03,
    'chara_debuff_success_passive_non_c5': 0.03,
    'main_weapon_bonuses_sabre': 0.06,
    'main_weapon_bonuses_dagger': 0.03,
    'main_weapon_bonuses_spear': 0.03,
    'main_weapon_bonuses_axe': 0.06,
    'main_weapon_bonuses_staff': 0.03,
    'main_weapon_bonuses_gun': 0.06,
    'main_weapon_bonuses_melee': 0.03,
    'main_weapon_bonuses_bow': 0.03,
    'main_weapon_bonuses_harp': 0.03,
    'main_weapon_bonuses_katana': 0.03
};

// 属性颜色映射
const ELEMENT_COLORS = { 
    "火": "#E04241", 
    "水": "#3980D9", 
    "土": "#9C6040", 
    "风": "#6FD840", 
    "光": "#FEEC59", 
    "暗": "#7F45C9", 
    "全": "#FCF4EC" 
};

// 属性映射
const SKILL_ELEMENT_MAP = { 
    "all": "全", 
    "fire": "火", 
    "water": "水", 
    "earth": "土", 
    "wind": "风", 
    "light": "光", 
    "dark": "暗", 
    "weapon": "weapon" 
};

// 武器类型映射
const WEAPON_TYPE_MAP = { 
    "剑": "sabre", "剣": "sabre", "sword": "sabre", "sabre": "sabre",
    "短剑": "dagger", "短剣": "dagger", "dagger": "dagger",
    "枪": "spear", "槍": "spear", "spear": "spear",
    "斧头": "axe", "斧": "axe", "axe": "axe",
    "杖": "staff", "staff": "staff",
    "铳": "gun", "銃": "gun", "gun": "gun",
    "格斗": "fist", "拳": "fist", "fist": "fist", "melee": "fist",
    "弓": "bow", "bow": "bow",
    "乐器": "harp", "琴": "harp", "harp": "harp",
    "刀": "katana", "katana": "katana"
};

// 属性显示名称映射
const DISPLAY_NAME_MAP = {
    'chara_da_base': '基础DA',
    'chara_ta_base': '基础TA',
    'chara_da_passive': 'da加成',
    'chara_ta_passive': 'ta加成',
    'chara_hp_passive': '生命值加成',
    'chara_atk_passive': '基础攻击加成',
    'chara_def_passive': '防御力加成',
    'chara_all_cap_passive': '全上限',
    'chara_skill_dmg_passive': '技伤伤害',
    'chara_skill_dmg_cap_passive': '技能上限',
    'chara_debuff_resistance_passive': '弱体耐性',
    'chara_skill_hit_rate_passive': '技能命中',
    'chara_ca_passive': '奥义伤害',
    'chara_cb_cap_passive': 'CB上限',
    'chara_db_rate_passive': '弱体成功',
    'chara_atk_base': '基础攻击',
    'chara_hp_base': '基础HP',
    'chara_def_passive_max_hp': 'HP最大时防御力',
    'chara_all_cap_passive_non_c5': '非C5职业 全上限',
    'chara_def_passive_non_c5': '非C5职业 防御',
    'chara_heal_cap_passive_non_c5': '非C5职业 回复上限',
    'chara_skill_dmg_amp_passive_non_c5': '非C5职业 技能伤害增幅',
    'chara_na_dmg_amp_passive_non_c5': '非C5职业 普通攻击伤害增幅',
    'chara_debuff_success_passive_non_c5': '非C5职业 弱体成功率',
    'main_weapon_bonuses_sabre': '主手剑攻击力加成',
    'main_weapon_bonuses_dagger': '主手短剑攻击力加成',
    'main_weapon_bonuses_spear': '主手枪攻击力加成',
    'main_weapon_bonuses_axe': '主手斧攻击力加成',
    'main_weapon_bonuses_staff': '主手杖攻击力加成',
    'main_weapon_bonuses_gun': '主手铳攻击力加成',
    'main_weapon_bonuses_melee': '主手拳攻击力加成',
    'main_weapon_bonuses_bow': '主手弓攻击力加成',
    'main_weapon_bonuses_harp': '主手琴攻击力加成',
    'main_weapon_bonuses_katana': '主手刀攻击力加成'
};


// 统计配置
const STAT_CONFIG = [
    { "key": "weapon_normal_atk", "label": "攻刃", "cap": null, "format": "percent" },
    { "key": "weapon_omega_atk", "label": "M攻刃", "cap": null, "format": "percent" },
    { "key": "weapon_odious_atk", "label": "od攻刃", "cap": null, "format": "percent" },
    { "key": "weapon_ex_atk", "label": "ex攻刃", "cap": null, "format": "percent" },
    { "key": "weapon_special_ex_atk", "label": "ex攻刃（特殊）", "cap": 0.8, "format": "percent" },
    { "key": "weapon_normal_stamina", "label": "浑身", "cap": 8.0, "format": "percent" },
    { "key": "weapon_omega_stamina", "label": "M浑身", "cap": 8.0, "format": "percent" },
    { "key": "weapon_normal_enmity", "label": "背水", "cap": 8.0, "format": "percent" },
    { "key": "weapon_omega_enmity", "label": "M背水", "cap": 8.0, "format": "percent" },
    { "key": "weapon_awaken_element_atk", "label": "属性攻击（觉醒）", "cap": 0.4, "format": "percent" },
    { "key": "weapon_progression_element_atk", "label": "属性攻击（进境）", "cap": 0.75, "format": "percent" },
    { "key": "weapon_critical_hit_rate", "label": "暴击率", "cap": 1.0, "format": "percent" },
    { "key": "weapon_counter_rate", "label": "反击发生率", "cap": 0.2, "format": "percent" },
    { "key": "weapon_counter_dmg", "label": "反击伤害增加", "cap": null, "format": "percent" },
    { "key": "weapon_da", "label": "da几率", "cap": 0.75, "format": "percent" },
    { "key": "weapon_ta", "label": "ta几率", "cap": 0.75, "format": "percent" },
    { "key": "weapon_enhance_optimus", "label": "神石加护", "cap": 0.9, "format": "percent" },
    { "key": "weapon_enhance_omega", "label": "方阵加护", "cap": 1.0, "format": "percent" },
    { "key": "weapon_elem_bonus_na", "label": "平a属性追击", "cap": 0.5, "format": "percent" },
    { "key": "weapon_elem_bonus_ca", "label": "奥义属性追击", "cap": 0.2, "format": "percent" },
    { "key": "weapon_elem_bonus_skill", "label": "技能属性追击", "cap": 0.2, "format": "percent" },
    { "key": "weapon_hp", "label": "hp", "cap": 4.0, "format": "percent" },
    { "key": "weapon_hp_cut", "label": "hp减少", "cap": 0.7, "format": "percent" },
    { "key": "weapon_hp_dmg", "label": "hp开局减少（修罗）", "cap": 0.4, "format": "percent" },
    { "key": "weapon_turn_dmg", "label": "hp每回合减少", "cap": null, "format": "percent" },
    { "key": "weapon_heal", "label": "回复力", "cap": null, "format": "percent" },
    { "key": "weapon_heal_cap", "label": "回复上限", "cap": 1.0, "format": "percent" },
    { "key": "weapon_def", "label": "防御", "cap": 4.0, "format": "percent" },
    { "key": "weapon_hit_to_def", "label": "防御下降", "cap": null, "format": "percent" },
    { "key": "weapon_dmg_reduce", "label": "先制的防壁", "cap": null, "format": "percent" },
    { "key": "weapon_element_reduce", "label": "属性伤害减轻", "cap": 0.3, "format": "percent" },
    { "key": "weapon_dodge_all", "label": "全回避发生率", "cap": null, "format": "percent" },
    { "key": "weapon_dodge_rate", "label": "回避率", "cap": null, "format": "percent" },
    { "key": "weapon_hostility", "label": "敌对心", "cap": null, "format": "percent" },
    { "key": "weapon_debuff_resistance", "label": "弱体耐性", "cap": 0.3, "format": "percent" },
    { "key": "weapon_turn_dmg_reduce", "label": "回合类伤害减轻", "cap": null, "format": "percent" },
    { "key": "weapon_dmg_cap", "label": "全上限", "cap": 0.2, "format": "percent" },
    { "key": "weapon_special_dmg_cap", "label": "全上限（特殊）", "cap": 0.2, "format": "percent" },
    { "key": "weapon_dmg_amp", "label": "全伤害增幅", "cap": 0.2, "format": "percent" },
    { "key": "weapon_dmg_to_elemental_amp", "label": "对有利属性伤害增幅", "cap": null, "format": "percent" },
    { "key": "weapon_dmg_to_non_elemental_amp", "label": "对无属性伤害增幅", "cap": null, "format": "percent" },
    { "key": "weapon_na_dmg_cap", "label": "普通攻击伤害上限", "cap": 0.2, "format": "percent" },
    { "key": "weapon_na_dmg_amp", "label": "普通攻击伤害增幅", "cap": 0.3, "format": "percent" },
    { "key": "weapon_special_na_dmg_amp", "label": "普通攻击伤害增幅（特殊）", "cap": 0.3, "format": "percent" },
    { "key": "weapon_counter_dmg_supp", "label": "反击伤害上升", "cap": null, "format": "fixed" },
    { "key": "weapon_skill_dmg", "label": "技能伤害提升", "cap": null, "format": "percent" },
    { "key": "weapon_skill_dmg_cap", "label": "技能伤害上限", "cap": 1.0, "format": "percent" },
    { "key": "weapon_special_skill_dmg_cap", "label": "技能伤害上限（特殊）", "cap": 0.6, "format": "percent" },
    { "key": "weapon_skill_dmg_amp", "label": "技能伤害增幅", "cap": null, "format": "percent" },
    { "key": "weapon_special_skill_dmg_amp", "label": "技能伤害增幅（特殊）", "cap": 0.3, "format": "percent" },
    { "key": "weapon_ca_dmg", "label": "奥义伤害提升", "cap": 1.2, "format": "percent" },
    { "key": "weapon_ca_dmg_cap", "label": "奥义伤害上限提升", "cap": 0.75, "format": "percent" },
    { "key": "weapon_ca_dmg_amp", "label": "奥义伤害增幅", "cap": null, "format": "percent" },
    { "key": "weapon_special_ca_dmg_amp", "label": "奥义伤害增幅（特殊）", "cap": 0.3, "format": "percent" },
    { "key": "weapon_special_ca_dmg_cap", "label": "奥义伤害特殊上限", "cap": 0.3, "format": "percent" },
    { "key": "weapon_cb_dmg", "label": "奥义连锁伤害上升", "cap": 1.2, "format": "percent" },
    { "key": "weapon_cb_dmg_cap", "label": "奥义连锁伤害上限上升", "cap": 1.0, "format": "percent" },
    { "key": "weapon_cb_dmg_amp", "label": "奥义连锁伤害增幅", "cap": null, "format": "percent" },
    { "key": "weapon_fc_dmg_cap", "label": "致命连锁伤害上限", "cap": null, "format": "percent" },
    { "key": "weapon_fc_dmg_amp", "label": "致命连锁伤害增幅", "cap": null, "format": "percent" },
    { "key": "weapon_critical_hit_amp", "label": "暴击时伤害增幅", "cap": 0.2, "format": "percent" },
    { "key": "weapon_dmg_supp", "label": "全伤害上升", "cap": 100000, "format": "fixed" },
    { "key": "weapon_na_dmg_supp", "label": "普通攻击伤害上升", "cap": 100000, "format": "fixed" },
    { "key": "weapon_skill_dmg_supp", "label": "技能伤害上升", "cap": 200000, "format": "fixed" },
    { "key": "weapon_ca_dmg_supp", "label": "奥义伤害上升", "cap": 1000000, "format": "fixed" },
    { "key": "weapon_skill_hit_rate", "label": "技能命中率", "cap": null, "format": "percent" },
    { "key": "weapon_debuff_success_rate", "label": "弱体成功率", "cap": null, "format": "percent" },
    { "key": "weapon_charge_gain", "label": "奥义值上升量", "cap": 0.5, "format": "percent" },
    { "key": "weapon_def_ignore", "label": "无视防御", "cap": 0.3, "format": "percent" },
    { "key": "weapon_ax_atk", "label": "附魔攻击力", "cap": null, "format": "percent" },
    { "key": "weapon_ax_stamina", "label": "附魔浑身", "cap": null, "format": "percent" },
    { "key": "weapon_ax_enmity", "label": "附魔背水", "cap": null, "format": "percent" },
    { "key": "weapon_ax_element_atk", "label": "附魔属攻", "cap": null, "format": "percent" },
    { "key": "weapon_ax_da", "label": "附魔da几率", "cap": null, "format": "percent" },
    { "key": "weapon_ax_ta", "label": "附魔ta几率", "cap": null, "format": "percent" },
    { "key": "weapon_ax_hp", "label": "附魔hp", "cap": null, "format": "percent" },
    { "key": "weapon_ax_heal", "label": "附魔治愈力", "cap": null, "format": "percent" },
    { "key": "weapon_ax_heal_cap", "label": "附魔治愈上限", "cap": null, "format": "percent" },
    { "key": "weapon_ax_def", "label": "附魔防御", "cap": null, "format": "percent" },
    { "key": "weapon_ax_element_reduce", "label": "附魔全属性伤害减轻", "cap": null, "format": "percent" },
    { "key": "weapon_ax_debuff_resistance", "label": "附魔弱体耐性", "cap": null, "format": "percent" },
    { "key": "weapon_ax_na_dmg_cap", "label": "附魔普通攻击伤害上限", "cap": null, "format": "percent" },
    { "key": "weapon_ax_skill_dmg_cap", "label": "附魔技能伤害上限", "cap": null, "format": "percent" },
    { "key": "weapon_ax_ca_dmg", "label": "附魔奥义伤害", "cap": null, "format": "percent" },
    { "key": "weapon_ax_ca_dmg_cap", "label": "附魔奥义伤害上限", "cap": null, "format": "percent" },
    { "key": "weapon_ax_skill_dmg_supp", "label": "附魔技能伤害上升", "cap": null, "format": "fixed" },
    { "key": "weapon_ax_ca_dmg_supp", "label": "附魔奥义伤害上升", "cap": null, "format": "fixed" },
    { "key": "weapon_ax_exp_gain", "label": "附魔经验加成", "cap": null, "format": "percent" },
    { "key": "weapon_ax_rupie_gain", "label": "附魔卢布获取量加成", "cap": null, "format": "percent" }
];

// 导出常量
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        STORAGE_KEY,
        CONFIG_VERSION,
        SKILL_CURVES,
        DEFAULT_MASTERY,
        ELEMENT_COLORS,
        SKILL_ELEMENT_MAP,
        WEAPON_TYPE_MAP,
        DISPLAY_NAME_MAP,
        STAT_CONFIG
    };
}
