// ==========================================
//  GBF 模拟器 - 计算模块
// ==========================================

// 全局变量：角色数据
let party = [];

const MC_LB_SLOT_COUNT = 30;
let mcLbSlotsByJob = {};
const MC_LB_OPTIONS = [
    { id: 'atk', label: '攻击力', values: [500, 1500, 3000], kind: 'fixed', apply: 'baseAtk' },
    { id: 'def', label: '防御力', values: [1, 3, 5], kind: 'percent', apply: 'mcDef' },
    { id: 'hp', label: 'HP', values: [300, 600, 1000], kind: 'fixed', apply: 'baseHp' },
    { id: 'heal_std', label: '回复性能(1/3/5)', values: [1, 3, 5], kind: 'percent', apply: 'healCap' },
    { id: 'heal_high', label: '回复性能(5/10/15)', values: [5, 10, 15], kind: 'percent', apply: 'healCap' },
    { id: 'skill_dmg', label: '技能伤害', values: [1, 3, 5], kind: 'percent', apply: 'skillDmg' },
    { id: 'debuff_res', label: '弱体耐性', values: [1, 3, 5], kind: 'percent', apply: 'debuffRes' },
    { id: 'debuff_success_std', label: '弱体成功率(1/3/5)', values: [1, 3, 5], kind: 'percent', apply: 'debuffSuccess' },
    { id: 'debuff_success_high', label: '弱体成功率(2/4/8)', values: [2, 4, 8], kind: 'percent', apply: 'debuffSuccess' },
    { id: 'fire_atk', label: '火属性攻击', values: [1, 3, 5], kind: 'percent', apply: 'elementAtkFire' },
    { id: 'water_atk', label: '水属性攻击', values: [1, 3, 5], kind: 'percent', apply: 'elementAtkWater' },
    { id: 'earth_atk', label: '土属性攻击', values: [1, 3, 5], kind: 'percent', apply: 'elementAtkEarth' },
    { id: 'wind_atk', label: '风属性攻击', values: [1, 3, 5], kind: 'percent', apply: 'elementAtkWind' },
    { id: 'light_atk', label: '光属性攻击', values: [1, 3, 5], kind: 'percent', apply: 'elementAtkLight' },
    { id: 'dark_atk', label: '暗属性攻击', values: [1, 3, 5], kind: 'percent', apply: 'elementAtkDark' },
    { id: 'all_element_atk', label: '全属性属攻加成', values: [1, 3, 5], kind: 'percent', apply: 'elementAtkAll' },
    { id: 'ca_dmg_std', label: '奥义伤害(1/3/5)', values: [1, 3, 5], kind: 'percent', apply: 'caDmg' },
    { id: 'ca_dmg_high', label: '奥义伤害(2/4/8)', values: [2, 4, 8], kind: 'percent', apply: 'caDmg' },
    { id: 'prof1', label: '得意武器攻击1', values: [1, 3, 5], kind: 'percent', apply: 'prof1' },
    { id: 'prof2', label: '得意武器攻击2', values: [1, 3, 5], kind: 'percent', apply: 'prof2' },
    { id: 'prof12', label: '得意武器攻击1·2', values: [1, 3, 5], kind: 'percent', apply: 'prof12' },
    { id: 'da', label: 'DA几率', values: [1, 3, 5], kind: 'percent', apply: 'da' },
    { id: 'ta', label: 'TA几率', values: [1, 3, 5], kind: 'percent', apply: 'ta' },
    { id: 'crit', label: '暴击率', values: [1, 3, 5], kind: 'percent', apply: 'crit' },
    { id: 'party_hp', label: '我方全体HP', values: [300, 600, 1000], kind: 'fixed', apply: 'partyHpFlat' },
    { id: 'dmg_cap', label: '伤害上限', values: [1, 3, 5], kind: 'percent', apply: 'allCap' },
    { id: 'na_cap', label: '平A伤害上限', values: [1, 2, 3], kind: 'percent', apply: 'naCap' },
    { id: 'cb_dmg', label: 'CB伤害', values: [1, 3, 5], kind: 'percent', apply: 'cbDmg' },
    { id: 'dodge', label: '回避率', values: [1, 2, 3], kind: 'percent', apply: 'dodge' },
    { id: 'skill_cap', label: '技能伤害上限', values: [1, 3, 5], kind: 'percent', apply: 'skillCap' },
    { id: 'cb_cap', label: 'CB伤害上限', values: [1, 3, 5], kind: 'percent', apply: 'cbCap' }
];

const MC_LB_OPTION_MAP = MC_LB_OPTIONS.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
}, {});

function ensureMcLbUI() {
    const listContainer = document.querySelector('.mc-lb-slot-list');
    if (!listContainer || listContainer.dataset.initialized === '1') return;
    let rowsHtml = '';
    const optionHtml = MC_LB_OPTIONS.map(opt => `<option value="${opt.id}">${opt.label}</option>`).join('');
    for (let i = 0; i < MC_LB_SLOT_COUNT; i++) {
        rowsHtml += `
            <div class="lb-slot" style="background:#2a2a2a;padding:5px;border-radius:4px;display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <div style="font-size:0.8em;color:#888;width:25px;text-align:center;">${i + 1}</div>
                <div style="flex:1;">
                    <select class="mc-form-control mc-lb-type-select" id="mc-lb-type-${i}" style="width:100%;font-size:0.85em;" onchange="handleMcLbChange();">
                        <option value="none">-</option>
                        ${optionHtml}
                    </select>
                </div>
                <div style="width:74px;">
                    <select class="mc-form-control mc-lb-level-select" id="mc-lb-lvl-${i}" style="width:100%;font-size:0.85em;" onchange="handleMcLbChange();">
                        <option value="0">-</option>
                        <option value="1">★1</option>
                        <option value="2">★2</option>
                        <option value="3">★3</option>
                    </select>
                </div>
                <div id="mc-lb-val-${i}" style="width:80px;text-align:right;font-size:0.75em;color:#aaa;">-</div>
            </div>`;
    }
    listContainer.innerHTML = rowsHtml;
    listContainer.dataset.initialized = '1';
}

function getMcLbSelections() {
    const selections = [];
    for (let i = 0; i < MC_LB_SLOT_COUNT; i++) {
        selections.push({
            type: document.getElementById(`mc-lb-type-${i}`)?.value || 'none',
            lvl: parseInt(document.getElementById(`mc-lb-lvl-${i}`)?.value, 10) || 0
        });
    }
    return selections;
}

function getEmptyMcLbSelections() {
    return Array.from({ length: MC_LB_SLOT_COUNT }, () => ({ type: 'none', lvl: 0 }));
}

function normalizeMcLbSlot(slot) {
    const rawType = slot && slot.type != null ? String(slot.type) : 'none';
    const type = rawType === 'none' || MC_LB_OPTION_MAP[rawType] ? rawType : 'none';
    const rawLvl = parseInt(slot && slot.lvl, 10);
    const lvl = rawLvl >= 1 && rawLvl <= 3 ? rawLvl : 0;
    return { type, lvl: type === 'none' ? 0 : lvl };
}

function normalizeMcLbSelections(slots) {
    const source = Array.isArray(slots) ? slots : [];
    const normalized = getEmptyMcLbSelections();
    for (let i = 0; i < MC_LB_SLOT_COUNT; i++) {
        normalized[i] = normalizeMcLbSlot(source[i]);
    }
    return normalized;
}

function setMcLbSelections(slots) {
    ensureMcLbUI();
    const normalized = normalizeMcLbSelections(slots);
    normalized.forEach((slot, i) => {
        const typeEl = document.getElementById(`mc-lb-type-${i}`);
        const lvlEl = document.getElementById(`mc-lb-lvl-${i}`);
        if (typeEl) typeEl.value = slot.type;
        if (lvlEl) lvlEl.value = String(slot.lvl);
    });
    return normalized;
}

function rememberCurrentMcLbSelectionsForJob(jobId) {
    const key = jobId || (typeof currentMC !== 'undefined' ? currentMC.jobId : null);
    if (!key) return;
    mcLbSlotsByJob[String(key)] = normalizeMcLbSelections(getMcLbSelections());
}

function loadMcLbSelectionsForJob(jobId) {
    const key = jobId ? String(jobId) : '';
    const slots = key && mcLbSlotsByJob[key] ? mcLbSlotsByJob[key] : getEmptyMcLbSelections();
    setMcLbSelections(slots);
    if (key) {
        mcLbSlotsByJob[key] = normalizeMcLbSelections(slots);
    }
    if (typeof window.getMcLbTotals === 'function') {
        window.getMcLbTotals();
    }
}

function getMcLbSlotsByJobForStorage(currentJobId) {
    if (currentJobId) {
        rememberCurrentMcLbSelectionsForJob(currentJobId);
    }
    const out = {};
    Object.keys(mcLbSlotsByJob).forEach((jobId) => {
        out[jobId] = normalizeMcLbSelections(mcLbSlotsByJob[jobId]);
    });
    return out;
}

function restoreMcLbSlotsByJobFromStorage(savedByJob, legacySlots, legacyJobId) {
    const next = {};
    if (savedByJob && typeof savedByJob === 'object' && !Array.isArray(savedByJob)) {
        Object.keys(savedByJob).forEach((jobId) => {
            if (!jobId) return;
            next[String(jobId)] = normalizeMcLbSelections(savedByJob[jobId]);
        });
    }
    if (legacyJobId && Array.isArray(legacySlots) && !next[String(legacyJobId)]) {
        next[String(legacyJobId)] = normalizeMcLbSelections(legacySlots);
    }
    mcLbSlotsByJob = next;
    return getMcLbSlotsByJobForStorage();
}

function handleMcLbChange() {
    if (typeof currentMC !== 'undefined' && currentMC.jobId) {
        rememberCurrentMcLbSelectionsForJob(currentMC.jobId);
    }
    try { recalculate(); } catch(e) { console.error('recalculate error:', e); }
    if (typeof autoSaveEnabled !== 'undefined' && autoSaveEnabled && typeof saveToLocal === 'function') {
        saveToLocal(true);
    }
}

window.getMcLbSelections = getMcLbSelections;
window.ensureMcLbUI = ensureMcLbUI;
window.setMcLbSelections = setMcLbSelections;
window.getMcLbSlotsByJobForStorage = getMcLbSlotsByJobForStorage;
window.restoreMcLbSlotsByJobFromStorage = restoreMcLbSlotsByJobFromStorage;
window.rememberCurrentMcLbSelectionsForJob = rememberCurrentMcLbSelectionsForJob;
window.loadMcLbSelectionsForJob = loadMcLbSelectionsForJob;
window.handleMcLbChange = handleMcLbChange;

window.getMcLbTotals = function() {
    ensureMcLbUI();
    const totals = {
        baseAtk: 0, baseHp: 0, partyHpFlat: 0, prof1: 0, prof2: 0, mcDef: 0, healCap: 0,
        skillDmg: 0, debuffRes: 0, debuffSuccess: 0, elementAtk: 0,
        elementAtkFire: 0, elementAtkWater: 0, elementAtkEarth: 0,
        elementAtkWind: 0, elementAtkLight: 0, elementAtkDark: 0, elementAtkAll: 0,
        elementReduce: 0, caDmg: 0,
        da: 0, ta: 0, crit: 0, allCap: 0, naCap: 0, cbDmg: 0, dodge: 0, skillCap: 0, cbCap: 0,
        expRp: 0, odSuppression: 0, breakdown: {}
    };
    const selections = getMcLbSelections();
    selections.forEach((sel, i) => {
        const opt = MC_LB_OPTION_MAP[sel.type];
        if (!opt || sel.lvl < 1 || sel.lvl > 3) {
            const valEl = document.getElementById(`mc-lb-val-${i}`);
            if (valEl) valEl.textContent = '-';
            return;
        }
        const rawValue = opt.values[sel.lvl - 1];
        const numericVal = opt.kind === 'percent' ? rawValue / 100 : rawValue;
        totals[opt.apply] = (totals[opt.apply] || 0) + numericVal;
        if (String(opt.apply).indexOf('elementAtk') === 0) {
            totals.elementAtk = (totals.elementAtk || 0) + numericVal;
        }
        totals.breakdown[`${opt.label}#${i + 1}`] = numericVal;
        const valEl = document.getElementById(`mc-lb-val-${i}`);
        if (valEl) valEl.textContent = opt.kind === 'percent' ? `${rawValue}%` : `${rawValue}`;
    });
    return totals;
};

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
    } else if (curveData.type === 'enmity') {
        // 背水曲线：HP比例 = 1 - (现时HP / 最大HP)
        // 倍率 = baseMult * ((1 + 2 * HP比例) * HP比例)
        
        let hpRatio;
        if (hpPercent === 1) {
            // 当 hpPercent 为 1 时，代表游戏中的“1HP”极限背水状态，HP损失比例直接视为 1.0
            hpRatio = new Decimal(1.0);
        } else {
            hpRatio = new Decimal(1).minus(new Decimal(hpPercent).div(100));
        }

        let baseMult = 0;
        
        if (curveData.base) {
            // 解析类似于 '1:0.5 10:6.0 15:7.0 20:7.5' 这样的阶梯数据
            baseMult = parseSkillValue(curveData.base, slvl, null);
        } else if (curveData.coeff) {
            baseMult = curveData.coeff;
        }

        // 转为小数计算，例如 7.5% -> 0.075
        let baseDecimal = new Decimal(baseMult).div(100);

        let multiplier = new Decimal(1).plus(hpRatio.times(2)).times(hpRatio);
        return baseDecimal.times(multiplier).toDecimalPlaces(10).toNumber();
    } else if (curveData.type === 'ax_stamina') {
        // 附魔浑身（强壮乘区）曲线：按 100/75/50/25/0 五点线性插值
        const amt = Number(curveData.amount) || 0;
        if (amt !== 1 && amt !== 2 && amt !== 3) return 0;

        // 游戏中的“1HP”显示为 hpPercent=1，应当按 0% 档处理（否则会在 0%~25% 间插值出 1.04%/2.04% 这类值）
        if (Number(hpPercent) <= 1) {
            hpPercent = 0;
        }

        const hp01 = Math.max(0, Math.min(1, new Decimal(hpPercent || 0).div(100).toNumber()));
        const hpBp = [1, 0.75, 0.5, 0.25, 0];
        const table = {
            1: [0.03, 0.025, 0.02, 0.015, 0.01], // +1
            2: [0.04, 0.04, 0.04, 0.03, 0.02],   // +2
            3: [0.05, 0.05, 0.04, 0.03, 0.02]    // +3
        };
        const values = table[amt];
        if (!values) return 0;

        if (hp01 >= hpBp[0]) return values[0];
        if (hp01 <= hpBp[hpBp.length - 1]) return values[values.length - 1];

        for (let i = 0; i < hpBp.length - 1; i++) {
            const hiHp = hpBp[i];
            const loHp = hpBp[i + 1];
            if (hp01 <= hiHp && hp01 >= loHp) {
                const hiVal = values[i];
                const loVal = values[i + 1];
                const denom = hiHp - loHp;
                if (!denom) return loVal;
                const t = (hp01 - loHp) / denom;
                return new Decimal(loVal).plus(new Decimal(hiVal).minus(loVal).times(t)).toDecimalPlaces(10).toNumber();
            }
        }
        return 0;
    } else if (curveData.type === 'ax_enmity') {
        // 附魔背水（逆境乘区）曲线：与戒指/耳饰 背水+1/+2/+3 共用一套曲线
        const amt = Number(curveData.amount) || 0;
        if (amt !== 1 && amt !== 2 && amt !== 3) return 0;

        // 游戏中的“1HP”显示为 hpPercent=1，应当按 0% 档处理，避免 1.04% 这类边界
        if (Number(hpPercent) <= 1) {
            hpPercent = 0;
        }

        const hp01 = Math.max(0, Math.min(1, new Decimal(hpPercent || 0).div(100).toNumber()));
        // 直接复用戒指/耳饰背水 +N 的通用曲线（amount=1/2/3 → 背水+1/+2/+3）
        if (typeof getRingEarringEnmityAdversityBonus === 'function') {
            return getRingEarringEnmityAdversityBonus(hp01, amt);
        }
        return 0;
    }
    return 0; 
}

// 解析技能值
function parseSkillValue(valStr, currentSlvl, context, hpPercent) {
    if (!valStr) return 0;
    const str = String(valStr);

    // 通用线性写法（直接写在技能 value 中）：
    // linear_hp:<min>:<max>       => HP 越高，数值越高（0%->min, 100%->max）
    // linear_hp_down:<min>:<max>  => HP 越低，数值越高（0%->max, 100%->min）
    // 例：
    // - linear_hp:100000:600000
    // - linear_hp:5%:20%
    if (str.startsWith('linear_hp:') || str.startsWith('linear_hp_down:')) {
        const parts = str.split(':');
        if (parts.length >= 3) {
            const parseLinearToken = (raw) => {
                const s = String(raw || '').trim();
                if (!s) return 0;
                if (s.endsWith('%')) return (parseFloat(s) || 0) / 100;
                return parseFloat(s) || 0;
            };

            // 按你当前口径：1HP（显示 1%）按 0% 档处理
            let hp = Number(hpPercent);
            if (!Number.isFinite(hp)) hp = 100;
            if (hp <= 1) hp = 0;
            const hp01 = Math.max(0, Math.min(1, new Decimal(hp).div(100).toNumber()));

            const minVal = parseLinearToken(parts[1]);
            const maxVal = parseLinearToken(parts[2]);
            const isDown = str.startsWith('linear_hp_down:');
            if (isDown) {
                // 0%HP=max, 100%HP=min
                return new Decimal(maxVal)
                    .minus(new Decimal(maxVal).minus(minVal).times(hp01))
                    .toDecimalPlaces(10)
                    .toNumber();
            }
            // 0%HP=min, 100%HP=max
            return new Decimal(minVal)
                .plus(new Decimal(maxVal).minus(minVal).times(hp01))
                .toDecimalPlaces(10)
                .toNumber();
        }
        return 0;
    }

    if (str.includes('count_')) {
        try {
            let expression = str.replace(/count_([a-z]+)/g, (match, typeKey) => {
                return (context && context.typeCounts) ? (context.typeCounts[typeKey] || 0) : 0;
            });
            return new Function('return ' + expression)();
        } catch (e) { return 0; }
    }
    // 兼容直接写百分号的 value（如 "-100%"、"7.5%"），统一转为小数参与计算
    // 例如："-100%" -> -1, "7.5%" -> 0.075
    if (!str.includes(':')) {
        const s = str.trim();
        if (s.endsWith('%')) return (parseFloat(s) || 0) / 100;
        return parseFloat(s) || 0;
    }
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
// ATK: Rank2 +80, R3-100 每级+40, R101-175 每级+20, R176-190 每级+10, R191-425 每级+5 (Rank1 基础 1000)
// HP:  Rank2 +16, R3-100 每级+8,  R101-175 每级+4, R176-191 每级+2, R192-425 每级+1 (Rank1 基础 599)
function calculateRankStats(rank) {
    const R1_ATK = 1000;
    const R1_HP = 599;
    if (rank <= 1) return { hp: R1_HP, atk: R1_ATK };

    let atk = new Decimal(R1_ATK);
    let hp = new Decimal(R1_HP);

    // Rank 2: +80 ATK, +16 HP
    if (rank >= 2) {
        atk = atk.plus(80);
        hp = hp.plus(16);
    }
    // R3-100: +40 ATK / +8 HP per rank
    if (rank >= 3) {
        let n = Decimal.min(rank, 100).minus(2);
        if (n.gt(0)) { atk = atk.plus(n.times(40)); hp = hp.plus(n.times(8)); }
    }
    // R101-175: +20 ATK / +4 HP per rank
    if (rank >= 101) {
        let n = Decimal.min(rank, 175).minus(100);
        if (n.gt(0)) { atk = atk.plus(n.times(20)); hp = hp.plus(n.times(4)); }
    }
    // R176-190: +10 ATK per rank（ATK 分段）
    if (rank >= 176) {
        let nAtk = Decimal.min(rank, 190).minus(175);
        if (nAtk.gt(0)) atk = atk.plus(nAtk.times(10));
        // HP: R176-191 每级+2（HP 分段与 ATK 不同）
        let nHp = Decimal.min(rank, 190).minus(175);
        if (nHp.gt(0)) hp = hp.plus(nHp.times(2));
    }
    // R191-425: +5 ATK per rank
    if (rank >= 191) {
        let nAtk = Decimal.min(rank, 425).minus(190);
        if (nAtk.gt(0)) atk = atk.plus(nAtk.times(5));
    }
    // R192-425: +1 HP per rank（HP 分段与 ATK 不同）
    if (rank >= 191) {
        let nHp = Decimal.min(rank, 425).minus(190);
        if (nHp.gt(0)) hp = hp.plus(nHp.times(1));
    }

    return { hp: hp.toNumber(), atk: atk.toNumber() };
}

function getStaticSkillById(skillId) {
    if (!skillId) return null;
    if (window.SkillRegistry && typeof window.SkillRegistry.get === 'function') {
        return window.SkillRegistry.get(skillId);
    }
    const charaMap = typeof globalCharaSkillMap !== 'undefined' ? globalCharaSkillMap : {};
    return charaMap[skillId] || null;
}

function resolveStaticStatusTargetSlots(target, ownerSlot, targetSlots) {
    if (target === 'ally_slots' && Array.isArray(targetSlots)) {
        return Array.from(new Set(targetSlots.map(Number).filter((slot) => Number.isInteger(slot) && slot >= 0 && slot <= 5)));
    }
    if (!target || target === 'self') return ownerSlot == null ? [] : [ownerSlot];
    if (target === 'ally_party' || target === 'party') return [0, 1, 2, 3];
    if (target === 'ally_all') return [0, 1, 2, 3, 4, 5];
    return [];
}

/**
 * 将静态面板中选中的主动技能和自动生效的开局被动统一展开到实际目标槽位。
 * 返回值不直接修改 party，供计算和 Buff 图标展示共同使用。
 */
function collectStaticSkillStatusApplications() {
    if (typeof document === 'undefined' || !window.StatusResolver
        || typeof window.StatusResolver.getStatusesFromSkillActions !== 'function') return [];

    const sources = [];
    const seen = new Set();
    document.querySelectorAll('.char-skill-enabled-cb:checked').forEach((cb) => {
        const ownerSlot = Number(cb.getAttribute('data-slot'));
        if (!Number.isInteger(ownerSlot) || ownerSlot < 0 || ownerSlot > 5) return;
        let skillId = cb.getAttribute('data-skill-id');
        if (!skillId && ownerSlot > 0) {
            const charData = typeof currentParty !== 'undefined' ? currentParty[ownerSlot] : null;
            const pos = cb.getAttribute('data-pos');
            if (charData && charData['ID'] != null && pos) skillId = `${charData['ID']}_${pos}`;
        }
        const skill = getStaticSkillById(skillId);
        if (!skill || String(skill.kind || 'active').toLowerCase() === 'passive') return;
        const key = `${ownerSlot}|${skill.id || skillId}`;
        if (seen.has(key)) return;
        seen.add(key);
        sources.push({ ownerSlot, skillId: skill.id || skillId, skill });
    });

    const jobPassives = typeof currentMC !== 'undefined' && Array.isArray(currentMC.battleSkills)
        ? currentMC.battleSkills
        : [];
    jobPassives.forEach((skill) => {
        if (!skill || !skill.trigger || skill.trigger.event !== 'battle_start') return;
        const skillId = skill.id || `job_passive_${sources.length}`;
        const key = `0|${skillId}`;
        if (seen.has(key)) return;
        seen.add(key);
        sources.push({ ownerSlot: 0, skillId, skill });
    });

    if (window.SummonRegistry && typeof window.SummonRegistry.collectPassiveSkills === 'function'
        && window.SkillRegistry && typeof currentSummons !== 'undefined') {
        window.SummonRegistry.collectPassiveSkills(currentSummons, window.SkillRegistry).forEach((entry) => {
            const skill = entry && entry.skill;
            if (!skill || !skill.trigger || skill.trigger.event !== 'battle_start') return;
            const key = `summon:${entry.summonSlot}|${skill.id || entry.skillId}`;
            if (seen.has(key)) return;
            seen.add(key);
            sources.push({
                ownerSlot: entry.ownerSlot == null ? 0 : entry.ownerSlot,
                skillId: skill.id || entry.skillId,
                skill,
                summonSlot: entry.summonSlot
            });
        });
    }

    const applications = [];
    const staticHpInput = document.getElementById('current-hp-slider');
    const staticHpPercent = staticHpInput && Number.isFinite(Number(staticHpInput.value))
        ? Number(staticHpInput.value)
        : 100;
    sources.forEach((source) => {
        const statuses = window.StatusResolver.getStatusesFromSkillActions(source.skill, {
            skillId: source.skillId,
            skillName: source.skill.name || source.skillId,
            ownerSlot: source.ownerSlot
        });
        statuses.forEach((status) => {
            resolveStaticStatusTargetSlots(status.target, source.ownerSlot, status.target_slots).forEach((targetSlot) => {
                const conditionContext = {
                    actor: { slot: targetSlot, hpPercent: staticHpPercent },
                    owner: { slot: source.ownerSlot, hpPercent: staticHpPercent },
                    hpPercent: staticHpPercent,
                    static: true
                };
                if (window.StatusResolver.isStatusDisplayActive
                    && !window.StatusResolver.isStatusDisplayActive(status, conditionContext)) return;
                const appliedStatus = JSON.parse(JSON.stringify(status));
                appliedStatus.owner_slot = source.ownerSlot;
                appliedStatus.target_slot = targetSlot;
                applications.push({
                    ownerSlot: source.ownerSlot,
                    targetSlot,
                    skillId: source.skillId,
                    skill: source.skill,
                    status: appliedStatus
                });
            });
        });
    });
    return applications;
}

/**
 * 将 charaskills 解析出的状态按实际目标展开，再交给 BuffRegistry / buff_zones 统一结算。
 */
function applyCharaSkillBuffStatsToParty() {
    if (typeof document === 'undefined' || typeof party === 'undefined' || !Array.isArray(party)) return;
    const charaBuffKeys =
        typeof getCharabuffStatKeysList === 'function'
            ? getCharabuffStatKeysList()
            : [
                  'charabuff_ta',
                  'charabuff_bonus_na_dmg_a2',
                  'charabuff_bonus_na_dmg_e',
                  'weapon_destruction_bonus_na'
              ];
    for (let i = 0; i < party.length && i < 6; i++) {
        if (!party[i] || !party[i].stats) continue;
        charaBuffKeys.forEach((k) => {
            party[i].stats[k] = 0;
        });
        party[i].dynamicBuffEntries = [];
        party[i].skillZoneEffectEntries = [];
    }
    collectStaticSkillStatusApplications().forEach((application) => {
        const slot = application.targetSlot;
        if (!party[slot] || !party[slot].stats || !window.StatusResolver.collectZoneEntriesFromStatuses) return;
        const staticHpInput = document.getElementById('current-hp-slider');
        const staticHpPercent = staticHpInput && Number.isFinite(Number(staticHpInput.value))
            ? Number(staticHpInput.value)
            : 100;
        const zoneEntries = window.StatusResolver.collectZoneEntriesFromStatuses([application.status], {
            actor: { slot, hpPercent: staticHpPercent },
            hpPercent: staticHpPercent,
            static: true
        });
        zoneEntries.forEach((entry) => {
            if (!entry || !entry.prop || !entry.zone) return;
            party[slot].skillZoneEffectEntries.push(entry);
            if (String(entry.prop || '').indexOf('bonus_na_') === 0) {
                party[slot].dynamicBuffEntries.push(entry);
            }
        });
    });
    if (typeof window.applyBuffCodexRowsToPartyStats === 'function') {
        window.applyBuffCodexRowsToPartyStats();
    }
}

function getCalcParty() {
    return party;
}

window.applyCharaSkillBuffStatsToParty = applyCharaSkillBuffStatsToParty;
window.collectStaticSkillStatusApplications = collectStaticSkillStatusApplications;
window.collectCheckedStaticSkillStatusesForSlot = function (slotIndex) {
    return collectStaticSkillStatusApplications()
        .filter((application) => application.targetSlot === Number(slotIndex))
        .map((application) => application.status);
};
window.getCalcParty = getCalcParty;

/**
 * [Buff Zone 分区统合]
 * 遍历 party 中每个成员的 stats，将 STAT_CONFIG 中标注了 prop/zone 的键
 * 注册到 BuffRegistry，按 BUFF_TYPE_ZONE_RULES 的冲突规则聚合，
 * 产出统合值存入 stats._xxx_total。
 *
 * 同时补充 currentParty 中不经过 stats 中转的数据（如耳饰予伤）。
 */
function applyBuffZoneRulesToStats() {
    if (typeof BuffRegistry === 'undefined') return;
    if (typeof parseBuffProp === 'function' && typeof STAT_CONFIG !== 'undefined') {
        // pass
    } else {
        return;
    }

    // 构建 STAT_CONFIG.key → { prop, zone } 的映射表（仅标注过的条目）
    var statKeyMap = {};
    STAT_CONFIG.forEach(function(cfg) {
        if (cfg && cfg.prop && cfg.zone) {
            statKeyMap[cfg.key] = { prop: cfg.prop, zone: cfg.zone };
        }
    });

    // 收集所有需要统合的 buff_type 集合
    var allBuffTypes = new Set();

    party.forEach(function(member, idx) {
        if (!member || !member.stats) return;

        // 1) 创建 BuffRegistry，从 stats 中读取标注值
        var registry = new BuffRegistry();

        // 从 stats 注册（仅对有 prop/zone 标注的键）
        Object.keys(statKeyMap).forEach(function(key) {
            var val = member.stats[key];
            if (typeof val !== 'number' || val === 0) return;
            var mapping = statKeyMap[key];
            registry.addByProp(mapping.prop, mapping.zone, key, val);
        });

        if (Array.isArray(member.zoneEffectEntries)) {
            member.zoneEffectEntries.forEach(function(entry, entryIdx) {
                if (!entry || !entry.prop || !entry.zone) return;
                var entryVal = Number(entry.value) || 0;
                if (entryVal === 0) return;
                registry.addByProp(
                    entry.prop,
                    entry.zone,
                    entry.sourceId || ('zone_effect_' + idx + '_' + entryIdx),
                    entryVal
                );
            });
        }

        if (Array.isArray(member.skillZoneEffectEntries)) {
            member.skillZoneEffectEntries.forEach(function(entry, entryIdx) {
                if (!entry || !entry.prop || !entry.zone) return;
                var entryVal = Number(entry.value) || 0;
                if (entryVal === 0) return;
                registry.addByProp(
                    entry.prop,
                    entry.zone,
                    entry.sourceId || ('skill_zone_effect_' + idx + '_' + entryIdx),
                    entryVal
                );
            });
        }

        // 2) 补充 currentParty 中不经过 stats 的数据
        if (typeof currentParty !== 'undefined' && currentParty[idx]) {
            var cp = currentParty[idx];

            // 耳饰予伤（等级 × 2000）
            if (cp.chara_earring_dmg_supp && typeof getEarringDmgSuppFromLevel === 'function') {
                var earringVal = getEarringDmgSuppFromLevel(cp.chara_earring_dmg_supp);
                if (earringVal > 0) {
                    registry.addByProp('dmg_supp', 'earring', 'chara_earring_dmg_supp', earringVal);
                }
            }

            // 神器平A予伤
            if (cp.chara_artifacts_na_dmg_supp) {
                registry.addByProp('dmg_supp', 'artifacts', 'chara_artifacts_na_dmg_supp', Number(cp.chara_artifacts_na_dmg_supp) || 0);
            }

            // 召唤石属攻（已通过 STAT_CONFIG 标注注册）
            // 婚戒久远攻刃（已写入 stats.marriage_perpetuity_atk，STAT_CONFIG 标注）
        }

        // 3) 收集所有已注册的 buff_type
        registry.getRegisteredTypes().forEach(function(bt) { allBuffTypes.add(bt); });
        // 也收集 BUFF_TYPE_ZONE_RULES 中定义了的类型
        if (typeof BUFF_TYPE_ZONE_RULES !== 'undefined') {
            Object.keys(BUFF_TYPE_ZONE_RULES).forEach(function(bt) { allBuffTypes.add(bt); });
        }

        // 4) 对每个 buff_type 计算统合值，写入 stats._xxx_total
        allBuffTypes.forEach(function(buffType) {
            var total = registry.getTotal(buffType);
            var consolidatedKey = '_' + buffType + '_total';
            member.stats[consolidatedKey] = total;
        });

    });
}

window.applyBuffZoneRulesToStats = applyBuffZoneRulesToStats;

// 重新计算 (核心计算逻辑)
function recalculate() {
    ensureMcLbUI();
    let currentHpPercent = parseInt(document.getElementById('current-hp-slider').value) || 100;

    let baseOptimus = (parseFloat(document.getElementById('aura-optimus').value) || 0) / 100;
    let baseMagna = (parseFloat(document.getElementById('aura-magna').value) || 0) / 100;
    let baseJinzhou = (parseFloat(document.getElementById('aura-jinzhou').value) || 0) / 100;
    let baseElementAtk = (parseFloat(document.getElementById('aura-elemental').value) || 0) / 100;

    let rankInput = parseInt(document.getElementById('mc-rank-input').value) || 1;
    if(rankInput > 425) rankInput = 425; 
    
    let rankStats = calculateRankStats(rankInput);
    const rankStatsEl = document.getElementById('mc-rank-stats');
    if (rankStatsEl) rankStatsEl.innerText = `(HP: ${rankStats.hp} / ATK: ${rankStats.atk})`;

    const mcLbTotals = (typeof window.getMcLbTotals === 'function') ? window.getMcLbTotals() : {};
    let lbAtk = mcLbTotals.baseAtk || 0;
    let lbHp = mcLbTotals.baseHp || 0;

    // 得意武器攻击1·2（prof12）表示对“1系”和“2系”都生效
    // 若得意武器1和得意武器2映射到同一个 wType，则 prof12 需要在该命中下再额外计算一次（即算两次）
    const prof12Extra = mcLbTotals.prof12 || 0;
    let prof1Extra = (mcLbTotals.prof1 || 0) + prof12Extra;
    let prof2Extra = (mcLbTotals.prof2 || 0) + prof12Extra;

    let summonAtk = parseInt(document.getElementById('summon-atk').value) || 0;
    let summonHp = parseInt(document.getElementById('summon-hp').value) || 0;

    const mcPartyHpFlat = mcLbTotals.partyHpFlat || 0;

    let mcBaseAtk = new Decimal(rankStats.atk)
        .plus(lbAtk)
        .plus(currentMC.bonuses.class_atk_base || 0)
        .plus(currentMC.bonuses.mc_atk_base || 0)
        .toNumber(); 
    let mcBaseHp = new Decimal(rankStats.hp)
        .plus(lbHp)
        .plus(currentMC.bonuses.class_hp_base || 0)
        .plus(currentMC.bonuses.mc_hp_base || 0)
        .toNumber();

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
                    rawExtraOptimus = rawExtraOptimus.plus(parseSkillValue(effect.value, slvl, {}, currentHpPercent));
                }
                if (effect.prop === 'magna') {
                    rawExtraMagna = rawExtraMagna.plus(parseSkillValue(effect.value, slvl, {}, currentHpPercent));
                }
            });
        });
    });

    let extraOptimus = Decimal.min(rawExtraOptimus, 0.9).toNumber();
    let extraMagna = Decimal.min(rawExtraMagna, 0.9).toNumber();

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
    
    // 初始化6个角色的状态数组
    party = [];
    for (let i = 0; i < 6; i++) {
        // 第0个固定是MC
        if (i === 0) {
            // 确保主角的 proficiency 是一个有效的数组，并进行初步格式化
            let mcProfs = [];
            if (currentMC && currentMC.proficiency && Array.isArray(currentMC.proficiency)) {
                mcProfs = currentMC.proficiency;
            }
            party.push({ name: "MC", element: mcElement, isMain: true, stats: {}, proficiency: mcProfs, weaponBaseValueBonuses: {} });
        } else {
            // 后面的槽位如果有选择角色，则使用角色的属性，目前暂时如果未选，让其默认跟MC一个属性方便测试武器盘加成
            const charData = typeof currentParty !== 'undefined' ? currentParty[i] : null;
            if (charData) {
                party.push({ name: charData.名称, element: charData.属性, isMain: false, stats: {}, baseHp: charData.角色基础HP || 0, baseAtk: charData.角色基础atk || 0, weaponBaseValueBonuses: {} });
            } else {
                // 占位角色，如果将来不想要占位可以去掉
                party.push({ name: "角色" + (i + 1), element: mcElement, isMain: false, stats: {}, baseHp: 0, baseAtk: 0, weaponBaseValueBonuses: {} });
            }
        }
        STAT_CONFIG.forEach(cfg => party[i].stats[cfg.key] = 0);
        party[i].stats['weapon_na_ranshu'] = 1;
        party[i].stats._elementAtkEntries = [];
    }

    // 解析当前召唤石的 effect 字符串，并写入 stats 统筹字典（主要写给主角，后续可以通过共享或者复制传给全队）
    if (typeof currentSummons !== 'undefined') {
        if (window.SummonRegistry && typeof window.SummonRegistry.collectBuildEffects === 'function') {
            window.SummonRegistry.collectBuildEffects(currentSummons).forEach((entry) => {
                if (!entry || !entry.stat_key) return;
                const value = Number(entry.value);
                if (!Number.isFinite(value) || value === 0) return;
                if (!STAT_CONFIG.some((cfg) => cfg.key === entry.stat_key)) return;
                party[0].stats[entry.stat_key] = (party[0].stats[entry.stat_key] || 0) + value;
                if (entry.stat_key === 'summon_element_atk' && typeof addElementAtkEntry === 'function') {
                    addElementAtkEntry(party[0].stats, {
                        sourceId: entry.sourceId,
                        statKey: entry.stat_key,
                        scope: entry.elementScope || 'main_element',
                        element: entry.element,
                        zone: entry.zone || 'summon',
                        value
                    });
                }
            });
        } else {
        const mainOnlySet = new Set();
        const friendOnlySet = new Set();
        const subOnlySet = new Set();
        
        for (let i = 0; i < 8; i++) {
            const summon = currentSummons[i];
            if (!summon) continue;
            
            // 检查召唤石重复限制
            const isMainOnly = i === 0 && summon.mainonly;
            const isFriendOnly = i === 1 && summon.friendonly;
            const isSubOnly = i >= 2 && summon.subonly;
            
            let isDuplicate = false;
            if (isMainOnly) {
                if (mainOnlySet.has(summon.id)) isDuplicate = true;
                else mainOnlySet.add(summon.id);
            } else if (isFriendOnly) {
                if (friendOnlySet.has(summon.id)) isDuplicate = true;
                else friendOnlySet.add(summon.id);
            } else if (isSubOnly) {
                if (subOnlySet.has(summon.id)) isDuplicate = true;
                else subOnlySet.add(summon.id);
            }
            
            if (isDuplicate) continue; // 如果受同类同名限制，则跳过
            
            // 获取对应槽位/等级的 effect 字符串
            const selectedLevel = summon.selectedLevel || 250;
            let effectStr = '';
            
            if (summon.effects) {
                if (i === 0) {
                    effectStr = summon.effects.main?.[selectedLevel]?.effect || '';
                } else if (i === 1) {
                    effectStr = summon.effects.friend?.[selectedLevel]?.effect || '';
                } else {
                    effectStr = summon.effects.sub?.[selectedLevel]?.effect || '';
                }
            }
            
            // 解析字符串，如 "summon_element_atk:10%;summon_hp:10%;element_optiums:170%"
            if (effectStr) {
                const effects = effectStr.split(';');
                effects.forEach(eff => {
                    const parts = eff.split(':');
                    if (parts.length === 2) {
                        let key = parts[0].trim();
                        let valStr = parts[1].trim();
                        let numValue = 0;
                        if (valStr.endsWith('%')) {
                            numValue = parseFloat(valStr) / 100;
                        } else {
                            numValue = parseFloat(valStr);
                        }
                        
                        // 兼容拼写错误 element_optiums -> summon_optimus
                        if (key === 'element_optiums' || key === 'element_optimus') {
                            key = 'summon_optimus';
                        } else if (key === 'element_magna') {
                            key = 'summon_magna';
                        }
                        
                        // 将解析出的加成属性写入 party[0].stats
                        if (key && !isNaN(numValue) && STAT_CONFIG.some(c => c.key === key)) {
                            party[0].stats[key] = (party[0].stats[key] || 0) + numValue;
                        }
                    }
                });
            }
        }
        }
    }

    const finalOptimus = new Decimal(baseOptimus).plus(extraOptimus).plus(party[0].stats['summon_optimus'] || 0).toNumber();
    const finalMagna = new Decimal(baseMagna).plus(extraMagna).plus(party[0].stats['summon_magna'] || 0).toNumber();
    // 如果之后有禁咒加成，可以在这里扩展：const finalJinzhou = ...

    const passiveOptimusDisplay = document.getElementById('aura-optimus-passive');
    if(passiveOptimusDisplay) {
        const sumPassiveOptimus = new Decimal(extraOptimus).plus(party[0].stats['summon_optimus'] || 0).times(100).toFixed(0);
        passiveOptimusDisplay.innerText = sumPassiveOptimus; 
    }

    const passiveMagnaDisplay = document.getElementById('aura-magna-passive');
    if(passiveMagnaDisplay) {
        const sumPassiveMagna = new Decimal(extraMagna).plus(party[0].stats['summon_magna'] || 0).times(100).toFixed(0);
        passiveMagnaDisplay.innerText = sumPassiveMagna;
    }

    const passiveJinzhouDisplay = document.getElementById('aura-jinzhou-passive');
    if(passiveJinzhouDisplay) {
        // 假如有召唤石禁咒，或者武器盘禁咒属性可在这相加。目前暂无，显示为0或按需补充
        passiveJinzhouDisplay.innerText = "0";
    }

    const passiveEleDisplay = document.getElementById('aura-elemental-passive');
    if(passiveEleDisplay) {
        const sumPassiveEle = new Decimal(party[0].stats['summon_element_atk'] || 0).times(100).toFixed(0);
        passiveEleDisplay.innerText = sumPassiveEle;
    }

    party[0].stats['optimus_boost'] = extraOptimus;
    party[0].stats['magna_boost'] = extraMagna;
    
    // 把召唤石（解析后写在 party[0].stats 的那些）以及面板输入的通用加成分发给全体队员
    // 这里我们抽取所有不是仅限主角生效的全局词条（如召唤石的各类加成）。
    const globalSummonKeys = STAT_CONFIG.map(c => c.key).filter(k => k.startsWith('summon_'));
    const summonDamageCap = window.summonDamageCapBonus || 0;
    
    for (let i = 0; i < party.length; i++) {
        // 分发属攻（包括面板输入的和可能来自召唤石合并的）
        if (i > 0) {
            party[i].stats['element_atk'] = (party[i].stats['element_atk'] || 0) + baseElementAtk;
            
            // 分发神石和方阵的召唤光环数值（供某些按光环判断的技能使用，虽然不一定用得到，但保持数据完整）
            party[i].stats['optimus_boost'] = party[0].stats['optimus_boost'];
            party[i].stats['magna_boost'] = party[0].stats['magna_boost'];
            
            // 分发召唤石提供的全队加成（HP、伤害上限等）
            globalSummonKeys.forEach(key => {
                party[i].stats[key] = (party[i].stats[key] || 0) + (party[0].stats[key] || 0);
            });
            const summonElementEntries = Array.isArray(party[0].stats._elementAtkEntries)
                ? party[0].stats._elementAtkEntries.filter((entry) => entry && entry.zone === 'summon')
                : [];
            summonElementEntries.forEach((entry) => {
                if (typeof addElementAtkEntry === 'function') addElementAtkEntry(party[i].stats, entry);
            });
            
            if (summonDamageCap > 0 && !party[i].stats['summon_dmg_cap']) {
                party[i].stats['summon_dmg_cap'] = summonDamageCap;
            }
        } else {
            party[0].stats['element_atk'] = (party[0].stats['element_atk'] || 0) + baseElementAtk;
            if (summonDamageCap > 0 && !party[0].stats['summon_dmg_cap']) {
                party[0].stats['summon_dmg_cap'] = summonDamageCap;
            }
        }
    }

    // =====================================
    // 统筹非武器加成 (角色被动、职业被动等)
    // =====================================
    // 1. 将当前用户的 DEFAULT_MASTERY 常驻加成汇入 stats 中（对于 MC）
    const defaultMastery = getDefaultMastery();
    ['mc_atk_passive', 'mc_def_passive', 'mc_hp_passive', 
     'mc_da_passive', 'mc_ta_passive', 'mc_all_cap_passive', 
     'mc_skill_dmg_passive', 'mc_skill_dmg_cap_passive', 
     'mc_ca_passive', 'mc_cb_cap_passive'].forEach(k => {
        party[0].stats[k] = (party[0].stats[k] || 0) + (defaultMastery[k] || 0);
    });

    // 主角LB额外加成（30槽位）
    party[0].stats['mc_def_passive'] = (party[0].stats['mc_def_passive'] || 0) + (mcLbTotals.mcDef || 0);
    party[0].stats['mc_da_base'] = (party[0].stats['mc_da_base'] || 0) + (mcLbTotals.da || 0);
    party[0].stats['mc_ta_base'] = (party[0].stats['mc_ta_base'] || 0) + (mcLbTotals.ta || 0);
    party[0].stats['mc_ca_passive'] = (party[0].stats['mc_ca_passive'] || 0) + (mcLbTotals.caDmg || 0);
    party[0].stats['mc_skill_dmg_passive'] = (party[0].stats['mc_skill_dmg_passive'] || 0) + (mcLbTotals.skillDmg || 0);
    party[0].stats['mc_skill_dmg_cap_passive'] = (party[0].stats['mc_skill_dmg_cap_passive'] || 0) + (mcLbTotals.skillCap || 0);
    party[0].stats['mc_cb_cap_passive'] = (party[0].stats['mc_cb_cap_passive'] || 0) + (mcLbTotals.cbCap || 0);
    party[0].stats['mc_all_cap_passive'] = (party[0].stats['mc_all_cap_passive'] || 0) + (mcLbTotals.allCap || 0);
    party[0].stats['mc_na_dmg_cap_passive'] = (party[0].stats['mc_na_dmg_cap_passive'] || 0) + (mcLbTotals.naCap || 0);
    party[0].stats['mc_debuff_resistance_passive'] = (party[0].stats['mc_debuff_resistance_passive'] || 0) + (mcLbTotals.debuffRes || 0);
    party[0].stats['mc_debuff_success_passive_non_c5'] = (party[0].stats['mc_debuff_success_passive_non_c5'] || 0) + (mcLbTotals.debuffSuccess || 0);
    party[0].stats['mc_heal_cap_passive_non_c5'] = (party[0].stats['mc_heal_cap_passive_non_c5'] || 0) + (mcLbTotals.healCap || 0);
    party[0].stats['weapon_dodge_rate'] = (party[0].stats['weapon_dodge_rate'] || 0) + (mcLbTotals.dodge || 0);
    party[0].stats['weapon_cb_dmg'] = (party[0].stats['weapon_cb_dmg'] || 0) + (mcLbTotals.cbDmg || 0);
    if (typeof addElementAtkEntry === 'function') {
        [
            ['fire', mcLbTotals.elementAtkFire],
            ['water', mcLbTotals.elementAtkWater],
            ['earth', mcLbTotals.elementAtkEarth],
            ['wind', mcLbTotals.elementAtkWind],
            ['light', mcLbTotals.elementAtkLight],
            ['dark', mcLbTotals.elementAtkDark],
            ['all', mcLbTotals.elementAtkAll]
        ].forEach(([scope, value]) => addElementAtkEntry(party[0].stats, {
            sourceId: `mc_lb:element_atk:${scope}`,
            statKey: `mc_lb_element_atk_${scope}`,
            scope,
            zone: 'charabonus',
            value: Number(value) || 0
        }));
    }
    
    // 2. 将 currentMC.bonuses 中的对应职业加成也汇入 stats 中
    if (currentMC && currentMC.bonuses) {
        Object.keys(currentMC.bonuses).forEach(k => {
            // 职业 bonus 中的 `staff_base_value_hp: 0.5` 这类字段，
            // 表示全队对应武器类型的白值加成，而不是角色自身面板乘区。
            const baseValueMatch = String(k).match(/^(.+)_base_value_(atk|hp)$/i);
            if (baseValueMatch) {
                const rawType = baseValueMatch[1];
                const stat = baseValueMatch[2].toLowerCase();
                const weaponType = WEAPON_TYPE_MAP[rawType] || String(rawType).toLowerCase();
                const value = Number(currentMC.bonuses[k]);
                if (WEAPON_BASE_VALUE_STATS.includes(stat) && weaponType && Number.isFinite(value)) {
                    party.forEach(member => {
                        if (!member.weaponBaseValueBonuses[weaponType]) {
                            member.weaponBaseValueBonuses[weaponType] = { atk: 0, hp: 0 };
                        }
                        member.weaponBaseValueBonuses[weaponType][stat] += value;
                    });
                }
                return;
            }
            if (party[0].stats.hasOwnProperty(k)) {
                party[0].stats[k] += currentMC.bonuses[k];
            }
        });
    }

    // 3. 将职业平A增幅及非C5加成写入 stats（给伤害计算统一读取）
    const currentJob = currentMC.jobId ? allClasses.find(c => c.id === currentMC.jobId) : null;
    const isClass5 = currentJob && currentJob.type === 'class_5';
    // job_na_amp 使用当前用户的 defaultMastery，用户2 可为 0
    party[0].stats['job_na_amp'] = isClass5 ? 0 : (defaultMastery['mc_na_dmg_amp_passive_non_c5'] || 0);
    party[0].stats['mc_skill_dmg_passive_non_c5'] = isClass5 ? 0 : (defaultMastery['mc_skill_dmg_passive_non_c5'] || 0);
    party[0].stats['mc_na_dmg_amp_passive_non_c5'] = isClass5 ? 0 : (defaultMastery['mc_na_dmg_amp_passive_non_c5'] || 0);
    
    if (!isClass5) {
        // 如果不是 C5 职业，赋予非 C5 相关的常驻加成
        party[0].stats['mc_all_cap_passive_non_c5'] = defaultMastery['mc_all_cap_passive_non_c5'] || 0;
    }

    party.forEach((member, i) => {
        if (!member.element) return; 

        // 将角色上的久远独立攻刃折算到统一乘区 marriage_perpetuity_atk
        const charDataForIndep = (typeof currentParty !== 'undefined') ? currentParty[i] : null;
        if (charDataForIndep && charDataForIndep.chara_marriage_perpetuity_atk) {
            member.stats['marriage_perpetuity_atk'] = (member.stats['marriage_perpetuity_atk'] || 0) + (charDataForIndep.chara_marriage_perpetuity_atk || 0);
        }

        currentGrid.forEach(weapon => {
            if (!weapon) return;
            const slvl = weapon.userSelectedSlvl || 15;
            const estLvl = estimateWeaponLevel(slvl);

            weapon.skills.forEach((skill, idx) => {
                if (estLvl < (skill.unlock_level || 0)) return;
                const realSkill = getEffectiveSkill(weapon, skill, idx);
                if (!realSkill) return;

                // 判断条件是否满足，以及选择正确的效果组
                let conditionMet280 = true;
                let useAltEffects280 = false;
                
                if (realSkill.condition) {
                    const cond = realSkill.condition.toLowerCase();
                    if (cond === 'aura_up_280') {
                        conditionMet280 = (finalOptimus >= 2.8 || finalMagna >= 2.8);
                        useAltEffects280 = true; // 条件满足时用effects_up_280，不满足时用effects_down_280
                    }
                    if (cond === 'main_hand' || cond === 'is_main_hand') {
                        if (weapon !== currentGrid[0]) return;
                    }
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

                const skillPos = (realSkill.position != null ? String(realSkill.position) : 'all').toLowerCase();
                if (skillPos === 'mc' && i !== 0) return;

                // 选择要使用的效果数组
                let effectsToProcess = realSkill.effects;

                // 检查 effects_prof_weapon：效果仅对武器类型与角色得意武器相同的角色生效
                if (realSkill["effects_prof_weapon"]) {
                    const rawWeaponType = weapon.type;
                    const weaponTypeNorm = WEAPON_TYPE_MAP[rawWeaponType] || (rawWeaponType ? String(rawWeaponType).toLowerCase() : '');
                    const charProfsLower = (member.proficiency || []).map(p => String(p).trim().toLowerCase());
                    const mappedProfs = new Set(charProfsLower);
                    charProfsLower.forEach(p => {
                        const m = WEAPON_TYPE_MAP[p];
                        if (m) mappedProfs.add(m.toLowerCase());
                    });
                    if (mappedProfs.has(weaponTypeNorm)) {
                        effectsToProcess = realSkill["effects_prof_weapon"];
                    } else {
                        return; // 角色得意武器与武器类型不匹配，跳过此技能效果
                    }
                }

                // 检查是否有基于角色得意武器的专属效果（固定类型名：effects_prof_staff 等）
                // 使用 Array.isArray 确保 member.proficiency 是数组，并检查其长度
                else if (member.proficiency && Array.isArray(member.proficiency) && member.proficiency.length > 0) {
                    for (const prof of member.proficiency) {
                        if (!prof) continue; // 跳过空值
                        
                        // 使用 WEAPON_TYPE_MAP 进行映射，确保获取到正确的 key
                        const rawProf = String(prof).trim(); // 确保是字符串并去除空格
                        
                        // 尝试多级查找：原始值 -> 转小写 -> 映射值 -> 映射值转小写
                        let mappedProf = WEAPON_TYPE_MAP[rawProf];
                        if (!mappedProf) mappedProf = WEAPON_TYPE_MAP[rawProf.toLowerCase()];
                        if (!mappedProf) mappedProf = rawProf.toLowerCase(); // 兜底使用小写

                        const profKey = `effects_prof_${mappedProf.toLowerCase()}`;

                        if (realSkill[profKey]) {
                            effectsToProcess = realSkill[profKey];
                            break; // 找到第一个匹配的就跳出
                        }
                    }
                }
                
                if (useAltEffects280 && conditionMet280 && realSkill.effects_up_280) {
                    effectsToProcess = realSkill.effects_up_280;
                } else if (useAltEffects280 && !conditionMet280 && realSkill.effects_down_280) {
                    effectsToProcess = realSkill.effects_down_280;
                }

                // 如果条件不满足且没有备选效果组，则跳过
                if (useAltEffects280 && !conditionMet280 && !realSkill.effects_down_280) {
                    return;
                }

                effectsToProcess.forEach(effect => {
                    if (effect.prop === 'optimus' || effect.prop === 'magna') return;
                    if (effect.type === 'aura_boost') return;

                    if (effect.condition) {
                        const effCond = effect.condition;
                        if (effCond === 'aura_up_280') { if (finalOptimus < 2.8 && finalMagna < 2.8) return; }
                        if (effCond === 'aura_down_280') { if (finalOptimus >= 2.8 || finalMagna >= 2.8) return; }
                    }

                    let baseVal = 0;
                    if (effect.value.toString().startsWith("curve:")) {
                        let curveKey = effect.value.split(":")[1];
                        baseVal = calculateCurveValue(curveKey, slvl, currentHpPercent);
                    } else {
                        baseVal = parseSkillValue(effect.value, slvl, context, currentHpPercent);
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
                    
                    if (effect.type === WEAPON_BASE_VALUE_BONUS_EFFECT) {
                        const stat = String(effect.stat || '').toLowerCase();
                        const rawType = effect.weapon_type;
                        const weaponType = WEAPON_TYPE_MAP[rawType] || (rawType ? String(rawType).toLowerCase() : '');
                        if (WEAPON_BASE_VALUE_STATS.includes(stat) && weaponType) {
                            if (!member.weaponBaseValueBonuses[weaponType]) {
                                member.weaponBaseValueBonuses[weaponType] = { atk: 0, hp: 0 };
                            }
                            member.weaponBaseValueBonuses[weaponType][stat] += finalVal;
                        }
                    } else if (effect.prop === 'weapon_na_ranshu') {
                        const v = Math.max(1, Math.floor(Math.abs(finalVal)));
                        member.stats['weapon_na_ranshu'] = Math.max(member.stats['weapon_na_ranshu'] || 1, v);
                    } else if (member.stats.hasOwnProperty(effect.prop)) {
                        member.stats[effect.prop] += finalVal;
                        if (typeof addElementAtkEntry === 'function'
                            && (effect.prop === 'weapon_element_atk'
                                || effect.prop === 'weapon_progression_element_atk'
                                || effect.prop === 'weapon_awaken_element_atk'
                                || effect.prop === 'weapon_ax_element_atk')) {
                            const allElement = effect.prop === 'weapon_ax_element_atk'
                                || effectiveSkillEl === '全'
                                || effectiveSkillEl === 'all';
                            addElementAtkEntry(member.stats, {
                                sourceId: `weapon:${weapon.id || weapon.name || 'unknown'}:${realSkill.id || realSkill.name || idx}:${effect.prop}`,
                                statKey: effect.prop,
                                scope: allElement ? 'all' : effectiveSkillEl,
                                zone: 'weapon_grid',
                                value: finalVal
                            });
                        }
                    }
                });
            });
        });
    });

    // =====================================
    // 过量技能·上限
    // 「全上限」与「全上限（特殊）」各自超过 20% 的部分合计：
    // 总溢出至少 2% 时，按 1% 溢出 → 0.5% D上限缓和换算，效果上限 20%。
    // 必须在武器盘 cap 生效前保存结果，之后普通上限仍各自按原规则封顶。
    // =====================================
    function updateOvercapDmgCapRelaxation(statsObj) {
        if (!statsObj) return;
        const normalOverflow = Decimal.max(
            new Decimal(Number(statsObj['weapon_dmg_cap']) || 0).minus(0.2),
            0
        );
        const specialOverflow = Decimal.max(
            new Decimal(Number(statsObj['weapon_special_dmg_cap']) || 0).minus(0.2),
            0
        );
        const totalOverflow = normalOverflow.plus(specialOverflow);
        const relaxation = totalOverflow.gte(0.02)
            ? Decimal.min(totalOverflow.times(0.5), 0.2)
            : new Decimal(0);

        statsObj['_overcap_dmg_cap_overflow'] = totalOverflow.toDecimalPlaces(10).toNumber();
        // 注册字段会由 BuffRegistry 汇入 All Effects 的 dmg_cap_relaxation。
        statsObj['overcap_dmg_cap_relaxation'] = relaxation.toDecimalPlaces(10).toNumber();
    }

    // =====================================
    // 武器盘加成上限处理（只处理 category=weapon 的字段）
    // 规则：只有武器盘提供的加成需要 cap，其他来源不做上限处理
    // =====================================
    function applyWeaponCaps(statsObj) {
        if (typeof applyWeaponStatCaps !== 'function' || typeof STAT_CONFIG === 'undefined') return;
        applyWeaponStatCaps(statsObj, STAT_CONFIG);
    }

    party.forEach(m => {
        updateOvercapDmgCapRelaxation(m.stats);
        applyWeaponCaps(m.stats);
    });

    // =====================================
    // 武器盘白值和面板最终显示统一在下方按各个角色独立计算
    // =====================================
    const teamStats = [];
    const outDiv = document.getElementById('stats-output');
    let html = '';

    party.forEach((member, i) => {
        let memberGridHp = new Decimal(0);
        let memberGridAtk = new Decimal(0);

        // 提取角色的得意武器列表
        // 主角在初始化 party 时已处理为 mapped proficiency，而非主角从 currentParty 中读取
        let charProfs = [];
        if (i === 0) {
            charProfs = member.proficiency || [];
        } else {
            const charData = typeof currentParty !== 'undefined' ? currentParty[i] : null;
            if (charData) {
                const p1 = WEAPON_TYPE_MAP[charData['得意武器1']] || charData['得意武器1'];
                const p2 = WEAPON_TYPE_MAP[charData['得意武器2']] || charData['得意武器2'];
                if (p1) charProfs.push(p1.toLowerCase());
                if (p2) charProfs.push(p2.toLowerCase());
            }
        }

        // 遍历盘子计算针对此角色的 gridHp 和 gridAtk
        for (let j = 0; j < currentGrid.length; j++) {
            const w = currentGrid[j];
            if (!w) continue;

            let wHp = (w.stats && w.stats.hp) ? parseInt(w.stats.hp) : (parseInt(w.hp) || 0);
            let wAtk = (w.stats && w.stats.atk) ? parseInt(w.stats.atk) : (parseInt(w.atk) || 0);

            // 类型限定的白值加成（例如“剑之宇宙”只强化剑武器）
            const weaponTypeKey = WEAPON_TYPE_MAP[w.type] || (w.type ? String(w.type).toLowerCase() : '');
            const typeValueBonus = member.weaponBaseValueBonuses?.[weaponTypeKey] || {};
            const typeAtkBonus = typeValueBonus.atk || 0;
            const typeHpBonus = typeValueBonus.hp || 0;
            
            // 加蛋加成
            const plusMarks = w.plusMarks || 0;
            wHp += plusMarks * 1;
            wAtk += plusMarks * 5;

            let wType = WEAPON_TYPE_MAP[w.type] || w.type;
            if(wType) wType = wType.toLowerCase();

            let isProf = charProfs.includes(wType);
            let atkMultiplier = new Decimal(1.0);

            if (i === 0) {
                // 类型白值加成与原有得意武器加成分别取整后相加。
                // 例如：round(武器HP×1.2) + round(武器HP×0.5)。
                const hpBaseMultiplier = isProf ? new Decimal(1.2) : new Decimal(1);
                const baseWeaponHp = new Decimal(wHp).times(hpBaseMultiplier).round();
                const typeBonusHp = new Decimal(wHp).times(typeHpBonus).round();
                memberGridHp = memberGridHp.plus(baseWeaponHp).plus(typeBonusHp);
                
                // 主角专属：职业多重得意加成
                // - 得意武器1·2（prof12）含义：对得意武器1与得意武器2均有加成
                // - 若得意武器1和2映射到同一种 wType，则 prof12 需要“算两次”
                const sameProfType = (charProfs.length > 1 && charProfs[0] === charProfs[1]);
                if (charProfs.length > 0 && wType === charProfs[0]) {
                    atkMultiplier = atkMultiplier
                        .plus(0.2)
                        .plus(prof1Extra)
                        .plus(sameProfType ? prof12Extra : 0);
                } else if (charProfs.length > 1 && wType === charProfs[1]) {
                    atkMultiplier = atkMultiplier.plus(0.2).plus(prof2Extra);
                }

                // 主角专属：主手武器额外加成
                if (j === 0) { 
                    let masteryType = wType;
                    if (wType === 'fist') masteryType = 'melee';
                    let key = 'main_weapon_bonuses_' + masteryType;
                    let mhBonus = getDefaultMastery()[key] || 0;
                    atkMultiplier = atkMultiplier.plus(mhBonus); 
                }

                // 类型白值加成与原有得意/LB/主手加成分别取整后相加。
                // 例如：round(武器ATK×1.3) + round(武器ATK×0.5)。
                const baseWeaponAtk = new Decimal(wAtk).times(atkMultiplier).round();
                const typeBonusAtk = new Decimal(wAtk).times(typeAtkBonus).round();
                memberGridAtk = memberGridAtk.plus(baseWeaponAtk).plus(typeBonusAtk);
            } else {
                // 非主角：HP无得意加成
                const baseWeaponHp = new Decimal(wHp).round();
                const typeBonusHp = new Decimal(wHp).times(typeHpBonus).round();
                memberGridHp = memberGridHp.plus(baseWeaponHp).plus(typeBonusHp);
                
                // 非主角：每把武器 wAtk×atkMultiplier 向下取整后累加
                if (isProf) {
                    atkMultiplier = atkMultiplier.plus(0.2);
                }
                const baseWeaponAtk = new Decimal(wAtk).times(atkMultiplier).floor();
                const typeBonusAtk = new Decimal(wAtk).times(typeAtkBonus).round();
                memberGridAtk = memberGridAtk.plus(baseWeaponAtk).plus(typeBonusAtk);
            }
        }

        // ------------------ 计算面板数值 ------------------
        // 各个成员的乘区独立计算
        const memberTotalAtkMod = new Decimal(member.stats['weapon_normal_atk'] || 0)
            .plus(member.stats['weapon_omega_atk'] || 0)
            .plus(member.stats['weapon_ex_atk'] || 0)
            .plus(member.stats['weapon_special_ex_atk'] || 0)
            .toDecimalPlaces(10)
            .toNumber();
            
        const memberGridHpMod = member.stats['weapon_hp'] || 0;

        if (i === 0) {
            // ================= 主角面板结算 =================
            const globalHpBonus = getDefaultMastery().mc_hp_passive || 0;
            const globalAtkBonus = getDefaultMastery().mc_atk_passive || 0;
            const jobPassiveHp = (currentMC.bonuses.class_hp_passive || 0) + (currentMC.bonuses.mc_hp_passive || 0); 
            
            // 提取汇总属性里的主角额外 HP/ATK
            let extraHp = 0;
            let extraAtk = 0;
            if (currentParty && currentParty[0]) {
                const charData = currentParty[0];
                extraHp = (charData.chara_ring_basehp || 0) + (charData.chara_artifacts_basehp || 0) + (charData.chara_lb_basehp || 0);
                extraAtk = (charData.chara_ring_baseatk || 0) + (charData.chara_artifacts_baseatk || 0) + (charData.chara_lb_baseatk || 0);
            }

            const rawBaseHp = new Decimal(mcBaseHp).plus(mcPartyHpFlat).plus(extraHp).plus(memberGridHp).plus(summonHp);
            const rawBaseAtk = new Decimal(mcBaseAtk).plus(extraAtk).plus(memberGridAtk).plus(summonAtk);

            const finalBaseHp = Math.round(rawBaseHp.times(new Decimal(1).plus(globalHpBonus)).toNumber());
            const finalBaseAtk = Math.round(rawBaseAtk.times(new Decimal(1).plus(globalAtkBonus)).toNumber());

            const displayHp = Math.floor(new Decimal(finalBaseHp).times(new Decimal(1).plus(memberGridHpMod).plus(jobPassiveHp)).toNumber());
            const displayAtk = Math.floor(new Decimal(finalBaseAtk).times(new Decimal(1).plus(memberTotalAtkMod)).toNumber());
            
            teamStats[i] = {
                gridHp: memberGridHp.floor().toNumber(),
                gridAtk: memberGridAtk.round().toNumber(),
                panelHp: finalBaseHp,
                panelAtk: finalBaseAtk,
                displayHp: displayHp,
                displayAtk: displayAtk
            };

            // (详细数据监控代码已移除，统一在下方生成)
            
            // 为主手更新详细分解区域
            renderDetailedBreakdown(member.stats);

        } else {
            // ================= 队员面板结算 =================
            let memberBaseHp = new Decimal(member.baseHp || 0);
            let memberBaseAtk = new Decimal(member.baseAtk || 0);
            
            const charData = typeof currentParty !== 'undefined' ? currentParty[i] : null;
            if (charData) {
                const extraHp = (charData.chara_ring_basehp || 0) + (charData.chara_artifacts_basehp || 0) + (charData.chara_lb_basehp || 0) + (charData.chara_awakening_basehp || 0);
                const extraAtk = (charData.chara_ring_baseatk || 0) + (charData.chara_artifacts_baseatk || 0) + (charData.chara_lb_baseatk || 0) + (charData.chara_awakening_baseatk || 0);
                memberBaseHp = memberBaseHp.plus(extraHp);
                memberBaseAtk = memberBaseAtk.plus(extraAtk);
            }
            
            let rawMemberBaseHp = memberBaseHp.plus(mcPartyHpFlat).plus(memberGridHp).plus(summonHp);
            let rawMemberBaseAtk = memberBaseAtk.plus(memberGridAtk).plus(summonAtk);
            
            let charHpBonus = 0;
            
            if (charData) {
                if (charData.chara_marriage_hp) charHpBonus += charData.chara_marriage_hp;
            }

            let finalMemberBaseHp = rawMemberBaseHp.times(new Decimal(1).plus(charHpBonus)).round().toNumber();
            let finalMemberBaseAtk = rawMemberBaseAtk.floor().toNumber();

            // 非主角显示面板为纯白值之和，不乘算武器盘的攻刃/守护乘区
            const displayHp = Math.floor(finalMemberBaseHp);
            const displayAtk = Math.floor(finalMemberBaseAtk);

            teamStats[i] = {
                gridHp: memberGridHp.floor().toNumber(),
                gridAtk: memberGridAtk.round().toNumber(),
                panelHp: displayHp,
                panelAtk: displayAtk,
                displayHp: displayHp,
                displayAtk: displayAtk
            };
        }

        // ================= 生成通用数据监控HTML (保留武器盘加成) =================
        // 默认显示主角(i===0)，隐藏其他人
        const displayStyle = (i === 0) ? 'block' : 'none';
        html += `<div id="monitor-stats-char-${i}" class="monitor-stats-block" style="display: ${displayStyle}; margin-bottom: 15px;">`;
        html += `<div style="font-weight:bold; color:#f39c12; border-bottom:1px solid #444; margin-bottom:5px;">${member.name || (i===0 ? 'MC' : '角色 '+(i+1))}</div>`;

        // 暴击过量计算
        const weaponCritRate = member.stats['weapon_critical_hit_rate'] || 0;
        const overflowCritRate = Decimal.max(new Decimal(weaponCritRate).minus(1.0), 0).toNumber();
        // 过量技能·暴击：显示阈值 1%（小于 1% 不显示）
        const excessCritDamageUpRaw = Decimal.min(new Decimal(overflowCritRate).times(0.5), 1.0).toNumber();
        const excessCritDamageUp = (excessCritDamageUpRaw >= 0.01) ? excessCritDamageUpRaw : 0;
        const excessDmgCapRelaxation = Number(member.stats['overcap_dmg_cap_relaxation']) || 0;

        STAT_CONFIG.forEach(cfg => {
            if (cfg.category !== 'weapon') return; 

            let val = member.stats[cfg.key] || 0;
            let isCapped = false;
            if (cfg.cap !== null && val > cfg.cap) {
                val = cfg.cap;
                isCapped = true;
            }

            // 平A乱击段数：默认值为 1（等同“无乱击”），监控面板不展示
            if (cfg.key === 'weapon_na_ranshu' && Number(val) === 1) return;

            // 仅在“接近 0”时隐藏；允许负数展示（例如 -100% TA）
            if (Math.abs(val) <= 0.0001) return; 
            
            let displayVal = val;
            if (cfg.format === 'percent') displayVal = (val * 100).toFixed(2) + "%";
            else displayVal = val.toFixed(0);

            if (isCapped) displayVal += " (MAX)";

            html += `<div class="stat-line"><span>${cfg.label}</span> <span class="${isCapped ? 'capped-val' : 'val-highlight'}">${displayVal}</span></div>`;
            
            if (cfg.key === 'weapon_critical_hit_rate' && overflowCritRate > 0 && excessCritDamageUp > 0) {
                const excessDisplayVal = (excessCritDamageUp * 100).toFixed(2) + "%";
                html += `<div class="stat-line"><span>过量技能·暴击</span> <span class="val-highlight" style="color:#f39c12;">${excessDisplayVal}</span></div>`;
            }
        });
        if (excessDmgCapRelaxation > 0) {
            const excessCapDisplayVal = (excessDmgCapRelaxation * 100).toFixed(2) + "%";
            html += `<div class="stat-line"><span>过量技能·上限</span> <span class="val-highlight" style="color:#f39c12;">${excessCapDisplayVal}</span></div>`;
        }
        html += `</div>`;
    });

    if (html === '') html = '<div style="color:#666;text-align:center;">暂无加成效果</div>';
    outDiv.innerHTML = html;

    // 计算当前激活的角色槽位 (由顶部 .char-slot-btn.active 决定)
    let activeSlot = 0;
    const activeBtn = document.querySelector('.char-slot-btn.active');
    if (activeBtn) {
        activeSlot = parseInt(activeBtn.getAttribute('data-slot')) || 0;
    }

    // 确保数据监控区展示的仍然是当前激活角色，而不是每次重算后强制回到 MC
    const monitorBlocks = document.querySelectorAll('.monitor-stats-block');
    monitorBlocks.forEach(el => { el.style.display = 'none'; });
    const activeMonitor = document.getElementById('monitor-stats-char-' + activeSlot);
    if (activeMonitor) {
        activeMonitor.style.display = 'block';
    }

    // 调用渲染方法一次性渲染全队
    if (typeof renderCharPanelStats === 'function') {
        renderCharPanelStats(teamStats);
    }

    // 在更新伤害显示前先同步角色技能 buff，确保伤害计算与右侧 Buff 面板使用同一帧数据
    if (typeof applyCharaSkillBuffStatsToParty === 'function') {
        applyCharaSkillBuffStatsToParty();
    }

    // [新增] Buff Zone 分区统合：在角色技能同步之后，读取 STAT_CONFIG 标注值 + currentParty 数据
    // → 注册到 BuffRegistry → 按 zone 规则裁决 → 产出统合值 _xxx_total
    if (typeof BuffRegistry !== 'undefined' && typeof STAT_CONFIG !== 'undefined') {
        applyBuffZoneRulesToStats();
    }

    // All Effects 是伤害公式的新读取源。先按当前 party/testbuff/拨片状态重建缓存，
    // 避免 updateDamageDisplay 读取到上一帧汇总值。
    if (typeof window !== 'undefined') {
        window.allEffectsBySlot = {};
        if (typeof buildAllEffectsForSlot === 'function') {
            party.forEach((member, i) => {
                if (member && member.stats) buildAllEffectsForSlot(i);
            });
        }
    }
    
    // 更新每个角色的伤害计算显示
    if (typeof updateDamageDisplay === 'function') {
        party.forEach((member, i) => {
            updateDamageDisplay(i);
        });
    }
    
    // 更新常驻加成显示 (使用当前激活角色槽位)
    if (typeof renderResidentBonuses === 'function') {
        renderResidentBonuses(activeSlot);
    }

    if (typeof renderPartyBuffPanel === 'function') {
        renderPartyBuffPanel(activeSlot);
    }

    // 通知依赖完整盘面结果的独立工具刷新。必须放在 All Effects、伤害显示和
    // 常驻加成全部更新之后，避免读取到本次 recalculate 之前的旧快照。
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function'
        && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('damageCalculationUpdated', {
            detail: { activeSlot: activeSlot }
        }));
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateCurveValue,
        parseSkillValue,
        estimateWeaponLevel,
        getEffectiveSkill,
        calculateRankStats,
        recalculate,
        applyCharaSkillBuffStatsToParty,
        getCalcParty
    };
}
