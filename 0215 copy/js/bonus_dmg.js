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

    function getSubtypeFromBonusProp(prop, prefix) {
        const p = String(prop || '');
        const head = prefix + '_';
        return p.indexOf(head) === 0 ? p.slice(head.length) : null;
    }

    function resolveChaseDisplayElement(subtype, fallbackElement) {
        if (subtype === 'own_element') return fallbackElement || 'unknown';
        if (subtype === 'advantage') return 'advantage';
        return subtype || fallbackElement || 'unknown';
    }

    function resolveAdvantageDamageElement(enemyElement, fallbackElement) {
        const enemy = typeof normalizeElementKey === 'function'
            ? normalizeElementKey(enemyElement)
            : enemyElement;
        const targets = typeof ELEMENT_ADVANTAGE_TARGET !== 'undefined'
            ? ELEMENT_ADVANTAGE_TARGET
            : {
                fire: 'wind', water: 'fire', earth: 'water',
                wind: 'earth', light: 'dark', dark: 'light'
            };
        const matched = Object.keys(targets).find((element) => targets[element] === enemy);
        return matched || fallbackElement || 'unknown';
    }

    function resolveChaseDamageElement(effect, params, baseContext) {
        const subtype = effect && effect.subtype ? String(effect.subtype) : '';
        if (subtype === 'own_element') return baseContext.actorElement || params.fallbackElement || 'unknown';
        if (subtype === 'advantage') {
            return resolveAdvantageDamageElement(baseContext.enemyElement, baseContext.actorElement || params.fallbackElement);
        }
        const raw = effect && effect.element && effect.element !== 'advantage'
            ? effect.element
            : subtype;
        return typeof normalizeElementKey === 'function'
            ? (normalizeElementKey(raw) || baseContext.actorElement || 'unknown')
            : (raw || baseContext.actorElement || 'unknown');
    }

    function getDamageElementContext(params, damageElement) {
        const actorElement = params.actorElement || params.fallbackElement || damageElement;
        const mainElement = params.mainElement || actorElement;
        const forceAdvantage = params.forceAdvantage === true
            && (!damageElement || !actorElement || String(damageElement) === String(actorElement));
        const enemyElement = params.enemyElement || (
            forceAdvantage && typeof inferEnemyElementFromActor === 'function'
                ? inferEnemyElementFromActor(actorElement)
                : null
        );
        if (typeof resolveDamageElementContext === 'function') {
            return resolveDamageElementContext({
                actorElement,
                damageElement: damageElement || actorElement,
                enemyElement,
                mainElement,
                forceAdvantage,
                forceNeutral: params.forceNeutral === true
            });
        }
        return {
            actorElement,
            damageElement: damageElement || actorElement,
            enemyElement,
            mainElement,
            isAdvantage: !!params.isAdv,
            isDestruction: damageElement === 'destruction',
            isNonElemental: damageElement === 'non_elemental'
        };
    }

    function isContextCritEligible(context) {
        return typeof isCritEligibleForDamage === 'function'
            ? isCritEligibleForDamage(context)
            : !!(context && context.isAdvantage);
    }

    function getElementMultiplier(params, context) {
        if (typeof resolveElementMultiplierForDamage === 'function') {
            return resolveElementMultiplierForDamage(params.stats || {}, params.teshuStats || {}, {
                actorElement: context.actorElement,
                damageElement: context.damageElement,
                enemyElement: context.enemyElement,
                mainElement: context.mainElement,
                forceAdvantage: context.forceAdvantage === true,
                forceNeutral: context.forceNeutral === true,
                ignoreTestBuffSettings: params.ignoreTestBuffSettings === true
                    || !!(params.capOptions && params.capOptions.ignoreTestBuffSettings === true)
            });
        }
        return {
            context,
            elementAtk: 0,
            weaknessBonus: context.isAdvantage ? 0.5 : 0,
            multiplier: context.isAdvantage ? 1.5 : 1
        };
    }

    function isNormalElement(element) {
        const normalized = typeof normalizeElementKey === 'function'
            ? normalizeElementKey(element)
            : element;
        return ['fire', 'water', 'earth', 'wind', 'light', 'dark'].includes(normalized);
    }

    /**
     * 六属性配对增幅（玲珑佩/龙心、命运之环）判断的是：
     * “该属性角色是否正在攻击其属性克制的敌人”。
     *
     * 它与泛用 dmg_to_elemental_amp 不同，后者判断当前这一 hit 的
     * damageElement 是否克制敌人。异属性追击不能用自身克属关系触发配对增幅。
     */
    function isActorPairAmpApplicable(params) {
        const actorElement = params.actorElement || params.fallbackElement || params.damageElement;
        if (!isNormalElement(actorElement) || params.forceNeutral === true) return false;

        const actorContext = getDamageElementContext(params, actorElement);
        if (!actorContext || actorContext.isAdvantage !== true) return false;

        // 明确指定六属性敌人时，以角色属性和敌方属性的自然关系为准；
        // “对克属”便利拨片则由 forceAdvantage 显式覆盖。
        if (params.forceAdvantage === true) return true;
        if (isNormalElement(actorContext.enemyElement)) {
            return typeof isDamageElementAdvantaged === 'function'
                ? isDamageElementAdvantaged(actorElement, actorContext.enemyElement)
                : actorContext.isAdvantage === true;
        }

        // 兼容旧调用：尚未提供敌方属性时，沿用调用方已经算出的本体克属状态。
        return !actorContext.enemyElement && params.isAdv === true;
    }

    function buildCapOptionsForDamageElement(params, context) {
        const source = params.capOptions || {};
        const out = { ...source };
        const totals = source.effectTotals;
        if (!totals || typeof totals !== 'object') return out;

        // All Effects 会把泛用克属增幅和六属性配对增幅合并进本体 na_dmg_amp。
        // 属性追击可能与本体属性不同，因此先还原基础值，再分别按两套条件重建：
        // - dmg_to_elemental_amp：本次伤害属性是否克制敌人；
        // - element_pair_dmg_amp：角色属性是否克制敌人。
        const cloned = { ...totals };
        const allAmp = Number(totals.dmg_amp) || 0;
        const elementalAmp = Number(totals.dmg_to_elemental_amp) || 0;
        const elementPairAmp = Number(totals.element_pair_dmg_amp) || 0;
        const actorPairApplicable = isActorPairAmpApplicable(params);
        const originalBodyContext = getDamageElementContext(
            params,
            params.actorElement || params.fallbackElement || params.damageElement
        );
        // effectTotals 是否已经合并本体克属增幅，应优先服从生成该汇总时传入的
        // isAdv；旧调用没有该字段时，才回退到元素上下文重新判断。
        const originalBodyIsAdvantage = typeof params.isAdv === 'boolean'
            ? params.isAdv
            : !!(originalBodyContext && originalBodyContext.isAdvantage);
        const originalIncludedElemental = originalBodyIsAdvantage ? elementalAmp : 0;
        const originalIncludedPair = actorPairApplicable ? elementPairAmp : 0;
        const naSpecific = (Number(totals.na_dmg_amp) || 0)
            - allAmp
            - originalIncludedElemental
            - originalIncludedPair;
        const damageElement = context && context.damageElement ? String(context.damageElement) : '';
        const isNormalElementDamage = isNormalElement(damageElement);
        const applicableElementalAmp = context.isAdvantage ? elementalAmp : 0;
        const applicablePairAmp = actorPairApplicable && isNormalElementDamage ? elementPairAmp : 0;
        cloned.na_dmg_amp = naSpecific + allAmp + applicableElementalAmp + applicablePairAmp;
        out.effectTotals = cloned;
        return out;
    }

    function collectNaChaseSourcesFromStats(stats, fallbackElement) {
        const s = stats || {};
        const sources = [
            {
                key: 'weapon_bonus_na_own_element',
                prop: 'bonus_na_own_element',
                zone: 'E',
                value: s.weapon_bonus_na_own_element
            },
            {
                key: 'weapon_shuichong_bonus_na_own_element',
                prop: 'bonus_na_own_element',
                zone: 'E',
                value: s.weapon_shuichong_bonus_na_own_element
            }
        ];

        return sources.map((src) => {
            const subtype = getSubtypeFromBonusProp(src.prop, 'bonus_na');
            return {
                key: src.key,
                prop: src.prop,
                subtype,
                zone: src.zone || 'unknown',
                element: resolveChaseDisplayElement(subtype, fallbackElement),
                pct: toPositiveNumber(src.value)
            };
        }).filter((src) => src.pct > 0);
    }

    function collectNaChaseSourcesFromDynamic(params, fallbackElement) {
        const dynamicEntries = Array.isArray(params && params.dynamicBuffEntries)
            ? params.dynamicBuffEntries
            : (
                typeof party !== 'undefined'
                && params
                && typeof params.charIndex === 'number'
                && party[params.charIndex]
                && Array.isArray(party[params.charIndex].dynamicBuffEntries)
                    ? party[params.charIndex].dynamicBuffEntries
                    : []
            );

        return dynamicEntries.map((entry, idx) => {
            if (!entry || !entry.prop || !entry.zone) return null;
            const subtype = getSubtypeFromBonusProp(entry.prop, 'bonus_na');
            if (!subtype || subtype === 'destruction') return null;
            return {
                key: entry.sourceId || ('dynamic_na_chase_' + idx),
                prop: entry.prop,
                subtype,
                zone: entry.zone || 'unknown',
                element: resolveChaseDisplayElement(subtype, fallbackElement),
                pct: toPositiveNumber(entry.value),
                label: entry.label || entry.prop
            };
        }).filter((src) => src && src.pct > 0);
    }

    function resolveNaChaseEffects(params) {
        const fallbackElement = params && params.fallbackElement ? params.fallbackElement : 'unknown';
        const sources = collectNaChaseSourcesFromStats((params && params.stats) || {}, fallbackElement)
            .concat(collectNaChaseSourcesFromDynamic(params || {}, fallbackElement));
        const byZone = new Map();

        sources.forEach((src) => {
            const zoneKey = src.zone || 'unknown';
            const prev = byZone.get(zoneKey);
            if (!prev || src.pct > prev.pct) byZone.set(zoneKey, src);
        });

        const effects = Array.from(byZone.values());
        const totalPct = effects.reduce((sum, src) => sum + (Number(src.pct) || 0), 0);
        return {
            effects,
            totalPct
        };
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
        return resolveNaChaseEffects({ stats, fallbackElement }).totalPct;
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
     * 破坏属性追击：与 na_dmg_calc.calculateDamage 的 Step5～12（乘区合并 → 随机 → 除防）一致。
     * 基础值仍按「面板 ATK ÷10 向上取整 → 基础值手动修正 → ×10」处理，
     * 但不经过骑空艇与支援加成。
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
            indepZhanScale: 1,
            lbStaminaBonus: 0,
            charStrongBonus: 0,
            charIndex: 0,
            /** true：不读取静态伤害面板的基础值手动修正 */
            ignoreBaseValueAdjustment: false,
            /** 若传入则替代 getTeshuStats()（破坏追击需去掉饰品区 element_atk） */
            teshuStatsOverride: null,
            /** true：完全忽略 testbuff 面板；供回合模拟的战斗状态隔离使用 */
            ignoreTestBuffSettings: false,
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
        const actorElement = opts.actorElement || opts.fallbackElement || null;
        const mainElement = opts.mainElement || actorElement;
        const elementResult = typeof resolveElementMultiplierForDamage === 'function'
            ? resolveElementMultiplierForDamage(stats, teshuStats, {
                actorElement,
                damageElement: opts.damageElement || actorElement,
                enemyElement: opts.enemyElement,
                mainElement,
                forceAdvantage: opts.forceAdvantage === true || opts.isAdvantage === true,
                forceNeutral: opts.forceNeutral === true,
                ignoreTestBuffSettings: opts.ignoreTestBuffSettings || opts.ignoreTestbuffElement
            })
            : {
                elementAtk: aggregateZoneValue('element_atk', stats, teshuStats),
                weaknessBonus: opts.isAdvantage ? 0.5 : 0
            };
        const indep_cumulative = aggregateZoneValue('indep_cumulative_atk', stats, teshuStats);
        const indep_unjudged = aggregateZoneValue('indep_unjudged_atk', stats, teshuStats);
        const indep_special_enmity = aggregateZoneValue('indep_special_enmity_atk', stats, teshuStats);
        const indep_special = aggregateZoneValue('indep_special_atk', stats, teshuStats);
        const indep_zhan = aggregateZoneValue('indep_zhan_atk', stats, teshuStats);

        const buffs = !opts.ignoreTestBuffSettings && typeof window !== 'undefined' && window.buffSettings
            ? window.buffSettings
            : {};
        const buffNormal = buffs.normal || 0;
        const buffStamina = buffs.stamina || 0;
        const buffEnmity = buffs.enmity || 0;
        const buffStrong = buffs.strong || 0;
        const buffAdversity = buffs.adversity || 0;
        const buffMarriage = buffs.marriage || 0;
        const buffIndepCumulative = buffs.indepCumulative || 0;
        const buffIndepUnjudged = buffs.indepUnjudged || 0;
        const buffIndepSpecialEnmity = buffs.indepSpecialEnmity || 0;
        const buffIndepSpecial = buffs.indepSpecial || 0;

        const p_mult_total = new Decimal(p_mult).plus(buffNormal).toNumber();
        const stamina_total = new Decimal(h_mult).plus(buffStamina).toNumber();
        const enmity_total = new Decimal(en_mult).plus(buffEnmity).toNumber();
        const ele_mult_total = Number(elementResult.elementAtk) || 0;
        const marriage_mult_total = new Decimal(aggregateZoneValue('marriage_perpetuity_atk', stats, teshuStats)).plus(buffMarriage).toNumber();
        const indep_cumulative_mult_total = new Decimal(indep_cumulative).plus(buffIndepCumulative).toNumber();
        const indep_unjudged_mult_total = new Decimal(indep_unjudged).plus(buffIndepUnjudged).toNumber();
        const indep_special_enmity_mult_total = new Decimal(indep_special_enmity).plus(buffIndepSpecialEnmity).toNumber();
        const indep_special_mult_total = new Decimal(indep_special).plus(buffIndepSpecial).toNumber();
        const indep_zhan_mult_total = new Decimal(indep_zhan)
            .times(Math.max(0, Number(opts.indepZhanScale) || 0))
            .toNumber();

        const weaknessBonus = Number(elementResult.weaknessBonus) || 0;
        let directBaseValue = new Decimal(panelAtk || 0).div(10).ceil().toNumber();
        if (!opts.ignoreBaseValueAdjustment && typeof window !== 'undefined') {
            const charIndex = Number.isInteger(Number(opts.charIndex)) ? Number(opts.charIndex) : 0;
            const baseState = window.baseValues && window.baseValues[charIndex];
            directBaseValue += Number(baseState && baseState.adjustment) || 0;
        }
        const baseAfterStep4 = new Decimal(directBaseValue).times(10).toNumber();
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
        if (indep_zhan_mult_total !== 0) applyZone(indep_zhan_mult_total);

        const randMult = new Decimal(opts.randomFactor || 1);
        zoneMult = zoneMult.times(randMult);
        const afterZones = new Decimal(baseAfterStep4).times(zoneMult).toNumber();

        const defDownPct = Math.min(99, Math.max(0, Number(opts.defenseDown) || 0)) / 100;
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
        const chaseInfo = resolveNaChaseEffects(params || {});
        const chasePct = chaseInfo.totalPct;
        if (chasePct <= 0) return { pct: 0, perHit: 0, effects: [] };
        const rawIn = Number(params.rawPostDefUsed != null ? params.rawPostDefUsed : params.rawCritPostDefUsed);
        if (!Number.isFinite(rawIn) || rawIn <= 0) return { pct: chasePct, perHit: 0, effects: chaseInfo.effects };
        if (typeof sumNaFinalWithRanshu !== 'function') return { pct: chasePct, perHit: 0, effects: chaseInfo.effects };

        const baseContext = getDamageElementContext(params, params.actorElement || params.fallbackElement);
        const baseElementResult = getElementMultiplier(params, baseContext);
        const baseElementMultiplier = Math.max(0.0000000001, Number(baseElementResult.multiplier) || 1);
        const effects = chaseInfo.effects.map((effect) => {
            const pct = toPositiveNumber(effect.pct);
            if (pct <= 0) return null;
            const damageElement = resolveChaseDamageElement(effect, params, baseContext);
            const effectContext = getDamageElementContext(params, damageElement);
            const effectElementResult = getElementMultiplier(params, effectContext);
            const effectElementMultiplier = Math.max(0, Number(effectElementResult.multiplier) || 0);

            // 除属攻与克属补正外，追击沿用本体同一条平A税后基底。
            // 因此只需按元素乘区比值换算，即可保留原公式与取整口径。
            const effectRawPostDef = new Decimal(rawIn)
                .times(effectElementMultiplier)
                .div(baseElementMultiplier)
                .toNumber();
            const effectCapOptions = buildCapOptionsForDamageElement(params, effectContext);
            const effectCritEligible = isContextCritEligible(effectContext);
            const effectCritMult = effectCritEligible ? (Number(params.totalCritMult) || 1) : 1;
            const effectExtraAmpBase = effectContext.isAdvantage
                ? (params.extraAmpAdvantageBase != null ? params.extraAmpAdvantageBase : params.extraAmpAdvantage)
                : (params.extraAmpNormalBase != null ? params.extraAmpNormalBase : params.extraAmpNormal);
            const effectExtraAmp = new Decimal(Number(effectExtraAmpBase) || 0)
                .plus(effectCritEligible ? (Number(params.critOnlyAmpPotential) || 0) : 0)
                .toNumber();
            const perHit = calcPerHitSingleRoundFromRaw(
                effectRawPostDef,
                pct,
                {
                    ...params,
                    totalCritMult: effectCritMult,
                    capOptions: effectCapOptions,
                    extraAmpForCap: Number(effectExtraAmp) || 0
                },
                effectContext.isAdvantage,
                params.stats
            );
            return {
                ...effect,
                element: damageElement,
                pct,
                perHit,
                elementAtk: Number(effectElementResult.elementAtk) || 0,
                weaknessBonus: Number(effectElementResult.weaknessBonus) || 0,
                critEligible: effectCritEligible
            };
        }).filter((effect) => effect && effect.pct > 0 && effect.perHit > 0);
        const perHit = effects.reduce((sum, effect) => sum + (Number(effect.perHit) || 0), 0);
        return { pct: chasePct, perHit, effects };
    }

    function calcDesChaseDamage(params) {
        const stats = params.stats || {};
        const chasePct = toPositiveNumber(stats['weapon_bonus_na_destruction']);
        if (chasePct <= 0) return { pct: 0, perHit: 0 };

        // 破坏属性追击：不吃任何属攻，仅固定弱点 +0.5；因此对克制属性伤害增幅始终生效。
        const desStats = stripElementAtkZoneFromStats(stats);
        const calcOptions = params.calcOptions || {};
        // 平A本体在回合模拟中会传入 ignoreTestBuffSettings；破坏追击使用独立的
        // raw 计算路径，也必须继承同一隔离策略，不能再次读取静态 testbuff。
        const ignoreTestBuffSettings = params.ignoreTestBuffSettings === true
            || calcOptions.ignoreTestBuffSettings === true
            || !!(params.capOptions && params.capOptions.ignoreTestBuffSettings === true);
        const rawTeshu = (params.teshuStats && typeof params.teshuStats === 'object')
            ? params.teshuStats
            : (typeof getTeshuStats === 'function' ? getTeshuStats() : {});
        const teshuForDes = { ...rawTeshu, element_atk: 0 };
        const destructionContext = getDamageElementContext(params, 'destruction');
        // 泛用“对克制属性增幅”适用于破坏属性；六属性配对增幅虽然按角色与敌方
        // 的关系判断，但破坏属性不属于六属性伤害，因此仍不会进入。
        const destructionCapOptions = buildCapOptionsForDamageElement(params, destructionContext);
        let extraAmpDes = Number(params.extraAmpNormalBase != null ? params.extraAmpNormalBase : params.extraAmpNormal) || 0;
        extraAmpDes = new Decimal(extraAmpDes)
            .plus(Number(params.critOnlyAmpPotential) || 0)
            .toNumber();
        if (!destructionCapOptions.effectTotals && typeof aggregateZoneValue === 'function') {
            extraAmpDes = new Decimal(extraAmpDes)
                .plus(aggregateZoneValue('dmg_to_elemental_amp', desStats, rawTeshu))
                .toNumber();
        }
        const rawPostDef = calculateNaRawPostDefFromPanelDirect(
            params.panelAtk,
            desStats,
            params.hpPercent,
            {
                isAdvantage: true,
                actorElement: params.actorElement || params.fallbackElement,
                damageElement: 'destruction',
                enemyElement: params.enemyElement,
                mainElement: params.mainElement || params.actorElement || params.fallbackElement,
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
                charIndex: params.charIndex,
                ignoreBaseValueAdjustment: params.ignoreBaseValueAdjustment === true
                    || calcOptions.ignoreBaseValueAdjustment === true,
                teshuStatsOverride: teshuForDes,
                ignoreTestBuffSettings,
                ignoreTestbuffElement: true
            }
        );
        const perHit = calcPerHitSingleRoundFromRaw(
            rawPostDef,
            chasePct,
            {
                ...params,
                stats: desStats,
                totalCritMult: Number(params.totalCritMult) || 1,
                capOptions: destructionCapOptions,
                extraAmpForCap: extraAmpDes
            },
            false
        );
        return { pct: chasePct, perHit };
    }

    const SKILL_CHASE_ELEMENTS = ['fire', 'water', 'earth', 'wind', 'light', 'dark'];

    function normalizeSkillChaseElement(element) {
        const aliases = { '火': 'fire', '水': 'water', '土': 'earth', '风': 'wind', '光': 'light', '暗': 'dark' };
        return aliases[element] || element;
    }

    function isElementalSkillDamage(damage) {
        const spec = damage || {};
        const type = spec.damage_type || spec.damageType || 'skill';
        const element = normalizeSkillChaseElement(spec.element);
        return type === 'skill' && (!element || element === 'own_element' || SKILL_CHASE_ELEMENTS.includes(element));
    }

    // 武器数值已经经过武器技能加护/上限汇总；只从 stats 取一次，不再读 effectTotals。
    function resolveSkillChaseEffects(params) {
        const opts = params || {};
        const stats = opts.stats || {};
        const actorElement = normalizeSkillChaseElement(opts.actorElement || opts.fallbackElement);
        const sources = (opts.dynamicBuffEntries || []).slice();
        SKILL_CHASE_ELEMENTS.concat('own_element').forEach((element) => {
            const key = 'weapon_bonus_skill_' + element;
            const value = Number(stats[key]);
            if (Number.isFinite(value) && value > 0) sources.push({
                prop: 'bonus_skill_' + element, zone: 'weapon_grid',
                sourceId: key, value: Math.min(0.2, value)
            });
        });
        const groups = new Map();
        sources.forEach((source) => {
            if (!source) return;
            const subtype = getSubtypeFromBonusProp(source.prop, 'bonus_skill');
            const element = subtype === 'own_element' ? actorElement : normalizeSkillChaseElement(subtype);
            const zone = source.zone;
            const pct = Number(source.value);
            if (!SKILL_CHASE_ELEMENTS.includes(element) || !Number.isFinite(pct) || pct <= 0
                || !['weapon_grid', 'chara_skill', 'independent'].includes(zone)) return;
            const key = element + ':' + zone;
            const previous = groups.get(key);
            if (previous && zone === 'independent') {
                // 同属性独立区相加后追加一次；各属性、各分区分别结算。
                previous.pct = typeof Decimal === 'function'
                    ? new Decimal(previous.pct).plus(pct).toNumber() : previous.pct + pct;
                previous.sources.push(source.sourceId || source.prop);
            } else if (!previous || pct > previous.pct) {
                groups.set(key, { element, zone, pct, sources: [source.sourceId || source.prop] });
            }
        });
        return Array.from(groups.values());
    }

    // 最终伤害的比例复制：不重算属性相性/衰减/予伤/增幅/世界上限，不产生递归追击。
    function calcSkillChaseDamage(baseDamage, effects) {
        const base = Number(baseDamage);
        if (!Number.isFinite(base) || base <= 0) return [];
        return (Array.isArray(effects) ? effects : []).filter((effect) => (
            effect && Number.isFinite(effect.pct) && effect.pct > 0
        )).map((effect) => Object.assign({}, effect, {
            kind: 'skill_chase', damageType: 'skill', isSkillChase: true,
            consumesHitDurations: false, hitCount: 1, baseDamage: base,
            damage: typeof Decimal === 'function'
                ? new Decimal(base).times(effect.pct).ceil().toNumber()
                : Math.ceil(base * effect.pct)
        }));
    }

    function calcNaBonusDamage(params) {
        const e = calcEChaseDamage(params);
        const des = calcDesChaseDamage(params);
        return {
            chaseEPct: e.pct,
            chasePerHit: e.perHit,
            chaseEffects: e.effects || [],
            chaseDesPct: des.pct,
            chaseDesPerHit: des.perHit
        };
    }

    const api = {
            mergeChaseSources,
            resolveEChasePct,
            resolveNaChaseEffects,
            isElementalSkillDamage,
            resolveSkillChaseEffects,
            calcSkillChaseDamage,
            calcNaBonusDamage
    };
    if (typeof window !== 'undefined') window.BonusDmgCalc = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
