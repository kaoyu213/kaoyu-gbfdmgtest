// ==========================================
//  GBF 模拟器 - 技能伤害预测（用户填写技能基础倍率）
// ==========================================
//
// 公式（与需求一致）：
// 【 基础伤害/防御 × (技能基础倍率 + 技能伤害加成) × (1+暴击倍率) + 伤害上升效果 】× (1+伤害增幅)
//
// - 基础伤害：与奥义相同，来自平 A 计算链路的「随机补正」值（防御前）
// - 技能基础倍率：由 UI 输入（如 3 表示 300%）
// - 技能伤害加成：常驻「主角技伤伤害」mc_skill_dmg_passive、「角色技伤伤害」chara_skill_dmg_passive（小数，如 23% → 0.23），与倍率相加
// - 伤害上升：技伤予伤类固定值（武器/附魔/神器等）
// - 伤害增幅：与 damage_cap.calculateAmp(..., 'skill') 一致，暴击时附加暴击伤害增幅
// - 伤害衰减：默认关闭（显示未衰减伤害）；与平 A 的 funcDecay 分离便于研究技伤上限，需衰减时传 applyCap: true
//

(function () {
    'use strict';

    /**
     * 技能伤害加成（小数）：常驻职业/角色被动，与 UI 填写的技能基础倍率相加。
     * - 主角：mc_skill_dmg_passive（界面「主角技伤伤害」）
     * - 队友：chara_skill_dmg_passive（「角色技伤伤害」）
     * 同一槽位通常只会有其一非零，故直接相加。
     */
    function getSkillDmgBonusFromStats(stats) {
        var s = stats || {};
        var mc = Number(s['mc_skill_dmg_passive']) || 0;
        var chara = Number(s['chara_skill_dmg_passive']) || 0;
        return new Decimal(mc).plus(chara).toNumber();
    }

    var SKILL_SUPP_KEYS = [
        'weapon_skill_dmg_supp',
        'weapon_ax_skill_dmg_supp',
        'weapon_special_skill_dmg_supp',
        'chara_artifacts_skill_dmg_supp'
    ];

    function sumSupp(keys, stats) {
        var s = new Decimal(0);
        (keys || []).forEach(function (k) {
            s = s.plus(stats[k] || 0);
        });
        return s.toNumber();
    }

    /**
     * @param {object} params
     * @param {number} params.baseDamage - 基础伤害（防御前，与奥义同源）
     * @param {number} params.defense - 有效防御
     * @param {number} params.skillBaseMult - 技能基础倍率（如 3）
     * @param {number} params.skillDmgBonus - 技能伤害加成（小数），含 mc/chara 技伤被动
     * @param {number} params.critMult
     * @param {number} params.skillSupp - 伤害上升（固定值）
     * @param {number} params.skillAmp - 伤害增幅（小数总和）
     */
    function calcSkillDamageRaw(params) {
        var base = Number(params.baseDamage) || 0;
        var def = Number(params.defense) || 10;
        var mult = Number(params.skillBaseMult);
        if (!Number.isFinite(mult) || mult <= 0) mult = 0;
        var bonus = Number(params.skillDmgBonus) || 0;
        var critMult = Number(params.critMult) != null ? Number(params.critMult) : 1;
        var supp = Number(params.skillSupp) || 0;
        var amp = Number(params.skillAmp) || 0;

        if (def <= 0) def = 1;

        var afterDef = base / def;
        var inner = new Decimal(afterDef)
            .times(new Decimal(mult).plus(bonus))
            .times(critMult);
        var afterSupp = inner.plus(supp).toNumber();
        var finalVal = new Decimal(afterSupp).times(new Decimal(1).plus(amp)).toNumber();

        return {
            value: Math.floor(finalVal),
            steps: {
                baseDamage: base,
                defense: def,
                afterDef: afterDef,
                afterMultCrit: inner.toNumber(),
                afterSupp: afterSupp,
                final: finalVal
            }
        };
    }

    function calculateSkillDamage(panelAtk, stats, hpPercent, options) {
        options = options || {};
        var skillBaseMult = Number(options.skillBaseMult);
        if (!Number.isFinite(skillBaseMult) || skillBaseMult <= 0) {
            return { value: null, theoryValue: null, skillBaseMult: skillBaseMult };
        }

        var defense = options.defense != null ? options.defense : 10;
        var defenseDown = options.defenseDown != null ? options.defenseDown : 0;
        var charIndex = options.charIndex != null ? options.charIndex : 0;
        var isAdvantage = options.isAdvantage === true;
        var applyCap = options.applyCap === true;
        var critMode = options.critMode || 'expected';
        var naOptions = options.naOptions || {};

        var teshuStats = typeof getTeshuStats === 'function' ? getTeshuStats() : {};

        var weaponDefIgnore = Math.min(0.3, Math.max(0, Number(stats['weapon_def_ignore']) || 0));
        var effectiveDefense = typeof window.CaDmgCalc !== 'undefined' && typeof window.CaDmgCalc.getEffectiveDefense === 'function'
            ? window.CaDmgCalc.getEffectiveDefense(defense, defenseDown, weaponDefIgnore)
            : defense;

        naOptions.defense = defense;
        naOptions.defenseDown = defenseDown;
        naOptions.isAdvantage = isAdvantage;
        if (naOptions.randomFactor == null) naOptions.randomFactor = 1;

        var baseDamage = 0;
        if (typeof window.CaDmgCalc !== 'undefined' && typeof window.CaDmgCalc.getBaseDamageBeforeDefense === 'function') {
            baseDamage = window.CaDmgCalc.getBaseDamageBeforeDefense(panelAtk, stats, hpPercent, naOptions);
        }

        var skillSuppWeapon = sumSupp(SKILL_SUPP_KEYS, stats);
        var skillSuppEarring = 0;
        if (typeof getEarringDmgSuppFromLevel === 'function' && typeof currentParty !== 'undefined' && currentParty[charIndex]) {
            skillSuppEarring = getEarringDmgSuppFromLevel(currentParty[charIndex].chara_earring_dmg_supp);
        }
        var skillSupp = skillSuppWeapon + skillSuppEarring;

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
        } else if (typeof window.CaDmgCalc !== 'undefined' && typeof window.CaDmgCalc.getCritMultiplier === 'function') {
            critMult = window.CaDmgCalc.getCritMultiplier(stats);
            critFlag = critMult > 1;
            critAmpRate = critFlag ? 1 : 0;
        }

        var skillAmp = typeof calculateAmp === 'function' ? calculateAmp(stats, 'skill', teshuStats) : 0;
        skillAmp += (Number(stats['weapon_critical_hit_amp'] || 0) * critAmpRate);

        var skillDmgBonus = getSkillDmgBonusFromStats(stats);

        var raw = calcSkillDamageRaw({
            baseDamage: baseDamage,
            defense: effectiveDefense,
            skillBaseMult: skillBaseMult,
            skillDmgBonus: skillDmgBonus,
            critMult: critMult,
            skillSupp: skillSupp,
            skillAmp: skillAmp
        });

        var out = {
            value: raw.value,
            theoryValue: raw.value,
            steps: raw.steps,
            skillBaseMultUsed: skillBaseMult,
            skillDmgBonusUsed: skillDmgBonus,
            suppZones: {
                weaponGrid: skillSuppWeapon,
                earring: skillSuppEarring
            }
        };

        if (applyCap && typeof applyDamageCap === 'function') {
            var afterCrit = raw.steps.afterMultCrit;
            var critExtraAmp = (Number(stats['weapon_critical_hit_amp']) || 0) * critAmpRate;
            var capOptions = Object.assign({}, options.capOptions || {});
            var capResult = applyDamageCap(afterCrit, stats, 'skill', teshuStats, critExtraAmp, capOptions);

            // 技伤公式：decayed → +Supp → ×(1+Amp) → ×(1+TakenAmp) → worldCap → ceil
            var worldCapMode = (capOptions && capOptions.worldCapMode) ? capOptions.worldCapMode : '660';
            var beforeWorld = new Decimal(capResult.decayedDamage)
                .plus(skillSupp)
                .times(new Decimal(1).plus(capResult.ampCoef))
                .times(new Decimal(1).plus(capResult.takenDmgAmpCoef))
                .toNumber();
            var capFinal = typeof applyWorldCap === 'function'
                ? applyWorldCap(beforeWorld, 'skill', stats, worldCapMode).ceil().toNumber()
                : new Decimal(beforeWorld).ceil().toNumber();
            out.value = capFinal;
            out.withCap = capFinal;
            out.capResult = capResult;
        }

        return out;
    }

    function readSkillMultFromUI(charIndex) {
        var el = document.getElementById('skill-mult-input-' + charIndex);
        if (!el || el.value === '' || el.value == null) return NaN;
        return parseFloat(String(el.value).replace(/,/g, ''));
    }

    window.SkillDmgCalc = {
        getSkillDmgBonusFromStats: getSkillDmgBonusFromStats,
        calcSkillDamageRaw: calcSkillDamageRaw,
        calculateSkillDamage: calculateSkillDamage,
        readSkillMultFromUI: readSkillMultFromUI
    };
})();
