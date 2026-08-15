// ==========================================
//  GBF 模拟器 - 伤害上限计算模块 (Damage Cap Module)
// ==========================================
// 
// 阈值表现在统一由 threshold_registry.js 从 threshold_tables.json 加载。
// 本模块只负责衰减计算逻辑（funcDecay、calculateTotalCap、calculateAmp 等），
// 不再硬编码任何阈值数值。

/**
 * 核心衰减函数 (Func_Decay)
 * @param {number} rawDamage - 理论面板伤害 (未衰减, 已除防御)
 * @param {number} totalCap - 总上限系数 (1.0 + sum(caps))
 * @param {Array<{limit:number,slope:number}>} thresholdStages - 分段阈值表（stages 数组）
 * @returns {Decimal} 衰减后的伤害 (Decimal 精度)
 */
function funcDecay(rawDamage, totalCap, thresholdStages) {
    // 确保使用 Decimal 进行高精度计算
    let damage = new Decimal(rawDamage);
    const cap = new Decimal(totalCap);
    
    let decayedDamage = new Decimal(0);
    let previousThreshold = new Decimal(0);
    
    const stages = thresholdStages || [];
    
    for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        
        // 当前阶段的实际判定阈值 = 基础阈值 * 总上限系数
        let currentThreshold = stage.limit === Infinity 
            ? new Decimal(Infinity) 
            : new Decimal(stage.limit).times(cap);
            
        // 如果当前伤害已经小于上一阶段的阈值，说明计算结束
        if (damage.lte(previousThreshold)) {
            break;
        }
        
        // 计算当前区间的有效伤害量: min(伤害, 当前阈值) - 上一阈值
        let effectiveDamageInStage = Decimal.min(damage, currentThreshold).minus(previousThreshold);
        
        if (effectiveDamageInStage.isNegative()) {
            effectiveDamageInStage = new Decimal(0);
        }
        
        // 累加衰减后的伤害: 有效量 * 斜率
        decayedDamage = decayedDamage.plus(effectiveDamageInStage.times(stage.slope));
        
        // 如果伤害小于当前阈值，后续区间无需计算
        if (damage.lte(currentThreshold)) {
            break;
        }
        
        previousThreshold = currentThreshold;
    }
    
    return decayedDamage;
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
    var charIndex = options.charIndex != null ? options.charIndex : 0;
    if (typeof getAllEffectsTotalForSlot === 'function') {
        var mappedCapType = capType === 'na' ? 'na_dmg_cap'
            : capType === 'skill' ? 'skill_dmg_cap'
            : capType === 'ca' ? 'ca_dmg_cap'
            : null;
        if (mappedCapType) {
            var allEffectsCap = getAllEffectsTotalForSlot(charIndex, mappedCapType, null);
            if (typeof allEffectsCap === 'number') return new Decimal(1.0).plus(allEffectsCap).toNumber();
        }
    }

    let totalCap = new Decimal(1.0);

    // 1. 全上限 (All Cap)
    const weaponCap = Math.min(stats['weapon_dmg_cap'] || 0, 0.2);
    const allCap = new Decimal(weaponCap)
        .plus(stats['mc_all_cap_passive'] || 0)
        .plus(stats['mc_all_cap_passive_non_c5'] || 0)
        .plus(stats['summon_dmg_cap'] || 0)
        .plus(stats['weapon_special_dmg_cap'] || 0)
        .plus(stats['chara_marriage_dmg_cap'] || 0);

    // 2. 特殊物品全上限
    if (teshuStats && teshuStats['dmg_cap']) {
        totalCap = totalCap.plus(teshuStats['dmg_cap']);
    }
        
    // 3. 特定伤害类型上限
    let specificCap = new Decimal(0);
    
    if (capType === 'na') {
        specificCap = new Decimal(stats['weapon_na_dmg_cap'] || 0)
            .plus(stats['weapon_ax_na_dmg_cap'] || 0);
        if (teshuStats && teshuStats['na_dmg_cap']) {
            specificCap = specificCap.plus(teshuStats['na_dmg_cap']);
        }
    } else if (capType === 'skill') {
        specificCap = new Decimal(stats['weapon_skill_dmg_cap'] || 0)
            .plus(stats['mc_skill_dmg_cap_passive'] || 0)
            .plus(stats['weapon_special_skill_dmg_cap'] || 0)
            .plus(stats['weapon_ax_skill_dmg_cap'] || 0);
    } else if (capType === 'ca') {
        specificCap = new Decimal(stats['weapon_ca_dmg_cap'] || 0)
            .plus(stats['weapon_ax_ca_dmg_cap'] || 0)
            .plus(stats['chara_lb_ca_dmg_cap'] || 0)
            .plus(stats['chara_ring_ca_dmg_cap'] || 0)
            .plus(stats['chara_artifacts_ca_dmg_cap'] || 0)
            .plus(stats['chara_awakening_ca_dmg_cap'] || 0);
        if (teshuStats && teshuStats['ca_dmg_cap']) {
            specificCap = specificCap.plus(teshuStats['ca_dmg_cap']);
        }
        if (typeof window !== 'undefined' && window.buffSettings && window.buffSettings.caCap) {
            specificCap = specificCap.plus(window.buffSettings.caCap);
        }
    } else if (capType === 'cb') {
        specificCap = new Decimal(stats['weapon_cb_dmg_cap'] || 0)
            .plus(stats['mc_cb_cap_passive'] || 0);
    }
    
    totalCap = totalCap.plus(allCap).plus(specificCap);

    // testbuff
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
 * @returns {number} 增幅系数
 */
function calculateAmp(stats, ampType, teshuStats) {
    var options = arguments.length > 3 && arguments[3] ? arguments[3] : {};
    var charIndex = options.charIndex != null ? options.charIndex : 0;
    if (typeof getAllEffectsTotalForSlot === 'function') {
        var mappedAmpType = ampType === 'na' ? 'na_dmg_amp'
            : ampType === 'skill' ? 'skill_dmg_amp'
            : ampType === 'ca' ? 'ca_dmg_amp'
            : null;
        if (mappedAmpType) {
            var allEffectsAmp = getAllEffectsTotalForSlot(charIndex, mappedAmpType, null);
            if (typeof allEffectsAmp === 'number') return allEffectsAmp;
        }
    }

    let amp = new Decimal(0);
    
    amp = amp.plus(stats['weapon_dmg_amp'] || 0);
    
    if (teshuStats && teshuStats['dmg_amp']) {
        amp = amp.plus(teshuStats['dmg_amp']);
    }
    
    if (ampType === 'na') {
        amp = amp.plus(stats['weapon_na_dmg_amp'] || 0)
             .plus(stats['weapon_special_na_dmg_amp'] || 0);
    } else if (ampType === 'skill') {
        amp = amp.plus(stats['weapon_skill_dmg_amp'] || 0)
             .plus(stats['weapon_special_skill_dmg_amp'] || 0);
    } else if (ampType === 'ca') {
        amp = amp.plus(stats['weapon_ca_dmg_amp'] || 0)
             .plus(stats['weapon_special_ca_dmg_amp'] || 0);
    } else if (ampType === 'cb') {
        amp = amp.plus(stats['weapon_cb_dmg_amp'] || 0);
    }

    if (typeof window !== 'undefined' && window.buffSettings && window.buffSettings.dmgAmp) {
        amp = amp.plus(window.buffSettings.dmgAmp);
    }

    return amp.toNumber();
}

function calculateTakenDamageAmp() {
    var options = arguments.length > 0 && arguments[0] ? arguments[0] : {};
    var charIndex = options.charIndex != null ? options.charIndex : 0;
    if (typeof getAllEffectsTotalForSlot === 'function') {
        var allEffectsTakenAmp = getAllEffectsTotalForSlot(charIndex, 'taken_dmg_amp', null);
        if (typeof allEffectsTakenAmp === 'number') return allEffectsTakenAmp;
    }
    if (typeof window !== 'undefined' && window.buffSettings && window.buffSettings.takenDmgAmp) {
        return Number(window.buffSettings.takenDmgAmp) || 0;
    }
    return 0;
}

/**
 * 世界上限衰减 (第二段衰减)
 * 在增幅乘算之后应用，对 na/skill/ca 类型生效，cb 不生效。
 * 奥义(ca)类型：阈值乘以 (1 + weapon_special_ca_dmg_cap + chara_artifacts_special_ca_dmg_cap) 系数。
 * 其他类型：阈值为固定值 (totalCap = 1.0)。
 * 阈值表从 ThresholdRegistry 获取。
 *
 * @param {number} ampedDamage - 增幅后的伤害
 * @param {string} type - 伤害类型 ('na', 'skill', 'ca', 'cb')
 * @param {object} stats - 统计对象
 * @param {string} worldCapMode - '660' | '1310' | 'none'
 * @returns {Decimal} 世界上限衰减后的伤害 (Decimal 精度)
 */
function applyWorldCap(ampedDamage, type, stats, worldCapMode) {
    if (type === 'cb') {
        return new Decimal(ampedDamage);
    }

    if (worldCapMode === 'none') {
        return new Decimal(ampedDamage);
    }
    
    // 计算世界上限的总上限系数
    let worldCapC = 1.0;
    if (type === 'ca') {
        const weaponSpecialCaCap = Number(stats['weapon_special_ca_dmg_cap'] || 0);
        const charaSpecialCaCap = Number(stats['chara_artifacts_special_ca_dmg_cap'] || 0);
        worldCapC = 1 + weaponSpecialCaCap + charaSpecialCaCap;
    }

    // 从注册表获取世界衰减表
    const worldStages = (typeof ThresholdRegistry !== 'undefined' && typeof ThresholdRegistry.getWorldCap === 'function')
        ? ThresholdRegistry.getWorldCap(worldCapMode || '660')
        : null;
    
    if (!worldStages || worldStages.length === 0) {
        console.warn('[WorldCap] No stages found for mode=' + worldCapMode + ', skipping world cap');
        return new Decimal(ampedDamage);
    }
    
    const worldCappedDamage = funcDecay(ampedDamage, worldCapC, worldStages);
    return worldCappedDamage;
}

/**
 * 应用伤害上限逻辑 (主入口)
 * 只负责计算衰减后的伤害和各项系数，不做增幅乘算/世界衰减/取整。
 * 最终伤害的拼装由各伤害类型调用方自行完成（平A/技伤/奥义公式不同）。
 *
 * 阈值表选择通过 options.thresholdTableId 或自动按 type + multiplier 从 ThresholdRegistry 匹配。
 *
 * @param {number} rawDamage - 理论面板伤害 (未衰减, 已除防御)
 * @param {object} stats - 统计对象
 * @param {string} type - 伤害类型 ('na', 'skill', 'ca', 'cb')
 * @param {object} teshuStats - 特殊加成
 * @param {number} extraAmp - 额外的增幅系数（仅用于汇总 ampCoef，不在此处应用）
 * @param {object} options - 额外选项
 *   { thresholdTableId: string, caMultiplier: number, worldCapMode: string, isClass5: boolean }
 * @returns {object} { decayedDamage, capCoef, ampCoef, takenDmgAmpCoef, thresholdTableId }
 */
function applyDamageCap(rawDamage, stats, type, teshuStats, extraAmp = 0, options = {}) {
    // 1. 计算总上限系数 C
    const C = calculateTotalCap(stats, type, teshuStats, options);
    
    // 2. 获取阈值表
    let thresholdStages;
    let usedTableId = null;
    
    const tableId = options.thresholdTableId;
    
    if (typeof ThresholdRegistry !== 'undefined' && typeof ThresholdRegistry.resolve === 'function') {
        // 优先用 tableId 精确匹配；无 tableId 时用 type 默认表
        const resolved = ThresholdRegistry.resolve(type, null, tableId);
        if (resolved && resolved.stages) {
            thresholdStages = resolved.stages;
            usedTableId = resolved.tableId;
        }
    }
    
    if (!thresholdStages || thresholdStages.length === 0) {
        // 终极兜底：使用内置的最基础 5 段表
        console.warn('[DamageCap] No threshold table resolved for type=' + type + ', using hardcoded fallback');
        thresholdStages = [
            { limit: 300000, slope: 1.0 },
            { limit: 400000, slope: 0.8 },
            { limit: 500000, slope: 0.6 },
            { limit: 600000, slope: 0.05 },
            { limit: Infinity, slope: 0.01 }
        ];
        usedTableId = 'fallback';
    }
    
    // 3. 执行衰减 (Func_Decay)
    const decayedDamage = funcDecay(rawDamage, C, thresholdStages);
    
    // 4. 计算增幅系数 Amp（仅汇总，不应用乘算）
    const baseAmp = calculateAmp(stats, type, teshuStats, options);
    const totalAmp = new Decimal(baseAmp).plus(extraAmp).toNumber();
    
    // 5. 承受伤害增幅系数（仅汇总，不应用乘算）
    const takenDmgAmp = calculateTakenDamageAmp(options);
    
    console.log(`[Cap Debug ${type}] Table: ${usedTableId}, Raw: ${rawDamage}, C: ${C.toFixed(4)}, Decayed: ${new Decimal(decayedDamage).toNumber()}, Amp: ${totalAmp.toFixed(6)}, TakenAmp: ${takenDmgAmp.toFixed(6)}`);
    
    return {
        decayedDamage: new Decimal(decayedDamage).toNumber(),
        capCoef: C,
        ampCoef: totalAmp,
        takenDmgAmpCoef: takenDmgAmp,
        thresholdTableId: usedTableId
    };
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        funcDecay,
        calculateTotalCap,
        calculateAmp,
        calculateTakenDamageAmp,
        applyWorldCap,
        applyDamageCap
    };
}
