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

/**
 * 核心衰减函数 (Func_Decay)
 * @param {number} rawDamage - 理论面板伤害 (未衰减, 已除防御)
 * @param {number} totalCap - 总上限系数 (1.0 + sum(caps))
 * @returns {number} 衰减后的伤害
 */
function funcDecay(rawDamage, totalCap) {
    // 确保使用 Decimal 进行高精度计算
    let damage = new Decimal(rawDamage);
    const cap = new Decimal(totalCap);
    
    let decayedDamage = new Decimal(0);
    let previousThreshold = new Decimal(0);
    
    for (let i = 0; i < THRESHOLD_TABLE.length; i++) {
        const stage = THRESHOLD_TABLE[i];
        
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
    
    // 返回结果，向下取整 (GBF通常是取整)
    return decayedDamage.floor().toNumber();
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
    
    // 0. 全职业常驻汇总 (Global Mastery Fixed) - 1.0%
    totalCap = totalCap.plus(0.01);

    // 1. 非C5职业判定 (Non-C5 Class Bonus) - 3.0%
    // 只有当明确传入 isClass5=false 时才生效 (排除 undefined 情况，虽然默认 options={}，但调用方应传值)
    if (options.isClass5 === false) {
        totalCap = totalCap.plus(0.03);
    }

    // 2. 全上限 (All Cap)
    // 来源: 武器盘全上限(浩劫/法武), 职业精通(Mastery), 角色LB(Over Mastery), 饰品, 特殊系统
    // 武器盘全上限独立受20%上限限制
    const weaponCap = Math.min(stats['weapon_dmg_cap'] || 0, 0.2);
    const allCap = new Decimal(weaponCap)
        .plus(stats['chara_all_cap_passive'] || 0)
        .plus(stats['summon_dmg_cap'] || 0)
        .plus(stats['weapon_special_dmg_cap'] || 0);
    
    // totalCap = totalCap.plus(allCap); // 已移除：避免重复计算，最后统一加算

    // 3. 特殊物品全上限 (teshuStats['dmg_cap']) - 如 0.03
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
            .plus(stats['chara_skill_dmg_cap_passive'] || 0)
            .plus(stats['weapon_special_skill_dmg_cap'] || 0)
            .plus(stats['weapon_ax_skill_dmg_cap'] || 0);
            
    } else if (capType === 'ca') { // 奥义伤害 (Chain Burst / CA)
        specificCap = new Decimal(stats['weapon_ca_dmg_cap'] || 0)
            .plus(stats['weapon_special_ca_dmg_cap'] || 0)
            .plus(stats['weapon_ax_ca_dmg_cap'] || 0);
            
    } else if (capType === 'cb') { // 奥义连锁 (Chain Burst)
        specificCap = new Decimal(stats['weapon_cb_dmg_cap'] || 0)
            .plus(stats['chara_cb_cap_passive'] || 0);
    }
    
    // 汇总: 1.0 + All Cap + Specific Cap
    // 上限类词条通常上限为 20% (0.2), 但这是针对武器盘的，这里传进来的 stats 应该已经是聚合后的值
    // 此时不再做单项上限限制，直接累加，因为 stats 里的值理论上在 aggregate 阶段已经处理过盘子上限
    // (注意: 这里的 stats 是从 party[i].stats 来的，如果 calc.js 里没有处理上限，这里需要确认)
    // 根据 calc.js 的逻辑，stats 里的值已经是 sum(weapons) 并经过 cap 处理的。
    
    totalCap = totalCap.plus(allCap).plus(specificCap);
    
    console.log(`[Cap Debug ${capType}]`, {
        fixed_global: 0.01,
        non_c5: options.isClass5 === false ? 0.03 : 0,
        weapon_dmg_cap: stats['weapon_dmg_cap'],
        chara_all_cap: stats['chara_all_cap_passive'],
        summon_dmg_cap: stats['summon_dmg_cap'],
        weapon_special_cap: stats['weapon_special_dmg_cap'],
        teshu_dmg_cap: teshuStats ? teshuStats['dmg_cap'] : 0,
        weapon_na_cap: capType === 'na' ? stats['weapon_na_dmg_cap'] : 'N/A',
        teshu_na_cap: (capType === 'na' && teshuStats) ? teshuStats['na_dmg_cap'] : 'N/A',
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
    
    return amp.toNumber();
}

/**
 * 应用伤害上限逻辑 (主入口)
 * @param {number} rawDamage - 理论面板伤害 (未衰减, 已除防御)
 * @param {object} stats - 统计对象
 * @param {string} type - 伤害类型 ('na', 'skill', 'ca', 'cb')
 * @param {object} teshuStats - 特殊加成
 * @param {number} extraAmp - 额外的增幅系数
 * @param {object} options - 额外选项 ({ isClass5: boolean })
 * @returns {number} 最终伤害
 */
function applyDamageCap(rawDamage, stats, type, teshuStats, extraAmp = 0, options = {}) {
    // 1. 计算总上限系数 C
    const C = calculateTotalCap(stats, type, teshuStats, options);
    
    // 2. 执行衰减 (Func_Decay)
    const decayedDamage = funcDecay(rawDamage, C);
    
    // 3. 计算增幅系数 Amp
    const baseAmp = calculateAmp(stats, type, teshuStats);
    const totalAmp = new Decimal(baseAmp).plus(extraAmp).toNumber();
    
    // 4. 执行增幅乘算: 衰减后 * (1 + Amp)
    // 使用 Decimal 避免精度问题
    const preFloorDamage = new Decimal(decayedDamage).times(new Decimal(1).plus(totalAmp));
    const finalDamage = preFloorDamage.floor().toNumber();
    
    // 调试日志 (可选)
    console.log(`[Cap Debug ${type}] Raw: ${rawDamage}, C: ${C.toFixed(4)}, Decayed: ${decayedDamage}, Amp: ${totalAmp.toFixed(6)}, PreFloor: ${preFloorDamage.toNumber()}, Final: ${finalDamage}`);
    
    return {
        finalDamage: finalDamage,
        decayedDamage: decayedDamage,
        capCoef: C,
        ampCoef: totalAmp
    };
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        THRESHOLD_TABLE,
        funcDecay,
        calculateTotalCap,
        calculateAmp,
        applyDamageCap
    };
}
