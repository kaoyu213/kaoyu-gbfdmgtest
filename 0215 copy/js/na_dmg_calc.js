// ==========================================
//  GBF 模拟器 - 平A伤害计算模块 (从 damage_calc.js 迁移)
// ==========================================

// ==========================================
// 测试用 buff 状态 (testbuff 面板)
// ==========================================
if (typeof window !== 'undefined') {
    window.buffSettings = Object.assign({
        normal: 0,    // 普刃 → step5
        stamina: 0,   // 浑身 → step7
        enmity: 0,    // 背水 → step7.1
        strong: 0,    // 强壮 → step7.3
        adversity: 0, // 逆境 → step7.4
        element: 0,   // 属攻 → step9
        marriage: 0,  // 独立攻刃【久远】 → step10
        indepCumulative: 0,    // 独立攻刃【累积】 → step10.x
        indepUnjudged: 0,      // 独立攻刃【未判定】 → step10.x
        indepSpecialEnmity: 0, // 独立攻刃【特殊背水】 → step10.x
        indepSpecial: 0,       // 独立攻刃【特殊】 → step10.x
        dmgCap: 0,    // 伤害上限 → all cap
        dmgAmp: 0,    // 伤害增幅 → dmg amp
        caWeaponDmg: 0,
        caDmg: 0,
        caCap: 0,
        dmgSupp: 0,
        caDmgSupp: 0,
        takenDmgAmp: 0
    }, window.buffSettings || {});
}

/** 戒指 / 耳饰暴击独立来源：暴伤固定 +30%（期望式里 bonus=0.3，与角色 LB「rate=bonus」区分） */
const CHARA_CRIT_INDEPENDENT_DAMAGE_BONUS = 0.3;
/** @deprecated 使用 CHARA_CRIT_INDEPENDENT_DAMAGE_BONUS */
const EARRING_CRIT_DAMAGE_BONUS = CHARA_CRIT_INDEPENDENT_DAMAGE_BONUS;

function getCaCapDisplayBase(caMultiplier) {
    // 从 ThresholdRegistry 获取 ca 类型的默认表，取 displayCap（单位：万）换算为实际值
    if (typeof ThresholdRegistry !== 'undefined' && typeof ThresholdRegistry.getDefault === 'function') {
        const resolved = ThresholdRegistry.getDefault('ca');
        if (resolved && resolved.displayCap != null) {
            return Math.round(resolved.displayCap * 10000); // 万 → 实际值
        }
    }

    // 兜底
    const mult = Number(caMultiplier);
    if (Number.isFinite(mult)) {
        if (Math.abs(mult - 4.5) < 1e-6) return 1685000;
        if (Math.abs(mult - 5) < 1e-6) return 1800000;
    }
    return 500000;
}

function getIndependentCritSources(charIndex, stats) {
    const sources = [];
    const weaponCritRateRaw = Number(stats['weapon_critical_hit_rate'] || 0);
    if (weaponCritRateRaw > 0) {
        const critRate = Decimal.min(weaponCritRateRaw, 1.0).toNumber();
        const overflowCritRate = Math.max(weaponCritRateRaw - 1.0, 0);
        let excessCritDamageUp = Math.min(overflowCritRate * 0.5, 1.0);
        if (excessCritDamageUp < 0.01) excessCritDamageUp = 0;
        const critBonus = 0.5 + 0.5 * excessCritDamageUp;
        sources.push({
            source: 'weapon',
            label: '武器盘暴击',
            rate: critRate,
            bonus: critBonus
        });
    }

    // 戒指 / 耳饰暴击：各为独立来源，暴伤均固定 +30%；与耳饰分列两条，期望中加算
    if (typeof currentParty !== 'undefined' && currentParty[charIndex]) {
        const cd = currentParty[charIndex];
        const ringCritRate = Number(cd.chara_ring_critical_hit_rate || 0);
        if (ringCritRate > 0) {
            sources.push({
                source: 'ring_crit',
                label: '戒指暴击',
                rate: Decimal.min(ringCritRate, 1.0).toNumber(),
                bonus: CHARA_CRIT_INDEPENDENT_DAMAGE_BONUS
            });
        }
        const earringCritRate = Number(cd.chara_earring_critical_hit_rate || 0);
        if (earringCritRate > 0) {
            sources.push({
                source: 'earring_crit',
                label: '耳饰暴击',
                rate: Decimal.min(earringCritRate, 1.0).toNumber(),
                bonus: CHARA_CRIT_INDEPENDENT_DAMAGE_BONUS
            });
        }
    }

    // 主角LB暴击：每个槽位独立判定，可重复
    if (charIndex === 0 && typeof window.getMcLbSelections === 'function') {
        const lbCritMap = { 1: 0.01, 2: 0.03, 3: 0.05 };
        const selections = window.getMcLbSelections() || [];
        selections.forEach((slot, idx) => {
            if (slot && slot.type === 'crit' && slot.lvl >= 1 && slot.lvl <= 3) {
                const v = lbCritMap[slot.lvl] || 0;
                if (v > 0) {
                    sources.push({
                        source: 'mc_lb_crit',
                        label: `LB暴击#${idx + 1}`,
                        rate: v,
                        bonus: v
                    });
                }
            }
        });
    }

    // 非主角角色LB暴击：独立来源（与戒指/耳饰/武器盘并列）；★1/2/3 = 12%/20%/25% 发动与额外伤害（rate=bonus）
    // 数据在 currentParty；多格暴击 LB 用 chara_lb_crit_amounts 各算一条来源
    if (charIndex > 0 && typeof currentParty !== 'undefined' && currentParty[charIndex]) {
        const cd = currentParty[charIndex];
        const critAmounts = Array.isArray(cd.chara_lb_crit_amounts) ? cd.chara_lb_crit_amounts : null;
        if (critAmounts && critAmounts.length > 0) {
            critAmounts.forEach((raw, idx) => {
                const v = Number(raw) || 0;
                if (v <= 0) return;
                const r = Decimal.min(v, 1.0).toNumber();
                sources.push({
                    source: 'chara_lb_crit',
                    label: critAmounts.length > 1 ? `角色LB暴击#${idx + 1}` : '角色LB暴击',
                    rate: r,
                    bonus: r
                });
            });
        } else {
            const charLbCrit = Number(cd.chara_lb_critical_hit_rate || stats['chara_lb_critical_hit_rate'] || 0);
            if (charLbCrit > 0) {
                const r = Decimal.min(charLbCrit, 1.0).toNumber();
                sources.push({
                    source: 'chara_lb_crit',
                    label: '角色LB暴击',
                    rate: r,
                    bonus: r
                });
            }
        }
    }

    return sources;
}

function getCritMultiplierByMode(mode, sources) {
    const src = Array.isArray(sources) ? sources : [];
    const sumBonus = src.reduce((acc, s) => acc + (Number(s.bonus) || 0), 0);
    const expectedBonus = src.reduce((acc, s) => acc + ((Number(s.rate) || 0) * (Number(s.bonus) || 0)), 0);
    const projectedSrc = src.map(s => {
        const out = { ...s };
        if (out.source === 'weapon') {
            const r = Number(out.rate) || 0;
            out.rate = r > 0 ? 1 : 0;
        }
        return out;
    });
    const projectedBonus = projectedSrc.reduce((acc, s) => acc + ((Number(s.rate) || 0) * (Number(s.bonus) || 0)), 0);

    if (mode === 'non_crit') return 1;
    if (mode === 'upper_bound') return 1 + sumBonus;
    if (mode === 'lower_bound') return 1 + projectedBonus;
    return 1 + expectedBonus; // expected
}

function getCritFlagByMode(mode, sources) {
    const src = Array.isArray(sources) ? sources : [];
    if (mode === 'non_crit') return false;
    if (mode === 'upper_bound') return src.length > 0;
    if (mode === 'lower_bound') return src.some(s => {
        if (s.source === 'weapon') return (Number(s.rate) || 0) > 0;
        return (Number(s.rate) || 0) > 0;
    });
    // 期望模式下默认不触发“暴击时生效”词条，避免与布尔语义冲突
    return false;
}

function getCritAmpRateByMode(mode, sources) {
    const src = Array.isArray(sources) ? sources : [];
    if (mode === 'non_crit') return 0;
    if (mode === 'upper_bound') return src.length > 0 ? 1 : 0;
    const adjusted = src.map(s => {
        const out = { ...s };
        if (mode === 'lower_bound' && out.source === 'weapon') {
            const r = Number(out.rate) || 0;
            out.rate = r > 0 ? 1 : 0;
        } else {
            out.rate = Math.max(0, Math.min(1, Number(out.rate) || 0));
        }
        return out;
    });
    const noCritProb = adjusted.reduce((acc, s) => acc * (1 - (Number(s.rate) || 0)), 1);
    return Math.max(0, Math.min(1, 1 - noCritProb));
}

if (typeof window !== 'undefined') {
    window.CHARA_CRIT_INDEPENDENT_DAMAGE_BONUS = CHARA_CRIT_INDEPENDENT_DAMAGE_BONUS;
    window.EARRING_CRIT_DAMAGE_BONUS = EARRING_CRIT_DAMAGE_BONUS;
    window.getIndependentCritSources = getIndependentCritSources;
    window.getCritMultiplierByMode = getCritMultiplierByMode;
    window.getCritFlagByMode = getCritFlagByMode;
    window.getCritAmpRateByMode = getCritAmpRateByMode;
}

// ==========================================
// 核心伤害计算函数
// ==========================================
function calculateDamage(panelAtk, stats, hpPercent, options) {
    // options: { isAdvantage, defense, defenseDown, randomFactor, backups, strongCaps, adversityCharSkill, adversityWeapon, adversityStrongBonus, charIndex }
    // defenseDown: 对boss的防御力down效果，0~80 表示 0%~80%
    const defaults = {
        isAdvantage: false,
        defense: 10,
        defenseDown: 0,
        randomFactor: 1,  // 默认理论值
        backups: [0, 0, 0, 0, 0],  // 5个备用乘区
        strongCaps: [],           // 强壮乘区各独立技能的满血上限列表
        charIndex: 0,             // 角色槽位索引，用于基础值调整
        updateBaseValueDisplay: false,
        ignoreBaseValueAdjustment: false,
        ignoreTestBuffSettings: false,
        // 逆境乘区来源（当前先作为已按 HP 折算后的实时值传入，后续可根据你提供的曲线在此处或上层计算）
        // - adversityCharSkill: 来自角色技能的逆境
        // - adversityWeapon: 来自武器被动/奥义等的逆境
        // - adversityStrongBonus: 戒指 / 耳饰 / LB / 武器附魔等额外逆境
        // - 召唤提供的逆境暂不处理，预留在上层
        adversityCharSkill: 0,
        adversityWeapon: 0,
        adversityStrongBonus: 0
    };
    const opts = { ...defaults, ...options };
    const charIndex = opts.charIndex || 0;
    
    let logSteps = []; // 计算步骤日志
    
    // Helper to push log
    const addLog = (name, value, desc = "") => {
        logSteps.push({ name, value, desc });
    };
    
    // 获取饰品加成
    const teshuStats = getTeshuStats();
    
    // 聚合各乘区值 - 使用 fixPrecision 修正精度
    const p_mult = fixPrecision(aggregateZoneValue('normal_atk', stats, teshuStats));  // 普刃
    const e_mult = aggregateZoneValue('ex_atk', stats, teshuStats);       // EX
    const m_mult = aggregateZoneValue('omega_atk', stats, teshuStats);    // M攻刃
    const od_mult = aggregateZoneValue('odious_atk', stats, teshuStats);  // OD攻刃
    const h_mult = aggregateZoneValue('stamina', stats, teshuStats);      // 浑身
    const h_omega_mult = aggregateZoneValue('stamina_omega', stats, teshuStats); // M浑身
    const en_mult = aggregateZoneValue('enmity', stats, teshuStats);      // 背水
    const en_omega_mult = aggregateZoneValue('enmity_omega', stats, teshuStats); // M背水
    const ele_mult = aggregateZoneValue('element_atk', stats, teshuStats); // 属攻
    const dmg_amp = aggregateZoneValue('dmg_amp', stats, teshuStats);   // 伤害增幅
    // 4 个新的独立攻刃乘区，目前仅支持通过 testbuff 手动调整
    const indep_cumulative = aggregateZoneValue('indep_cumulative_atk', stats, teshuStats);
    const indep_unjudged = aggregateZoneValue('indep_unjudged_atk', stats, teshuStats);
    const indep_special_enmity = aggregateZoneValue('indep_special_enmity_atk', stats, teshuStats);
    const indep_special = aggregateZoneValue('indep_special_atk', stats, teshuStats);

    // 应用 testbuff 面板的乘区修正（在进入各 Step 之前统一汇总）
    const buffs = !opts.ignoreTestBuffSettings && typeof window !== 'undefined' && window.buffSettings ? window.buffSettings : {};
    const buffNormal    = buffs.normal    || 0;
    const buffStamina   = buffs.stamina   || 0;
    const buffEnmity    = buffs.enmity    || 0;
    const buffStrong    = buffs.strong    || 0;
    const buffAdversity = buffs.adversity || 0;
    const buffElement   = buffs.element   || 0;
    const buffMarriage  = buffs.marriage  || 0;
    const buffIndepCumulative    = buffs.indepCumulative    || 0;
    const buffIndepUnjudged      = buffs.indepUnjudged      || 0;
    const buffIndepSpecialEnmity = buffs.indepSpecialEnmity || 0;
    const buffIndepSpecial       = buffs.indepSpecial       || 0;

    const p_mult_total       = new Decimal(p_mult).plus(buffNormal).toNumber();        // 普刃 (step5)
    const stamina_total      = new Decimal(h_mult).plus(buffStamina).toNumber();       // 浑身 (step7)
    const enmity_total       = new Decimal(en_mult).plus(buffEnmity).toNumber();       // 背水 (step7.1)
    const ele_mult_total     = new Decimal(ele_mult).plus(buffElement).toNumber();     // 属攻 (step9) - 不含克属
    const marriage_mult_total= new Decimal(aggregateZoneValue('marriage_perpetuity_atk', stats, teshuStats)).plus(buffMarriage).toNumber(); // 久远乘区 (step10)
    const indep_cumulative_mult_total    = new Decimal(indep_cumulative).plus(buffIndepCumulative).toNumber();
    const indep_unjudged_mult_total      = new Decimal(indep_unjudged).plus(buffIndepUnjudged).toNumber();
    const indep_special_enmity_mult_total= new Decimal(indep_special_enmity).plus(buffIndepSpecialEnmity).toNumber();
    const indep_special_mult_total       = new Decimal(indep_special).plus(buffIndepSpecial).toNumber();
    
    // 弱点补正 (0.5)
    const weaknessBonus = opts.isAdvantage ? 0.5 : 0;
    
    // ====== 调试输出 ======
    const typeLabel = opts.isAdvantage ? "【对克属】" : "【无克属】";
    console.groupCollapsed(`伤害计算调试 ${typeLabel}`);
    console.log("面板ATK:", panelAtk);
    console.log("防御:", opts.defense);
    console.log("随机:", opts.randomFactor);
    console.log("乘区系数:", {
        p_mult: p_mult_total.toFixed(4), 
        e_mult: e_mult.toFixed(4), 
        m_mult: m_mult.toFixed(4),
        od_mult: od_mult.toFixed(4),
        stamina_curve: stamina_total.toFixed(4), 
        enmity_curve: enmity_total.toFixed(4),
        ele_mult: ele_mult_total.toFixed(4), 
        dmg_amp: dmg_amp.toFixed(4)
    });
    
    // Step 1: 面板ATK ÷ 10 (使用 Decimal.js 精确向上取整)
    let current = new Decimal(panelAtk).div(10).ceil().toNumber();
    console.log(`Step1 [ATK/10]: ${panelAtk} / 10 = ${panelAtk/10} → ${current}`);
    addLog("ATK/10", current);
    
    // Step 2: 骑空艇 (使用 Decimal.js 乘法 + 向上取整)
    const airshipSpAtk2 = teshuStats['airship_sp_atk2'] || 0;
    const airshipMult2 = new Decimal(1).plus(airshipSpAtk2).toNumber();
    let s2 = decimalMultiply(current, airshipMult2);
    current = decimalMultiplyCeil(current, airshipMult2);
    console.log(`Step2 [骑空艇]: ${s2} → ${current}`);
    addLog(`骑空艇 (x${airshipMult2.toFixed(2)})`, current);
    
    // Step 3: 支援 (使用 Decimal.js 乘法 + 向上取整)
    const airshipSpAtk1 = teshuStats['airship_sp_atk1'] || 0;
    const airshipMult3 = new Decimal(1).plus(airshipSpAtk1).toNumber();
    let s3 = decimalMultiply(current, airshipMult3);
    current = decimalMultiplyCeil(current, airshipMult3);
    console.log(`Step3 [支援]: ${s3} → ${current}`);
    addLog(`支援 (x${airshipMult3.toFixed(2)})`, current);

    // Step3 完成后的 current 是基础值；只有平 A 主显示流程负责同步 UI。
    if (!opts.ignoreBaseValueAdjustment && typeof window !== 'undefined') {
        window.baseValues = window.baseValues || {};
        const baseState = window.baseValues[charIndex] || { original: current, adjustment: 0 };
        if (opts.updateBaseValueDisplay || !window.baseValues[charIndex]) {
            baseState.original = current;
        }
        window.baseValues[charIndex] = baseState;
        current = current + (baseState.adjustment || 0);
        if (opts.updateBaseValueDisplay) {
            const baseEl = document.getElementById('char-base-value-' + charIndex);
            if (baseEl) {
                baseEl.textContent = current;
            }
        }
    }
    
    // Step 4: 基准放大 x10 (使用 Decimal.js 乘法，无取整)
    current = decimalMultiply(current, 10);
    console.log(`Step4 [基准放大]: ${current}`);
    addLog("基准放大 (x10)", current);

    // 从 Step5 开始：重构为“先汇总所有乘区系数，再一次性乘到基准值上”
    const baseAfterStep4 = current;
    let zoneMult = new Decimal(1); // 所有乘区的总系数

    // Step 5: 普刃
    if (p_mult_total !== 0) {
        const mult = new Decimal(1).plus(p_mult_total);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step5 [普刃]: base=${baseAfterStep4} x${mult.toFixed(4)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("普刃", preview.toNumber(), `x${mult.toFixed(4)}`);
    }
    
    // Step 6: EX攻刃
    if (e_mult !== 0) {
        const mult = new Decimal(1).plus(e_mult);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step6 [EX攻刃]: base=${baseAfterStep4} x${mult.toFixed(4)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("EX攻刃", preview.toNumber(), `x${mult.toFixed(4)}`);
    }

    // Step 6.1: M攻刃
    if (m_mult !== 0) {
        const mult = new Decimal(1).plus(m_mult);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step6.1 [M攻刃]: base=${baseAfterStep4} x${mult.toFixed(4)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("M攻刃", preview.toNumber(), `x${mult.toFixed(4)}`);
    }

    // Step 6.2: OD攻刃
    if (od_mult !== 0) {
        const mult = new Decimal(1).plus(od_mult);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step6.2 [OD攻刃]: base=${baseAfterStep4} x${mult.toFixed(4)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("OD攻刃", preview.toNumber(), `x${mult.toFixed(4)}`);
    }
    
    // Step 7: 浑身 - 使用calc.js中已经计算好的曲线值(已包含HP百分比修正)
    const stam_real = stamina_total; // 浑身总乘区（原始值 + testbuff 修正）
    if (stam_real !== 0) {
        const mult = new Decimal(1).plus(stam_real);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step7 [浑身]: base=${baseAfterStep4} x${mult.toFixed(10)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("浑身", preview.toNumber(), `x${mult.toFixed(10)}`);
    }

// Step 7.1: M浑身 - 使用calc.js中已经计算好的曲线值(已包含HP百分比修正)
    // h_omega_mult 是原始值，stam_real 是从party stats中获取的已计算好的曲线值
    const stam_real2 = h_omega_mult; // M浑身在stats里已经被计算好了，现在统合在enmity/stamina_omega里
    if (stam_real2 !== 0) {
        const mult = new Decimal(1).plus(stam_real2);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step7.1 [M浑身]: base=${baseAfterStep4} x${mult.toFixed(10)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("M浑身", preview.toNumber(), `x${mult.toFixed(10)}`);
    }






    // Step 7.1: 背水 - 与浑身类似，从party stats中获取的已计算好的曲线值
    const enmity_real = enmity_total; 
    if (enmity_real !== 0) {
        const mult = new Decimal(1).plus(enmity_real);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step7.1 [背水]: base=${baseAfterStep4} x${mult.toFixed(10)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("背水", preview.toNumber(), `x${mult.toFixed(10)}`);
    }
   
    
    // Step 7.2: M背水 - 与浑身类似，从party stats中获取的已计算好的曲线值
    const enmity_real2 = en_omega_mult; 
    if (enmity_real2 !== 0) {
        const mult = new Decimal(1).plus(enmity_real2);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step7.2 [M背水]: base=${baseAfterStep4} x${mult.toFixed(10)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("M背水", preview.toNumber(), `x${mult.toFixed(10)}`);
    }

    // Step 7.3: 强壮乘区 - 来自角色强化加成中的浑身（随HP变化）+ 附魔浑身 weapon_ax_stamina（已在calc.js按HP折算）+ testbuff
    const hasStrongCaps = Array.isArray(opts.strongCaps) && opts.strongCaps.length > 0 && typeof calculateStrongBuffSum === 'function';
    const axStamina = stats['weapon_ax_stamina'] || 0; // 已按HP折算后的实时值
    const lbStaminaBonus = Number(opts.lbStaminaBonus) || 0;
    const charStrongBonus = Number(opts.charStrongBonus) || 0; // 戒指/耳饰浑身强壮

        if (hasStrongCaps || axStamina !== 0 || lbStaminaBonus !== 0 || charStrongBonus !== 0 || buffStrong !== 0) {
        const hp01 = Math.max(0, Math.min(1, (hpPercent || 0) / 100));
        let effectiveStrong = axStamina;
        if (hasStrongCaps) {
            effectiveStrong += calculateStrongBuffSum(hp01, opts.strongCaps);
        }
        if (lbStaminaBonus) {
            effectiveStrong += lbStaminaBonus;
        }
        if (charStrongBonus) {
            effectiveStrong += charStrongBonus;
        }
        if (buffStrong) {
            effectiveStrong += buffStrong;
        }
        if (effectiveStrong !== 0) {
            const mult = new Decimal(1).plus(effectiveStrong);
            zoneMult = zoneMult.times(mult);
            const preview = new Decimal(baseAfterStep4).times(zoneMult);
            console.log(`Step7.3 [强壮]: base=${baseAfterStep4} x${mult.toFixed(10)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
            addLog("强壮", preview.toNumber(), `x${mult.toFixed(10)}`);
        }
    }

    // Step 7.4: 逆境乘区 - 规则与强壮类似，作为一个独立乘区
    // 各来源均视为“已按 HP 折算后的实时值”，简单求和后作为 1+sum 的乘区。
    // 当前来源包括：
    //  - 武器附魔背水 weapon_ax_enmity（参考附魔浑身的处理方式，在 calc.js 中按 HP 折算后写入 stats）
    //  - 角色强化加成中的总背水（逆境）（戒指/耳饰/LB 等），通过 options.adversityStrongBonus 传入
    //  - 预留：角色技能逆境 / 武器被动逆境等，通过 options.adversityCharSkill / adversityWeapon 传入
    const axEnmity = stats['weapon_ax_enmity'] || 0; // 已按 HP 折算后的实时值（若未设置则为 0）
    const adversityCharSkill = Number(opts.adversityCharSkill) || 0;
    const adversityWeapon = Number(opts.adversityWeapon) || 0;
    const adversityStrongBonus = Number(opts.adversityStrongBonus) || 0;
    let effectiveAdversity = axEnmity + adversityCharSkill + adversityWeapon + adversityStrongBonus + buffAdversity;

    if (effectiveAdversity !== 0) {
        const mult = new Decimal(1).plus(effectiveAdversity);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step7.4 [逆境]: base=${baseAfterStep4} x${mult.toFixed(10)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("逆境", preview.toNumber(), `x${mult.toFixed(10)}`);
    }










    // Step 8: 备用乘区 (5个) - 汇总到 zoneMult
    opts.backups.forEach((bVal, idx) => {
        if (bVal !== 0) {
            const mult = new Decimal(1).plus(bVal);
            zoneMult = zoneMult.times(mult);
            const preview = new Decimal(baseAfterStep4).times(zoneMult);
            console.log(`Step8 [备用${idx+1}]: base=${baseAfterStep4} x${mult.toFixed(4)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
            addLog(`备用乘区 ${idx + 1}`, preview.toNumber(), `x${mult.toFixed(4)}`);
        }
    });
    
    // Step 9: 属攻 + 克属固定0.5
    const totalEle = new Decimal(1).plus(ele_mult_total).plus(weaknessBonus).toNumber();
    if (totalEle !== 1) {
        const mult = new Decimal(totalEle);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step9 [属攻+克属]: base=${baseAfterStep4} x${mult.toFixed(4)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("属攻+克属", preview.toNumber(), `x${mult.toFixed(4)}`);
    }
    
    // Step 10: 独立攻刃【久远乘区】
    const marriage_mult = marriage_mult_total;
    if (marriage_mult !== 0) {
        const mult = new Decimal(1).plus(marriage_mult);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step10 [独立攻刃【久远乘区】]: base=${baseAfterStep4} x${mult.toFixed(4)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("独立攻刃【久远乘区】", preview.toNumber(), `x${mult.toFixed(4)}`);
    }

    // Step 10.x: 新增 4 个独立攻刃乘区
    if (indep_cumulative_mult_total !== 0) {
        const mult = new Decimal(1).plus(indep_cumulative_mult_total);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step10.1 [独立攻刃【累积】]: base=${baseAfterStep4} x${mult.toFixed(4)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("独立攻刃【累积】", preview.toNumber(), `x${mult.toFixed(4)}`);
    }

    if (indep_unjudged_mult_total !== 0) {
        const mult = new Decimal(1).plus(indep_unjudged_mult_total);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step10.2 [独立攻刃【未判定】]: base=${baseAfterStep4} x${mult.toFixed(4)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("独立攻刃【未判定】", preview.toNumber(), `x${mult.toFixed(4)}`);
    }

    if (indep_special_enmity_mult_total !== 0) {
        const mult = new Decimal(1).plus(indep_special_enmity_mult_total);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step10.3 [独立攻刃【特殊背水】]: base=${baseAfterStep4} x${mult.toFixed(4)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("独立攻刃【特殊背水】", preview.toNumber(), `x${mult.toFixed(4)}`);
    }

    if (indep_special_mult_total !== 0) {
        const mult = new Decimal(1).plus(indep_special_mult_total);
        zoneMult = zoneMult.times(mult);
        const preview = new Decimal(baseAfterStep4).times(zoneMult);
        console.log(`Step10.4 [独立攻刃【特殊】]: base=${baseAfterStep4} x${mult.toFixed(4)} → 累积系数 x${zoneMult.toFixed(10)} → 预览=${preview.toFixed(3)}`);
        addLog("独立攻刃【特殊】", preview.toNumber(), `x${mult.toFixed(4)}`);
    }

    // Step 11: 随机补正 - 也并入总系数
    // 重构目标：Step3 之后不再做任何中途取整，保留 Decimal 精度到最终增幅阶段统一 ceil
    const randMult = new Decimal(opts.randomFactor || 1);
    zoneMult = zoneMult.times(randMult);
    const afterZonesExact = new Decimal(baseAfterStep4).times(zoneMult);
    current = afterZonesExact.toNumber(); // 不取整，保留小数
    console.log(`Step11 [随机补正+乘区合并]: base=${baseAfterStep4} x${zoneMult.toFixed(10)} (含随机=${randMult.toNumber()}) = ${afterZonesExact.toFixed(6)} → no-round → ${current}`);
    addLog("随机补正", current, `x${zoneMult.toFixed(10)}`);
    
    // Step 12: 防御计算 (最终防御 = 防御值 × (1 - 防down) × (1 - weapon_def_ignore))
    const defDownPct = Math.min(80, Math.max(0, Number(opts.defenseDown) || 0)) / 100;
    const weaponDefIgnore = Math.min(0.9, Math.max(0, Number(stats['weapon_def_ignore']) || 0));
    const effectiveDefense = opts.defense * (1 - defDownPct) * (1 - weaponDefIgnore);
    // 不再使用 finalRound(ceil)，仅做精确除法，不取整
    const rawPostDef = new Decimal(current).div(effectiveDefense).toNumber();
    console.log(`Step12 [防御计算]: 防down=${opts.defenseDown}%, 无视防御=${weaponDefIgnore} → 最终防御=${effectiveDefense}, ${current} / ${effectiveDefense} → no-round → ${rawPostDef}`);
    console.groupEnd();
    addLog("防御后伤害", rawPostDef, `/${effectiveDefense.toFixed(2)}`, true);
    
    return { damage: rawPostDef, logs: logSteps };
}

// ==========================================
// 从UI获取计算参数并执行计算
// ==========================================
function calculateDamageFromUI(charIndex = 0) {
    const panelAtkKey = `char-panel-atk-${charIndex}`;
    const panelAtkEl = document.getElementById(panelAtkKey);
    let panelAtk = 0;
    if (panelAtkEl) {
        const atkText = panelAtkEl.innerText.replace(/,/g, '').trim();
        panelAtk = parseInt(atkText) || 0;
    }
    
    const hpPercent = parseInt(document.getElementById('current-hp-slider')?.value) || 100;
    
    const weaknessToggleId = charIndex === 0 ? 'weakness-toggle' : `weakness-toggle-${charIndex}`;
    const isAdvantage = document.getElementById(weaknessToggleId)?.checked || false;
    
    const defInputId = charIndex === 0 ? 'def-input' : `def-input-${charIndex}`;
    const defDownInputId = charIndex === 0 ? 'def-down-input' : `def-down-input-${charIndex}`;
    const defense = parseInt(document.getElementById(defInputId)?.value) || 10;
    const defenseDown = Math.min(80, Math.max(0, parseInt(document.getElementById(defDownInputId)?.value) || 0));
    
    // 从全局拨片状态读取随机因子
    let randomFactor = 1;
    if (window.damageViewStates && window.damageViewStates[charIndex]) {
        const mode = window.damageViewStates[charIndex].randomMode || 'theory';
        if (mode === 'min') randomFactor = 0.95;
        else if (mode === 'max') randomFactor = 1.05;
        else randomFactor = 1;
    }
    
    const stats = {};
    if (typeof party !== 'undefined' && party[charIndex]) {
        STAT_CONFIG.forEach(cfg => {
            stats[cfg.key] = party[charIndex].stats[cfg.key] || 0;
        });
        if (party[charIndex].stats._charabuffZoneEffectTotals) {
            stats._charabuffZoneEffectTotals = Object.assign({}, party[charIndex].stats._charabuffZoneEffectTotals);
        }
        stats['element_atk'] = party[charIndex].stats['element_atk'] || 0;
    }
    if (typeof overlayCharaEarringElementAtkFromParty === 'function') {
        overlayCharaEarringElementAtkFromParty(stats, charIndex);
    }
    if (typeof overlayCharaLbElementAtkFromParty === 'function') {
        overlayCharaLbElementAtkFromParty(stats, charIndex);
    }
    // 非主角上限加成（LB、戒指、神器、觉醒、婚戒等）overlay 进 stats
    if (typeof overlayCharaCapsFromParty === 'function') {
        overlayCharaCapsFromParty(stats, charIndex);
    }
    
    // 计算角色强化加成提供的强壮乘区：
    //  - 戒指浑身 / 耳饰浑身：各自按渾身+N 曲线计算后相加
    //  - 浑身LB：按 LB 曲线（已在 damage_calc.js 中定义）计算并相加
    //  - strongCaps 预留给其他仍走通用强壮曲线的来源
    let strongCaps = [];
    let lbStaminaBonus = 0;
    let charStrongBonus = 0; // 戒指+耳饰浑身强壮
    if (typeof currentParty !== 'undefined' && Array.isArray(currentParty)) {
        const charData = currentParty[charIndex] || null;
        if (charData) {
            const ringStamina = charData['chara_ring_stamina'] || 0;
            const earringStamina = charData['chara_earring_stamina'] || 0;

            const hp01Char = Math.max(0, Math.min(1, (hpPercent || 0) / 100));

            if (ringStamina > 0) {
                if (typeof getRingEarringStaminaStrongBonus === 'function') {
                    charStrongBonus += getRingEarringStaminaStrongBonus(hp01Char, ringStamina);
                } else {
                    strongCaps.push((2 + ringStamina) / 100);
                }
            }

            if (earringStamina > 0) {
                if (typeof getRingEarringStaminaStrongBonus === 'function') {
                    charStrongBonus += getRingEarringStaminaStrongBonus(hp01Char, earringStamina);
                } else {
                    strongCaps.push((2 + earringStamina) / 100);
                }
            }
            if (typeof getLbStaminaStrongBonus === 'function') {
                const hp01 = Math.max(0, Math.min(1, (hpPercent || 0) / 100));
                const amounts = Array.isArray(charData['chara_lb_stamina_amounts']) ? charData['chara_lb_stamina_amounts'] : null;
                if (amounts && amounts.length > 0) {
                    lbStaminaBonus = amounts.reduce((acc, amt) => acc + getLbStaminaStrongBonus(hp01, amt), 0);
                } else {
                    const lbStaminaLevel = charData['chara_lb_stamina'] || 0;
                    if (lbStaminaLevel > 0) {
                        lbStaminaBonus = getLbStaminaStrongBonus(hp01, lbStaminaLevel);
                    }
                }
            }
        }
    }
    
    const backups = [0, 0, 0, 0, 0];

    // 从角色强化加成(汇总)中读取「总背水（逆境）」作为逆境乘区的一部分
    let adversityFromCharBonus = 0;
    if (typeof buildCharabonusSummary === 'function') {
        const summary = buildCharabonusSummary(charIndex, hpPercent);
        if (summary && typeof summary.adversity === 'number') {
            adversityFromCharBonus = summary.adversity;
        }
    }
    
    const result = calculateDamage(panelAtk, stats, hpPercent, {
        isAdvantage: isAdvantage,
        defense: defense,
        defenseDown: defenseDown,
        randomFactor: randomFactor,
        backups: backups,
        charIndex: charIndex,
        updateBaseValueDisplay: true,
        strongCaps: strongCaps,
        lbStaminaBonus: lbStaminaBonus,
        charStrongBonus: charStrongBonus,
        // 逆境乘区：目前直接使用「角色强化加成(汇总)」中的总背水（逆境）
        adversityCharSkill: 0,
        adversityWeapon: 0,
        adversityStrongBonus: adversityFromCharBonus
    });
    
    return result;
}

/**
 * 乱击：先对整段税后伤害执行 applyDamageCap（衰减+增幅+ceil），再将衰减后的本体伤害均分为 x 段，
 * 每段再全额加 totalSupp。无乱击时 x=1，与单次 cap 一致。
 * 多来源乱击段数取高已在 stats.weapon_na_ranshu 上体现。
 */
function sumNaFinalWithRanshu(rawPostDef, stats, teshuStats, extraAmp, capOptions, totalSupp, ranshuHits) {
    const x = Math.max(1, Math.floor(Number(ranshuHits) || 1));
    const cap = applyDamageCap(rawPostDef, stats, 'na', teshuStats, extraAmp, capOptions);
    const ampMul = new Decimal(1).plus(cap.ampCoef || 0);
    const takenAmpMul = new Decimal(1).plus(cap.takenDmgAmpCoef || 0);
    const cappedBeforeWorld = new Decimal(cap.decayedDamage).times(ampMul).ceil().times(takenAmpMul);
    const worldCapMode = (capOptions && capOptions.worldCapMode) ? capOptions.worldCapMode : '660';
    if (x <= 1) {
        const seg = applyWorldCap(cappedBeforeWorld.plus(totalSupp), 'na', stats, worldCapMode).ceil().toNumber();
        return { sum: seg, firstCapResult: cap, perSegment: seg };
    }
    const cappedBase = cappedBeforeWorld;
    const per = cappedBase.div(x);
    let sum = 0;
    let perSegment = 0;
    for (let k = 0; k < x; k++) {
        const segBase = k === x - 1
            ? cappedBase.minus(per.times(x - 1)).toNumber()
            : per.toNumber();
        const segTotal = applyWorldCap(new Decimal(segBase).plus(totalSupp), 'na', stats, worldCapMode).ceil().toNumber();
        if (k === 0) perSegment = segTotal;
        sum += segTotal;
    }
    return { sum, firstCapResult: cap, perSegment };
}

/**
 * 理论伤害（不经过伤害衰减）：税后伤害仅乘增幅并 ceil，再加伤害上升。
 * 与预测值保持相同乱击口径（返回每段值 perSegment 与总和 sum）。
 */
function sumNaTheoryWithoutDecayWithRanshu(rawPostDef, stats, teshuStats, extraAmp, totalSupp, ranshuHits, capOptions) {
    const x = Math.max(1, Math.floor(Number(ranshuHits) || 1));
    const baseAmp = (typeof calculateAmp === 'function')
        ? (Number(calculateAmp(stats, 'na', teshuStats, capOptions || {})) || 0)
        : 0;
    const totalAmp = baseAmp + (Number(extraAmp) || 0);
    const ampMul = new Decimal(1).plus(totalAmp);
    const takenAmp = (typeof calculateTakenDamageAmp === 'function') ? calculateTakenDamageAmp(capOptions || {}) : 0;
    const takenAmpMul = new Decimal(1).plus(takenAmp);
    if (x <= 1) {
        const seg = new Decimal(rawPostDef).times(ampMul).ceil().times(takenAmpMul).ceil().plus(totalSupp).toNumber();
        return { sum: seg, perSegment: seg };
    }
    const base = new Decimal(rawPostDef);
    const per = base.div(x);
    let sum = 0;
    let perSegment = 0;
    for (let k = 0; k < x; k++) {
        const segRaw = k === x - 1
            ? base.minus(per.times(x - 1)).toNumber()
            : per.toNumber();
        const seg = new Decimal(segRaw).times(ampMul).ceil().times(takenAmpMul).ceil().plus(totalSupp).toNumber();
        if (k === 0) perSegment = seg;
        sum += seg;
    }
    return { sum, perSegment };
}

// ==========================================
// 更新UI显示伤害结果
// ==========================================
function escapeSkillDamageHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getCheckedDamageSkillSteps(charIndex) {
    const out = [];
    if (charIndex === 0 || typeof currentParty === 'undefined' || !currentParty[charIndex]) return out;
    if (typeof globalCharaSkillMap === 'undefined' || !globalCharaSkillMap) return out;
    if (!window.StatusResolver || typeof window.StatusResolver.getSkillActions !== 'function') return out;

    const charData = currentParty[charIndex];
    const cid = charData && charData['ID'];
    if (cid == null) return out;

    for (let pos = 1; pos <= 4; pos++) {
        const cb = document.querySelector(`.char-skill-enabled-cb[data-slot="${charIndex}"][data-pos="${pos}"]`);
        if (!cb || !cb.checked) continue;
        const sid = `${cid}_${pos}`;
        const skill = globalCharaSkillMap[sid];
        if (!skill) continue;
        const actions = window.StatusResolver.getSkillActions(skill, {
            skillId: sid,
            skillName: skill.name || sid,
            element: skill.element || null,
            ownerSlot: charIndex
        });
        actions.forEach((action, actionIdx) => {
            if (!action || action.type !== 'damage' || !action.damage) return;
            out.push({
                skill,
                skillId: sid,
                action,
                actionIdx
            });
        });
    }
    return out;
}

if (typeof window !== 'undefined') {
    window.skillDamageDecayModeByChar = window.skillDamageDecayModeByChar || {};
}

function getSkillDamageDecayMode(charIndex) {
    if (typeof window === 'undefined') return 'fuzzy';
    return window.skillDamageDecayModeByChar && window.skillDamageDecayModeByChar[charIndex] === 'exact'
        ? 'exact'
        : 'fuzzy';
}

function setSkillDamageDecayModeButton(charIndex, hasDamageSkill) {
    const input = document.getElementById('skill-mult-input-' + charIndex);
    const wrap = input ? input.closest('.dmg-skill-label-input') : null;
    if (!wrap) return;
    let btn = document.getElementById('skill-decay-mode-btn-' + charIndex);
    if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'skill-decay-mode-btn-' + charIndex;
        btn.className = 'skill-decay-mode-btn';
        btn.onclick = function () {
            const cur = getSkillDamageDecayMode(charIndex);
            window.skillDamageDecayModeByChar[charIndex] = cur === 'exact' ? 'fuzzy' : 'exact';
            if (
                window.skillDamageDecayModeByChar[charIndex] === 'exact'
                && window.ThresholdRegistry
                && typeof window.ThresholdRegistry.loadThresholdData === 'function'
            ) {
                window.ThresholdRegistry.loadThresholdData().then(function () {
                    if (typeof recalculate === 'function') recalculate();
                    else updateDamageDisplay(charIndex);
                });
                return;
            }
            if (typeof recalculate === 'function') recalculate();
            else updateDamageDisplay(charIndex);
        };
        wrap.appendChild(btn);
    }
    btn.style.display = hasDamageSkill ? '' : 'none';
    btn.textContent = getSkillDamageDecayMode(charIndex) === 'exact' ? '精确' : '模糊';
    btn.title = '模糊：超过 cap 的部分按 0.01 斜率计算；精确：使用技能阈值表计算';
}

function getSkillDamageCapCoefForFuzzy(charIndex, stats, capOptions) {
    const teshuStats = typeof getTeshuStats === 'function' ? getTeshuStats() : {};
    if (typeof calculateTotalCap === 'function') {
        return calculateTotalCap(stats || {}, 'skill', teshuStats, Object.assign({}, capOptions || {}, { charIndex }));
    }
    if (typeof getAllEffectsTotalForSlot === 'function') {
        const cap = getAllEffectsTotalForSlot(charIndex, 'skill_dmg_cap', 0);
        return new Decimal(1).plus(Number(cap) || 0).toNumber();
    }
    return 1;
}

function applyFuzzySkillCap(rawPerHit, capPerHit, capCoef) {
    const raw = Number(rawPerHit);
    const cap = new Decimal(Number(capPerHit) || 0)
        .times(Number(capCoef) || 1)
        .toNumber();
    if (!Number.isFinite(raw)) return NaN;
    if (cap <= 0 || raw <= cap) return raw;
    return cap + (raw - cap) * 0.01;
}

function renderCheckedSkillDamageRows(charIndex, skillDmgEl, calcContext) {
    const damageSteps = getCheckedDamageSkillSteps(charIndex);
    if (!damageSteps.length) return false;
    if (!window.SkillDmgCalc || typeof window.SkillDmgCalc.calculateSkillDamage !== 'function') return false;

    const rows = [];
    const decayMode = getSkillDamageDecayMode(charIndex);
    damageSteps.forEach((item) => {
        const damage = item.action.damage || {};
        const multiplier = Number(damage.multiplier);
        const hits = Math.max(1, Math.floor(Number(damage.hits) || 1));
        if (!Number.isFinite(multiplier) || multiplier <= 0) return;

        const capPerHit = Number(damage.cap_per_hit) || 0;
        const thresholdTableId = damage.threshold_table || null;
        const exactTable = thresholdTableId && window.ThresholdRegistry && typeof window.ThresholdRegistry.getById === 'function'
            ? window.ThresholdRegistry.getById(thresholdTableId)
            : null;
        const useExact = decayMode === 'exact' && !!exactTable;
        const skillResult = window.SkillDmgCalc.calculateSkillDamage(
            calcContext.panelAtk,
            calcContext.stats,
            calcContext.hpPercent,
            {
                defense: calcContext.defense,
                defenseDown: calcContext.defenseDown,
                charIndex: charIndex,
                isAdvantage: calcContext.isAdv,
                critMode: calcContext.critMode,
                naOptions: { randomFactor: calcContext.randomFactor },
                strongCaps: calcContext.strongCaps,
                lbStaminaBonus: calcContext.lbStaminaBonus,
                charStrongBonus: calcContext.charStrongBonus,
                adversityCharSkill: calcContext.adversityCharSkill,
                adversityWeapon: calcContext.adversityWeapon,
                adversityStrongBonus: calcContext.adversityStrongBonus,
                applyCap: useExact,
                capOptions: Object.assign({}, calcContext.capOptions || {}, useExact ? { thresholdTableId } : {}),
                skillBaseMult: multiplier
            }
        );
        const rawPerHit = skillResult && skillResult.value != null ? Number(skillResult.value) : NaN;
        if (!Number.isFinite(rawPerHit)) return;
        const fuzzyCapCoef = useExact ? 1 : getSkillDamageCapCoefForFuzzy(charIndex, calcContext.stats, calcContext.capOptions);
        const perHit = useExact ? rawPerHit : applyFuzzySkillCap(rawPerHit, capPerHit, fuzzyCapCoef);
        const label = item.skill && item.skill.name ? item.skill.name : item.skillId;
        const capDetail = capPerHit > 0
            ? `，cap ${Math.round(new Decimal(capPerHit).times(fuzzyCapCoef)).toLocaleString()}`
            : '';
        const detail = `${multiplier}倍 × ${hits}hit${capDetail}${useExact ? `，精确阈值表 ${thresholdTableId}` : '，模糊衰减'}`;
        const iconRel = item.skill && item.skill.icon ? item.skill.icon : '';
        const iconSrc = iconRel && typeof buildCharaSkillIconSrc === 'function'
            ? buildCharaSkillIconSrc(iconRel)
            : '';
        const iconHtml = iconSrc
            ? `<img class="skill-dmg-breakdown-icon" src="${escapeSkillDamageHtml(iconSrc)}" alt="" title="${escapeSkillDamageHtml(label)}">`
            : `<span class="skill-dmg-breakdown-icon skill-dmg-breakdown-icon--text">${escapeSkillDamageHtml(label.slice(0, 1) || '?')}</span>`;
        rows.push(`
            <span class="skill-dmg-breakdown-row" title="${escapeSkillDamageHtml(detail)}">
                ${iconHtml}
                <span class="skill-dmg-breakdown-val">${Math.round(perHit).toLocaleString()} × ${hits}</span>
            </span>
        `);
    });

    if (!rows.length) return false;
    skillDmgEl.innerHTML = rows.join('');
    return true;
}

function updateDamageDisplay(charIndex = 0) {
    function ensureDamageRangeRow(detailsId, rangeId) {
        const detailsEl = document.getElementById(detailsId);
        if (!detailsEl) return null;
        let rangeEl = document.getElementById(rangeId);
        if (rangeEl) return rangeEl;
        const theoryEl = detailsEl.querySelector('[id*="-theory-"]');
        if (!theoryEl || !theoryEl.parentElement) return null;
        const row = document.createElement('div');
        row.className = 'dmg-detail-row';
        row.innerHTML = '<span class="label">伤害范围:</span><span class="value" id="' + rangeId + '">-</span>';
        detailsEl.insertBefore(row, theoryEl.parentElement);
        return row.querySelector('#' + rangeId);
    }

    function formatDamageRange(minValue, maxValue) {
        if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return '-';
        return Math.ceil(minValue).toLocaleString() + '~' + Math.ceil(maxValue).toLocaleString();
    }

    const stats = {};
    if (typeof party !== 'undefined' && party[charIndex]) {
        STAT_CONFIG.forEach(cfg => {
            stats[cfg.key] = party[charIndex].stats[cfg.key] || 0;
        });
        if (party[charIndex].stats._charabuffZoneEffectTotals) {
            stats._charabuffZoneEffectTotals = Object.assign({}, party[charIndex].stats._charabuffZoneEffectTotals);
        }
        stats['element_atk'] = party[charIndex].stats['element_atk'] || 0;
        stats['summon_dmg_cap'] = party[charIndex].stats['summon_dmg_cap'] || 0;
        stats['job_na_amp'] = party[charIndex].stats['job_na_amp'] || 0;
        const rawR = party[charIndex].stats['weapon_na_ranshu'];
        stats['weapon_na_ranshu'] = Math.max(1, Math.floor(Number(rawR != null && rawR !== '' ? rawR : 1)));
    }
    if (typeof overlayCharaEarringElementAtkFromParty === 'function') {
        overlayCharaEarringElementAtkFromParty(stats, charIndex);
    }
    if (typeof overlayCharaLbElementAtkFromParty === 'function') {
        overlayCharaLbElementAtkFromParty(stats, charIndex);
    }
    // 非主角上限加成（LB、戒指、神器、觉醒、婚戒等）overlay 进 stats
    if (typeof overlayCharaCapsFromParty === 'function') {
        overlayCharaCapsFromParty(stats, charIndex);
    }
    
    const teshuStats = getTeshuStats();
    
    const panelAtkKey = `char-panel-atk-${charIndex}`;
    const panelAtkEl = document.getElementById(panelAtkKey);
    let panelAtk = 0;
    if (panelAtkEl) {
        const atkText = panelAtkEl.innerText.replace(/,/g, '').trim();
        panelAtk = parseInt(atkText) || 0;
    }
    
    const hpPercent = parseInt(document.getElementById('current-hp-slider')?.value) || 100;
    
    const defInputId = charIndex === 0 ? 'def-input' : `def-input-${charIndex}`;
    const defDownInputId = charIndex === 0 ? 'def-down-input' : `def-down-input-${charIndex}`;
    const defense = parseInt(document.getElementById(defInputId)?.value) || 10;
    const defenseDown = Math.min(80, Math.max(0, parseInt(document.getElementById(defDownInputId)?.value) || 0));
    const weaponDefIgnore = Math.min(0.8, Math.max(0, Number(stats['weapon_def_ignore']) || 0));
    const effectiveDefense = defense * (1 - defenseDown / 100) * (1 - weaponDefIgnore);
    
    // 计算角色强化加成提供的强壮乘区：
    //  - 戒指浑身 / 耳饰浑身：各自按渾身+N 曲线计算后相加
    //  - 浑身LB：按 LB 曲线计算并相加
    //  - strongCaps 预留给其他仍走通用强壮曲线的来源
    let strongCaps = [];
    let lbStaminaBonus = 0;
    let charStrongBonus = 0;
    if (typeof currentParty !== 'undefined' && Array.isArray(currentParty)) {
        const charData = currentParty[charIndex] || null;
        if (charData) {
            const ringStamina = charData['chara_ring_stamina'] || 0;
            const earringStamina = charData['chara_earring_stamina'] || 0;

            const hp01Char = Math.max(0, Math.min(1, (hpPercent || 0) / 100));

            if (ringStamina > 0) {
                if (typeof getRingEarringStaminaStrongBonus === 'function') {
                    charStrongBonus += getRingEarringStaminaStrongBonus(hp01Char, ringStamina);
                } else {
                    strongCaps.push((2 + ringStamina) / 100);
                }
            }

            if (earringStamina > 0) {
                if (typeof getRingEarringStaminaStrongBonus === 'function') {
                    charStrongBonus += getRingEarringStaminaStrongBonus(hp01Char, earringStamina);
                } else {
                    strongCaps.push((2 + earringStamina) / 100);
                }
            }
            if (typeof getLbStaminaStrongBonus === 'function') {
                const hp01 = Math.max(0, Math.min(1, (hpPercent || 0) / 100));
                const amounts = Array.isArray(charData['chara_lb_stamina_amounts']) ? charData['chara_lb_stamina_amounts'] : null;
                if (amounts && amounts.length > 0) {
                    lbStaminaBonus = amounts.reduce((acc, amt) => acc + getLbStaminaStrongBonus(hp01, amt), 0);
                } else {
                    const lbStaminaLevel = charData['chara_lb_stamina'] || 0;
                    if (lbStaminaLevel > 0) {
                        lbStaminaBonus = getLbStaminaStrongBonus(hp01, lbStaminaLevel);
                    }
                }
            }
        }
    }
    
    // 从全局拨片状态读取随机因子
    let randomFactor = 1;
    if (window.damageViewStates && window.damageViewStates[charIndex]) {
        const mode = window.damageViewStates[charIndex].randomMode || 'theory';
        if (mode === 'min') randomFactor = 0.95;
        else if (mode === 'max') randomFactor = 1.05;
        else randomFactor = 1;
    }
    
    const backups = [0, 0, 0, 0, 0];

    // 从角色强化加成(汇总)中读取「总背水（逆境）」作为逆境乘区的一部分
    let adversityFromCharBonus = 0;
    if (typeof buildCharabonusSummary === 'function') {
        const summary = buildCharabonusSummary(charIndex, hpPercent);
        if (summary && typeof summary.adversity === 'number') {
            adversityFromCharBonus = summary.adversity;
        }
    }

    const baseAdversityOptions = {
        strongCaps: strongCaps,
        lbStaminaBonus: lbStaminaBonus,
        charStrongBonus: charStrongBonus,
        // 逆境乘区：目前直接使用「角色强化加成(汇总)」中的总背水（逆境）
        adversityCharSkill: 0,
        adversityWeapon: 0,
        adversityStrongBonus: adversityFromCharBonus
    };

    const resultNormal = calculateDamage(panelAtk, stats, hpPercent, {
        isAdvantage: false,
        charIndex: charIndex,
        defense: defense,
        defenseDown: defenseDown,
        randomFactor: randomFactor,
        backups: backups,
        updateBaseValueDisplay: true,
        ...baseAdversityOptions
    });
    
    const resultAdvantage = calculateDamage(panelAtk, stats, hpPercent, {
        isAdvantage: true,
        charIndex: charIndex,
        defense: defense,
        defenseDown: defenseDown,
        randomFactor: randomFactor,
        backups: backups,
        ...baseAdversityOptions
    });

    const resultNormalMin = calculateDamage(panelAtk, stats, hpPercent, {
        isAdvantage: false,
        charIndex: charIndex,
        defense: defense,
        defenseDown: defenseDown,
        randomFactor: 0.95,
        backups: backups,
        ...baseAdversityOptions
    });
    const resultNormalMax = calculateDamage(panelAtk, stats, hpPercent, {
        isAdvantage: false,
        charIndex: charIndex,
        defense: defense,
        defenseDown: defenseDown,
        randomFactor: 1.05,
        backups: backups,
        ...baseAdversityOptions
    });
    const resultAdvantageMin = calculateDamage(panelAtk, stats, hpPercent, {
        isAdvantage: true,
        charIndex: charIndex,
        defense: defense,
        defenseDown: defenseDown,
        randomFactor: 0.95,
        backups: backups,
        ...baseAdversityOptions
    });
    const resultAdvantageMax = calculateDamage(panelAtk, stats, hpPercent, {
        isAdvantage: true,
        charIndex: charIndex,
        defense: defense,
        defenseDown: defenseDown,
        randomFactor: 1.05,
        backups: backups,
        ...baseAdversityOptions
    });
    
    // 基础伤害：基础值 * 总倍率 / 防御（不含上限/增幅/予伤/暴击）
    // 这里直接使用 calculateDamage 的输出 damage（已在 Step12 除以有效防御并向上取整）
    const getPreDefVal = (result) => {
        const log = result.logs.find(l => l.name === "随机补正");
        return log ? log.value : 0;
    };
    const preDefNormalVal = getPreDefVal(resultNormal);
    const preDefAdvVal = getPreDefVal(resultAdvantage);
    const baseDmgNormal = resultNormal.damage;
    const baseDmgAdv = resultAdvantage.damage;
    
    const dmg_amp = aggregateZoneValue('dmg_amp', stats, teshuStats);

    let isAdv = false;
    let currentCritMode = 'expected';
    if (window.damageViewStates && window.damageViewStates[charIndex]) {
        isAdv = window.damageViewStates[charIndex].isAdvantage;
        currentCritMode = window.damageViewStates[charIndex].critMode || 'expected';
    }
    
    // 判断是否为主角 (charIndex === 0) 且应用对应的职业特性
    let isClass5 = false;
    let char_buff_amp = 0;
    
    if (charIndex === 0) {
        const currentJob = allClasses.find(c => c.id === currentMC.jobId);
        isClass5 = currentJob && currentJob.type === 'class_5';
        // 如果有针对主角的特殊 buffs，也可以在这里累加给 char_buff_amp
    } else {
        // 对于非主角队员，如果有特有的被动增幅（如从 LB、戒指、神器等提取），可以在这里加
        // 由于这部分以后可能会存储在 member.stats 中，这里作为演示留一个口子
        // 例如：char_buff_amp = stats['chara_specific_amp'] || 0;
    }
    
    const fallbackNormalDmgAmp = isAdv
        ? new Decimal(aggregateZoneValue('normal_dmg_amp', stats, teshuStats)).plus(aggregateZoneValue('dmg_to_elemental_amp', stats, teshuStats)).toNumber()
        : aggregateZoneValue('normal_dmg_amp', stats, teshuStats);
    const normal_dmg_amp = (typeof getAllEffectsTotalForSlot === 'function')
        ? getAllEffectsTotalForSlot(charIndex, 'na_dmg_amp', fallbackNormalDmgAmp)
        : fallbackNormalDmgAmp;
    
    const naSuppZones = typeof getDmgSuppZonesForNa === 'function'
        ? getDmgSuppZonesForNa(stats, teshuStats, charIndex)
        : {
            weaponGrid: aggregateZoneValue('dmg_supp', stats, teshuStats) + aggregateZoneValue('na_dmg_supp', stats, teshuStats),
            earring: 0,
            total: aggregateZoneValue('dmg_supp', stats, teshuStats) + aggregateZoneValue('na_dmg_supp', stats, teshuStats)
        };
    const testBuffSupp = (typeof window !== 'undefined' && window.buffSettings)
        ? (Number(window.buffSettings.dmgSupp) || 0)
        : 0;
    const fallbackNaSupp = (Number(naSuppZones.total) || 0) + testBuffSupp;
    const total_supp = (typeof getAllEffectsTotalForSlot === 'function')
        ? getAllEffectsTotalForSlot(charIndex, 'na_dmg_supp', fallbackNaSupp)
        : fallbackNaSupp;

    const critState = (window.damageViewStates && window.damageViewStates[charIndex]) ? window.damageViewStates[charIndex] : {};
    const critMode = critState.critMode || 'expected';
    const critSources = getIndependentCritSources(charIndex, stats);
    const totalCritMult = getCritMultiplierByMode(critMode, critSources);
    const critFlag = getCritFlagByMode(critMode, critSources);
    const critAmpRate = getCritAmpRateByMode(critMode, critSources);

    // 暴击时生效的伤害增幅（如：属性角色暴击时，伤害增幅（大））
    const critOnlyAmp = (Number(stats['weapon_critical_hit_amp'] || 0)) * critAmpRate;
    
    const allEffectsAmpReady = typeof getAllEffectsTotalForSlot === 'function' && typeof getAllEffectsTotalForSlot(charIndex, 'na_dmg_amp', null) === 'number';
    const extraAmpNormal = allEffectsAmpReady
        ? new Decimal(char_buff_amp).plus(critOnlyAmp).toNumber()
        : new Decimal(char_buff_amp).plus(normal_dmg_amp).plus(critOnlyAmp).toNumber();
    const extraAmpAdvantage = extraAmpNormal;

    console.groupCollapsed(`[Debug Amp Composition]`);
    console.log(`Char Buff Amp: ${char_buff_amp}`);
    console.log(`Normal Dmg Amp (Stats): ${normal_dmg_amp}`);
    console.log(`Crit Flag: ${critFlag}`);
    console.log(`Crit-only Amp: ${critOnlyAmp}`);
    console.log(`Dmg to Ele Amp is included in All Effects NA amp when advantage is enabled`);
    console.log(`Extra Amp Normal: ${extraAmpNormal}`);
    console.log(`Extra Amp Advantage: ${extraAmpAdvantage}`);
    console.groupEnd();

    const rawPostDefNormal = resultNormal.damage;
    const rawPostDefAdv = resultAdvantage.damage;

    const worldCapMode = (window.damageViewStates && window.damageViewStates[charIndex]) ? (window.damageViewStates[charIndex].worldCapMode || '660') : '660';
    const capOptions = { isClass5: isClass5, worldCapMode: worldCapMode, charIndex: charIndex };
    const ranshuFromStats = Math.max(1, Math.floor(Number(stats['weapon_na_ranshu'] || 1)));
    const hideRanshuDisplay = !!(window.damageViewStates && window.damageViewStates[charIndex] && window.damageViewStates[charIndex].hideRanshuDisplay);
    const ranshuHits = hideRanshuDisplay ? 1 : ranshuFromStats;

    const nn = sumNaFinalWithRanshu(rawPostDefNormal, stats, teshuStats, extraAmpNormal, capOptions, total_supp, ranshuHits);
    const naDmgNormal = nn.sum;
    const capResultNormal = nn.firstCapResult;

    const nadv = sumNaFinalWithRanshu(rawPostDefAdv, stats, teshuStats, extraAmpAdvantage, capOptions, total_supp, ranshuHits);
    const naDmgAdvantage = nadv.sum;
    const capResultAdv = nadv.firstCapResult;

    // preDefNormalVal / preDefAdvVal 已在上方计算，后续暴击计算复用
    
    // 暴击路径同样不在此处取整，保留小数直到最终增幅阶段统一 ceil
    const rawCritPostDefNormal = new Decimal(preDefNormalVal).times(totalCritMult).div(effectiveDefense).toNumber();
    const rawCritPostDefAdv = new Decimal(preDefAdvVal).times(totalCritMult).div(effectiveDefense).toNumber();

    const cn = sumNaFinalWithRanshu(rawCritPostDefNormal, stats, teshuStats, extraAmpNormal, capOptions, total_supp, ranshuHits);
    const critSumNormal = cn.sum;
    const critSegNormal = cn.perSegment;
    const capCritResultNormal = cn.firstCapResult;

    const cadv = sumNaFinalWithRanshu(rawCritPostDefAdv, stats, teshuStats, extraAmpAdvantage, capOptions, total_supp, ranshuHits);
    const critSumAdv = cadv.sum;
    const critSegAdv = cadv.perSegment;
    const capCritResultAdv = cadv.firstCapResult;
    const tn = sumNaTheoryWithoutDecayWithRanshu(rawCritPostDefNormal, stats, teshuStats, extraAmpNormal, total_supp, ranshuHits, capOptions);
    const tadv = sumNaTheoryWithoutDecayWithRanshu(rawCritPostDefAdv, stats, teshuStats, extraAmpAdvantage, total_supp, ranshuHits, capOptions);

    console.groupCollapsed(`最终伤害详细调试 [Slot ${charIndex}]`);
    console.log(`Defense: ${defense}, DefDown: ${defenseDown}%, DefIgnore: ${weaponDefIgnore}, EffectiveDef: ${effectiveDefense}, CritMult: ${totalCritMult}, Supp: ${total_supp}`, naSuppZones ? `(予伤 武器盘:${naSuppZones.weaponGrid} 耳饰:${naSuppZones.earring} 神器:${naSuppZones.artifacts || 0} testbuff:${testBuffSupp})` : '');
    
    console.log("【Normal Path】");
    console.log(`Pre-Def: ${preDefNormalVal}`);
    console.log(`Post-Def (Raw): ${rawPostDefNormal}`);
    console.log(`Total Cap Coeff: ${capResultNormal.capCoef}`);
    console.log(`Decayed: ${capResultNormal.decayedDamage}`);
    console.log(`Amp Coeff: ${capResultNormal.ampCoef}`);
    console.log(`Final Non-Crit: ${naDmgNormal}`);
    console.log(`Post-Def (Crit): ${rawCritPostDefNormal}`);
    console.log(`Decayed (Crit): ${capCritResultNormal.decayedDamage}`);
    console.log(`Final Crit (sum): ${critSumNormal} | per-seg: ${critSegNormal}`);

    console.log("【Advantage Path】");
    console.log(`Pre-Def: ${preDefAdvVal}`);
    console.log(`Post-Def (Raw): ${rawPostDefAdv}`);
    console.log(`Final Non-Crit: ${naDmgAdvantage}`);
    console.log(`Final Crit (sum): ${critSumAdv} | per-seg: ${critSegAdv}`);
    console.groupEnd();
    
    const baseDmgEl = document.getElementById(`base-dmg-display-${charIndex}`);
    const naDmgEl = document.getElementById(`na-dmg-display-${charIndex}`);
    
    // 获取当前面板的拨片状态
    isAdv = false;
    currentCritMode = 'expected';
    if (window.damageViewStates && window.damageViewStates[charIndex]) {
        isAdv = window.damageViewStates[charIndex].isAdvantage;
        currentCritMode = window.damageViewStates[charIndex].critMode || 'expected';
    }

    /** 平A预测：显示每段乱击伤害；乱击1 时等同整次 */
    const finalNa = isAdv ? critSegAdv : critSegNormal;
    // 最终显示口径：平A预测值在输出前统一向上取整，避免出现小数
    const finalNaDisplay = Math.ceil(Number(finalNa) || 0);

    // 更新暴击按钮的文本
    const critBtn = document.querySelector(`#data-slot-${charIndex} .crit-btn`);
    if (critBtn) {
        const modeLabelMap = {
            non_crit: '非暴击',
            expected: '暴击期望值',
            lower_bound: '暴击预期值',
            upper_bound: '暴击上限值'
        };
        const weaponCritRate = Number(stats['weapon_critical_hit_rate'] || 0);
        const displayRate = (weaponCritRate * 100).toFixed(1);
        const modeLabel = modeLabelMap[currentCritMode] || modeLabelMap.expected;
        critBtn.textContent = `${modeLabel}(${displayRate}%)`;
        if (currentCritMode === 'non_crit') critBtn.classList.remove('active');
        else critBtn.classList.add('active');
    }

    const ranshuBtn = document.querySelector(`#data-slot-${charIndex} .ranshu-display-btn`);
    if (ranshuBtn) {
        if (hideRanshuDisplay) {
            ranshuBtn.textContent = '不显示乱击';
            ranshuBtn.classList.remove('active');
        } else {
            ranshuBtn.textContent = '乱击';
            ranshuBtn.classList.add('active');
        }
    }
    
    // 渲染基础伤害（不受暴击影响，只受克属影响）
    if (baseDmgEl) {
        const finalBase = isAdv ? baseDmgAdv : baseDmgNormal;
        baseDmgEl.innerHTML = finalBase.toLocaleString();
    }
    
    // 渲染平A预测伤害（受克属和暴击影响）
    if (naDmgEl) {
        naDmgEl.innerHTML = finalNaDisplay.toLocaleString();
        if (totalCritMult > 1.0000001) naDmgEl.classList.add('is-crit');
        else naDmgEl.classList.remove('is-crit');
    }

    const theoryEl = document.getElementById(charIndex === 0 ? 'na-theory-0' : `na-theory-${charIndex}`);
    const capEl = document.getElementById(charIndex === 0 ? 'na-cap-0' : `na-cap-${charIndex}`);
    const naRangeEl = ensureDamageRangeRow(`na-details-${charIndex}`, `na-range-${charIndex}`);
    if (naRangeEl) {
        const naMinResult = isAdv ? resultAdvantageMin : resultNormalMin;
        const naMaxResult = isAdv ? resultAdvantageMax : resultNormalMax;
        const naMinPreDef = getPreDefVal(naMinResult);
        const naMaxPreDef = getPreDefVal(naMaxResult);
        const naMinRawCritPostDef = new Decimal(naMinPreDef).times(totalCritMult).div(effectiveDefense).toNumber();
        const naMaxRawCritPostDef = new Decimal(naMaxPreDef).times(totalCritMult).div(effectiveDefense).toNumber();
        const naMinExtraAmp = isAdv ? extraAmpAdvantage : extraAmpNormal;
        const naMaxExtraAmp = isAdv ? extraAmpAdvantage : extraAmpNormal;
        const naMin = sumNaFinalWithRanshu(naMinRawCritPostDef, stats, teshuStats, naMinExtraAmp, capOptions, total_supp, ranshuHits).perSegment;
        const naMax = sumNaFinalWithRanshu(naMaxRawCritPostDef, stats, teshuStats, naMaxExtraAmp, capOptions, total_supp, ranshuHits).perSegment;
        naRangeEl.textContent = formatDamageRange(naMin, naMax);
    }
    if (theoryEl) {
        const finalTheory = isAdv ? tadv.perSegment : tn.perSegment;
        theoryEl.innerHTML = finalTheory.toLocaleString();
    }

    if (capEl) {
        const capForDisplay = isAdv ? cadv.firstCapResult : cn.firstCapResult;
        const thresholdNormal = new Decimal(500000)
            .times(capForDisplay.capCoef)
            .floor()
            .toNumber();
        capEl.innerHTML = `${thresholdNormal.toLocaleString()}`;
    }

    // 奥义预测伤害：随暴击/克属拨片更新，暴击时与平A一致显示橙黄色
    let caValForTotal = null;
    const caDmgEl = document.getElementById('ca-dmg-display-' + charIndex);
    const caTheoryEl = document.getElementById('ca-theory-' + charIndex);
    const caCapEl = document.getElementById('ca-cap-' + charIndex);
    const caRangeEl = ensureDamageRangeRow(`ca-details-${charIndex}`, `ca-range-${charIndex}`);
    if (caDmgEl) {
        let showCa = true;
        if (charIndex === 0) {
            const hasMainHand = window.CaDmgCalc && typeof window.CaDmgCalc.getMainHandWeapon === 'function' && window.CaDmgCalc.getMainHandWeapon();
            if (!hasMainHand) showCa = false;
        }
        if (!showCa) {
            caDmgEl.textContent = '-';
            caDmgEl.classList.remove('is-crit');
            if (caTheoryEl) caTheoryEl.textContent = '-';
            if (caCapEl) caCapEl.textContent = '-';
            if (caRangeEl) caRangeEl.textContent = '-';
        } else if (typeof window.CaDmgCalc.calculateCaDamageFromUI === 'function') {
            // 优先使用 calculateCaDamage：可以拿到 applyCap 相关的 capCoef，用于填“衰减阈值”
            if (typeof window.CaDmgCalc.calculateCaDamage === 'function') {
                const caCapOptions = { isClass5: isClass5, worldCapMode: worldCapMode };
                const buildCaOptions = (rangeRandomFactor) => ({
                    defense: defense,
                    defenseDown: defenseDown,
                    charIndex: charIndex,
                    isAdvantage: isAdv,
                    applyCap: true,
                    critMode: currentCritMode,
                    naOptions: { randomFactor: rangeRandomFactor },
                    capOptions: caCapOptions,
                    strongCaps: strongCaps,
                    lbStaminaBonus: lbStaminaBonus,
                    charStrongBonus: charStrongBonus,
                    adversityCharSkill: 0,
                    adversityWeapon: 0,
                    adversityStrongBonus: adversityFromCharBonus
                });
                const caResult = window.CaDmgCalc.calculateCaDamage(panelAtk, stats, hpPercent, buildCaOptions(randomFactor));

                const caVal = caResult && caResult.value != null ? caResult.value : null;
                caValForTotal = caVal;
                const caTheoryVal = caResult && caResult.theoryValue != null ? caResult.theoryValue : null;
                caDmgEl.textContent = caVal != null ? caVal.toLocaleString() : '-';
                if (caTheoryEl) caTheoryEl.textContent = caTheoryVal != null ? caTheoryVal.toLocaleString() : '-';
                if (caRangeEl) {
                    const caMinResult = window.CaDmgCalc.calculateCaDamage(panelAtk, stats, hpPercent, buildCaOptions(0.95));
                    const caMaxResult = window.CaDmgCalc.calculateCaDamage(panelAtk, stats, hpPercent, buildCaOptions(1.05));
                    const caMin = caMinResult && caMinResult.value != null ? caMinResult.value : NaN;
                    const caMax = caMaxResult && caMaxResult.value != null ? caMaxResult.value : NaN;
                    caRangeEl.textContent = formatDamageRange(caMin, caMax);
                }

                if (caCapEl) {
                    // “衰减阈值”按你图表定义：
                    // - 当奥义倍率=5时，“衰减70%阈值线”= 165万 * (1+伤害上限)
                    // - 其它奥义倍率暂按原逻辑（500000）占位
                    const caMultiplierUsed = caResult ? caResult.caMultiplierUsed : null;
                    const thresholdBase = getCaCapDisplayBase(caMultiplierUsed);
                    const capCoef = caResult && caResult.capResult && caResult.capResult.capCoef != null ? caResult.capResult.capCoef : null;
                    if (capCoef != null) {
                        const thresholdCa = new Decimal(thresholdBase)
                            .times(capCoef)
                            .floor()
                            .toNumber();
                        caCapEl.textContent = thresholdCa.toLocaleString();
                    } else {
                        caCapEl.textContent = '-';
                    }
                }
            } else {
                const caResult = window.CaDmgCalc.calculateCaDamageFromUI(charIndex);
                if (caResult && caResult.value != null) {
                    caValForTotal = caResult.value;
                    caDmgEl.textContent = caResult.value.toLocaleString();
                    if (caTheoryEl) caTheoryEl.textContent = caResult.value.toLocaleString();
                    if (caRangeEl) caRangeEl.textContent = '-';
                } else {
                    caValForTotal = null;
                    caDmgEl.textContent = '-';
                    if (caTheoryEl) caTheoryEl.textContent = '-';
                    if (caRangeEl) caRangeEl.textContent = '-';
                }
                if (caCapEl) caCapEl.textContent = '-';
            }
            if (totalCritMult > 1.0000001) caDmgEl.classList.add('is-crit');
            else caDmgEl.classList.remove('is-crit');
        }
    }

    // 理论总伤（与当前选中角色槽一致）：平A = 预测平A×3，奥义 = 预测奥义
    const activeSlotBtn = document.querySelector('.char-slot-btn.active');
    const activeSlot = activeSlotBtn ? (parseInt(activeSlotBtn.getAttribute('data-slot'), 10) || 0) : 0;
    if (charIndex === activeSlot) {
        const naBaseEl = document.getElementById('theoretical-na-base');
        const naMultCombinedEl = document.getElementById('theoretical-na-mult-combined');
        const naSumEl = document.getElementById('theoretical-na-sum');
        const naChaseERowEl = document.getElementById('theoretical-na-chase-e-row');
        const naChaseELabelEl = document.getElementById('theoretical-na-chase-e-label');
        const naChaseEValueEl = document.getElementById('theoretical-na-chase-e-value');
        const naChaseDesRowEl = document.getElementById('theoretical-na-chase-des-row');
        const naChaseDesLabelEl = document.getElementById('theoretical-na-chase-des-label');
        const naChaseDesValueEl = document.getElementById('theoretical-na-chase-des-value');
        const caTotalEl = document.getElementById('theoretical-ca-total');
        const ranshuForUi = ranshuHits;
        const multTotal = 3 * ranshuForUi;
        const chaseElementNameMap = {
            fire: '火',
            water: '水',
            earth: '土',
            wind: '风',
            light: '光',
            dark: '暗',
            destruction: '破坏',
            advantage: '克制'
        };
        const chaseElementColorFallback = {
            火: '#E74C3C',
            水: '#3980D9',
            土: '#9C6040',
            风: '#6FD840',
            光: '#FEEC59',
            暗: '#7F45C9',
            破坏: '#D2FBFE',
            克制: '#FCF4EC'
        };
        const getChaseElementLabel = (effect) => {
            const raw = effect && effect.element != null ? String(effect.element) : '';
            return chaseElementNameMap[raw] || raw || '属性';
        };
        const getChaseElementColor = (effect) => {
            const label = getChaseElementLabel(effect);
            const colorMap = (typeof ELEMENT_COLORS !== 'undefined' && ELEMENT_COLORS) ? ELEMENT_COLORS : {};
            return colorMap[label] || colorMap[effect && effect.element] || chaseElementColorFallback[label] || '';
        };
        const clearDynamicNaChaseRows = () => {
            if (typeof document === 'undefined') return;
            document.querySelectorAll('.theoretical-na-chase-dynamic-row').forEach((el) => el.remove());
        };
        const appendNaChaseRow = (effect) => {
            if (!effect || !naChaseDesRowEl || !naChaseDesRowEl.parentElement) return;
            const pct = Number(effect.pct || 0);
            const perHit = Number(effect.perHit || 0);
            if (pct <= 0 || perHit <= 0) return;
            const row = document.createElement('div');
            row.className = 'theoretical-total-dmg-row theoretical-na-chase-dynamic-row';
            const label = document.createElement('span');
            label.className = 'theoretical-total-dmg-label';
            const value = document.createElement('span');
            value.className = 'theoretical-total-dmg-value';
            const elementLabel = getChaseElementLabel(effect);
            const zone = effect.zone ? String(effect.zone) : '';
            label.textContent = `${elementLabel}属性追击（${zone ? zone + '区 ' : ''}${(pct * 100).toFixed(2)}%）`;
            value.textContent = perHit.toLocaleString();
            const color = getChaseElementColor(effect);
            if (color) {
                label.style.color = color;
                value.style.color = color;
            }
            row.appendChild(label);
            row.appendChild(value);
            naChaseDesRowEl.parentElement.insertBefore(row, naChaseDesRowEl);
        };

        // 先硬重置追击显示，避免卸武器/切角色时沿用上一帧残留
        clearDynamicNaChaseRows();
        if (naChaseERowEl && naChaseELabelEl && naChaseEValueEl) {
            naChaseERowEl.hidden = true;
            naChaseELabelEl.textContent = '属性追击（E类 0%）';
            naChaseEValueEl.textContent = '-';
            naChaseELabelEl.style.color = '';
            naChaseEValueEl.style.color = '';
            naChaseERowEl.style.display = 'none';
        }
        if (naChaseDesRowEl && naChaseDesLabelEl && naChaseDesValueEl) {
            naChaseDesRowEl.hidden = true;
            naChaseDesLabelEl.textContent = '破坏属性追击（0%）';
            naChaseDesValueEl.textContent = '-';
            naChaseDesLabelEl.style.color = '';
            naChaseDesValueEl.style.color = '';
        }

        // 平A追击/破坏追击：统一由 BonusDmgCalc 计算
        const fallbackElement = (typeof party !== 'undefined' && Array.isArray(party) && party[charIndex])
            ? (party[charIndex].element || 'unknown')
            : 'unknown';
        const bonusCalcResult = (window.BonusDmgCalc && typeof window.BonusDmgCalc.calcNaBonusDamage === 'function')
            ? window.BonusDmgCalc.calcNaBonusDamage({
                panelAtk,
                stats,
                hpPercent,
                charIndex,
                teshuStats,
                isAdv,
                // 与平A预测同一条「暴击税后基底」：preDef×暴击倍率÷防，再与 sumNaFinalWithRanshu 一致
                rawCritPostDefUsed: isAdv ? rawCritPostDefAdv : rawCritPostDefNormal,
                extraAmpUsed: isAdv ? extraAmpAdvantage : extraAmpNormal,
                defense,
                defenseDown,
                randomFactor,
                fallbackElement,
                ranshuForUi,
                totalSupp: total_supp,
                calcOptions: {
                    backups,
                    ...baseAdversityOptions
                },
                capCritResultAdv,
                capCritResultNormal,
                preDefAdvVal,
                preDefNormalVal,
                totalCritMult,
                effectiveDefense,
                extraAmpAdvantage,
                extraAmpNormal,
                capOptions
            })
            : {
                chaseEPct: 0,
                chasePerHit: 0,
                chaseEffects: [],
                chaseDesPct: 0,
                chaseDesPerHit: 0
            };
        const chaseEPct = Number(bonusCalcResult.chaseEPct || 0);
        const chasePerHit = Number(bonusCalcResult.chasePerHit || 0);
        const chaseEffects = Array.isArray(bonusCalcResult.chaseEffects) ? bonusCalcResult.chaseEffects : [];
        const chaseDesPct = Number(bonusCalcResult.chaseDesPct || 0);
        const chaseDesPerHit = Number(bonusCalcResult.chaseDesPerHit || 0);
        const chaseTotal = Math.round(chasePerHit * multTotal);
        const chaseDesTotal = Math.round(chaseDesPerHit * multTotal);

        if (naBaseEl && naSumEl) {
            const naNum = finalNaDisplay;
            // 总和伤害口径： (平A每段 + 追击每段) × 总hit数
            const perHitTotal = naNum + chasePerHit + chaseDesPerHit;
            const productWithChase = Math.round(perHitTotal * multTotal);
            naBaseEl.textContent = Number.isFinite(naNum) ? naNum.toLocaleString() : '-';
            if (naMultCombinedEl) naMultCombinedEl.textContent = '× ' + multTotal;
            naSumEl.textContent = Number.isFinite(naNum) ? productWithChase.toLocaleString() : '-';
        } else if (naMultCombinedEl) {
            naMultCombinedEl.textContent = '× ' + multTotal;
        }

        // 显示/隐藏：平A属性追击。按实际生效分区逐条显示，避免把 E/A1 等追击压成一行。
        chaseEffects.forEach((effect) => appendNaChaseRow(effect));

        // 显示/隐藏：平A破坏属性追击
        if (naChaseDesRowEl && naChaseDesLabelEl && naChaseDesValueEl) {
            if (chaseDesPct > 0 && chaseDesPerHit > 0) {
                naChaseDesLabelEl.textContent = `破坏属性追击（${(chaseDesPct * 100).toFixed(2)}%）`;
                naChaseDesValueEl.textContent = chaseDesPerHit.toLocaleString();

                // 破坏属性追击固定色（不随武器/角色属性变化）
                const desColor = '#D2FBFE';
                naChaseDesLabelEl.style.color = desColor;
                naChaseDesValueEl.style.color = desColor;

                naChaseDesRowEl.style.display = '';
                naChaseDesRowEl.hidden = false;
            } else {
                naChaseDesLabelEl.style.color = '';
                naChaseDesValueEl.style.color = '';
                naChaseDesRowEl.style.display = 'none';
                naChaseDesRowEl.hidden = true;
            }
        }

        if (caTotalEl) {
            if (caValForTotal != null && Number.isFinite(caValForTotal)) {
                caTotalEl.textContent = caValForTotal.toLocaleString();
            } else {
                caTotalEl.textContent = '-';
            }
        }
    }

    const skillDmgEl = document.getElementById('skill-dmg-display-' + charIndex);
    if (skillDmgEl && window.SkillDmgCalc && typeof window.SkillDmgCalc.calculateSkillDamage === 'function') {
        const skillMultInput = document.getElementById('skill-mult-input-' + charIndex);
        const skillLabelWrap = skillMultInput ? skillMultInput.closest('.dmg-skill-label-input') : null;
        const skillLabel = skillLabelWrap ? skillLabelWrap.querySelector('.dmg-label') : null;
        const hasCheckedDamageSkill = getCheckedDamageSkillSteps(charIndex).length > 0;
        setSkillDamageDecayModeButton(charIndex, hasCheckedDamageSkill);
        const renderedCheckedSkills = renderCheckedSkillDamageRows(charIndex, skillDmgEl, {
            panelAtk,
            stats,
            hpPercent,
            defense,
            defenseDown,
            isAdv,
            critMode,
            randomFactor,
            capOptions,
            ...baseAdversityOptions
        });
        if (renderedCheckedSkills) {
            if (skillMultInput) skillMultInput.style.display = 'none';
            if (skillLabel) skillLabel.textContent = '技能伤害';
            if (totalCritMult > 1.0000001) skillDmgEl.classList.add('is-crit');
            else skillDmgEl.classList.remove('is-crit');
            return resultNormal;
        }

        if (skillMultInput) skillMultInput.style.display = '';
        if (skillLabel) skillLabel.textContent = '技能预测伤害';
        setSkillDamageDecayModeButton(charIndex, false);
        const skillMult = window.SkillDmgCalc.readSkillMultFromUI(charIndex);
        if (!Number.isFinite(skillMult) || skillMult <= 0) {
            skillDmgEl.textContent = '-';
            skillDmgEl.classList.remove('is-crit');
        } else {
            if (
                window.ThresholdRegistry
                && typeof window.ThresholdRegistry.loadThresholdData === 'function'
                && !window.__skillTestThresholdLoadRequested
            ) {
                window.__skillTestThresholdLoadRequested = true;
                window.ThresholdRegistry.loadThresholdData().then(function () {
                    if (typeof recalculate === 'function') recalculate();
                    else updateDamageDisplay(charIndex);
                });
            }
            const skillResult = window.SkillDmgCalc.calculateSkillDamage(panelAtk, stats, hpPercent, {
                defense: defense,
                defenseDown: defenseDown,
                charIndex: charIndex,
                isAdvantage: isAdv,
                critMode: critMode,
                naOptions: { randomFactor: randomFactor },
                ...baseAdversityOptions,
                applyCap: true,
                capOptions: Object.assign({}, capOptions || {}, { thresholdTableId: 'skill_test' }),
                skillBaseMult: skillMult
            });
            const skillVal = skillResult && skillResult.value != null ? skillResult.value : null;
            skillDmgEl.textContent = skillVal != null ? skillVal.toLocaleString() : '-';
            if (totalCritMult > 1.0000001) skillDmgEl.classList.add('is-crit');
            else skillDmgEl.classList.remove('is-crit');
        }
    }
    
    return resultNormal;
}

// 切换理论伤害显示 (暴击/非暴击)
function toggleCritTheory(btn, charIndex) {
    const valEl = document.getElementById(`theory-val-adv-${charIndex}`);
    if (!valEl) return;
    
    const mode = valEl.getAttribute('data-mode');
    
    if (mode === 'crit') {
        valEl.textContent = valEl.getAttribute('data-normal');
        valEl.setAttribute('data-mode', 'normal');
        
        btn.textContent = '非暴击';
        btn.style.background = '#7f8c8d';
        btn.style.color = '#fff';
    } else {
        valEl.textContent = valEl.getAttribute('data-crit');
        valEl.setAttribute('data-mode', 'crit');
        
        btn.textContent = '暴击';
        btn.style.background = '';
        btn.style.color = '';
    }
}

// ==========================================
// 暴击伤害计算 (使用 Decimal.js)
// ==========================================

function calculateCriticalDamage(rawDamageDecimal, suppDamage, critRate, critBonus = 0.5) {
    const effectiveRate = Decimal.min(critRate, 1.0).toNumber();
    
    const totalMultiplier = new Decimal(1).plus(critBonus);
    
    const amplifiedRaw = rawDamageDecimal.times(totalMultiplier);
    
    const finalCritDamage = amplifiedRaw.round().plus(suppDamage).toNumber();
    
    return {
        critDamage: finalCritDamage,
        critRate: effectiveRate
    };
}

// ==========================================
// 基础值手动调整 (+1 / -1 / 重置)
// ==========================================
function adjustBaseValue(charIndex, delta) {
    if (!window.baseValues) window.baseValues = {};
    if (!window.baseValues[charIndex]) {
        window.baseValues[charIndex] = { original: 0, adjustment: 0 };
    }
    window.baseValues[charIndex].adjustment = (window.baseValues[charIndex].adjustment || 0) + delta;
    recalculate();
}

function resetBaseValue(charIndex) {
    if (!window.baseValues) window.baseValues = {};
    if (!window.baseValues[charIndex]) {
        window.baseValues[charIndex] = { original: 0, adjustment: 0 };
    }
    window.baseValues[charIndex].adjustment = 0;
    recalculate();
}

// 导出模块 (如果需要的话，为了不破坏之前的引用暂时不导出，作为全局函数存在)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateDamage,
        calculateDamageFromUI,
        updateDamageDisplay,
        toggleCritTheory,
        calculateCriticalDamage
    };
}
