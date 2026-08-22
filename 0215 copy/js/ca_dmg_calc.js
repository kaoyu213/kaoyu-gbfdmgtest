// ==========================================
//  GBF 模拟器 - 奥义伤害计算模块 (Ougi / CA Damage)
// ==========================================
//
// 公式（与手算一致）：
// 先算 基础伤害/防御 × 奥义倍率 × (1+武器盘) × (1+其余) + 奥义固定值（此处不对 inner 取整，保留 Decimal 精度）；
// 奥义攻击伤害 = {
//   inner × (1+暴击倍率) + 伤害上升效果
// } × (1+伤害增幅)
//
// 名词约定：
//   武器盘 = CA_DMG_WEAPON_GRID_KEYS 的汇总（仅武器盘奥义伤害加成）
//   其余   = 其余所有来源奥义伤害加成（非武器盘），即 CA_DMG_OTHER_KEYS + 特殊加成中的 ca_dmg
//
// 与平A差异：奥义的「伤害上升效果」在 暴击之后、伤害增幅之前 加上；
//           平A 的伤害上升是在 伤害上限与增幅 之后 加上。
//

(function () {
    'use strict';

    // 依赖：damage_calc.js (getTeshuStats, aggregateZoneValue, finalRound)
    //       na_dmg_calc.js (calculateDamage，用于取得基础伤害)
    //       damage_cap.js (applyDamageCap，可选用于奥义上限)
    // 全局：party, currentGrid, STAT_CONFIG, allClasses, currentMC

    // ==========================================
    // 奥义乘区来源配置
    // ==========================================

    /** 武器盘奥义伤害加成来源（仅武器盘） */
    const CA_DMG_WEAPON_GRID_KEYS = [
        'weapon_ca_dmg',
        'weapon_ax_ca_dmg'
    ];

    /** 其余所有来源奥义伤害加成（非武器盘） */
    const CA_DMG_OTHER_KEYS = [
        'mc_ca_passive',
        'chara_ca_passive',
        'chara_ring_ca_dmg',
        'chara_artifacts_ca_dmg',
        'chara_awakening_ca_dmg',
        'chara_lb_ca_dmg'
    ];

    /** 奥义伤害上升：武器盘区（仅武器词条） */
    const CA_DMG_SUPP_WEAPON_GRID_KEYS = [
        'weapon_ca_dmg_supp',
        'weapon_ax_ca_dmg_supp',
        'weapon_dmg_supp',
        'weapon_special_ca_dmg_supp'
    ];
    /** 神器等非武器盘来源（与耳饰、武器盘区分，便于以后单独定规则） */
    const CA_DMG_SUPP_OTHER_KEYS = [
        'chara_artifacts_ca_dmg_supp'
    ];
    /** 兼容旧引用：武器盘 + 其它非耳饰 stat */
    const CA_DMG_SUPP_KEYS = CA_DMG_SUPP_WEAPON_GRID_KEYS.concat(CA_DMG_SUPP_OTHER_KEYS);

    // ==========================================
    // 工具：从 stats（及可选 teshuStats）汇总数值
    // ==========================================
    /** 汇总 keys 对应 stats 中的值；若传 teshuStats 则再加上 teshuStats['ca_dmg']（用于「其余」） */
    function sumKeys(keys, stats, teshuStats) {
        let s = new Decimal(0);
        (keys || []).forEach(function (k) {
            s = s.plus(stats[k] || 0);
        });
        if (teshuStats && teshuStats['ca_dmg'] != null) {
            s = s.plus(teshuStats['ca_dmg']);
        }
        return s.toNumber();
    }

    /** 仅汇总 keys 对应 stats（不包含 teshuStats），用于「武器盘」 */
    function sumWeaponGridKeys(keys, stats) {
        let s = new Decimal(0);
        (keys || []).forEach(function (k) {
            s = s.plus(stats[k] || 0);
        });
        return s.toNumber();
    }

    function sumSupp(keys, stats) {
        let s = new Decimal(0);
        (keys || []).forEach(function (k) {
            s = s.plus(stats[k] || 0);
        });
        return s.toNumber();
    }

    /** 获取主手武器（当前武器盘第一个槽位） */
    function getMainHandWeapon() {
        var grid = typeof currentGrid !== 'undefined' ? currentGrid : [];
        return grid[0] || null;
    }

    /** 从武器对象读取奥义倍率（weapon_multiplier），无则默认 3（300%） */
    function getWeaponCaMultiplier(weapon) {
        if (!weapon) return 3;
        var mult = (weapon.stats && weapon.stats.weapon_multiplier != null)
            ? weapon.stats.weapon_multiplier
            : weapon.weapon_multiplier;
        return Number(mult) > 0 ? Number(mult) : 3;
    }

    /** 从武器对象读取奥义固定值（ca_fixed） */
    function getWeaponCaFixed(weapon) {
        if (!weapon) return 0;
        var fixed = (weapon.stats && weapon.stats.ca_fixed != null)
            ? weapon.stats.ca_fixed
            : weapon.ca_fixed;
        return Number(fixed) || 0;
    }

    /** 从当前武器盘汇总奥义固定值（武器上的 ca_fixed）。主角时仅取主手时可传 mainHandOnly=true */
    function getCaFixedFromGrid(mainHandOnly) {
        if (mainHandOnly) {
            return getWeaponCaFixed(getMainHandWeapon());
        }
        var grid = typeof currentGrid !== 'undefined' ? currentGrid : [];
        var total = 0;
        for (var i = 0; i < grid.length; i++) {
            var w = grid[i];
            if (w) {
                total += getWeaponCaFixed(w);
            }
        }
        return total;
    }

    /** 非主角奥义：倍率/固定值来自 chara.json（经 currentParty 引用），缺省 4.5 / 2000 */
    var DEFAULT_NON_MC_CA_MULTIPLIER = 4.5;
    var DEFAULT_NON_MC_CA_FIXED = 2000;

    /**
     * @param {number} charIndex 队伍槽位，>0 为非主角
     * @returns {{ mult: number, fixed: number }}
     */
    function getNonMcCaMultiplierAndFixed(charIndex) {
        var mult = DEFAULT_NON_MC_CA_MULTIPLIER;
        var fixed = DEFAULT_NON_MC_CA_FIXED;
        if (typeof currentParty === 'undefined' || !currentParty[charIndex]) {
            return { mult: mult, fixed: fixed };
        }
        var c = currentParty[charIndex];
        var m = Number(c['奥义倍率']);
        if (Number.isFinite(m) && m > 0) {
            mult = m;
        }
        if (c['奥义固定值'] !== undefined && c['奥义固定值'] !== null && c['奥义固定值'] !== '') {
            var fx = Number(c['奥义固定值']);
            if (Number.isFinite(fx)) {
                fixed = fx;
            }
        }
        return { mult: mult, fixed: fixed };
    }

    /**
     * 获取「基础伤害」（与平 A 相同流程，防御前一步的数值）
     * 通过平 A 计算函数拿到「随机补正」后的值。
     */
    function getBaseDamageBeforeDefense(panelAtk, stats, hpPercent, options) {
        if (typeof calculateDamage !== 'function') {
            return 0;
        }
        var result = calculateDamage(panelAtk, stats, hpPercent, options || {});
        var logs = result.logs || [];
        for (var i = 0; i < logs.length; i++) {
            if (logs[i].name === '随机补正') {
                return Number(logs[i].value) || 0;
            }
        }
        return 0;
    }

    /**
     * 计算有效防御
     * @param {number} defense - 敌方防御
     * @param {number} defenseDown - 防 down 百分比 0~80
     * @param {number} weaponDefIgnore - 无视防御 0~0.3
     */
    function getEffectiveDefense(defense, defenseDown, weaponDefIgnore) {
        var def = Number(defense) || 10;
        var down = Math.min(80, Math.max(0, Number(defenseDown) || 0)) / 100;
        var ignore = Math.min(0.3, Math.max(0, Number(weaponDefIgnore) || 0));
        return def * (1 - down) * (1 - ignore);
    }

    /**
     * 计算暴击倍率 (1 + 暴击倍率) 的乘数
     * 与 na_dmg_calc 中暴击逻辑一致
     */
    function getCritMultiplier(stats) {
        var weaponCritRate = stats['weapon_critical_hit_rate'] || 0;
        var critRate = Decimal.min(weaponCritRate, 1.0).toNumber();
        var overflowCritRate = Math.max(Number(weaponCritRate) - 1.0, 0);
        var excessCritDamageUp = Math.min(overflowCritRate * 0.5, 1.0);
        // 过量技能·暴击：小于 1% 时不计入伤害计算
        if (excessCritDamageUp < 0.01) excessCritDamageUp = 0;
        var critBonus = 0.5 + 0.5 * excessCritDamageUp;
        return 1 + critBonus;
    }

    /**
     * 奥义伤害计算（仅公式部分，不包含伤害上限）
     * 注意：奥义的「伤害上升」在暴击之后、伤害增幅之前加上，与平A（伤害上升在增幅之后）不同。
     *
     * @param {object} params
     * @param {number} params.baseDamage - 基础伤害（防御前）
     * @param {number} params.defense - 有效防御
     * @param {number} params.caMultiplier - 奥义倍率（如 300% 传 3）
     * @param {number} params.weaponGrid - 武器盘 = CA_DMG_WEAPON_GRID_KEYS 汇总（小数）
     * @param {number} params.other - 其余 = 其余所有来源奥义伤害加成 CA_DMG_OTHER_KEYS 等（小数）
     * @param {number} params.caFixed - 奥义固定值
     * @param {number} params.critMult - 暴击乘数 (1+暴击倍率)
     * @param {number} params.caDmgSupp - 伤害上升效果（固定值）；奥义中在暴击后、增幅前加上
     * @param {number} params.caDmgAmp - 伤害增幅（小数，如 0.1 表示 10%）
     * @param {number} params.takenDmgAmp - 承受伤害增幅（小数，如 0.1 表示 10%）
     * @returns {{ value: number, steps: object }}
     */
    function calcCaDamageRaw(params) {
        var base = Number(params.baseDamage) || 0;
        var def = Number(params.defense) || 10;
        var rate = Number(params.caMultiplier) != null ? Number(params.caMultiplier) : 3;
        var weaponGrid = Number(params.weaponGrid) || 0;   // 武器盘 = CA_DMG_WEAPON_GRID_KEYS
        var other = Number(params.other) || 0;           // 其余 = 其余所有来源奥义伤害加成（非武器盘）
        var fixed = Number(params.caFixed) || 0;
        var critMult = Number(params.critMult) != null ? Number(params.critMult) : 1;
        var supp = Number(params.caDmgSupp) || 0;
        var amp = Number(params.caDmgAmp) || 0;
        var takenAmp = Number(params.takenDmgAmp) || 0;

        if (def <= 0) def = 1;

        // inner = (base/def)*rate*(1+weaponGrid)*(1+other)+fixed，不在此处取整，保留精度到暴击及之后
        var afterDefExact = base / def;
        var inner = new Decimal(afterDefExact)
            .times(rate)
            .times(new Decimal(1).plus(weaponGrid))
            .times(new Decimal(1).plus(other))
            .plus(fixed);

        // × (1+暴击倍率)
        var afterCrit = inner.times(critMult).ceil().toNumber();

        // × (1+承受伤害增幅)（在伤害上升计算前）
        var afterTakenAmp = new Decimal(afterCrit)
            .times(new Decimal(1).plus(takenAmp))
            .toNumber();

        // + 伤害上升效果（奥义：在暴击之后、伤害增幅之前，与平A不同）
        var afterSupp = new Decimal(afterTakenAmp).plus(supp).toNumber();

        // × (1+伤害增幅)
        var finalVal = new Decimal(afterSupp)
            .times(new Decimal(1).plus(amp))
            .toNumber();

        return {
            value: Math.floor(finalVal),
            steps: {
                baseDamage: base,
                defense: def,
                afterDef: afterDefExact,
                afterOugiMult: inner.toNumber(),
                afterCrit: afterCrit,
                afterSupp: afterSupp,
                final: finalVal
            }
        };
    }

    /**
     * 奥义伤害计算主入口（从面板与 stats 计算）
     *
     * @param {number} panelAtk - 面板攻击
     * @param {object} stats - party[i].stats
     * @param {number} hpPercent - 当前 HP 百分比 0~100
     * @param {object} options
     * @param {number} options.defense - 敌方防御，默认 10
     * @param {number} options.defenseDown - 防 down 0~80
     * @param {number} options.caMultiplier - 奥义倍率；主角且持主手时若未传则从主手读取；非主角若未传则从 chara.json（currentParty 的 奥义倍率，缺省 4.5）
     * @param {number} options.caFixed - 奥义固定值；非主角若未传则从 chara.json（奥义固定值，缺省 2000）
     * @param {boolean} options.isAdvantage - 是否克属
     * @param {boolean} options.applyCap - 是否应用奥义伤害上限，默认 false（仅公式）
     * @param {number} options.charIndex - 队伍槽位，0=主角；主角时奥义倍率与奥义固定值从主手武器读取
     * @param {object} options.naOptions - 传给平 A 计算基础伤害的额外参数
     * @param {string} options.critMode - 暴击模式：non_crit / expected / lower_bound(暴击预期值) / upper_bound
     * @returns {{ value: number, steps: object, withCap?: number }}
     */
    function calculateCaDamage(panelAtk, stats, hpPercent, options) {
        options = options || {};
        var defense = options.defense != null ? options.defense : 10;
        var defenseDown = options.defenseDown != null ? options.defenseDown : 0;
        var charIndex = options.charIndex != null ? options.charIndex : -1;
        var isMC = charIndex === 0;
        var mainHand = getMainHandWeapon();

        var caMultiplier;
        var caFixed;
        if (isMC && mainHand) {
            caMultiplier = options.caMultiplier != null ? options.caMultiplier : getWeaponCaMultiplier(mainHand);
            caFixed = options.caFixed != null ? options.caFixed : getWeaponCaFixed(mainHand);
        } else if (isMC) {
            // 主角无有效主手：沿用武器盘奥义固定值汇总；倍率默认 3
            caMultiplier = options.caMultiplier != null ? options.caMultiplier : 3;
            caFixed = options.caFixed != null ? options.caFixed : getCaFixedFromGrid(false);
        } else {
            // 非主角：奥义倍率/固定值默认来自 chara.json（currentParty 角色数据上的 奥义倍率 / 奥义固定值）
            var nonMc = getNonMcCaMultiplierAndFixed(charIndex);
            caMultiplier = options.caMultiplier != null ? options.caMultiplier : nonMc.mult;
            caFixed = options.caFixed != null ? options.caFixed : nonMc.fixed;
        }

        var isAdvantage = options.isAdvantage === true;
        var applyCap = options.applyCap === true;
        var critMode = options.critMode || 'expected';
        var naOptions = options.naOptions || {};

        var teshuStats = typeof getTeshuStats === 'function' ? getTeshuStats() : {};

        if (typeof overlayCharaLbCaDmgFromParty === 'function') {
            overlayCharaLbCaDmgFromParty(stats, charIndex);
        }
        // 非主角戒指/神器/觉醒奥义伤害加成 overlay 进 stats
        if (typeof overlayCharaOtherCaDmgFromParty === 'function') {
            overlayCharaOtherCaDmgFromParty(stats, charIndex);
        }
        // 非主角上限加成（LB、戒指、神器、觉醒、婚戒等）overlay 进 stats
        if (typeof overlayCharaCapsFromParty === 'function') {
            overlayCharaCapsFromParty(stats, charIndex);
        }

        var weaponDefIgnore = Math.min(0.3, Math.max(0, Number(stats['weapon_def_ignore']) || 0));
        var effectiveDefense = getEffectiveDefense(defense, defenseDown, weaponDefIgnore);

        naOptions.defense = defense;
        naOptions.defenseDown = defenseDown;
        naOptions.isAdvantage = isAdvantage;
        if (naOptions.randomFactor == null) naOptions.randomFactor = 1;
        // 传递强壮/逆境等乘区参数，确保奥义基础伤害计算时能正确包含这些加成
        naOptions.strongCaps = options.strongCaps || [];
        naOptions.lbStaminaBonus = options.lbStaminaBonus || 0;
        naOptions.charStrongBonus = options.charStrongBonus || 0;
        naOptions.adversityCharSkill = options.adversityCharSkill || 0;
        naOptions.adversityWeapon = options.adversityWeapon || 0;
        naOptions.adversityStrongBonus = options.adversityStrongBonus || 0;

        var baseDamage = getBaseDamageBeforeDefense(panelAtk, stats, hpPercent, naOptions);

        // 武器盘 = CA_DMG_WEAPON_GRID_KEYS；其余 = 其余所有来源奥义伤害加成（非武器盘）= CA_DMG_OTHER_KEYS + 特殊
        var weaponGrid = sumWeaponGridKeys(CA_DMG_WEAPON_GRID_KEYS, stats);
        var other = sumKeys(CA_DMG_OTHER_KEYS, stats, teshuStats);
        var buffs = !options.ignoreTestBuffSettings && typeof window !== 'undefined' && window.buffSettings ? window.buffSettings : {};
        weaponGrid += Number(buffs.caWeaponDmg || 0);
        other += Number(buffs.caDmg || 0);
        if (options.effectTotals && typeof options.effectTotals === 'object') {
            if (typeof options.effectTotals.ca_dmg_weapon_grid === 'number') weaponGrid = options.effectTotals.ca_dmg_weapon_grid;
        } else if (typeof getAllEffectsTotalForSlot === 'function') {
            weaponGrid = getAllEffectsTotalForSlot(charIndex, 'ca_dmg_weapon_grid', weaponGrid);
        }
        if (options.effectTotals && typeof options.effectTotals === 'object') {
            if (typeof options.effectTotals.ca_dmg_other === 'number') other = options.effectTotals.ca_dmg_other;
        } else if (typeof getAllEffectsTotalForSlot === 'function') {
            other = getAllEffectsTotalForSlot(charIndex, 'ca_dmg_other', other);
        }
        var caDmgSuppWeapon = sumSupp(CA_DMG_SUPP_WEAPON_GRID_KEYS, stats);
        var caDmgSuppOther = sumSupp(CA_DMG_SUPP_OTHER_KEYS, stats);
        var caDmgSuppEarring = 0;
        if (typeof getEarringDmgSuppFromLevel === 'function' && typeof currentParty !== 'undefined' && currentParty[charIndex]) {
            caDmgSuppEarring = getEarringDmgSuppFromLevel(currentParty[charIndex].chara_earring_dmg_supp);
        }
        var fallbackCaDmgSupp = caDmgSuppWeapon + caDmgSuppOther + caDmgSuppEarring + (Number(buffs.dmgSupp || 0)) + (Number(buffs.caDmgSupp || 0));
        var caDmgSupp = options.effectTotals && typeof options.effectTotals === 'object'
            ? (typeof options.effectTotals.ca_dmg_supp === 'number' ? options.effectTotals.ca_dmg_supp : fallbackCaDmgSupp)
            : ((typeof getAllEffectsTotalForSlot === 'function')
                ? getAllEffectsTotalForSlot(charIndex, 'ca_dmg_supp', fallbackCaDmgSupp)
                : fallbackCaDmgSupp);
        var critMult = 1;
        var critFlag = false;
        var critAmpRate = 0;
        if (typeof window !== 'undefined' && typeof window.getIndependentCritSources === 'function' && typeof window.getCritMultiplierByMode === 'function') {
            var critSources = window.getIndependentCritSources(charIndex, stats);
            critMult = window.getCritMultiplierByMode(critMode, critSources);
            if (typeof window.getCritFlagByMode === 'function') {
                critFlag = window.getCritFlagByMode(critMode, critSources);
            }
            if (typeof window.getCritAmpRateByMode === 'function') {
                critAmpRate = window.getCritAmpRateByMode(critMode, critSources);
            } else {
                critAmpRate = critFlag ? 1 : 0;
            }
        } else {
            critMult = getCritMultiplier(stats);
            critFlag = critMult > 1;
            critAmpRate = critFlag ? 1 : 0;
        }

        var critOnlyAmp = Number(stats['weapon_critical_hit_amp'] || 0) * critAmpRate;
        var fallbackCaDmgAmp = (stats['weapon_ca_dmg_amp'] || 0) + (stats['weapon_special_ca_dmg_amp'] || 0) + (stats['weapon_dmg_amp'] || 0);
        if (teshuStats && teshuStats['dmg_amp']) {
            fallbackCaDmgAmp += teshuStats['dmg_amp'];
        }
        // 玲珑佩/武器盘的"对克制属性伤害增幅"，仅克属时生效
        if (isAdvantage) {
            fallbackCaDmgAmp += aggregateZoneValue('dmg_to_elemental_amp', stats, teshuStats);
        }
        var caDmgAmp = options.effectTotals && typeof options.effectTotals === 'object'
            ? (typeof options.effectTotals.ca_dmg_amp === 'number' ? options.effectTotals.ca_dmg_amp : fallbackCaDmgAmp)
            : ((typeof getAllEffectsTotalForSlot === 'function')
                ? getAllEffectsTotalForSlot(charIndex, 'ca_dmg_amp', fallbackCaDmgAmp)
                : fallbackCaDmgAmp);
        caDmgAmp += critOnlyAmp;
        var takenDmgAmp = (typeof calculateTakenDamageAmp === 'function')
            ? calculateTakenDamageAmp({
                charIndex: charIndex,
                ignoreTestBuffSettings: options.ignoreTestBuffSettings === true,
                effectTotals: options.effectTotals
            })
            : 0;

        var raw = calcCaDamageRaw({
            baseDamage: baseDamage,
            defense: effectiveDefense,
            caMultiplier: caMultiplier,
            weaponGrid: weaponGrid,
            other: other,
            caFixed: caFixed,
            critMult: critMult,
            caDmgSupp: caDmgSupp,
            caDmgAmp: caDmgAmp,
            takenDmgAmp: takenDmgAmp
        });

        // 返回结果：
        // - value：给 UI 展示的最终伤害（根据 applyCap 决定是否套用上限衰减）
        // - withCap/capResult：给调试/阈值展示使用
        var out = {
            // value：给 UI 展示的最终伤害（根据 applyCap 决定是否套用上限衰减）
            value: raw.value,
            // theoryValue：理论伤害（不做伤害上限衰减），用于“理论伤害”展示
            theoryValue: raw.value,
            steps: raw.steps,
            caMultiplierUsed: caMultiplier,
            suppZones: {
                weaponGrid: caDmgSuppWeapon,
                earring: caDmgSuppEarring,
                other: caDmgSuppOther
            }
        };

        if (applyCap && typeof applyDamageCap === 'function') {
            // 奥义上限路径口径：
            // 1) 先对"本体（不含 supp/amp）"做第一次伤害上限衰减；
            // 2) 衰减后乘承受伤害增幅（takenDmgAmp）；
            // 3) 再叠加伤害上升（supp）；
            // 4) 最后乘伤害增幅（amp），走世界上限。
             var rawDamageForCap = raw.steps.afterCrit; // 不含 supp，不含 amp
            // 从角色数据读取阈值表ID
            var thresholdTableId = null;
            if (!isMC && typeof currentParty !== 'undefined' && currentParty[charIndex]) {
                thresholdTableId = currentParty[charIndex]['阈值表'] || null;
            }
            var capOptions = Object.assign({}, options.capOptions || {}, {
                caMultiplier: caMultiplier,
                thresholdTableId: thresholdTableId,
                charIndex: charIndex
            });
            // 克属时，将玲珑佩/武器盘的"对克制属性伤害增幅"传入上限衰减的 extraAmp
            var capResult = applyDamageCap(rawDamageForCap, stats, 'ca', teshuStats, critOnlyAmp, capOptions);

            // 按奥义公式：衰减后向上取整 → × (1+承受伤害增幅) → + 伤害上升 → × (1+伤害增幅) → 世界上限。
            var capFinal = new Decimal(capResult.decayedDamage)
                .ceil()
                .times(new Decimal(1).plus(capResult.takenDmgAmpCoef || 0))
                .plus(caDmgSupp)
                .times(new Decimal(1).plus(capResult.ampCoef))
                .toNumber();

            capFinal = applyWorldCap(capFinal, 'ca', stats, capOptions && capOptions.worldCapMode ? capOptions.worldCapMode : '660')
                .ceil()
                .toNumber();

            out.value = capFinal;
            out.withCap = capFinal;
            out.capResult = capResult;
        }

        return out;
    }

    /**
     * 从 UI 读取参数并计算当前角色的奥义伤害
     * @param {number} charIndex - 队伍槽位 0~4
     * @param {number} caMultiplier - 可选，覆盖 chara 中的奥义倍率（非主角）
     * @returns {{ value: number, steps?: object }}
     */
    function calculateCaDamageFromUI(charIndex, caMultiplier) {
        charIndex = charIndex || 0;
        // 非主角不传第二参数时，由 calculateCaDamage 从 chara.json（currentParty）读取奥义倍率/固定值

        var panelAtk = 0;
        var panelAtkEl = document.getElementById('char-panel-atk-' + charIndex);
        if (panelAtkEl) {
            panelAtk = parseInt(String(panelAtkEl.innerText).replace(/,/g, ''), 10) || 0;
        }

        var hpPercent = parseInt(document.getElementById('current-hp-slider') && document.getElementById('current-hp-slider').value, 10);
        if (isNaN(hpPercent)) hpPercent = 100;

        // 与平A一致：克属、暴击从 damageViewStates 读取（与拨片按钮同步）
        var isAdvantage = false;
        var critMode = 'expected';
        if (typeof window !== 'undefined' && window.damageViewStates && window.damageViewStates[charIndex]) {
            var state = window.damageViewStates[charIndex];
            isAdvantage = !!state.isAdvantage;
            critMode = state.critMode || 'expected';
        } else {
            var weaknessId = charIndex === 0 ? 'weakness-toggle' : 'weakness-toggle-' + charIndex;
            isAdvantage = !!(document.getElementById(weaknessId) && document.getElementById(weaknessId).checked);
        }

        var defId = charIndex === 0 ? 'def-input' : 'def-input-' + charIndex;
        var defDownId = charIndex === 0 ? 'def-down-input' : 'def-down-input-' + charIndex;
        var defense = parseInt(document.getElementById(defId) && document.getElementById(defId).value, 10) || 10;
        var defenseDown = Math.min(80, Math.max(0, parseInt(document.getElementById(defDownId) && document.getElementById(defDownId).value, 10) || 0));

        var randomFactor = 1;
        if (typeof window !== 'undefined' && window.damageViewStates && window.damageViewStates[charIndex]) {
            var mode = window.damageViewStates[charIndex].randomMode;
            if (mode === 'min') randomFactor = 0.95;
            else if (mode === 'max') randomFactor = 1.05;
        }

        var stats = {};
        if (typeof party !== 'undefined' && party[charIndex] && typeof STAT_CONFIG !== 'undefined') {
            STAT_CONFIG.forEach(function (cfg) {
                stats[cfg.key] = party[charIndex].stats[cfg.key] || 0;
            });
        }
        if (typeof overlayCharaEarringElementAtkFromParty === 'function') {
            overlayCharaEarringElementAtkFromParty(stats, charIndex);
        }
        if (typeof overlayCharaLbElementAtkFromParty === 'function') {
            overlayCharaLbElementAtkFromParty(stats, charIndex);
        }

        // 计算角色强化加成提供的强壮乘区（与平A计算一致）
        var strongCaps = [];
        var lbStaminaBonus = 0;
        var charStrongBonus = 0;
        if (typeof currentParty !== 'undefined' && Array.isArray(currentParty)) {
            var charData = currentParty[charIndex] || null;
            if (charData) {
                var ringStamina = charData['chara_ring_stamina'] || 0;
                var earringStamina = charData['chara_earring_stamina'] || 0;
                var hp01Char = Math.max(0, Math.min(1, (hpPercent || 0) / 100));
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
                    var hp01 = Math.max(0, Math.min(1, (hpPercent || 0) / 100));
                    var amounts = Array.isArray(charData['chara_lb_stamina_amounts']) ? charData['chara_lb_stamina_amounts'] : null;
                    if (amounts && amounts.length > 0) {
                        lbStaminaBonus = amounts.reduce(function (acc, amt) { return acc + getLbStaminaStrongBonus(hp01, amt); }, 0);
                    } else {
                        var lbStaminaLevel = charData['chara_lb_stamina'] || 0;
                        if (lbStaminaLevel > 0) {
                            lbStaminaBonus = getLbStaminaStrongBonus(hp01, lbStaminaLevel);
                        }
                    }
                }
            }
        }

        // 从角色强化加成(汇总)中读取「总背水（逆境）」
        var adversityFromCharBonus = 0;
        if (typeof buildCharabonusSummary === 'function') {
            var summary = buildCharabonusSummary(charIndex, hpPercent);
            if (summary && typeof summary.adversity === 'number') {
                adversityFromCharBonus = summary.adversity;
            }
        }

        return calculateCaDamage(panelAtk, stats, hpPercent, {
            defense: defense,
            defenseDown: defenseDown,
            caMultiplier: charIndex === 0 ? undefined : (caMultiplier != null ? caMultiplier : undefined),
            charIndex: charIndex,
            isAdvantage: isAdvantage,
            applyCap: false,
            critMode: critMode,
            naOptions: { randomFactor: randomFactor },
            strongCaps: strongCaps,
            lbStaminaBonus: lbStaminaBonus,
            charStrongBonus: charStrongBonus,
            adversityCharSkill: 0,
            adversityWeapon: 0,
            adversityStrongBonus: adversityFromCharBonus
        });
    }

    // 导出到全局，供 index1 与其它脚本使用
    window.CaDmgCalc = {
        calcCaDamageRaw: calcCaDamageRaw,
        calculateCaDamage: calculateCaDamage,
        calculateCaDamageFromUI: calculateCaDamageFromUI,
        getBaseDamageBeforeDefense: getBaseDamageBeforeDefense,
        getEffectiveDefense: getEffectiveDefense,
        getCritMultiplier: getCritMultiplier,
        getMainHandWeapon: getMainHandWeapon,
        getWeaponCaMultiplier: getWeaponCaMultiplier,
        getWeaponCaFixed: getWeaponCaFixed,
        getCaFixedFromGrid: getCaFixedFromGrid,
        getNonMcCaMultiplierAndFixed: getNonMcCaMultiplierAndFixed,
        DEFAULT_NON_MC_CA_MULTIPLIER: DEFAULT_NON_MC_CA_MULTIPLIER,
        DEFAULT_NON_MC_CA_FIXED: DEFAULT_NON_MC_CA_FIXED,
        CA_DMG_WEAPON_GRID_KEYS: CA_DMG_WEAPON_GRID_KEYS,
        CA_DMG_OTHER_KEYS: CA_DMG_OTHER_KEYS,
        CA_DMG_SUPP_KEYS: CA_DMG_SUPP_KEYS,
        CA_DMG_SUPP_WEAPON_GRID_KEYS: CA_DMG_SUPP_WEAPON_GRID_KEYS,
        CA_DMG_SUPP_OTHER_KEYS: CA_DMG_SUPP_OTHER_KEYS
    };
})();
