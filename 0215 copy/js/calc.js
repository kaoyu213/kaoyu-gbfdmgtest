// ==========================================
//  GBF 模拟器 - 计算模块
// ==========================================

// 全局变量：角色数据
let party = [];

// 浑身/背水 曲线计算 (使用 decimal.js 进行精确计算，保留10位小数)
function calculateCurveValue(curveKey, slvl, hpPercent) {
    const curveData = SKILL_CURVES[curveKey];
    if (!curveData) return 0;

    if (curveData.type === 'stamina') {
        if (hpPercent < 25) return 0;
        
        let denominator = new Decimal(curveData.coeff).minus(slvl);
        if (denominator.lte(0)) denominator = new Decimal(1);
        
        let base = new Decimal(hpPercent).div(denominator);
        let percentVal = Decimal.pow(base, 2.9).plus(2.1);
        
        return percentVal.div(100).toDecimalPlaces(10).toNumber();
    }
    return 0; 
}

// 解析技能值
function parseSkillValue(valStr, currentSlvl, context) {
    if (!valStr) return 0;
    const str = String(valStr);
    if (str.includes('count_')) {
        try {
            let expression = str.replace(/count_([a-z]+)/g, (match, typeKey) => {
                return (context && context.typeCounts) ? (context.typeCounts[typeKey] || 0) : 0;
            });
            return new Function('return ' + expression)();
        } catch (e) { return 0; }
    }
    if (!str.includes(':')) return parseFloat(str) || 0;
    const breakpoints = str.split(' ').map(pair => {
        const [lv, val] = pair.split(':');
        let valClean = val;
        if(val.includes('%')) valClean = parseFloat(val) / 100;
        else valClean = parseFloat(val);
        return { lv: parseInt(lv), val: valClean };
    });
    let bestVal = 0;
    for (let bp of breakpoints) {
        if (currentSlvl >= bp.lv) bestVal = bp.val;
    }
    return bestVal;
}

// 估算武器等级
function estimateWeaponLevel(slvl) {
    if (slvl > 20) return 250; 
    if (slvl > 15) return 200; 
    return 150;                
}

// 获取有效技能
function getEffectiveSkill(weapon, skillObj, slotIndex) {
    if (!skillObj.isSlot) return skillObj;
    const selectedId = weapon.userSlotChoices[slotIndex];
    if (!selectedId) return null;
    const realSkill = globalSkillMap[selectedId];
    if (realSkill) return { ...realSkill, unlock_level: skillObj.unlock_level };
    return null;
}

// 计算Rank属性 (使用 Decimal.js)
function calculateRankStats(rank) {
    let hp = new Decimal(0);
    let atk = new Decimal(5700).plus(new Decimal(5).times(rank));

    if (rank >= 2) {
        let r100 = Decimal.min(rank, 100).minus(1);
        if (r100.gt(0)) hp = hp.plus(r100.times(8));
    }
    if (rank >= 101) {
        let r175 = Decimal.min(rank, 175).minus(100);
        if (r175.gt(0)) hp = hp.plus(r175.times(4));
    }
    if (rank >= 176) {
        let r225 = Decimal.min(rank, 225).minus(175);
        if (r225.gt(0)) hp = hp.plus(r225.times(2));
    }
    if (rank >= 302) { 
        let r400 = Decimal.min(rank, 400).minus(301);
        if (r400.gt(0)) hp = hp.plus(r400.times(1));
    }
    
    let calculatedHP = new Decimal(648).plus(hp); 
    
    return { hp: calculatedHP.toNumber(), atk: atk.toNumber() };
}

// 重新计算 (核心计算逻辑)
function recalculate() {
    let currentHpPercent = parseInt(document.getElementById('current-hp-slider').value) || 100;

    let baseOptimus = (parseFloat(document.getElementById('aura-optimus').value) || 0) / 100;
    let baseMagna = (parseFloat(document.getElementById('aura-magna').value) || 0) / 100;
    let baseJinzhou = (parseFloat(document.getElementById('aura-jinzhou').value) || 0) / 100;
    let baseElementAtk = (parseFloat(document.getElementById('aura-elemental').value) || 0) / 100;

    let rankInput = parseInt(document.getElementById('mc-rank-input').value) || 1;
    if(rankInput > 400) rankInput = 400; 
    
    let rankStats = calculateRankStats(rankInput);
    const rankStatsEl = document.getElementById('mc-rank-stats');
    if (rankStatsEl) rankStatsEl.innerText = `(HP: ${rankStats.hp} / ATK: ${rankStats.atk})`;

    let lbAtk = parseInt(document.getElementById('mc-lb-atk').value) || 0;
    let lbHp = parseInt(document.getElementById('mc-lb-hp').value) || 0;

    let prof1Extra = (parseFloat(document.getElementById('prof1-extra').value) || 0) / 100;
    let prof2Extra = (parseFloat(document.getElementById('prof2-extra').value) || 0) / 100;

    let summonAtk = parseInt(document.getElementById('summon-atk').value) || 0;
    let summonHp = parseInt(document.getElementById('summon-hp').value) || 0;

    let mcBaseAtk = new Decimal(rankStats.atk)
        .plus(lbAtk)
        .plus(currentMC.bonuses.class_atk_base || 0)
        .plus(currentMC.bonuses.chara_atk_base || 0)
        .toNumber(); 
    let mcBaseHp = new Decimal(rankStats.hp)
        .plus(lbHp)
        .plus(currentMC.bonuses.class_hp_base || 0)
        .plus(currentMC.bonuses.chara_hp_base || 0)
        .toNumber();

    let gridHp = new Decimal(0);
    let gridAtk = new Decimal(0);
    
    const mcProfList = currentMC.proficiency.map(p => {
        let mapped = WEAPON_TYPE_MAP[p] || p;
        return mapped ? mapped.toLowerCase() : p;
    });

    for (let i = 0; i < currentGrid.length; i++) {
        const w = currentGrid[i];
        if (!w) continue;

        let wHp = (w.stats && w.stats.hp) ? parseInt(w.stats.hp) : (parseInt(w.hp) || 0);
        let wAtk = (w.stats && w.stats.atk) ? parseInt(w.stats.atk) : (parseInt(w.atk) || 0);
        
        // 加蛋加成
        const plusMarks = w.plusMarks || 0;
        wHp += plusMarks * 1;
        wAtk += plusMarks * 5;

        let wType = WEAPON_TYPE_MAP[w.type] || w.type;
        if(wType) wType = wType.toLowerCase();

        let isProf = mcProfList.includes(wType);

        if (isProf) {
            // wHp * 1.2 并向上取整
            gridHp = gridHp.plus(new Decimal(wHp).times(1.2).round());
        } else {
            gridHp = gridHp.plus(wHp);
        }

        let atkMultiplier = new Decimal(1.0);

        if (mcProfList.length > 0 && wType === mcProfList[0]) {
            atkMultiplier = atkMultiplier.plus(0.2).plus(prof1Extra);
        } else if (mcProfList.length > 1 && wType === mcProfList[1]) {
            atkMultiplier = atkMultiplier.plus(0.2).plus(prof2Extra);
        }

        if (i === 0) { 
            let masteryType = wType;
            if (wType === 'fist') masteryType = 'melee';
            let key = 'main_weapon_bonuses_' + masteryType;
            let mhBonus = DEFAULT_MASTERY[key] || 0;
            atkMultiplier = atkMultiplier.plus(mhBonus); 
        }

        // wAtk * atkMultiplier 并四舍五入
        gridAtk = gridAtk.plus(new Decimal(wAtk).times(atkMultiplier).round());
    }

    const mainHand = currentGrid[0];
    const deckElement = mainHand ? mainHand.element : null;

    let rawExtraOptimus = new Decimal(0);
    let rawExtraMagna = new Decimal(0);
    
    currentGrid.forEach(weapon => {
        if (!weapon) return;
        const slvl = weapon.userSelectedSlvl || 15;
        const estLvl = estimateWeaponLevel(slvl);

        weapon.skills.forEach((skill, idx) => {
            if (estLvl < (skill.unlock_level || 0)) return;
            const realSkill = getEffectiveSkill(weapon, skill, idx);
            if (!realSkill) return;

            let skillElCode = realSkill.element || "weapon";
            let effectiveSkillEl = skillElCode;
            if (skillElCode === "weapon") effectiveSkillEl = weapon.element;
            else if (SKILL_ELEMENT_MAP[skillElCode]) effectiveSkillEl = SKILL_ELEMENT_MAP[skillElCode];

            if (deckElement && effectiveSkillEl !== "全" && effectiveSkillEl !== deckElement) return;

            realSkill.effects.forEach(effect => {
                // optimus: 攻刃技能; weapon_enhance_optimus: 神石的激励等技能
                if (effect.prop === 'optimus' || effect.prop === 'weapon_enhance_optimus') {
                    rawExtraOptimus = rawExtraOptimus.plus(parseSkillValue(effect.value, slvl, {}));
                }
                if (effect.prop === 'magna') {
                    rawExtraMagna = rawExtraMagna.plus(parseSkillValue(effect.value, slvl, {}));
                }
            });
        });
    });

    let extraOptimus = Decimal.min(rawExtraOptimus, 0.9).toNumber();
    let extraMagna = Decimal.min(rawExtraMagna, 0.9).toNumber();
    const passiveDisplay = document.getElementById('aura-optimus-passive');
    if(passiveDisplay) passiveDisplay.innerText = new Decimal(extraOptimus).times(100).toFixed(0); 

    const finalOptimus = new Decimal(baseOptimus).plus(extraOptimus).toNumber();
    const finalMagna = new Decimal(baseMagna).plus(extraMagna).toNumber();

    let stats = {};
    STAT_CONFIG.forEach(cfg => stats[cfg.key] = 0);

    let context = { typeCounts: {}, elementCounts: {} };
    currentGrid.forEach(weapon => {
        if (weapon && weapon.type) {
            const rawType = weapon.type;
            const typeKey = WEAPON_TYPE_MAP[rawType] || WEAPON_TYPE_MAP[rawType.toLowerCase()];
            if (typeKey) context.typeCounts[typeKey] = (context.typeCounts[typeKey] || 0) + 1;
        }
    });

    const mcElement = mainHand ? mainHand.element : null;
    party = [ { name: "MC", element: mcElement, stats: {} } ];
    STAT_CONFIG.forEach(cfg => party[0].stats[cfg.key] = 0);

    party[0].stats['optimus_boost'] = extraOptimus;
    party[0].stats['magna_boost'] = extraMagna;
    
    // 加上属攻加成（从输入框读取）
    party[0].stats['element_atk'] = (party[0].stats['element_atk'] || 0) + baseElementAtk;
    
    // 加上召唤石伤害上限加成
    const summonDamageCap = window.summonDamageCapBonus || 0;
    console.log('[Calc Debug] summonDamageCap:', summonDamageCap);
    party[0].stats['summon_dmg_cap'] = (party[0].stats['summon_dmg_cap'] || 0) + summonDamageCap;
    console.log('[Calc Debug] party[0].stats[\'summon_dmg_cap\']:', party[0].stats['summon_dmg_cap']);

    party.forEach(member => {
        if (!member.element) return; 

        currentGrid.forEach(weapon => {
            if (!weapon) return;
            const slvl = weapon.userSelectedSlvl || 15;
            const estLvl = estimateWeaponLevel(slvl);

            weapon.skills.forEach((skill, idx) => {
                if (estLvl < (skill.unlock_level || 0)) return;
                const realSkill = getEffectiveSkill(weapon, skill, idx);
                if (!realSkill) return;

                if (realSkill.condition) {
                    const cond = realSkill.condition.toLowerCase();
                    if (cond === 'aura_280' && finalOptimus < 2.8 && finalMagna < 2.8) return; 
                    if ((cond === 'main_hand' || cond === 'is_main_hand') && weapon !== currentGrid[0]) return;
                    if (cond === 'same_type_4') {
                        const counts = Object.values(context.typeCounts);
                        const maxCount = counts.length > 0 ? Math.max(...counts) : 0;
                        if (maxCount < 4) return;
                    }
                }

                let skillElCode = realSkill.element || "weapon";
                let effectiveSkillEl = skillElCode;
                if (skillElCode === "weapon") effectiveSkillEl = weapon.element;
                else if (SKILL_ELEMENT_MAP[skillElCode]) effectiveSkillEl = SKILL_ELEMENT_MAP[skillElCode];

                if (effectiveSkillEl !== "全" && effectiveSkillEl !== member.element) return;

                realSkill.effects.forEach(effect => {
                    if (effect.prop === 'optimus' || effect.prop === 'magna') return;
                    if (effect.type === 'aura_boost') return;

                    if (effect.condition) {
                        const effCond = effect.condition;
                        if (effCond === 'aura_ge_280') { if (finalOptimus < 2.8 && finalMagna < 2.8) return; }
                        if (effCond === 'aura_lt_280') { if (finalOptimus >= 2.8 || finalMagna >= 2.8) return; }
                    }

                    let baseVal = 0;
                    if (effect.value.toString().startsWith("curve:")) {
                        let curveKey = effect.value.split(":")[1];
                        baseVal = calculateCurveValue(curveKey, slvl, currentHpPercent);
                    } else {
                        baseVal = parseSkillValue(effect.value, slvl, context);
                    }
                    
                    let finalVal = baseVal;
                    
                    // 使用 Decimal.js 计算加成值，保留10位小数
                    if (effect.boost === 'optimus') {
                        finalVal = new Decimal(baseVal)
                            .times(new Decimal(1).plus(finalOptimus))
                            .toDecimalPlaces(10)
                            .toNumber();
                    } else if (effect.boost === 'magna' || effect.boost === 'omega') {
                        finalVal = new Decimal(baseVal)
                            .times(new Decimal(1).plus(finalMagna))
                            .toDecimalPlaces(10)
                            .toNumber();
                    } else if (effect.boost === 'jinzhou') {
                        finalVal = new Decimal(baseVal)
                            .times(new Decimal(1).plus(baseJinzhou))
                            .toDecimalPlaces(10)
                            .toNumber();
                    }
                    
                    if (member.stats.hasOwnProperty(effect.prop)) {
                        member.stats[effect.prop] += finalVal;
                    }
                });
            });
        });
    });

    const globalHpBonus = DEFAULT_MASTERY.chara_hp_passive || 0;
    const globalAtkBonus = DEFAULT_MASTERY.chara_atk_passive || 0;
    
    const jobPassiveHp = (currentMC.bonuses.class_hp_passive || 0) + (currentMC.bonuses.chara_hp_passive || 0);
    
    const gridHpMod = party[0].stats['weapon_hp'] || 0;
    
    // 使用 Decimal.js 计算 totalAtkMod，保留10位小数
    const totalAtkMod = new Decimal(party[0].stats['weapon_normal_atk'] || 0)
        .plus(party[0].stats['weapon_omega_atk'] || 0)
        .plus(party[0].stats['weapon_ex_atk'] || 0)
        .plus(party[0].stats['weapon_special_ex_atk'] || 0)
        .toDecimalPlaces(10)
        .toNumber();

    const rawBaseHp = new Decimal(mcBaseHp).plus(gridHp).plus(summonHp);
    const rawBaseAtk = new Decimal(mcBaseAtk).plus(gridAtk).plus(summonAtk);

    const roundedBaseHp = rawBaseHp;
    const roundedBaseAtk = rawBaseAtk;

    // 使用 Decimal.js 计算最终面板数值
    const finalBaseHp = roundedBaseHp
        .times(new Decimal(1).plus(globalHpBonus))
        .round()
        .toNumber();
    const finalBaseAtk = roundedBaseAtk
        .times(new Decimal(1).plus(globalAtkBonus))
        .round()
        .toNumber();

    const displayHp = new Decimal(finalBaseHp)
        .times(new Decimal(1).plus(gridHpMod).plus(jobPassiveHp))
        .floor()
        .toNumber();
    const displayAtk = new Decimal(finalBaseAtk)
        .times(new Decimal(1).plus(totalAtkMod))
        .floor()
        .toNumber();

    const outDiv = document.getElementById('stats-output');
    let html = '';
    
    html += `<div class="stat-line"><span style="color:#aaa">主角武器盘基础HP</span> <span style="font-weight:bold; color:white">${gridHp.round().toNumber()}</span></div>`;
    html += `<div class="stat-line"><span style="color:#aaa">主角武器盘基础ATK</span> <span style="font-weight:bold; color:white">${gridAtk.round().toNumber()}</span></div>`;
    
    html += `<hr style="border-color:#444; margin: 10px 0;">`;
    html += `<div class="stat-line"><span style="color:#888">主角面板 HP</span> <span style="font-weight:bold; color:#ccc">${finalBaseHp}</span></div>`;
    html += `<div class="stat-line"><span style="color:#888">主角面板 ATK</span> <span style="font-weight:bold; color:#ccc">${finalBaseAtk}</span></div>`;
    html += `<div class="stat-line" style="margin-top:5px;"><span style="color:#fff">主角最终 HP修改</span> <span class="total-highlight">${displayHp}</span></div>`;
    html += `<div class="stat-line"><span style="color:#fff">主角最终 ATK修改</span> <span class="total-highlight">${displayAtk}</span></div>`;

    html += `<hr style="border-color:#444; margin: 10px 0;">`;

    // 计算过量技能·暴击（提前计算，用于在暴击率下方显示）使用 Decimal.js
    const weaponCritRate = party[0].stats['weapon_critical_hit_rate'] || 0;
    const overflowCritRate = Decimal.max(new Decimal(weaponCritRate).minus(1.0), 0).toNumber(); // 溢出暴击率
    const excessCritDamageUp = Decimal.min(new Decimal(overflowCritRate).times(0.5), 1.0).toNumber(); // 暴击伤害UP，上限100%

    STAT_CONFIG.forEach(cfg => {
        let val = party[0].stats[cfg.key] || 0;
        
        // 应用上限逻辑
        let isCapped = false;
        if (cfg.cap !== null && val > cfg.cap) {
            val = cfg.cap;
            isCapped = true;
        }

        if (val <= 0.0001) return; 
        
        let displayVal = val;
        if (cfg.format === 'percent') displayVal = (val * 100).toFixed(2) + "%";
        else displayVal = val.toFixed(0);

        if (isCapped) {
             displayVal += " (MAX)";
        }

        html += `<div class="stat-line"><span>${cfg.label}</span> <span class="${isCapped ? 'capped-val' : 'val-highlight'}">${displayVal}</span></div>`;
        
        // 如果是暴击率且暴击率溢出，紧接着显示过量技能·暴击
        if (cfg.key === 'weapon_critical_hit_rate' && overflowCritRate > 0) {
            const excessDisplayVal = (excessCritDamageUp * 100).toFixed(2) + "%";
            html += `<div class="stat-line"><span>过量技能·暴击</span> <span class="val-highlight" style="color:#f39c12;">${excessDisplayVal}</span></div>`;
        }
    });

    if (html.endsWith('<hr style="border-color:#444; margin: 10px 0;">')) html += '<div style="color:#666;text-align:center;">暂无加成效果</div>';
    outDiv.innerHTML = html;
    
    // 更新详细分解区域
    renderDetailedBreakdown(party[0].stats); 
    
    // 更新角色面板显示区域
    renderCharPanelStats({
        gridHp: gridHp.round().toNumber(),
        gridAtk: gridAtk.round().toNumber(),
        panelHp: finalBaseHp,
        panelAtk: finalBaseAtk
    });
    
    // 更新伤害计算显示
    updateDamageDisplay(0);
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateCurveValue,
        parseSkillValue,
        estimateWeaponLevel,
        getEffectiveSkill,
        calculateRankStats,
        recalculate
    };
}
