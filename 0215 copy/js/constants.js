// ==========================================
//  GBF 模拟器 - 常量配置模块
// ==========================================

// 存储键名和配置版本
const STORAGE_KEY = 'gbf_simulator_v5_save';
const CONFIG_VERSION = '5.0.0';

// 当前选中用户的持久化 key（用于下次打开页面时恢复用户1/用户2）
const CURRENT_USER_STORAGE_KEY = 'gbf_simulator_current_user';

/** 当前用户对应的配置存储 key（用户1 与 用户2 的配置分开存） */
function getUserStorageKey() {
    return (typeof currentUserId !== 'undefined' && currentUserId)
        ? STORAGE_KEY + '_' + currentUserId
        : STORAGE_KEY;
}

/** 当前用户下某角色的强化数据 key（戒指、耳饰、神器、觉醒、LB 等按用户+角色名独立存） */
function getCharBonusStorageKey(charName) {
    const uid = (typeof currentUserId !== 'undefined' && currentUserId) ? currentUserId : 'user1';
    return 'gbf_char_bonus_' + uid + '_' + charName;
}

// 自动保存开关
let autoSaveEnabled = true;

// 浑身/背水 曲线计算配置
const SKILL_CURVES = {
    'stamina_omega_medium': { type: 'stamina', coeff: 60.4 },
    'stamina_omega_big': { type: 'stamina', coeff: 56.4 },

    'stamina_normal_medium': { type: 'stamina', coeff: 65.0 },
    'stamina_normal_small': { type: 'stamina', coeff: 85.0 },
    'stamina_normal_big': { type: 'stamina', coeff: 56.4 },
    'stamina_normal_big2': { type: 'stamina', coeff: 53.7 },
    
    'stamina_element_ancestral': { type: 'stamina', coeff: 50.4 },// 无加护武器浑身曲线，比如暗龙剑

    // 附魔浑身（强壮乘区）曲线：与戒指/耳饰浑身 +1/+2/+3 一致（线性插值）
    // 对应：+1=满血3%、+2=满血4%、+3=满血5%
    'ex-stamina1': { type: 'ax_stamina', amount: 1 },
    'ex-stamina2': { type: 'ax_stamina', amount: 2 },
    'ex-stamina3': { type: 'ax_stamina', amount: 3 },

    // 附魔背水（逆境乘区）曲线：与戒指/耳饰 背水+1/+2/+3 完全共用一套曲线
    // 这里的 amount=1/2/3 分别代表「背水+1/+2/+3」那条 HP 曲线
    'ex-enmity1': { type: 'ax_enmity', amount: 1 },
    'ex-enmity2': { type: 'ax_enmity', amount: 2 },
    'ex-enmity3': { type: 'ax_enmity', amount: 3 },

    'enmity_omega_small': { type: 'enmity', base: '1:0.5 10:6.0 15:7.0 20:7.5' },



    'enmity_optimus_small': { type: 'enmity', base: '1:0.5 10:6.0 15:7.0 20:7.5' }
};

// 按武器类型提升武器白值的通用加成配置。
// 技能通过 effect.type = weapon_base_value、effect.stat = atk/hp、
// effect.weapon_type = sabre/dagger/... 声明目标，不在计算逻辑中写死具体武器类型。
const WEAPON_BASE_VALUE_BONUS_EFFECT = 'weapon_base_value';
const WEAPON_BASE_VALUE_STATS = ['atk', 'hp'];

const CHARABONUS_SUM_RULES = {
    // 攻击白值类
    chara_ring_baseatk:        'baseatk',
    chara_artifacts_baseatk:   'baseatk',
    chara_lb_baseatk:          'baseatk',
    chara_awakening_baseatk:   'baseatk',
    // HP 白值类
    chara_ring_basehp:         'basehp',
    chara_artifacts_basehp:    'basehp',
    chara_lb_basehp:           'basehp',
    chara_awakening_basehp:    'basehp',
    // DA/TA 示例
    chara_ring_da:             'da',
    chara_earring_da:          'da',
    chara_artifacts_da:        'da',
    chara_lb_da:               'da',
    chara_awakening_da:        'da',
    '角色基础da':              'da',
    chara_ring_ta:             'ta',
    chara_earring_ta:          'ta',
    chara_artifacts_ta:        'ta',
    chara_lb_ta:               'ta',
    chara_awakening_ta:        'ta',
    '角色基础ta':              'ta'
    // 强壮相关不直接在这里求和，而是在 buildCharabonusSummary 中按规则换算
};

const CHARABONUS_SUM_GROUPS = {
    baseatk:    { label: '总额外攻击力',   format: 'fixed'   },
    basehp:     { label: '总额外HP',       format: 'fixed'   },
    da:         { label: 'DA 概率',        format: 'percent' },
    ta:         { label: 'TA 概率',        format: 'percent' },
    element_atk:{ label: '属性攻击',        format: 'percent' },
    na_cap:     { label: '平A上限',        format: 'percent' },
    skill_cap:  { label: '技伤上限',       format: 'percent' },
    ca_cap:     { label: '奥义上限',       format: 'percent' },
    // 角色强化中的浑身 → 强壮汇总（满血时）
    strong:     { label: '总浑身（强壮）', format: 'percent' },
    // 角色强化中的背水/逆境 → 逆境汇总（满血或当前HP）
    adversity:  { label: '总背水（逆境）', format: 'percent' }
    // 你想要的其他汇总组也可以在这里继续加
};

// 当前选中的用户（与用户系统联动，用户1/用户2 各自读取对应的 DEFAULT_MASTERY）
let currentUserId = 'user1';

// 默认职业加成 - 用户1 (Global Mastery)
const DEFAULT_MASTERY1 = {
    'mc_atk_passive': 0.22,
    'mc_def_passive': 0.13,
    'mc_hp_passive': 0.20,
    'mc_da_passive': 0.04,
    'mc_ta_passive': 0.03,
    'mc_all_cap_passive': 0.01,
    'mc_skill_dmg_passive': 0.26,
    'mc_skill_dmg_cap_passive': 0.05,
    'mc_debuff_resistance_passive': 0.20,
    'mc_skill_hit_rate_passive': 0.07,
    'mc_def_passive_max_hp': 0.03,
    'mc_all_cap_passive_non_c5': 0.03,
    'mc_def_passive_non_c5': 0.05,
    'mc_heal_cap_passive_non_c5': 0.03,
    'mc_skill_dmg_passive_non_c5': 0.03,
    'mc_na_dmg_amp_passive_non_c5': 0.03,
    'mc_debuff_success_passive_non_c5': 0.03,
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

// 默认职业加成 - 用户2 (Global Mastery)
const DEFAULT_MASTERY2 = {
   'mc_atk_passive': 0.24,
    'mc_def_passive': 0.13,
    'mc_hp_passive': 0.20,
    'mc_da_passive': 0.04,
    'mc_ta_passive': 0.03,
    'mc_all_cap_passive': 0.01,
    'mc_skill_dmg_passive': 0.26,
    'mc_skill_dmg_cap_passive': 0.05,
    'mc_debuff_resistance_passive': 0.20,
    'mc_skill_hit_rate_passive': 0.07,
    'mc_def_passive_max_hp': 0.03,
    'mc_all_cap_passive_non_c5': 0.03,
    'mc_def_passive_non_c5': 0.05,
    'mc_heal_cap_passive_non_c5': 0.03,
    'mc_skill_dmg_passive_non_c5': 0.03,
    'mc_na_dmg_amp_passive_non_c5': 0.03,
    'mc_debuff_success_passive_non_c5': 0.03,
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

/** 按当前用户返回对应的默认职业加成（用户1 → DEFAULT_MASTERY1，用户2 → DEFAULT_MASTERY2） */
function getDefaultMastery() {
    return currentUserId === 'user2' ? DEFAULT_MASTERY2 : DEFAULT_MASTERY1;
}

// 属性颜色映射
const ELEMENT_COLORS = { 
    "火": "#E04241", 
    "水": "#3980D9", 
    "土": "#9C6040", 
    "风": "#6FD840", 
    "光": "#FEEC59", 
    "暗": "#7F45C9", 
    "破坏":"#D2FBFE",
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
    'mc_da_base': '主角基础DA',
    'mc_ta_base': '主角基础TA',
    'mc_da_passive': '主角da加成',
    'mc_ta_passive': '主角ta加成',
    'mc_hp_passive': '主角生命值加成',
    'mc_atk_passive': '主角基础攻击加成',
    'mc_def_passive': '主角防御力加成',
    'mc_all_cap_passive': '主角全上限',
    'mc_na_dmg_cap_passive': '主角平A伤害上限',
    'mc_skill_dmg_passive': '主角技伤伤害',
    'mc_skill_dmg_cap_passive': '主角技能上限',
    'mc_debuff_resistance_passive': '主角弱体耐性',
    'mc_skill_hit_rate_passive': '主角技能命中',
    'mc_ca_passive': '主角奥义伤害',
    'mc_cb_cap_passive': '主角CB上限',
    'mc_db_rate_passive': '主角弱体成功',
    'mc_atk_base': '主角基础攻击',
    'mc_hp_base': '主角基础HP',
    'mc_def_passive_max_hp': '主角HP最大时防御力',
    'mc_all_cap_passive_non_c5': '非C5主角全上限',
    'mc_def_passive_non_c5': '非C5主角防御',
    'mc_heal_cap_passive_non_c5': '非C5主角回复上限',
    'mc_skill_dmg_passive_non_c5': '非C5职业技能伤害加成',
    'mc_na_dmg_amp_passive_non_c5': '非C5主角普通攻击伤害增幅',
    'mc_debuff_success_passive_non_c5': '非C5主角弱体成功率',
    'main_weapon_bonuses_sabre': '主手剑攻击力加成',
    'main_weapon_bonuses_dagger': '主手短剑攻击力加成',
    'main_weapon_bonuses_spear': '主手枪攻击力加成',
    'main_weapon_bonuses_axe': '主手斧攻击力加成',
    'main_weapon_bonuses_staff': '主手杖攻击力加成',
    'main_weapon_bonuses_gun': '主手铳攻击力加成',
    'main_weapon_bonuses_melee': '主手拳攻击力加成',
    'main_weapon_bonuses_bow': '主手弓攻击力加成',
    'main_weapon_bonuses_harp': '主手琴攻击力加成',
    'main_weapon_bonuses_katana': '主手刀攻击力加成',
    'element_atk': '属性攻击力',
    'def_linglongpei': '防御力(特殊)',
    'anti_element_reduce': '受克制伤害减轻',
    'airship_sp_atk1': '骑空艇独立攻击',
    'airship_sp_atk2': '骑空艇船炉攻击'
};


// 统计配置
const STAT_CONFIG = [
    { "key": "weapon_normal_atk", "label": "攻刃", "cap": null, "format": "percent", "category": "weapon", "prop": "normal_atk", "zone": "weapon_grid" },
    { "key": "weapon_omega_atk", "label": "M攻刃", "cap": null, "format": "percent", "category": "weapon", "prop": "omega_atk", "zone": "weapon_grid" },
    { "key": "weapon_odious_atk", "label": "od攻刃", "cap": null, "format": "percent", "category": "weapon", "prop": "odious_atk", "zone": "weapon_grid" },
    { "key": "weapon_ex_atk", "label": "ex攻刃", "cap": null, "format": "percent", "category": "weapon", "prop": "ex_atk", "zone": "weapon_grid" },
    { "key": "weapon_special_ex_atk", "label": "ex攻刃（特殊）", "cap": 0.8, "format": "percent", "category": "weapon", "prop": "ex_atk", "zone": "weapon_grid" },
    { "key": "weapon_normal_stamina", "label": "浑身", "cap": 8.0, "format": "percent", "category": "weapon", "prop": "stamina", "zone": "weapon_grid" },
    { "key": "weapon_omega_stamina", "label": "M浑身", "cap": 8.0, "format": "percent", "category": "weapon", "prop": "stamina_omega", "zone": "weapon_grid" },
    { "key": "weapon_normal_enmity", "label": "背水", "cap": 8.0, "format": "percent", "category": "weapon", "prop": "enmity", "zone": "weapon_grid" },
    { "key": "weapon_omega_enmity", "label": "M背水", "cap": 8.0, "format": "percent", "category": "weapon", "prop": "enmity_omega", "zone": "weapon_grid" },
    { "key": "weapon_element_atk", "label": "属性攻击", "cap": 0.4, "format": "percent", "category": "weapon", "prop": "element_atk", "zone": "weapon_grid" },
    { "key": "weapon_progression_element_atk", "label": "属性攻击（进境）", "cap": 0.75, "format": "percent", "category": "weapon", "prop": "element_atk", "zone": "weapon_grid" },
    { "key": "weapon_critical_hit_rate", "label": "暴击率", "cap": 1.0, "format": "percent", "category": "weapon", "prop": "critical_hit", "zone": "weapon_grid" },
    { "key": "weapon_counter_rate", "label": "反击发生率", "cap": 0.2, "format": "percent", "category": "weapon", "prop": "counter_rate", "zone": "weapon_grid" },
    { "key": "weapon_counter_dmg", "label": "反击伤害增加", "cap": null, "format": "percent", "category": "weapon", "prop": "counter_dmg", "zone": "weapon_grid" },
    { "key": "weapon_da", "label": "da几率", "cap": 0.75, "format": "percent", "category": "weapon", "prop": "da_rate", "zone": "weapon_grid" },
    { "key": "weapon_ta", "label": "ta几率", "cap": 0.75, "format": "percent", "category": "weapon", "prop": "ta_rate", "zone": "weapon_grid" },
    { "key": "weapon_enhance_optimus", "label": "神石加护", "cap": 0.9, "format": "percent", "category": "weapon", "prop": "optimus_boost", "zone": "weapon_grid" },
    { "key": "weapon_enhance_omega", "label": "方阵加护", "cap": 1.0, "format": "percent", "category": "weapon", "prop": "omega_boost", "zone": "weapon_grid" },
    { "key": "weapon_bonus_na_own_element", "label": "平a自属性追击", "cap": 0.5, "format": "percent", "category": "weapon", "prop": "bonus_na_own_element", "zone": "E" },
    { "key": "weapon_bonus_ca_own_element", "label": "奥义自属性追击", "cap": 0.2, "format": "percent", "category": "weapon", "prop": "bonus_ca_own_element", "zone": "weapon_grid" },
    { "key": "weapon_bonus_skill_own_element", "label": "技能自属性追击", "cap": 0.2, "format": "percent", "category": "weapon", "prop": "bonus_skill_own_element", "zone": "weapon_grid" },
    { "key": "weapon_hp", "label": "hp", "cap": 4.0, "format": "percent", "category": "weapon", "prop": "hp_mod", "zone": "weapon_grid" },
    { "key": "weapon_hp_cut", "label": "hp减少", "cap": 0.7, "format": "percent", "category": "weapon", "prop": "hp_cut", "zone": "weapon_grid" },
    { "key": "weapon_hp_dmg", "label": "hp开局减少（修罗）", "cap": 0.4, "format": "percent", "category": "weapon", "prop": "hp_dmg", "zone": "weapon_grid" },
    { "key": "weapon_turn_dmg", "label": "hp每回合减少", "cap": null, "format": "percent", "category": "weapon", "prop": "turn_dmg", "zone": "weapon_grid" },
    { "key": "weapon_heal", "label": "回复力", "cap": null, "format": "percent", "category": "weapon", "prop": "heal_mod", "zone": "weapon_grid" },
    { "key": "weapon_heal_cap", "label": "回复上限", "cap": 1.0, "format": "percent", "category": "weapon", "prop": "heal_cap", "zone": "weapon_grid" },
    { "key": "weapon_def", "label": "防御", "cap": 4.0, "format": "percent", "category": "weapon", "prop": "def_mod", "zone": "weapon_grid" },
    { "key": "weapon_hit_to_def", "label": "防御下降", "cap": null, "format": "percent", "category": "weapon", "prop": "def_down", "zone": "weapon_grid" },
    { "key": "weapon_dmg_reduce", "label": "先制的防壁", "cap": null, "format": "percent", "category": "weapon", "prop": "dmg_reduce", "zone": "weapon_grid" },
    { "key": "weapon_element_reduce", "label": "属性伤害减轻", "cap": 0.3, "format": "percent", "category": "weapon", "prop": "element_reduce", "zone": "weapon_grid" },
    { "key": "weapon_dodge_all", "label": "全回避发生率", "cap": null, "format": "percent", "category": "weapon", "prop": "dodge_all", "zone": "weapon_grid" },
    { "key": "weapon_dodge_rate", "label": "回避率", "cap": null, "format": "percent", "category": "weapon", "prop": "dodge_rate", "zone": "weapon_grid" },
    { "key": "weapon_hostility", "label": "敌对心", "cap": null, "format": "percent", "category": "weapon", "prop": "hostility", "zone": "weapon_grid" },
    { "key": "weapon_debuff_resistance", "label": "弱体耐性", "cap": 0.3, "format": "percent", "category": "weapon", "prop": "debuff_resist", "zone": "weapon_grid" },
    { "key": "weapon_turn_dmg_reduce", "label": "回合类伤害减轻", "cap": null, "format": "percent", "category": "weapon", "prop": "turn_dmg_reduce", "zone": "weapon_grid" },
    { "key": "weapon_dmg_cap", "label": "全上限", "cap": 0.2, "format": "percent", "category": "weapon", "prop": "dmg_cap", "zone": "weapon_grid" },
    { "key": "weapon_special_dmg_cap", "label": "全上限（特殊）", "cap": 0.2, "format": "percent", "category": "weapon", "prop": "dmg_cap", "zone": "weapon_grid" },
    { "key": "overcap_dmg_cap_relaxation", "label": "D上限缓和", "cap": 0.2, "format": "percent", "category": "derived", "prop": "dmg_cap_relaxation", "zone": "weapon_grid" },
    { "key": "weapon_dmg_amp", "label": "全伤害增幅", "cap": 0.2, "format": "percent", "category": "weapon", "prop": "dmg_amp", "zone": "weapon_grid" },
    { "key": "weapon_dmg_to_elemental_amp", "label": "对有利属性伤害增幅", "cap": null, "format": "percent", "category": "weapon", "prop": "dmg_to_elemental_amp", "zone": "weapon_grid" },
    { "key": "weapon_dmg_to_non_elemental_amp", "label": "对无属性伤害增幅", "cap": null, "format": "percent", "category": "weapon", "prop": "dmg_to_non_elemental_amp", "zone": "weapon_grid" },
    { "key": "weapon_na_dmg_cap", "label": "普通攻击伤害上限", "cap": 0.2, "format": "percent", "category": "weapon", "prop": "na_dmg_cap", "zone": "weapon_grid" },
    { "key": "weapon_na_dmg_amp", "label": "普通攻击伤害增幅", "cap": 0.3, "format": "percent", "category": "weapon", "prop": "na_dmg_amp", "zone": "weapon_grid" },
    { "key": "weapon_na_ranshu", "label": "平A乱击段数", "cap": null, "format": "fixed", "category": "weapon", "prop": "na_ranshu", "zone": "weapon_grid" },
    { "key": "weapon_special_na_dmg_amp", "label": "普通攻击伤害增幅（特殊）", "cap": 0.3, "format": "percent", "category": "weapon", "prop": "na_dmg_amp", "zone": "weapon_grid" },
    { "key": "weapon_counter_dmg_supp", "label": "反击伤害上升", "cap": null, "format": "fixed", "category": "weapon", "prop": "counter_dmg_supp", "zone": "weapon_grid" },
    { "key": "weapon_skill_dmg", "label": "技能伤害提升", "cap": null, "format": "percent", "category": "weapon", "prop": "skill_dmg", "zone": "weapon_grid" },
    { "key": "weapon_skill_dmg_cap", "label": "技能伤害上限", "cap": 1.0, "format": "percent", "category": "weapon", "prop": "skill_dmg_cap", "zone": "weapon_grid" },
    { "key": "weapon_special_skill_dmg_cap", "label": "技能伤害上限（特殊）", "cap": 0.6, "format": "percent", "category": "weapon", "prop": "skill_dmg_cap", "zone": "weapon_grid" },
    { "key": "weapon_skill_dmg_amp", "label": "技能伤害增幅", "cap": null, "format": "percent", "category": "weapon", "prop": "skill_dmg_amp", "zone": "weapon_grid" },
    { "key": "weapon_special_skill_dmg_amp", "label": "技能伤害增幅（特殊）", "cap": 0.3, "format": "percent", "category": "weapon", "prop": "skill_dmg_amp", "zone": "weapon_grid" },
    { "key": "weapon_ca_dmg", "label": "奥义伤害提升", "cap": 1.2, "format": "percent", "category": "weapon", "prop": "ca_dmg", "zone": "weapon_grid" },
    { "key": "weapon_ca_dmg_cap", "label": "奥义伤害上限提升", "cap": 0.75, "format": "percent", "category": "weapon", "prop": "ca_dmg_cap", "zone": "weapon_grid" },
    { "key": "weapon_ca_dmg_amp", "label": "奥义伤害增幅", "cap": null, "format": "percent", "category": "weapon", "prop": "ca_dmg_amp", "zone": "weapon_grid" },
    { "key": "weapon_special_ca_dmg_amp", "label": "奥义伤害增幅（特殊）", "cap": 0.3, "format": "percent", "category": "weapon", "prop": "ca_dmg_amp", "zone": "weapon_grid" },
    { "key": "weapon_special_ca_dmg_cap", "label": "奥义伤害特殊上限", "cap": 0.3, "format": "percent", "category": "weapon", "prop": "ca_special_dmg_cap", "zone": "weapon_grid" },
    { "key": "weapon_cb_dmg", "label": "奥义连锁伤害上升", "cap": 1.2, "format": "percent", "category": "weapon", "prop": "cb_dmg", "zone": "weapon_grid" },
    { "key": "weapon_cb_dmg_cap", "label": "奥义连锁伤害上限上升", "cap": 1.0, "format": "percent", "category": "weapon", "prop": "cb_dmg_cap", "zone": "weapon_grid" },
    { "key": "weapon_cb_dmg_amp", "label": "奥义连锁伤害增幅", "cap": null, "format": "percent", "category": "weapon", "prop": "cb_dmg_amp", "zone": "weapon_grid" },
    { "key": "weapon_fc_dmg_cap", "label": "致命连锁伤害上限", "cap": null, "format": "percent", "category": "weapon", "prop": "fc_dmg_cap", "zone": "weapon_grid" },
    { "key": "weapon_fc_dmg_amp", "label": "致命连锁伤害增幅", "cap": null, "format": "percent", "category": "weapon", "prop": "fc_dmg_amp", "zone": "weapon_grid" },
    { "key": "weapon_critical_hit_amp", "label": "暴击时伤害增幅", "cap": 0.2, "format": "percent", "category": "weapon", "prop": "critical_dmg_amp", "zone": "weapon_grid" },
    { "key": "weapon_dmg_supp", "label": "全伤害上升", "cap": 100000, "format": "fixed", "category": "weapon", "prop": "dmg_supp", "zone": "weapon_grid" },
    { "key": "weapon_na_dmg_supp", "label": "普通攻击伤害上升", "cap": 100000, "format": "fixed", "category": "weapon", "prop": "na_dmg_supp", "zone": "weapon_grid" },
    { "key": "weapon_special_na_dmg_supp", "label": "普通攻击伤害上升（特殊）", "cap": 20000, "format": "fixed", "category": "weapon", "prop": "na_dmg_supp", "zone": "weapon_grid" },
    { "key": "weapon_skill_dmg_supp", "label": "技能伤害上升", "cap": 200000, "format": "fixed", "category": "weapon", "prop": "skill_dmg_supp", "zone": "weapon_grid" },
    { "key": "weapon_special_skill_dmg_supp", "label": "技能伤害上升（特殊）", "cap": 30000, "format": "fixed", "category": "weapon", "prop": "skill_dmg_supp", "zone": "weapon_grid" },
    { "key": "weapon_ca_dmg_supp", "label": "奥义伤害上升", "cap": 1000000, "format": "fixed", "category": "weapon", "prop": "ca_dmg_supp", "zone": "weapon_grid" },
    { "key": "weapon_special_ca_dmg_supp", "label": "奥义伤害上升（特殊）", "cap": 300000, "format": "fixed", "category": "weapon", "prop": "ca_dmg_supp", "zone": "weapon_grid" },
    { "key": "weapon_skill_hit_rate", "label": "技能命中率", "cap": null, "format": "percent", "category": "weapon", "prop": "skill_hit_rate", "zone": "weapon_grid" },
    { "key": "weapon_debuff_success_rate", "label": "弱体成功率", "cap": null, "format": "percent", "category": "weapon", "prop": "debuff_success", "zone": "weapon_grid" },
    { "key": "weapon_charge_gain", "label": "奥义值上升量", "cap": 0.5, "format": "percent", "category": "weapon", "prop": "charge_gain", "zone": "weapon_grid" },
    { "key": "weapon_def_ignore", "label": "无视防御", "cap": 0.8, "format": "percent", "category": "weapon", "prop": "def_ignore", "zone": "weapon_grid" },
    { "key": "weapon_ax_atk", "label": "附魔攻击力", "cap": null, "format": "percent", "category": "weapon", "prop": "normal_atk", "zone": "weapon_grid" },
    { "key": "weapon_ax_stamina", "label": "附魔浑身", "cap": null, "format": "percent", "category": "weapon", "prop": "stamina", "zone": "weapon_grid" },
    { "key": "weapon_ax_enmity", "label": "附魔背水", "cap": null, "format": "percent", "category": "weapon", "prop": "enmity", "zone": "weapon_grid" },
    { "key": "weapon_ax_element_atk", "label": "附魔属攻", "cap": null, "format": "percent", "category": "weapon", "prop": "element_atk", "zone": "weapon_grid" },
    { "key": "weapon_ax_da", "label": "附魔da几率", "cap": null, "format": "percent", "category": "weapon", "prop": "da_rate", "zone": "weapon_grid" },
    { "key": "weapon_ax_ta", "label": "附魔ta几率", "cap": null, "format": "percent", "category": "weapon", "prop": "ta_rate", "zone": "weapon_grid" },
    { "key": "weapon_ax_hp", "label": "附魔hp", "cap": null, "format": "percent", "category": "weapon", "prop": "hp_mod", "zone": "weapon_grid" },
    { "key": "weapon_ax_heal", "label": "附魔治愈力", "cap": null, "format": "percent", "category": "weapon", "prop": "heal_mod", "zone": "weapon_grid" },
    { "key": "weapon_ax_heal_cap", "label": "附魔治愈上限", "cap": null, "format": "percent", "category": "weapon", "prop": "heal_cap", "zone": "weapon_grid" },
    { "key": "weapon_ax_def", "label": "附魔防御", "cap": null, "format": "percent", "category": "weapon", "prop": "def_mod", "zone": "weapon_grid" },
    { "key": "weapon_ax_element_reduce", "label": "附魔全属性伤害减轻", "cap": null, "format": "percent", "category": "weapon", "prop": "element_reduce", "zone": "weapon_grid" },
    { "key": "weapon_ax_debuff_resistance", "label": "附魔弱体耐性", "cap": null, "format": "percent", "category": "weapon", "prop": "debuff_resist", "zone": "weapon_grid" },
    { "key": "weapon_ax_na_dmg_cap", "label": "附魔普通攻击伤害上限", "cap": null, "format": "percent", "category": "weapon", "prop": "na_dmg_cap", "zone": "weapon_grid" },
    { "key": "weapon_ax_skill_dmg_cap", "label": "附魔技能伤害上限", "cap": null, "format": "percent", "category": "weapon", "prop": "skill_dmg_cap", "zone": "weapon_grid" },
    { "key": "weapon_ax_ca_dmg", "label": "附魔奥义伤害", "cap": null, "format": "percent", "category": "weapon", "prop": "ca_dmg", "zone": "weapon_grid" },
    { "key": "weapon_ax_ca_dmg_cap", "label": "附魔奥义伤害上限", "cap": null, "format": "percent", "category": "weapon", "prop": "ca_dmg_cap", "zone": "weapon_grid" },
    { "key": "weapon_ax_skill_dmg_supp", "label": "附魔技能伤害上升", "cap": null, "format": "fixed", "category": "weapon", "prop": "skill_dmg_supp", "zone": "weapon_grid" },
    { "key": "weapon_ax_ca_dmg_supp", "label": "附魔奥义伤害上升", "cap": null, "format": "fixed", "category": "weapon", "prop": "ca_dmg_supp", "zone": "weapon_grid" },
    { "key": "weapon_ax_exp_gain", "label": "附魔经验加成", "cap": null, "format": "percent", "category": "weapon", "prop": "exp_gain", "zone": "weapon_grid" },
    { "key": "weapon_ax_rupie_gain", "label": "附魔卢布获取量加成", "cap": null, "format": "percent", "category": "weapon", "prop": "rupie_gain", "zone": "weapon_grid" },
    { "key": "weapon_bonus_na_destruction", "label": "平a破坏属性追击", "cap": 0.5, "format": "percent", "category": "weapon", "prop": "bonus_na_destruction", "zone": "E" },
    { "key": "weapon_bonus_ca_destruction", "label": "奥义破坏属性追击", "cap": 0.2, "format": "percent", "category": "weapon", "prop": "bonus_ca_destruction", "zone": "weapon_grid" },
    { "key": "weapon_bonus_skill_destruction", "label": "技能破坏属性追击", "cap": 0.2, "format": "percent", "category": "weapon", "prop": "bonus_skill_destruction", "zone": "weapon_grid" },

    { "key": "weapon_shuichong_bonus_na_own_element", "label": "水铳sa自属性追击", "cap": null, "format": "percent", "category": "weapon", "prop": "bonus_na_own_element", "zone": "E" },

    // ==========================================
    // 角色额外加成 (戒指/耳饰/神器/婚戒)
    // ==========================================

    // --- 角色 JSON 基础连击率 ---
    { "key": "角色基础da", "label": "角色基础da", "cap": null, "format": "percent", "category": "charabonus", "prop": "da_rate", "zone": "charabonus" },
    { "key": "角色基础ta", "label": "角色基础ta", "cap": null, "format": "percent", "category": "charabonus", "prop": "ta_rate", "zone": "charabonus" },
    
    // --- 戒指 (Ring) ---
    { "key": "chara_ring_baseatk", "label": "戒指攻击力白值", "cap": null, "format": "fixed", "category": "charabonus", "prop": "base_atk", "zone": "charabonus" },
    { "key": "chara_ring_basehp", "label": "戒指HP", "cap": null, "format": "fixed", "category": "charabonus", "prop": "base_hp", "zone": "charabonus" },
    { "key": "chara_ring_critical_hit_rate", "label": "戒指暴击率", "cap": null, "format": "percent", "category": "charabonus", "prop": "critical_hit", "zone": "charabonus" },
    { "key": "chara_ring_skill_dmg_cap", "label": "戒指技伤上限", "cap": null, "format": "percent", "category": "charabonus", "prop": "skill_dmg_cap", "zone": "charabonus" },
    { "key": "chara_ring_ca_dmg", "label": "戒指奥义伤害", "cap": null, "format": "percent", "category": "charabonus", "prop": "ca_dmg", "zone": "charabonus" },
    { "key": "chara_ring_ca_dmg_cap", "label": "戒指奥义上限", "cap": null, "format": "percent", "category": "charabonus", "prop": "ca_dmg_cap", "zone": "charabonus" },
    { "key": "chara_ring_enmity", "label": "戒指背水", "cap": null, "format": "fixed", "category": "charabonus", "prop": "enmity", "zone": "charabonus" },
    { "key": "chara_ring_stamina", "label": "戒指浑身", "cap": null, "format": "fixed", "category": "charabonus", "prop": "stamina", "zone": "charabonus" },
    { "key": "chara_ring_debuff_success_rate", "label": "戒指弱体成功率", "cap": null, "format": "percent", "category": "charabonus", "prop": "debuff_success", "zone": "charabonus" },
    { "key": "chara_ring_da", "label": "戒指DA", "cap": null, "format": "percent", "category": "charabonus", "prop": "da_rate", "zone": "charabonus" },
    { "key": "chara_ring_ta", "label": "戒指TA", "cap": null, "format": "percent", "category": "charabonus", "prop": "ta_rate", "zone": "charabonus" },
    { "key": "chara_ring_def", "label": "戒指防御", "cap": null, "format": "percent", "category": "charabonus", "prop": "def_mod", "zone": "charabonus" },
    { "key": "chara_ring_dodge_rate", "label": "戒指回避", "cap": null, "format": "percent", "category": "charabonus", "prop": "dodge_rate", "zone": "charabonus" },
    { "key": "chara_ring_debuff_resistance", "label": "戒指弱体耐性", "cap": null, "format": "percent", "category": "charabonus", "prop": "debuff_resist", "zone": "charabonus" },
    { "key": "chara_ring_heal_cap", "label": "戒指回复性能", "cap": null, "format": "percent", "category": "charabonus", "prop": "heal_cap", "zone": "charabonus" },

    // --- 耳饰 (Earring) ---
    { "key": "chara_earring_da", "label": "耳饰DA", "cap": null, "format": "percent", "category": "charabonus", "prop": "da_rate", "zone": "charabonus" },
    { "key": "chara_earring_ta", "label": "耳饰TA", "cap": null, "format": "percent", "category": "charabonus", "prop": "ta_rate", "zone": "charabonus" },
    { "key": "chara_earring_element_atk", "label": "耳饰属性攻击", "cap": null, "format": "percent", "category": "charabonus", "prop": "element_atk", "zone": "charabonus" },
    { "key": "chara_earring_anti_element_reduce", "label": "耳饰属性减轻", "cap": null, "format": "percent", "category": "charabonus", "prop": "anti_element_reduce", "zone": "charabonus" },//注意点，不是全属性减轻
    { "key": "chara_earring_stamina", "label": "耳饰浑身", "cap": null, "format": "fixed", "category": "charabonus", "prop": "stamina", "zone": "charabonus" },
    { "key": "chara_earring_enmity", "label": "耳饰背水", "cap": null, "format": "fixed", "category": "charabonus", "prop": "enmity", "zone": "charabonus" },
    { "key": "chara_earring_dmg_supp", "label": "耳饰伤害上升", "cap": null, "format": "fixed", "category": "charabonus", "prop": "dmg_supp", "zone": "charabonus" },
    { "key": "chara_earring_critical_hit_rate", "label": "耳饰暴击率", "cap": null, "format": "percent", "category": "charabonus", "prop": "critical_hit", "zone": "charabonus" },
    { "key": "chara_earring_counter_dodge", "label": "耳饰反击(回避)", "cap": null, "format": "percent", "category": "charabonus", "prop": "counter_rate", "zone": "charabonus" },//注意点
    { "key": "chara_earring_counter_dmg", "label": "耳饰反击(受伤)", "cap": null, "format": "percent", "category": "charabonus", "prop": "counter_dmg", "zone": "charabonus" },

    // --- 神器 (artifacts/Awakening) ---
    { "key": "chara_artifacts_baseatk", "label": "神器攻击力", "cap": null, "format": "fixed", "category": "charabonus", "prop": "base_atk", "zone": "charabonus" },
    { "key": "chara_artifacts_def", "label": "神器防御", "cap": null, "format": "percent", "category": "charabonus", "prop": "def_mod", "zone": "charabonus" },
    { "key": "chara_artifacts_da", "label": "神器DA", "cap": null, "format": "percent", "category": "charabonus", "prop": "da_rate", "zone": "charabonus" },
    { "key": "chara_artifacts_ta", "label": "神器TA", "cap": null, "format": "percent", "category": "charabonus", "prop": "ta_rate", "zone": "charabonus" },
    { "key": "chara_artifacts_basehp", "label": "神器HP", "cap": null, "format": "fixed", "category": "charabonus", "prop": "base_hp", "zone": "charabonus" },
    { "key": "chara_artifacts_ca_dmg", "label": "神器奥义伤害", "cap": null, "format": "percent", "category": "charabonus", "prop": "ca_dmg", "zone": "charabonus" },
    { "key": "chara_artifacts_skill_dmg", "label": "神器技能伤害", "cap": null, "format": "percent", "category": "charabonus", "prop": "skill_dmg", "zone": "charabonus" },
    { "key": "chara_artifacts_element_atk", "label": "神器自属性攻击", "cap": null, "format": "percent", "category": "charabonus", "prop": "element_atk", "zone": "charabonus" },
    { "key": "chara_artifacts_anti_element_reduce", "label": "神器有利属性减轻", "cap": null, "format": "percent", "category": "charabonus", "prop": "anti_element_reduce", "zone": "charabonus" },
    { "key": "chara_artifacts_critical_hit_rate", "label": "神器暴击率", "cap": null, "format": "percent", "category": "charabonus", "prop": "critical_hit", "zone": "charabonus" },
    { "key": "chara_artifacts_dodge_rate", "label": "神器回避", "cap": null, "format": "percent", "category": "charabonus", "prop": "dodge_rate", "zone": "charabonus" },
    { "key": "chara_artifacts_heal_cap", "label": "神器回复性能", "cap": null, "format": "percent", "category": "charabonus", "prop": "heal_cap", "zone": "charabonus" },
    { "key": "chara_artifacts_debuff_success_rate", "label": "神器弱体成功率", "cap": null, "format": "percent", "category": "charabonus", "prop": "debuff_success", "zone": "charabonus" },
    { "key": "chara_artifacts_debuff_resistance", "label": "神器弱体耐性", "cap": null, "format": "percent", "category": "charabonus", "prop": "debuff_resist", "zone": "charabonus" },
    
    { "key": "chara_artifacts_na_dmg_cap", "label": "神器平A上限", "cap": null, "format": "percent", "category": "charabonus", "prop": "na_dmg_cap", "zone": "charabonus" },
    { "key": "chara_artifacts_skill_dmg_cap", "label": "神器技伤上限", "cap": null, "format": "percent", "category": "charabonus", "prop": "skill_dmg_cap", "zone": "charabonus" },
    { "key": "chara_artifacts_ca_dmg_cap", "label": "神器奥义上限", "cap": null, "format": "percent", "category": "charabonus", "prop": "ca_dmg_cap", "zone": "charabonus" },
    { "key": "chara_artifacts_special_ca_dmg_cap", "label": "神器奥义特殊上限", "cap": null, "format": "percent", "category": "charabonus", "prop": "ca_special_dmg_cap", "zone": "charabonus" },
    { "key": "chara_artifacts_crit_dmg_cap", "label": "神器暴击时上限", "cap": null, "format": "percent", "category": "charabonus", "prop": "critical_dmg_cap", "zone": "charabonus" },
    { "key": "chara_artifacts_na_dmg_supp", "label": "神器平A予伤", "cap": null, "format": "fixed", "category": "charabonus", "prop": "na_dmg_supp", "zone": "charabonus" },
    { "key": "chara_artifacts_skill_dmg_supp", "label": "神器技伤予伤", "cap": null, "format": "fixed", "category": "charabonus", "prop": "skill_dmg_supp", "zone": "charabonus" },
    { "key": "chara_artifacts_ca_dmg_supp", "label": "神器奥义予伤", "cap": null, "format": "fixed", "category": "charabonus", "prop": "ca_dmg_supp", "zone": "charabonus" },
    { "key": "chara_artifacts_chain_supp", "label": "神器CB予伤", "cap": null, "format": "percent", "category": "charabonus", "prop": "cb_dmg_supp", "zone": "charabonus" },//有2个加成，到时候专门写

    // --- 婚戒 (Marriage) ---
    { "key": "chara_marriage_perpetuity_atk", "label": "婚戒攻击力(独立)", "cap": null, "format": "percent", "category": "charabonus", "prop": "perpetuity_atk", "zone": "charabonus" },
    { "key": "chara_marriage_hp", "label": "婚戒HP", "cap": null, "format": "percent", "category": "charabonus", "prop": "hp_mod", "zone": "charabonus" },
    { "key": "chara_marriage_dmg_cap", "label": "婚戒伤害上限", "cap": null, "format": "percent", "category": "charabonus", "prop": "dmg_cap", "zone": "charabonus" },
    { "key": "chara_marriage_debuff_resistance", "label": "婚戒弱体耐性", "cap": null, "format": "percent", "category": "charabonus", "prop": "debuff_resist", "zone": "charabonus" },
    { "key": "marriage_perpetuity_atk", "label": "久远乘区(独立攻刃)", "cap": null, "format": "percent", "category": "chara", "prop": "perpetuity_atk", "zone": "charabonus" },

    // --- 觉醒 (Awakening) ---
    { "key": "chara_awakening_baseatk", "label": "觉醒攻击力", "cap": null, "format": "fixed", "category": "charabonus", "prop": "base_atk", "zone": "charabonus" },
    { "key": "chara_awakening_basehp", "label": "觉醒HP", "cap": null, "format": "fixed", "category": "charabonus", "prop": "base_hp", "zone": "charabonus" },
    { "key": "chara_awakening_ca_dmg", "label": "觉醒奥义伤害", "cap": null, "format": "percent", "category": "charabonus", "prop": "ca_dmg", "zone": "charabonus" },
    { "key": "chara_awakening_da", "label": "觉醒DA", "cap": null, "format": "percent", "category": "charabonus", "prop": "da_rate", "zone": "charabonus" },
    { "key": "chara_awakening_ta", "label": "觉醒TA", "cap": null, "format": "percent", "category": "charabonus", "prop": "ta_rate", "zone": "charabonus" },
    { "key": "chara_awakening_def", "label": "觉醒防御力", "cap": null, "format": "percent", "category": "charabonus", "prop": "def_mod", "zone": "charabonus" },
    { "key": "chara_awakening_ca_dmg_cap", "label": "觉醒奥义上限", "cap": null, "format": "percent", "category": "charabonus", "prop": "ca_dmg_cap", "zone": "charabonus" },
    { "key": "chara_awakening_element_reduce", "label": "觉醒全属性减免", "cap": null, "format": "percent", "category": "charabonus", "prop": "element_reduce", "zone": "charabonus" },
    { "key": "chara_awakening_na_dmg_amp", "label": "觉醒平A增幅", "cap": null, "format": "percent", "category": "charabonus", "prop": "na_dmg_amp", "zone": "charabonus" },
    { "key": "chara_awakening_na_dmg_cap", "label": "觉醒平A上限", "cap": null, "format": "percent", "category": "charabonus", "prop": "na_dmg_cap", "zone": "charabonus" },

    // --- LB (Limit Bonus) ---
    { "key": "chara_lb_baseatk", "label": "LB攻击力", "cap": null, "format": "fixed", "category": "charabonus", "prop": "base_atk", "zone": "charabonus" },
    { "key": "chara_lb_def", "label": "LB防御", "cap": null, "format": "percent", "category": "charabonus", "prop": "def_mod", "zone": "charabonus" },
    { "key": "chara_lb_basehp", "label": "LB HP", "cap": null, "format": "fixed", "category": "charabonus", "prop": "base_hp", "zone": "charabonus" },
    { "key": "chara_lb_critical_hit_rate", "label": "LB暴击率", "cap": null, "format": "percent", "category": "charabonus", "prop": "critical_hit", "zone": "charabonus" },
    { "key": "chara_lb_element_atk", "label": "LB属性攻击", "cap": null, "format": "percent", "category": "charabonus", "prop": "element_atk", "zone": "charabonus" },
    { "key": "chara_lb_stamina", "label": "LB浑身", "cap": null, "format": "fixed", "category": "charabonus", "prop": "stamina", "zone": "charabonus" },
    { "key": "chara_lb_enmity", "label": "LB背水", "cap": null, "format": "fixed", "category": "charabonus", "prop": "enmity", "zone": "charabonus" },
    { "key": "chara_lb_ta", "label": "LB TA", "cap": null, "format": "percent", "category": "charabonus", "prop": "ta_rate", "zone": "charabonus" },
    { "key": "chara_lb_da", "label": "LB DA", "cap": null, "format": "percent", "category": "charabonus", "prop": "da_rate", "zone": "charabonus" },
    { "key": "chara_lb_ca_dmg", "label": "LB奥义伤害", "cap": null, "format": "percent", "category": "charabonus", "prop": "ca_dmg", "zone": "charabonus" },
    { "key": "chara_lb_ca_dmg_cap", "label": "LB奥义上限", "cap": null, "format": "percent", "category": "charabonus", "prop": "ca_dmg_cap", "zone": "charabonus" },
    { "key": "chara_lb_skill_dmg", "label": "LB技能伤害", "cap": null, "format": "percent", "category": "charabonus", "prop": "skill_dmg", "zone": "charabonus" },
    { "key": "chara_lb_skill_dmg_cap", "label": "LB技能上限", "cap": null, "format": "percent", "category": "charabonus", "prop": "skill_dmg_cap", "zone": "charabonus" },
    { "key": "chara_lb_charge_gain", "label": "LB奥义值上升量", "cap": null, "format": "percent", "category": "charabonus", "prop": "charge_gain", "zone": "charabonus" },
    { "key": "chara_lb_debuff_resistance", "label": "LB弱体耐性", "cap": null, "format": "percent", "category": "charabonus", "prop": "debuff_resist", "zone": "charabonus" },
    { "key": "chara_lb_heal_cap", "label": "LB回复性能", "cap": null, "format": "percent", "category": "charabonus", "prop": "heal_cap", "zone": "charabonus" },
    { "key": "chara_lb_anti_element_reduce", "label": "LB属性伤害减轻", "cap": null, "format": "percent", "category": "charabonus", "prop": "anti_element_reduce", "zone": "charabonus" },

    // ==========================================
    // 非武器加成来源配置
    // ==========================================
    
    // 召唤石类 (用于显示)
    { "key": "summon_optimus", "label": "召唤石神石加护", "cap": null, "format": "percent", "category": "summon", "prop": "optimus_boost", "zone": "summon" },
    { "key": "summon_magna", "label": "召唤石方阵加护", "cap": null, "format": "percent", "category": "summon", "prop": "omega_boost", "zone": "summon" },
    { "key": "summon_dmg_cap", "label": "召唤石全上限加成", "cap": null, "format": "percent", "category": "summon", "prop": "dmg_cap", "zone": "summon" },
    { "key": "summon_element_atk", "label": "召唤石属性攻击", "cap": null, "format": "percent", "category": "summon", "prop": "element_atk", "zone": "summon" },
    { "key": "summon_hp", "label": "召唤石HP加成", "cap": null, "format": "percent", "category": "summon", "prop": "hp_mod", "zone": "summon" },


    // 主角加成类
    { "key": "mc_atk_passive", "label": "主角基础攻击加成", "cap": null, "format": "percent", "category": "job", "prop": "special", "zone": "chara_skill" },
    { "key": "mc_def_passive", "label": "主角防御力加成", "cap": null, "format": "percent", "category": "job", "prop": "def_mod", "zone": "chara_skill" },
    { "key": "mc_hp_passive", "label": "主角生命值加成", "cap": null, "format": "percent", "category": "job", "prop": "special", "zone": "chara_skill" },
    { "key": "mc_da_passive", "label": "主角da加成", "cap": null, "format": "percent", "category": "job", "prop": "da_rate", "zone": "chara_skill" },
    { "key": "mc_ta_passive", "label": "主角ta加成", "cap": null, "format": "percent", "category": "job", "prop": "ta_rate", "zone": "chara_skill" },
    { "key": "mc_skill_dmg_passive", "label": "主角技伤伤害", "cap": null, "format": "percent", "category": "job", "prop": "skill_dmg", "zone": "chara_skill" },
    { "key": "mc_ca_passive", "label": "主角奥义伤害", "cap": null, "format": "percent", "category": "job", "prop": "ca_dmg", "zone": "chara_skill" },
    
    // 角色加成类 (普通角色)
    { "key": "chara_atk_passive", "label": "角色基础攻击加成", "cap": null, "format": "percent", "category": "chara", "prop": "special", "zone": "chara_skill" },
    { "key": "chara_def_passive", "label": "角色防御力加成", "cap": null, "format": "percent", "category": "chara", "prop": "def_mod", "zone": "chara_skill" },
    { "key": "chara_hp_passive", "label": "角色生命值加成", "cap": null, "format": "percent", "category": "chara", "prop": "special", "zone": "chara_skill" },
    { "key": "chara_da_passive", "label": "角色da加成", "cap": null, "format": "percent", "category": "chara", "prop": "da_rate", "zone": "chara_skill" },
    { "key": "chara_ta_passive", "label": "角色ta加成", "cap": null, "format": "percent", "category": "chara", "prop": "ta_rate", "zone": "chara_skill" },
    { "key": "chara_skill_dmg_passive", "label": "角色技伤伤害", "cap": null, "format": "percent", "category": "chara", "prop": "skill_dmg", "zone": "chara_skill" },
    { "key": "chara_ca_passive", "label": "角色奥义伤害", "cap": null, "format": "percent", "category": "chara", "prop": "ca_dmg", "zone": "chara_skill" },
    { "key": "chara_all_cap_passive", "label": "角色全上限", "cap": null, "format": "percent", "category": "chara", "prop": "dmg_cap", "zone": "chara_skill" },
    { "key": "chara_skill_dmg_cap_passive", "label": "角色技能上限", "cap": null, "format": "percent", "category": "chara", "prop": "skill_dmg_cap", "zone": "chara_skill" },
    { "key": "chara_cb_cap_passive", "label": "角色CB上限", "cap": null, "format": "percent", "category": "chara", "prop": "cb_dmg_cap", "zone": "chara_skill" },

    // 职业加成类 (全职业常驻/特定职业被动)
    { "key": "mc_all_cap_passive", "label": "主角全上限", "cap": null, "format": "percent", "category": "job", "prop": "dmg_cap", "zone": "chara_skill" },
    { "key": "mc_na_dmg_cap_passive", "label": "主角平A伤害上限", "cap": null, "format": "percent", "category": "job", "prop": "na_dmg_cap", "zone": "chara_skill" },
    { "key": "mc_skill_dmg_cap_passive", "label": "主角技能上限", "cap": null, "format": "percent", "category": "job", "prop": "skill_dmg_cap", "zone": "chara_skill" },
    { "key": "mc_cb_cap_passive", "label": "主角CB上限", "cap": null, "format": "percent", "category": "job", "prop": "cb_dmg_cap", "zone": "chara_skill" },
    { "key": "job_na_amp", "label": "非C5职业平A增幅", "cap": null, "format": "percent", "category": "job", "prop": "na_dmg_amp", "zone": "chara_skill" },
    { "key": "mc_all_cap_passive_non_c5", "label": "非C5职业全上限加成", "cap": null, "format": "percent", "category": "job", "prop": "dmg_cap", "zone": "job_passive_extra" },
    { "key": "mc_skill_dmg_passive_non_c5", "label": "非C5职业技能伤害加成", "cap": null, "format": "percent", "category": "job", "prop": "skill_dmg", "zone": "job_passive_extra" },
    
    // 综合加成类 (如光环、输入框等统筹项)
    
    // 特殊道具加成类
    { "key": "special_element_atk", "label": "属性攻击力", "cap": null, "format": "percent", "category": "special", "prop": "element_atk", "zone": "independent" },
    { "key": "special_def_linglongpei", "label": "防御力", "cap": null, "format": "percent", "category": "special", "prop": "def_mod", "zone": "independent" },
    { "key": "special_skill_dmg", "label": "技能伤害", "cap": null, "format": "percent", "category": "special", "prop": "skill_dmg", "zone": "independent" },
    { "key": "special_ca_dmg", "label": "奥义伤害", "cap": null, "format": "percent", "category": "special", "prop": "ca_dmg", "zone": "independent" },
    { "key": "special_element_pair_dmg_amp", "label": "六属性克属伤害增幅", "cap": null, "format": "percent", "category": "special", "prop": "element_pair_dmg_amp", "zone": "independent" },
    { "key": "special_na_dmg_cap", "label": "普攻上限", "cap": null, "format": "percent", "category": "special", "prop": "na_dmg_cap", "zone": "independent" },
    { "key": "special_skill_dmg_cap", "label": "技伤上限", "cap": null, "format": "percent", "category": "special", "prop": "skill_dmg_cap", "zone": "independent" },
    { "key": "special_ca_dmg_cap", "label": "奥义上限", "cap": null, "format": "percent", "category": "special", "prop": "ca_dmg_cap", "zone": "independent" },
    { "key": "special_ta", "label": "TA", "cap": null, "format": "percent", "category": "special", "prop": "ta_rate", "zone": "independent" },
    { "key": "special_da", "label": "DA", "cap": null, "format": "percent", "category": "special", "prop": "da_rate", "zone": "independent" },
    { "key": "special_heal_cap", "label": "回复上限", "cap": null, "format": "percent", "category": "special", "prop": "heal_cap", "zone": "independent" },
    { "key": "special_debuff_resistance", "label": "弱体耐性", "cap": null, "format": "percent", "category": "special", "prop": "debuff_resist", "zone": "independent" },
    { "key": "special_debuff_success_rate", "label": "弱体成功率", "cap": null, "format": "percent", "category": "special", "prop": "debuff_success", "zone": "independent" },
    { "key": "special_anti_element_reduce", "label": "受克制伤害减轻", "cap": null, "format": "percent", "category": "special", "prop": "anti_element_reduce", "zone": "independent" },
    { "key": "special_dmg_cap", "label": "全上限", "cap": null, "format": "percent", "category": "special", "prop": "dmg_cap", "zone": "independent" },
    { "key": "special_dmg_amp", "label": "伤害增幅", "cap": null, "format": "percent", "category": "special", "prop": "dmg_amp", "zone": "independent" },
    { "key": "special_airship_sp_atk1", "label": "骑空艇独立加成", "cap": null, "format": "percent", "category": "special" },
    { "key": "special_airship_sp_atk2", "label": "骑空艇船炉加成", "cap": null, "format": "percent", "category": "special" },



 // 角色buff加成类 (普通角色)；charabuff_ta 存游戏内必 TA 加算白值，面板显示「ta率提升」+ 纯数字，非百分比
 { "key": "charabuff_ta", "label": "ta率提升", "cap": null, "format": "ta_rate_bonus", "category": "charabuff", "prop": "ta_rate", "zone": "chara_skill" },
 { "key": "charabuff_ta_must", "label": "必定ta", "cap": null, "format": "ta_rate_bonus", "category": "charabuff", "prop": "ta_rate", "zone": "chara_skill_must" },
 { "key": "charabuff_bonus_na_dmg_a2", "label": "平A属性追击(A2类)", "cap": null, "format": "percent", "category": "charabuff", "prop": "bonus_na", "zone": "A2" },
 { "key": "charabuff_bonus_na_dmg_e", "label": "平A属性追击(E类)", "cap": null, "format": "percent", "category": "charabuff", "prop": "bonus_na", "zone": "E" },
 { "key": "weapon_destruction_bonus_na", "label": "平a破坏属性追击", "cap": null, "format": "percent", "category": "charabuff", "prop": "bonus_na_destruction", "zone": "chara_skill" },
 { "key": "charabuff_dmg_supp_q", "label": "全伤害上升（q区）", "cap": null, "format": "fixed", "category": "charabuff", "prop": "dmg_supp", "zone": "chara_skill" },
 { "key": "charabuff_double_strike", "label": "再攻击", "cap": null, "format": "fixed", "category": "charabuff", "prop": "double_strike", "zone": "chara_skill" },














];

// ---------- charabuff：prop + type → STAT_CONFIG.key（未登记则 warn 且不入 stats）----------
let _charabuffStatKeySetCache = null;

function getCharabuffStatKeySet() {
    if (_charabuffStatKeySetCache) return _charabuffStatKeySetCache;
    _charabuffStatKeySetCache = new Set(
        STAT_CONFIG.filter((c) => c && c.category === 'charabuff' && c.key).map((c) => c.key)
    );
    return _charabuffStatKeySetCache;
}

/** 供 calc 等遍历清零 party.stats 中的 charabuff 键 */
function getCharabuffStatKeysList() {
    return Array.from(getCharabuffStatKeySet());
}

function normalizeCharabuffTypeSuffix(type) {
    if (type == null) return '';
    const s = String(type).trim();
    if (!s) return '';
    return s.toLowerCase().replace(/\s+/g, '_');
}

/**
 * charabuff.json 的 prop + type 或 apply_buff 的 buff_id + parameters.type
 * → STAT_CONFIG 中 category=charabuff 的 key。
 * - type 为空：prop 须本身是已登记的完整 key（如 charabuff_ta、charabuff_double_strike）。
 * - type 非空：拼接 prop + '_' + normalize(type)（如 charabuff_dmg_supp + q → charabuff_dmg_supp_q）。
 * 未登记则 console.warn 并返回 null（不累加）。
 */
function resolveCharabuffStatKey(prop, type) {
    if (prop == null || String(prop).trim() === '') {
        console.warn('[charabuff] resolveCharabuffStatKey: 缺少 prop');
        return null;
    }
    const p = String(prop).trim();
    const suffix = normalizeCharabuffTypeSuffix(type);
    const set = getCharabuffStatKeySet();

    if (!suffix) {
        if (set.has(p)) return p;
        console.warn('[charabuff] prop 未在 STAT_CONFIG 登记，且未提供 type 以拼接:', p);
        return null;
    }

    const composite = `${p}_${suffix}`;
    if (set.has(composite)) return composite;
    console.warn('[charabuff] 拼接键未在 STAT_CONFIG 登记:', composite, { prop: p, type });
    return null;
}

// 主角 LB 加成展示表（用于常驻加成面板的“主角LB加成”小节）
// 与 STAT_CONFIG 的显示规则保持一致：format 为 percent/fixed，render 时统一做隐藏阈值处理。
const MC_LB_DISPLAY_TABLE = [
    { key: 'baseAtk', label: 'LB攻击力', format: 'fixed', cap: null },
    { key: 'baseHp', label: 'LB生命值', format: 'fixed', cap: null },
    { key: 'partyHpFlat', label: '我方全体HP', format: 'fixed', cap: null },
    { key: 'prof1', label: '得意武器攻击1系数', format: 'percent', cap: null },
    { key: 'prof2', label: '得意武器攻击2系数', format: 'percent', cap: null },
    { key: 'prof12', label: '得意武器攻击1·2系数', format: 'percent', cap: null },
    { key: 'mcDef', label: '防御力', format: 'percent', cap: null },
    { key: 'da', label: 'DA几率', format: 'percent', cap: null },
    { key: 'ta', label: 'TA几率', format: 'percent', cap: null },
    { key: 'crit', label: '暴击率', format: 'percent', cap: null },
    { key: 'caDmg', label: '奥义伤害', format: 'percent', cap: null },
    { key: 'skillDmg', label: '技能伤害', format: 'percent', cap: null },
    { key: 'skillCap', label: '技能伤害上限', format: 'percent', cap: null },
    { key: 'allCap', label: '伤害上限', format: 'percent', cap: null },
    { key: 'cbDmg', label: 'CB伤害', format: 'percent', cap: null },
    { key: 'cbCap', label: 'CB伤害上限', format: 'percent', cap: null },
    { key: 'debuffRes', label: '弱体耐性', format: 'percent', cap: null },
    { key: 'debuffSuccess', label: '弱体成功率', format: 'percent', cap: null },
    { key: 'healCap', label: '回复性能', format: 'percent', cap: null },
    { key: 'elementAtkFire', label: '火属性攻击', format: 'percent', cap: null },
    { key: 'elementAtkWater', label: '水属性攻击', format: 'percent', cap: null },
    { key: 'elementAtkEarth', label: '土属性攻击', format: 'percent', cap: null },
    { key: 'elementAtkWind', label: '风属性攻击', format: 'percent', cap: null },
    { key: 'elementAtkLight', label: '光属性攻击', format: 'percent', cap: null },
    { key: 'elementAtkDark', label: '暗属性攻击', format: 'percent', cap: null },
    { key: 'elementAtkAll', label: '全属性属攻加成', format: 'percent', cap: null },
    { key: 'elementReduce', label: '属性减轻', format: 'percent', cap: null }
    
];

/**
 * apply_buff 左侧「角色 Buff」展示兜底（buff_id → { icon, title, abbrev }）
 * 优先 buff_icons.json → globalBuffIconsMap；此处仅未加载 JSON 时使用。
 * 单个 effect 可用 party_buff_ui 覆盖。
 */
const CHARA_APPLY_BUFF_PARTY_UI = {};

// 导出常量
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        STORAGE_KEY,
        CONFIG_VERSION,
        CURRENT_USER_STORAGE_KEY,
        getUserStorageKey,
        getCharBonusStorageKey,
        currentUserId,
        DEFAULT_MASTERY1,
        DEFAULT_MASTERY2,
        getDefaultMastery,
        ELEMENT_COLORS,
        SKILL_ELEMENT_MAP,
        WEAPON_TYPE_MAP,
        DISPLAY_NAME_MAP,
        STAT_CONFIG,
        MC_LB_DISPLAY_TABLE,
        CHARA_APPLY_BUFF_PARTY_UI,
        getCharabuffStatKeySet,
        getCharabuffStatKeysList,
        resolveCharabuffStatKey,
        normalizeCharabuffTypeSuffix
    };
}
