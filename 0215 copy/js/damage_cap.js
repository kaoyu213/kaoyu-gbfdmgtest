// ==========================================
//  GBF 模拟器 - 伤害上限计算模块 (Damage Cap Module)
// ==========================================

// 阈值表配置 (基础值)
const THRESHOLD_TABLE = [
    { limit: 300000, slope: 1.0 },   // 0~30w: 100%
    { limit: 400000, slope: 0.8 },   // 30w~40w: 80%
    { limit: 500000, slope: 0.6 },   // 40w~50w: 60%
    { limit: 600000, slope: 0.05 },  // 50w~60w: 5%
    { limit: Infinity, slope: 0.01 } // >60w: 1%
];

// 世界上限衰减分段（第二段衰减，在增幅乘算之后应用）
// 阈值为固定值，不受总上限系数 C 影响
// 奥义(ca)类型：阈值会乘以 (1 + weapon_special_ca_dmg_cap + chara_artifacts_special_ca_dmg_cap) 系数
const WORLD_CAP_THRESHOLD_TABLE = [
    { limit: 6000000,  slope: 1.0 },    // 0~600万: 0%衰减
    { limit: 7000000,  slope: 0.5 },    // 600万~700万: 50%衰减
    { limit: 8000000,  slope: 0.1 },    // 700万~800万: 90%衰减
    { limit: Infinity,  slope: 0.001 }   // 800万以上: 99.999%衰减
];

// 世界上限衰减分段（1310万版本）
// 衰减前伤害	本级衰减率	衰减后伤害
// 0~1200万	0%	1200万
// 1200万~1400万	50%	1300万（1200万＋200万×0.5）
// 1400万~1500万	90%	1310万（1300万＋100万×0.1）
// 1500万以上	99.999%	-
const WORLD_CAP_THRESHOLD_TABLE_1310 = [
    { limit: 12000000, slope: 1.0 },   // 0~1200万: 0%衰减
    { limit: 14000000, slope: 0.5 },   // 1200万~1400万: 50%衰减
    { limit: 15000000, slope: 0.1 },   // 1400万~1500万: 90%衰减
    { limit: Infinity,  slope: 0.001 }  // 1500万以上: 99.999%衰减
];

// 奥义倍率=4.5 时的上限衰减分段（非主角角色默认奥义倍率）
// 说明：
// - 0~150万：本级衰减率 0% => 余量系数 1.0
// - 150万~170万：本级衰减率 40% => 余量系数 0.6
// - 170万~180万：本级衰减率 70% => 余量系数 0.3
// - 180万~250万：本级衰减率 95% => 余量系数 0.05
// - 250万以上：本级衰减率 99% => 余量系数 0.01
const THRESHOLD_TABLE_CA_OUGI_4_5 = [
    { limit: 1500000, slope: 1.0 },
    { limit: 1700000, slope: 0.6 },
    { limit: 1800000, slope: 0.3 },
    { limit: 2500000, slope: 0.05 },
    { limit: Infinity, slope: 0.01 }
];
const THRESHOLD_TABLE_CA_OUGI_test = [
    { limit: 1800000, slope: 1.0 },
    { limit: 2000000, slope: 0.6 },
    { limit: 2200000, slope: 0.3 },
    { limit: 3000000, slope: 0.05 },
    { limit: Infinity, slope: 0.01 }
];


// 奥义倍率=5 时的上限衰减分段（临时，仅先覆盖 caMultiplier=5）
// 说明：
// - 0~150万：本级衰减率 0% => 余量系数 1.0
// - 150万~170万：本级衰减率 40% => 余量系数 0.6
// - 170万~180万：本级衰减率 70% => 余量系数 0.3
// - 180万~250万：本级衰减率 95% => 余量系数 0.05
// - 250万以上：本级衰减率 99% => 余量系数 0.01
const THRESHOLD_TABLE_CA_OUGI_5 = [
    { limit: 1500000, slope: 1.0 },
    { limit: 1700000, slope: 0.6 },
    { limit: 1800000, slope: 0.3 },
    { limit: 2500000, slope: 0.05 },
    { limit: Infinity, slope: 0.01 }
];

/**
 * 核心衰减函数 (Func_Decay)
 * @param {number} rawDamage - 理论面板伤害 (未衰减, 已除防御)
 * @param {number} totalCap - 总上限系数 (1.0 + sum(caps))
 * @param {Array<{limit:number,slope:number}>} thresholdTable - 分段阈值表
 * @returns {number} 衰减后的伤害
 */
function funcDecay(rawDamage, totalCap, thresholdTable = THRESHOLD_TABLE) {
    // 确保使用 Decimal 进行高精度计算
    let damage = new Decimal(rawDamage);
    const cap = new Decimal(totalCap);
    
    let decayedDamage = new Decimal(0);
    let previousThreshold = new Decimal(0);
    
    for (let i = 0; i < thresholdTable.length; i++) {
        const stage = thresholdTable[i];
        
        // 当前阶段的实际判定阈值 = 基础阈值 * 总上限系数
        let currentThreshold = stage.limit === Infinity 
            ? new Decimal(Infinity) 
            : new Decimal(stage.limit).times(cap);
            
        // 如果当前伤害已经小于上一阶段的阈值，说明计算结束 (理论上不会发生，因为是从0开始累加)
        if (damage.lte(previousThreshold)) {
            break;
        }
        
        // 计算当前区间的有效伤害量
        // 有效量 = min(伤害, 当前阈值) - 上一阈值
        let effectiveDamageInStage = Decimal.min(damage, currentThreshold).minus(previousThreshold);
        
        // 如果有效量为负 (即伤害小于上一阈值)，则视为0
        if (effectiveDamageInStage.isNegative()) {
            effectiveDamageInStage = new Decimal(0);
        }
        
        // 累加衰减后的伤害: 有效量 * 斜率
        decayedDamage = decayedDamage.plus(effectiveDamageInStage.times(stage.slope));
        
        // 如果伤害小于当前阈值，说明后续区间无需计算，直接跳出
        if (damage.lte(currentThreshold)) {
            break;
        }
        
        // 更新上一阈值
        previousThreshold = currentThreshold;
    }
    
    // 重构目标：不在衰减阶段做任何取整，保留 Decimal 精度到最终增幅阶段统一 ceil
    return decayedDamage;
}

function getDisplayCapBaseFromThresholdTable(thresholdTable) {
    if (!Array.isArray(thresholdTable) || thresholdTable.length === 0) return null;

    let targetLimit = null;
    for (let i = thresholdTable.length - 1; i >= 0; i--) {
        if (thresholdTable[i].limit !== Infinity) {
            targetLimit = thresholdTable[i].limit;
            break;
        }
    }
    if (targetLimit == null) return null;

    return funcDecay(targetLimit, 1, thresholdTable).floor().toNumber();
}

function getCaDisplayCapBase(caMultiplier) {
    const mult = Number(caMultiplier);
    if (Number.isFinite(mult)) {
        if (Math.abs(mult - 4.5) < 1e-6) {
            return getDisplayCapBaseFromThresholdTable(THRESHOLD_TABLE_CA_OUGI_4_5);
        }
        if (Math.abs(mult - 5) < 1e-6) {
            return getDisplayCapBaseFromThresholdTable(THRESHOLD_TABLE_CA_OUGI_5);
        }
    }
    return null;
}

/**
 * 计算总上限系数 (C)
 * @param {object} stats - 统计对象 (party[i].stats)
 * @param {string} capType - 上限类型 ('na', 'skill', 'ca', 'cb')
 * @param {object} teshuStats - 特殊饰品加成
 * @param {object} options - 额外选项 (如 { isClass5: boolean })
 * @returns {number} 总上限系数
 */
function calculateTotalCap(stats, capType, teshuStats, options = {}) {
    let totalCap = new Decimal(1.0);

    // 1. 全上限 (All Cap)
    // 来源: 武器盘全上限(浩劫/法武), 职业精通(Mastery), 角色LB(Over Mastery), 饰品, 特殊系统
    // 武器盘全上限独立受20%上限限制
    const weaponCap = Math.min(stats['weapon_dmg_cap'] || 0, 0.2);
    const allCap = new Decimal(weaponCap)
        .plus(stats['mc_all_cap_passive'] || 0)             // 包含全职业常驻的 1%
        .plus(stats['mc_all_cap_passive_non_c5'] || 0)      // 包含非C5加成的 3%
        .plus(stats['summon_dmg_cap'] || 0)
        .plus(stats['weapon_special_dmg_cap'] || 0)
        .plus(stats['chara_marriage_dmg_cap'] || 0);        // 婚戒全上限+5%

    // 2. 特殊物品全上限 (teshuStats['dmg_cap']) - 如 0.03
    if (teshuStats && teshuStats['dmg_cap']) {
        totalCap = totalCap.plus(teshuStats['dmg_cap']);
    }
        
    // 4. 特定伤害类型上限
    let specificCap = new Decimal(0);
    
    if (capType === 'na') { // 普通攻击 (Normal Attack)
        specificCap = new Decimal(stats['weapon_na_dmg_cap'] || 0)
            .plus(stats['weapon_ax_na_dmg_cap'] || 0); // 附魔
            
        // 特殊物品普攻上限 (teshuStats['na_dmg_cap']) - 如 0.05
        if (teshuStats && teshuStats['na_dmg_cap']) {
            specificCap = specificCap.plus(teshuStats['na_dmg_cap']);
        }
            
    } else if (capType === 'skill') { // 技能伤害 (Skill Damage)
        specificCap = new Decimal(stats['weapon_skill_dmg_cap'] || 0)
            .plus(stats['mc_skill_dmg_cap_passive'] || 0)
            .plus(stats['weapon_special_skill_dmg_cap'] || 0)
            .plus(stats['weapon_ax_skill_dmg_cap'] || 0);
            
    } else if (capType === 'ca') { // 奥义伤害 (Chain Burst / CA)
        // weapon_special_ca_dmg_cap 和 chara_artifacts_special_ca_dmg_cap 已移至世界上限阈值扩展，不再作用于普通上限
        specificCap = new Decimal(stats['weapon_ca_dmg_cap'] || 0)
            .plus(stats['weapon_ax_ca_dmg_cap'] || 0)
            // 角色个人奥义上限（LB、戒指、神器、觉醒等，需先 overlay 进 stats）
            .plus(stats['chara_lb_ca_dmg_cap'] || 0)
            .plus(stats['chara_ring_ca_dmg_cap'] || 0)
            .plus(stats['chara_artifacts_ca_dmg_cap'] || 0)
            .plus(stats['chara_awakening_ca_dmg_cap'] || 0);
            
        // 特殊饰品：奥义伤害上限（teshuStats['ca_dmg_cap']）
        if (teshuStats && teshuStats['ca_dmg_cap']) {
            specificCap = specificCap.plus(teshuStats['ca_dmg_cap']);
        }
        if (typeof window !== 'undefined' && window.buffSettings && window.buffSettings.caCap) {
            specificCap = specificCap.plus(window.buffSettings.caCap);
        }
            
    } else if (capType === 'cb') { // 奥义连锁 (Chain Burst)
        specificCap = new Decimal(stats['weapon_cb_dmg_cap'] || 0)
            .plus(stats['mc_cb_cap_passive'] || 0);
    }
    
    // 汇总: 1.0 + All Cap + Specific Cap
    // 上限类词条通常上限为 20% (0.2), 但这是针对武器盘的，这里传进来的 stats 应该已经是聚合后的值
    // 此时不再做单项上限限制，直接累加，因为 stats 里的值理论上在 aggregate 阶段已经处理过盘子上限
    // (注意: 这里的 stats 是从 party[i].stats 来的，如果 calc.js 里没有处理上限，这里需要确认)
    // 根据 calc.js 的逻辑，stats 里的值已经是 sum(weapons) 并经过 cap 处理的。
    
    totalCap = totalCap.plus(allCap).plus(specificCap);

    // testbuff：伤害上限乘区修正 (all cap)
    if (typeof window !== 'undefined' && window.buffSettings && window.buffSettings.dmgCap) {
        totalCap = totalCap.plus(window.buffSettings.dmgCap);
    }
    
    console.log(`[Cap Debug ${capType}]`, {
        weapon_dmg_cap: stats['weapon_dmg_cap'],
        job_all_cap: stats['mc_all_cap_passive'],
        job_non_c5_cap: stats['mc_all_cap_passive_non_c5'],
        summon_dmg_cap: stats['summon_dmg_cap'],
        weapon_special_cap: stats['weapon_special_dmg_cap'],
        teshu_dmg_cap: teshuStats ? teshuStats['dmg_cap'] : 0,
        weapon_na_cap: capType === 'na' ? stats['weapon_na_dmg_cap'] : 'N/A',
        teshu_na_cap: (capType === 'na' && teshuStats) ? teshuStats['na_dmg_cap'] : 'N/A',
        teshu_ca_cap: (capType === 'ca' && teshuStats) ? teshuStats['ca_dmg_cap'] : 'N/A',
        final_total: totalCap.toNumber()
    });

    return totalCap.toNumber();
}

/**
 * 计算独立增幅系数 (Amp)
 * @param {object} stats - 统计对象
 * @param {string} ampType - 增幅类型 ('na', 'skill', 'ca', 'cb')
 * @param {object} teshuStats - 特殊饰品加成
 * @returns {number} 增幅系数 (例如 0.1 代表 10% 增幅)
 */
function calculateAmp(stats, ampType, teshuStats) {
    let amp = new Decimal(0);
    
    // 1. 全伤害增幅 (Generic Amp)
    // 来源: 武器盘(dmg_amp), 饰品(dmg_amp)
    amp = amp.plus(stats['weapon_dmg_amp'] || 0);
    
    // 2. 饰品/特殊加成中的全增幅
    if (teshuStats && teshuStats['dmg_amp']) {
        amp = amp.plus(teshuStats['dmg_amp']);
    }
    
    // 3. 特定类型增幅
    if (ampType === 'na') {
        amp = amp.plus(stats['weapon_na_dmg_amp'] || 0)
             .plus(stats['weapon_special_na_dmg_amp'] || 0);
        // 职业/角色被动增幅通常在 updateDamageDisplay 中手动处理，这里仅计算 stats 中的
             
    } else if (ampType === 'skill') {
        amp = amp.plus(stats['weapon_skill_dmg_amp'] || 0)
             .plus(stats['weapon_special_skill_dmg_amp'] || 0);
             
    } else if (ampType === 'ca') {
        amp = amp.plus(stats['weapon_ca_dmg_amp'] || 0)
             .plus(stats['weapon_special_ca_dmg_amp'] || 0);
             
    } else if (ampType === 'cb') {
        amp = amp.plus(stats['weapon_cb_dmg_amp'] || 0);
    }

    // testbuff：伤害增幅乘区修正 (dmg amp)
    if (typeof window !== 'undefined' && window.buffSettings && window.buffSettings.dmgAmp) {
        amp = amp.plus(window.buffSettings.dmgAmp);
    }

    return amp.toNumber();
}

function calculateTakenDamageAmp() {
    if (typeof window !== 'undefined' && window.buffSettings && window.buffSettings.takenDmgAmp) {
        return Number(window.buffSettings.takenDmgAmp) || 0;
    }
    return 0;
}

/**
 * 世界上限衰减 (第二段衰减)
 * 在增幅乘算之后应用，对 na/skill/ca 类型生效，cb 不生效
 * 奥义(ca)类型：阈值乘以 (1 + weapon_special_ca_dmg_cap + chara_artifacts_special_ca_dmg_cap) 系数
 * 其他类型：阈值为固定值 (totalCap = 1.0)
 * @param {number} ampedDamage - 增幅后的伤害
 * @param {string} type - 伤害类型 ('na', 'skill', 'ca', 'cb')
 * @param {object} stats - 统计对象
 * @returns {Decimal} 世界上限衰减后的伤害 (Decimal 精度)
 */
function applyWorldCap(ampedDamage, type, stats, worldCapMode) {
    // cb (连锁奥义) 不应用世界上限
    if (type === 'cb') {
        return new Decimal(ampedDamage);
    }

    // worldCapMode: "660" | "1310" | "none"
    // "none" 表示不应用世界上限衰减
    if (worldCapMode === 'none') {
        return new Decimal(ampedDamage);
    }
    
    // 计算世界上限的总上限系数
    // 奥义(ca): 阈值乘以 (1 + weapon_special_ca_dmg_cap + chara_artifacts_special_ca_dmg_cap)
    // 其他类型: 阈值固定，系数为 1.0
    let worldCapC = 1.0;
    if (type === 'ca') {
        const weaponSpecialCaCap = Number(stats['weapon_special_ca_dmg_cap'] || 0);
        const charaSpecialCaCap = Number(stats['chara_artifacts_special_ca_dmg_cap'] || 0);
        worldCapC = 1 + weaponSpecialCaCap + charaSpecialCaCap;
    }

    // 根据 worldCapMode 选择阈值表
    let worldTable = WORLD_CAP_THRESHOLD_TABLE; // 默认660万
    if (worldCapMode === '1310') {
        worldTable = WORLD_CAP_THRESHOLD_TABLE_1310;
    }
    
    const worldCappedDamage = funcDecay(ampedDamage, worldCapC, worldTable);
    return worldCappedDamage;
}

/**
 * 应用伤害上限逻辑 (主入口)
 * @param {number} rawDamage - 理论面板伤害 (未衰减, 已除防御)
 * @param {object} stats - 统计对象
 * @param {string} type - 伤害类型 ('na', 'skill', 'ca', 'cb')
 * @param {object} teshuStats - 特殊加成
 * @param {number} extraAmp - 额外的增幅系数
 * @param {object} options - 额外选项 ({ isClass5: boolean })
 * @returns {object} { finalDamage, decayedDamage, capCoef, ampCoef, worldCappedDamage }
 */
function applyDamageCap(rawDamage, stats, type, teshuStats, extraAmp = 0, options = {}) {
    // 1. 计算总上限系数 C
    const C = calculateTotalCap(stats, type, teshuStats, options);
    
    // 2. 执行衰减 (Func_Decay)
    // 奥义上限：根据奥义倍率选择不同的阈值表
    let thresholdTable = THRESHOLD_TABLE;
    if (type === 'ca') {
        const caMultiplier = options && options.caMultiplier != null ? Number(options.caMultiplier) : null;
        // 容差放宽：避免浮点/字符串转数导致 4.999999 之类无法匹配
        if (caMultiplier != null && Math.abs(caMultiplier - 5) < 1e-6) {
            thresholdTable = THRESHOLD_TABLE_CA_OUGI_5;
        } else if (caMultiplier != null && Math.abs(caMultiplier - 4.5) < 1e-6) {
            thresholdTable = THRESHOLD_TABLE_CA_OUGI_4_5;
        }
    }
    const decayedDamage = funcDecay(rawDamage, C, thresholdTable);
    
    // 3. 计算增幅系数 Amp
    const baseAmp = calculateAmp(stats, type, teshuStats);
    const totalAmp = new Decimal(baseAmp).plus(extraAmp).toNumber();
    
    // 4. 执行增幅乘算: 衰减后 * (1 + Amp) (不取整，保留精度)
    const ampedDamage = new Decimal(decayedDamage).times(new Decimal(1).plus(totalAmp));

    // 4.5 承受伤害增幅：敌方 debuff 独立乘区，在伤害增幅之后、世界上限之前
    const takenDmgAmp = calculateTakenDamageAmp();
    const takenAmpedDamage = ampedDamage.times(new Decimal(1).plus(takenDmgAmp));
    
    // 5. 世界上限衰减 (第二段衰减，在增幅乘算之后)
    const worldCapMode = options && options.worldCapMode ? options.worldCapMode : '660';
    const worldCappedDamage = applyWorldCap(takenAmpedDamage, type, stats, worldCapMode);
    
    // 6. 最终向上取整
    const finalDamage = worldCappedDamage.ceil().toNumber();
    
    // 调试日志 (可选)
    console.log(`[Cap Debug ${type}] Raw: ${rawDamage}, C: ${C.toFixed(4)}, Decayed: ${new Decimal(decayedDamage).toNumber()}, Amp: ${totalAmp.toFixed(6)}, TakenAmp: ${takenDmgAmp.toFixed(6)}, Amped: ${ampedDamage.toNumber()}, TakenAmped: ${takenAmpedDamage.toNumber()}, WorldCapped: ${worldCappedDamage.toNumber()}, Final: ${finalDamage}`);
    
    return {
        finalDamage: finalDamage,
        decayedDamage: new Decimal(decayedDamage).toNumber(),
        worldCappedDamage: worldCappedDamage.toNumber(),
        capCoef: C,
        ampCoef: totalAmp,
        takenDmgAmpCoef: takenDmgAmp
    };
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        THRESHOLD_TABLE,
        WORLD_CAP_THRESHOLD_TABLE,
        THRESHOLD_TABLE_CA_OUGI_4_5,
        THRESHOLD_TABLE_CA_OUGI_5,
        funcDecay,
        calculateTotalCap,
        calculateAmp,
        calculateTakenDamageAmp,
        applyWorldCap,
        applyDamageCap
    };
}
