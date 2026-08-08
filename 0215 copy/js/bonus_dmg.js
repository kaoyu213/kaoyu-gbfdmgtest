// ==========================================
//  追击伤害计算模块
// ==========================================

(function () {
    function toPositiveNumber(v) {
        const n = Number(v || 0);
        return n > 0 ? n : 0;
    }

    function mergeChaseSources(sources) {
        const merged = new Map();
        (Array.isArray(sources) ? sources : []).forEach((src) => {
            if (!src) return;
            const pct = toPositiveNumber(src.pct);
            if (pct <= 0) return;
            const type = src.type || 'unknown';
            const element = src.element || 'unknown';
            const mapKey = `${type}|${element}`;
            const prev = merged.get(mapKey) || 0;
            if (pct > prev) merged.set(mapKey, pct);
        });
        let total = 0;
        merged.forEach((v) => { total += Number(v) || 0; });
        return total > 0 ? total : 0;
    }

    /** 与 damage_calc.DAMAGE_ZONES.element_atk 一致，避免仅清 element_atk 时其它属攻键仍被 aggregateZoneValue 汇总 */
    function stripElementAtkZoneFromStats(baseStats) {
        const out = { ...(baseStats || {}) };
        const keys = (typeof DAMAGE_ZONES !== 'undefined' && Array.isArray(DAMAGE_ZONES.element_atk))
            ? DAMAGE_ZONES.element_atk
            : [
                'weapon_awaken_element_atk',
                'weapon_progression_element_atk',
                'summon_element_atk',
                'element_atk',
                'weapon_element_atk',
                'chara_earring_element_atk',
                'chara_lb_element_atk'
            ];
        keys.forEach((k) => { out[k] = 0; });
        return out;
    }

    function resolveEChasePct(stats, fallbackElement) {
        const charaEElement = String(stats['charabuff_bonus_na_dmg_e_element'] || fallbackElement || 'unknown');
        const weaponElemElement = String(stats['weapon_elem_bonus_na_element'] || fallbackElement || 'unknown');
        const weaponShuichongElement = String(stats['weapon_shuichong_bonus_na_element'] || fallbackElement || 'unknown');
        return mergeChaseSources([
            { key: 'chara_e', pct: Number(stats['charabuff_bonus_na_dmg_e'] || 0), type: 'e', element: charaEElement },
            { key: 'weapon_elem_na', pct: Number(stats['weapon_elem_bonus_na'] || 0), type: 'e', element: weaponElemElement },
            { key: 'weapon_shuichong_na', pct: Number(stats['weapon_shuichong_bonus_na'] || 0), type: 'e', element: weaponShuichongElement }
        ]);
    }

    function calcPerHitFromFinalBase(baseAfterAmpTotal, chasePct, ranshuForUi, totalSupp) {
        const pct = toPositiveNumber(chasePct);
        const baseTotal = Number(baseAfterAmpTotal || 0);
        if (pct <= 0 || baseTotal <= 0) return 0;
        const segBase = new Decimal(baseTotal).div(Math.max(1, Math.floor(Number(ranshuForUi) || 1))).toNumber();
        if (segBase <= 0) return 0;
        const chaseBase = new Decimal(segBase).times(pct).ceil().toNumber();
        return chaseBase + (Number(totalSupp) || 0);
    }

    function calcPerHitSingleRoundFromRaw(rawPostDef, chasePct, params, isAdv, statsForChain) {
        const pct = toPositiveNumber(chasePct);
        const raw = Number(rawPostDef || 0);
        if (pct <= 0 || raw <= 0) return 0;

        const stats = statsForChain || params.stats;
        const extraAmp = (params.extraAmpForCap != null && Number.isFinite(Number(params.extraAmpForCap)))
            ? Number(params.extraAmpForCap)
            : (isAdv ? params.extraAmpAdvantage : params.extraAmpNormal);
        const x = Math.max(1, Math.floor(Number(params.ranshuForUi) || 1));
        const totalSupp = Number(params.totalSupp) || 0;

        // 破坏追击：与 E 类一致 — 税后×暴击 先 applyDamageCap（衰减+增幅），再×追伤%；乱击首段基底与 sumNaFinalWithRanshu 拆法一致
        const rawCrit = new Decimal(raw).times(params.totalCritMult).toNumber();
        const cap = applyDamageCap(
            rawCrit,
            stats,
            'na',
            params.teshuStats,
            extraAmp,
            params.capOptions || {}
        );
        // 重构后 applyDamageCap 不再返回 finalDamage，此处手动重建
        const worldCapMode0 = (params.capOptions && params.capOptions.worldCapMode) ? params.capOptions.worldCapMode : '660';
        const ampedAndTaken0 = new Decimal(cap.decayedDamage)
            .times(new Decimal(1).plus(cap.ampCoef))
            .times(new Decimal(1).plus(cap.takenDmgAmpCoef));
        const worldCapped0 = typeof applyWorldCap === 'function'
            ? applyWorldCap(ampedAndTaken0, 'na', stats, worldCapMode0)
            : ampedAndTaken0;
        const cappedBase = worldCapped0.ceil();
        // 与 sumNa 首段基底一致；追伤% 用 Decimal 连乘后 ceil，再加予伤
        const segForChase = x <= 1 ? cappedBase : cappedBase.div(x);
        return segForChase.times(pct).ceil().plus(totalSupp).toNumber();
    }

    /**
     * 破坏属性追击：与 na_dmg_calc.calculateDamage 的 Step5～12（乘区合并 → 随机 → 除防）一致，
     * 但乘区基准直接使用面板 ATK，不经过 ÷10、骑空艇、支援、×10。
     * 若主流程 calculateDamage 调整乘区顺序或公式，请同步此处。
     */
    function calculateNaRawPostDefFromPanelDirect(panelAtk, stats, hpPercent, options) {
        const defaults = {
            isAdvantage: false,
            defense: 10,
            defenseDown: 0,
            randomFactor: 1,
            backups: [0, 0, 0, 0, 0],
            strongCaps: [],
            adversityCharSkill: 0,
            adversityWeapon: 0,
            adversityStrongBonus: 0,
            lbStaminaBonus: 0,
            charStrongBonus: 0,
            /** 若传入则替代 getTeshuStats()（破坏追击需去掉饰品区 element_atk） */
            teshuStatsOverride: null,
            /** true：属攻乘区不计 testbuff 面板的「属攻」修正 */
            ignoreTestbuffElement: false
        };
        const opts = { ...defaults, ...options };
        const teshuStats = opts.teshuStatsOverride != null
            ? opts.teshuStatsOverride
            : (typeof getTeshuStats === 'function' ? getTeshuStats() : {});

        const p_mult = fixPrecision(aggregateZoneValue('normal_atk', stats, teshuStats));
        const e_mult = aggregateZoneValue('ex_atk', stats, teshuStats);
        const m_mult = aggregateZoneValue('omega_atk', stats, teshuStats);
        const od_mult = aggregateZoneValue('odious_atk', stats, teshuStats);
        const h_mult = aggregateZoneValue('stamina', stats, teshuStats);
        const h_omega_mult = aggregateZoneValue('stamina_omega', stats, teshuStats);
        const en_mult = aggregateZoneValue('enmity', stats, teshuStats);
        const en_omega_mult = aggregateZoneValue('enmity_omega', stats, teshuStats);
        const ele_mult = aggregateZoneValue('element_atk', stats, teshuStats);
        const indep_cumulative = aggregateZoneValue('indep_cumulative_atk', stats, teshuStats);
        const indep_unjudged = aggregateZoneValue('indep_unjudged_atk', stats, teshuStats);
        const indep_special_enmity = aggregateZoneValue('indep_special_enmity_atk', stats, teshuStats);
        const indep_special = aggregateZoneValue('indep_special_atk', stats, teshuStats);

        const buffs = (typeof window !== 'undefined' && window.buffSettings) ? window.buffSettings : {};
        const buffNormal = buffs.normal || 0;
        const buffStamina = buffs.stamina || 0;
        const buffEnmity = buffs.enmity || 0;
        const buffStrong = buffs.strong || 0;
        const buffAdversity = buffs.adversity || 0;
        const buffElement = opts.ignoreTestbuffElement ? 0 : (buffs.element || 0);
        const buffMarriage = buffs.marriage || 0;
        const buffIndepCumulative = buffs.indepCumulative || 0;
        const buffIndepUnjudged = buffs.indepUnjudged || 0;
        const buffIndepSpecialEnmity = buffs.indepSpecialEnmity || 0;
        const buffIndepSpecial = buffs.indepSpecial || 0;

        const p_mult_total = new Decimal(p_mult).plus(buffNormal).toNumber();
        const stamina_total = new Decimal(h_mult).plus(buffStamina).toNumber();
        const enmity_total = new Decimal(en_mult).plus(buffEnmity).toNumber();
        const ele_mult_total = new Decimal(ele_mult).plus(buffElement).toNumber();
        const marriage_mult_total = new Decimal(aggregateZoneValue('marriage_perpetuity_atk', stats, teshuStats)).plus(buffMarriage).toNumber();
        const indep_cumulative_mult_total = new Decimal(indep_cumulative).plus(buffIndepCumulative).toNumber();
        const indep_unjudged_mult_total = new Decimal(indep_unjudged).plus(buffIndepUnjudged).toNumber();
        const indep_special_enmity_mult_total = new Decimal(indep_special_enmity).plus(buffIndepSpecialEnmity).toNumber();
        const indep_special_mult_total = new Decimal(indep_special).plus(buffIndepSpecial).toNumber();

        const weaknessBonus = opts.isAdvantage ? 0.5 : 0;
        const baseAfterStep4 = new Decimal(panelAtk || 0).toNumber();
        let zoneMult = new Decimal(1);

        const applyZone = (add) => {
            if (add === 0) return;
            const mult = new Decimal(1).plus(add);
            zoneMult = zoneMult.times(mult);
        };

        if (p_mult_total !== 0) applyZone(p_mult_total);
        if (e_mult !== 0) applyZone(e_mult);
        if (m_mult !== 0) applyZone(m_mult);
        if (od_mult !== 0) applyZone(od_mult);
        if (stamina_total !== 0) applyZone(stamina_total);
        if (h_omega_mult !== 0) applyZone(h_omega_mult);
        if (enmity_total !== 0) applyZone(enmity_total);
        if (en_omega_mult !== 0) applyZone(en_omega_mult);

        const hasStrongCaps = Array.isArray(opts.strongCaps) && opts.strongCaps.length > 0 && typeof calculateStrongBuffSum === 'function';
        const axStamina = stats['weapon_ax_stamina'] || 0;
        const lbStaminaBonus = Number(opts.lbStaminaBonus) || 0;
        const charStrongBonus = Number(opts.charStrongBonus) || 0;
        if (hasStrongCaps || axStamina !== 0 || lbStaminaBonus !== 0 || charStrongBonus !== 0 || buffStrong !== 0) {
            const hp01 = Math.max(0, Math.min(1, (hpPercent || 0) / 100));
            let effectiveStrong = axStamina;
            if (hasStrongCaps) effectiveStrong += calculateStrongBuffSum(hp01, opts.strongCaps);
            if (lbStaminaBonus) effectiveStrong += lbStaminaBonus;
            if (charStrongBonus) effectiveStrong += charStrongBonus;
            if (buffStrong) effectiveStrong += buffStrong;
            if (effectiveStrong !== 0) applyZone(effectiveStrong);
        }

        const axEnmity = stats['weapon_ax_enmity'] || 0;
        const adversityCharSkill = Number(opts.adversityCharSkill) || 0;
        const adversityWeapon = Number(opts.adversityWeapon) || 0;
        const adversityStrongBonus = Number(opts.adversityStrongBonus) || 0;
        const effectiveAdversity = axEnmity + adversityCharSkill + adversityWeapon + adversityStrongBonus + buffAdversity;
        if (effectiveAdversity !== 0) applyZone(effectiveAdversity);

        (opts.backups || []).forEach((bVal) => {
            if (bVal !== 0) applyZone(bVal);
        });

        const totalEle = new Decimal(1).plus(ele_mult_total).plus(weaknessBonus).toNumber();
        if (totalEle !== 1) zoneMult = zoneMult.times(new Decimal(totalEle));

        if (marriage_mult_total !== 0) applyZone(marriage_mult_total);
        if (indep_cumulative_mult_total !== 0) applyZone(indep_cumulative_mult_total);
        if (indep_unjudged_mult_total !== 0) applyZone(indep_unjudged_mult_total);
        if (indep_special_enmity_mult_total !== 0) applyZone(indep_special_enmity_mult_total);
        if (indep_special_mult_total !== 0) applyZone(indep_special_mult_total);

        const randMult = new Decimal(opts.randomFactor || 1);
        zoneMult = zoneMult.times(randMult);
        const afterZones = new Decimal(baseAfterStep4).times(zoneMult).toNumber();

        const defDownPct = Math.min(80, Math.max(0, Number(opts.defenseDown) || 0)) / 100;
        const weaponDefIgnore = Math.min(0.3, Math.max(0, Number(stats['weapon_def_ignore']) || 0));
        const effectiveDefense = opts.defense * (1 - defDownPct) * (1 - weaponDefIgnore);
        return new Decimal(afterZones).div(effectiveDefense).toNumber();
    }

    function getNaFinalBaseFromRaw(rawPostDef, params, isAdv) {
        const rawCritPostDef = new Decimal(rawPostDef)
            .times(params.totalCritMult)
            .toNumber();
        const extraAmp = isAdv ? params.extraAmpAdvantage : params.extraAmpNormal;
        const capResult = applyDamageCap(
            rawCritPostDef,
            params.stats,
            'na',
            params.teshuStats,
            extraAmp,
            params.capOptions
        );
        // 重构后 applyDamageCap 不再返回 finalDamage，此处手动重建
        const worldCapMode1 = (params.capOptions && params.capOptions.worldCapMode) ? params.capOptions.worldCapMode : '660';
        const ampedAndTaken1 = new Decimal(capResult.decayedDamage)
            .times(new Decimal(1).plus(capResult.ampCoef))
            .times(new Decimal(1).plus(capResult.takenDmgAmpCoef));
        const worldCapped1 = typeof applyWorldCap === 'function'
            ? applyWorldCap(ampedAndTaken1, 'na', params.stats, worldCapMode1)
            : ampedAndTaken1;
        return worldCapped1.ceil().toNumber();
    }

    /**
     * E 类属性追击：逻辑在 bonus_dmg 内完成，但与主平A共用同一套「税后→cap→乱击拆段→+予伤」
     *
     * 与 na_dmg_calc 曾出现偏差的原因（已避免）：
     * 1) 另起一次 calculateDamage 得到的 rawPostDef，与主流程用的 rawCritPostDef（preDef×暴击÷防）在舍入上可能不一致；
     * 2) 对「本体×追击%」整体再 applyDamageCap，与「先对本体 cap 再乘追击%」在非线性衰减下不等价；
     * 3) 在 rawPostDef 上再乘 totalCritMult，若与主流程暴击基底不一致会重复或错位。
     *
     * 当前：rawCritPostDefUsed / extraAmpUsed 由 na_dmg_calc 传入，与 sumNaFinalWithRanshu 完全一致；
     * 追击每段 = ceil(cap 后首段基底 × 追击%) + 予伤
     */
    function calcEChaseDamage(params) {
        const chasePct = resolveEChasePct(params.stats || {}, params.fallbackElement || 'unknown');
        if (chasePct <= 0) return { pct: 0, perHit: 0 };
        const rawIn = Number(params.rawCritPostDefUsed);
        if (!Number.isFinite(rawIn) || rawIn <= 0) return { pct: chasePct, perHit: 0 };
        if (typeof sumNaFinalWithRanshu !== 'function') return { pct: chasePct, perHit: 0 };

        const nn = sumNaFinalWithRanshu(
            rawIn,
            params.stats,
            params.teshuStats,
            params.extraAmpUsed,
            params.capOptions,
            params.totalSupp,
            params.ranshuForUi
        );
        const supp = Number(params.totalSupp) || 0;
        // 重构后 applyDamageCap 不再返回 finalDamage，此处手动重建
        const worldCapMode2 = (params.capOptions && params.capOptions.worldCapMode) ? params.capOptions.worldCapMode : '660';
        const capRaw = nn.firstCapResult;
        const ampedAndTaken2 = new Decimal(capRaw.decayedDamage)
            .times(new Decimal(1).plus(capRaw.ampCoef))
            .times(new Decimal(1).plus(capRaw.takenDmgAmpCoef));
        const worldCapped2 = typeof applyWorldCap === 'function'
            ? applyWorldCap(ampedAndTaken2, 'na', params.stats, worldCapMode2)
            : ampedAndTaken2;
        const capAmt = worldCapped2.ceil().toNumber();
        const xh = Math.max(1, Math.floor(Number(params.ranshuForUi) || 1));
        const cappedBase = new Decimal(capAmt);
        const segForChase = xh <= 1 ? cappedBase : cappedBase.div(xh);
        const perHit = segForChase.times(chasePct).ceil().plus(supp).toNumber();
        return { pct: chasePct, perHit };
    }

    function calcDesChaseDamage(params) {
        const stats = params.stats || {};
        const chasePct = toPositiveNumber(stats['weapon_des_bonus_na']);
        if (chasePct <= 0) return { pct: 0, perHit: 0 };

        // 破坏属性追击：不吃盘/饰品等属攻，仅固定弱点 +0.5。
        // cap 额外增幅：weapon_dmg_to_elemental_amp（武器盘对克属增幅）始终计入；饰品 dmg_to_elemental_amp（玲珑佩等）仅 UI 克属时计入。
        const desStats = stripElementAtkZoneFromStats(stats);
        const calcOptions = params.calcOptions || {};
        const rawTeshu = (params.teshuStats && typeof params.teshuStats === 'object')
            ? params.teshuStats
            : (typeof getTeshuStats === 'function' ? getTeshuStats() : {});
        const teshuForDes = { ...rawTeshu, element_atk: 0 };
        const weaponDmgToEleAmp = Number(desStats.weapon_dmg_to_elemental_amp || 0);
        const teshuDmgToEleAmp = Number(rawTeshu.dmg_to_elemental_amp || 0);
        const uiAdv = !!params.isAdv;
        const extraAmpDes = new Decimal(params.extraAmpNormal || 0)
            .plus(weaponDmgToEleAmp)
            .plus(uiAdv ? teshuDmgToEleAmp : 0)
            .toNumber();
        const rawPostDef = calculateNaRawPostDefFromPanelDirect(
            params.panelAtk,
            desStats,
            params.hpPercent,
            {
                isAdvantage: true,
                defense: params.defense,
                defenseDown: params.defenseDown,
                randomFactor: params.randomFactor,
                backups: calcOptions.backups || [0, 0, 0, 0, 0],
                strongCaps: calcOptions.strongCaps || [],
                lbStaminaBonus: Number(calcOptions.lbStaminaBonus) || 0,
                charStrongBonus: Number(calcOptions.charStrongBonus) || 0,
                adversityCharSkill: Number(calcOptions.adversityCharSkill) || 0,
                adversityWeapon: Number(calcOptions.adversityWeapon) || 0,
                adversityStrongBonus: Number(calcOptions.adversityStrongBonus) || 0,
                teshuStatsOverride: teshuForDes,
                ignoreTestbuffElement: true
            }
        );
        const perHit = calcPerHitSingleRoundFromRaw(
            rawPostDef,
            chasePct,
            { ...params, stats: desStats, extraAmpForCap: extraAmpDes },
            false
        );
        return { pct: chasePct, perHit };
    }

    function calcNaBonusDamage(params) {
        const e = calcEChaseDamage(params);
        const des = calcDesChaseDamage(params);
        return {
            chaseEPct: e.pct,
            chasePerHit: e.perHit,
            chaseDesPct: des.pct,
            chaseDesPerHit: des.perHit
        };
    }

    if (typeof window !== 'undefined') {
        window.BonusDmgCalc = {
            mergeChaseSources,
            resolveEChasePct,
            calcNaBonusDamage
        };
    }
})();
