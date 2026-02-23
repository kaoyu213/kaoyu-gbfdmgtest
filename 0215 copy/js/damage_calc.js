// ==========================================
//  GBF 模拟器 - 伤害计算模块
// ==========================================

// ==========================================
// 乘区来源配置 - 定义每个乘区对应的数据来源
// ==========================================
const DAMAGE_ZONES = {
    // 普刃来源
    normal_atk: ['weapon_normal_atk'],
    // EX攻刃来源
    ex_atk: ['weapon_ex_atk', 'weapon_special_ex_atk'],
    // 浑身来源
    stamina: ['weapon_normal_stamina'],
    // 属攻来源 (觉醒 + 进境 + 召唤石属攻)
    element_atk: [
        'weapon_awaken_element_atk',
        'weapon_progression_element_atk',
        'element_atk'
    ],
    // 全伤害增幅来源
    dmg_amp: ['weapon_dmg_amp'],
    // 普通攻击伤害增幅来源
    normal_dmg_amp: ['weapon_normal_dmg_amp'],
    // 对有利属性伤害增幅来源 (仅弱点补正时生效)
    dmg_to_elemental_amp: ['weapon_dmg_to_elemental_amp']
};

// 备用乘区配置 (预留5个)
const BACKUP_ZONE_COUNT = 5;

// ==========================================
// 精度工具函数 - 使用 Decimal.js 解决浮点精度问题
// ==========================================

// 修正浮点数精度误差 - 四舍五入到小数点后10位
function fixPrecision(num) {
    return new Decimal(num).toDecimalPlaces(10).toNumber();
}

// 游戏实际取整：加0.5后向下取整
function gameRound(num) {
    return new Decimal(num).plus(0.5).floor().toNumber();
}

// 最终伤害取整：除以防御值后向上取整
function finalRound(num, defense) {
    return new Decimal(num).div(defense).ceil().toNumber();
}

// 精确向上取整：使用 Decimal.js 避免浮点边界问题
function ceilFixed(num) {
    return new Decimal(num).ceil().toNumber();
}

// ==========================================
// Decimal.js 乘法函数 - 避免浮点精度问题
// ==========================================

// Decimal.js 乘法 - 返回精确计算结果（不取整）
function decimalMultiply(a, b) {
    return new Decimal(a).times(new Decimal(b)).toNumber();
}

// Decimal.js 乘法 + 向上取整
function decimalMultiplyCeil(a, b) {
    return new Decimal(a).times(new Decimal(b)).ceil().toNumber();
}

// Decimal.js 乘法 + gameRound 取整 (加0.5后向下取整)
function decimalMultiplyGameRound(a, b) {
    return new Decimal(a).times(new Decimal(b)).plus(0.5).floor().toNumber();
}

// ==========================================
// 浑身曲线计算 (使用 decimal.js 进行精确计算，保留10位小数)
// ==========================================
function calculateStamina(hpPercent, baseMult) {
    if (hpPercent < 25) return 0;
    
    const hpRatio = new Decimal(hpPercent).div(50);
    const baseCurve = Decimal.pow(hpRatio, 2.9).plus(2.1);
    const maxCurve = Decimal.pow(2, 2.9).plus(2.1);
    
    if (maxCurve.isZero()) return 0;
    
    const stamReal = new Decimal(baseMult).times(baseCurve.div(maxCurve));
    return stamReal.toDecimalPlaces(10).toNumber();
}

// ==========================================
// 数据聚合函数 - 从stats和饰品数据中汇总值 (使用 Decimal.js，保留10位小数)
// ==========================================
function aggregateZoneValue(zoneName, stats, teshuStats) {
    const sources = DAMAGE_ZONES[zoneName];
    if (!sources) return 0;
    
    let sum = new Decimal(0);
    sources.forEach(key => {
        sum = sum.plus(stats[key] || 0);
    });
    
    // 加上饰品加成
    if (teshuStats && teshuStats[zoneName]) {
        sum = sum.plus(teshuStats[zoneName]);
    }
    
    return sum.toDecimalPlaces(10).toNumber();
}

// ==========================================
// 获取角色饰品加成
// ==========================================
function getTeshuStats() {
    // 从全局状态获取激活的饰品加成
    // activeSpecialBuffs 中存储的是已激活的特殊加成ID
    // 需要根据ID从teshujiacheng.json中获取对应的加成
    const teshuStats = {};
    
    if (typeof activeSpecialBuffs !== 'undefined' && activeSpecialBuffs) {
        activeSpecialBuffs.forEach(id => {
            // 查找对应的饰品数据
            const teshuItem = specialBuffsData.find(item => item.id === id);
            if (teshuItem && teshuItem.stats) {
                Object.keys(teshuItem.stats).forEach(key => {
                    // 通用加法逻辑：无论 key 是什么 (element_atk, dmg_cap, dmg_amp 等)，都累加到 teshuStats 中
                    // 这样可以自动支持 teshujiacheng.json 中的所有新属性
                    teshuStats[key] = (teshuStats[key] || 0) + teshuItem.stats[key];
                });
            }
        });
    }
    
    return teshuStats;
}

// ==========================================
// 核心伤害计算函数
// ==========================================
function calculateDamage(panelAtk, stats, hpPercent, options) {
    // options: { isAdvantage, defense, randomFactor, backups }
    const defaults = {
        isAdvantage: false,
        defense: 10,
        randomFactor: 1,  // 默认理论值
        backups: [0, 0, 0, 0, 0]  // 5个备用乘区
    };
    const opts = { ...defaults, ...options };
    
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
    const h_mult = aggregateZoneValue('stamina', stats, teshuStats);      // 浑身
    const ele_mult = aggregateZoneValue('element_atk', stats, teshuStats); // 属攻
    const dmg_amp = aggregateZoneValue('dmg_amp', stats, teshuStats);   // 伤害增幅
    
    // 弱点补正 (0.5)
    const weaknessBonus = opts.isAdvantage ? 0.5 : 0;
    
    // ====== 调试输出 ======
    const typeLabel = opts.isAdvantage ? "【对克属】" : "【无克属】";
    console.groupCollapsed(`伤害计算调试 ${typeLabel}`);
    console.log("面板ATK:", panelAtk);
    console.log("防御:", opts.defense);
    console.log("随机:", opts.randomFactor);
    console.log("乘区系数:", {
        p_mult: p_mult.toFixed(4), 
        e_mult: e_mult.toFixed(4), 
        stamina_curve: (stats['weapon_normal_stamina'] || 0).toFixed(4), 
        ele_mult: ele_mult.toFixed(4), 
        dmg_amp: dmg_amp.toFixed(4)
    });
    
    // Step 1: 面板ATK ÷ 10 (使用 Decimal.js 精确向上取整)
    let current = new Decimal(panelAtk).div(10).ceil().toNumber();
    console.log(`Step1 [ATK/10]: ${panelAtk} / 10 = ${panelAtk/10} → ${current}`);
    addLog("ATK/10", current);
    
    // Step 2: 骑空艇 1.1 (使用 Decimal.js 乘法 + 向上取整)
    let s2 = decimalMultiply(current, 1.1);
    current = decimalMultiplyCeil(current, 1.1);
    console.log(`Step2 [骑空艇]: ${s2} → ${current}`);
    addLog("骑空艇 (x1.1)", current);
    
    // Step 3: 支援 1.1 (使用 Decimal.js 乘法 + 向上取整)
    let s3 = decimalMultiply(current, 1.1);
    current = decimalMultiplyCeil(current, 1.1);
    console.log(`Step3 [支援]: ${s3} → ${current}`);
    addLog("支援 (x1.1)", current);
    
    // Step 4: 基准放大 x10 (使用 Decimal.js 乘法，无取整)
    current = decimalMultiply(current, 10);
    console.log(`Step4 [基准放大]: ${current}`);
    addLog("基准放大 (x10)", current);
    
    // Step 5: 普刃 (使用 Decimal.js 乘法 + gameRound)
    let s5 = decimalMultiply(current, new Decimal(1).plus(p_mult).toNumber());
    current = decimalMultiplyGameRound(current, new Decimal(1).plus(p_mult).toNumber());
    console.log(`Step5 [普刃]: ${s5} (x${(1+p_mult).toFixed(4)}) → ${current}`);
    addLog("普刃", current, `x${(1 + p_mult).toFixed(4)}`);
    
    // Step 6: EX攻刃 (使用 Decimal.js 乘法 + gameRound)
    let s6 = decimalMultiply(current, new Decimal(1).plus(e_mult).toNumber());
    current = decimalMultiplyGameRound(current, new Decimal(1).plus(e_mult).toNumber());
    console.log(`Step6 [EX攻刃]: ${s6} (x${(1+e_mult).toFixed(4)}) → ${current}`);
    addLog("EX攻刃", current, `x${(1 + e_mult).toFixed(4)}`);
    
    // Step 7: 浑身 - 使用calc.js中已经计算好的曲线值(已包含HP百分比修正)
    // h_mult 是原始值，stam_real 是从party stats中获取的已计算好的曲线值
    const stam_real = stats['weapon_normal_stamina'] || 0;
    let s7 = decimalMultiply(current, new Decimal(1).plus(stam_real).toNumber());
    current = decimalMultiplyGameRound(current, new Decimal(1).plus(stam_real).toNumber());
    console.log(`Step7 [浑身]: ${s7} (x${(1+stam_real).toFixed(10)}) → ${current}`);
    addLog("浑身", current, `x${(1 + stam_real).toFixed(10)}`);
    
    // Step 8: 备用乘区 (5个) (使用 Decimal.js 乘法 + gameRound)
    opts.backups.forEach((bVal, idx) => {
        if (bVal !== 0) {
            let sBackup = decimalMultiply(current, new Decimal(1).plus(bVal).toNumber());
            current = decimalMultiplyGameRound(current, new Decimal(1).plus(bVal).toNumber());
            console.log(`Step8 [备用${idx+1}]: ${sBackup} (x${(1+bVal).toFixed(4)}) → ${current}`);
            addLog(`备用乘区 ${idx + 1}`, current, `x${(1 + bVal).toFixed(4)}`);
        }
    });
    
    // Step 9: 属攻 + 克属固定0.5 (使用 Decimal.js 乘法 + gameRound)
    const totalEle = new Decimal(1).plus(ele_mult).plus(weaknessBonus).toNumber();
    let s9 = decimalMultiply(current, totalEle);
    current = decimalMultiplyGameRound(current, totalEle);
    console.log(`Step9 [属攻+克属]: ${s9} (x${totalEle.toFixed(4)}) → ${current}`);
    addLog("属攻+克属", current, `x${totalEle.toFixed(4)}`);
    
    // Step 10: 伤害增幅 (Step 10 已移除，改为在衰减后独立乘算)
    // 原始逻辑中在此处计算 dmg_amp，新逻辑推迟到最后
    console.log(`Step10 [伤害增幅]: (跳过，移至衰减后)`);
    addLog("伤害增幅", "-", "移至衰减后");
    
    // Step 11: 随机补正 (使用 Decimal.js 乘法 + gameRound)
    let s11 = decimalMultiply(current, opts.randomFactor);
    current = decimalMultiplyGameRound(current, opts.randomFactor);
    console.log(`Step11 [随机补正]: ${s11} (x${opts.randomFactor}) → ${current}`);
    addLog("随机补正", current, `x${opts.randomFactor}`);
    
    // Step 12: 防御计算 (除以防御值，作为"理论面板伤害"的基底)
    // 注意：这里除以防御后的值，就是进入 Func_Decay 的 "Raw Damage"
    const rawPostDef = finalRound(current, opts.defense);
    console.log(`Step12 [防御计算]: ${current} / ${opts.defense} = ${current/opts.defense} → ${rawPostDef}`);
    console.groupEnd();
    addLog("防御后伤害", rawPostDef, `/${opts.defense}`, true);
    
    return { damage: rawPostDef, logs: logSteps };
}

// ==========================================
// 从UI获取计算参数并执行计算
// ==========================================
function calculateDamageFromUI(charIndex = 0) {
    // 获取面板攻击力 (从calc.js的计算结果中获取)
    const panelAtkKey = `char-panel-atk-${charIndex}`;
    const panelAtkEl = document.getElementById(panelAtkKey);
    // 处理可能的逗号格式
    let panelAtk = 0;
    if (panelAtkEl) {
        const atkText = panelAtkEl.innerText.replace(/,/g, '').trim();
        panelAtk = parseInt(atkText) || 0;
    }
    
    // 获取HP百分比
    const hpPercent = parseInt(document.getElementById('current-hp-slider')?.value) || 100;
    
    // 获取弱点补正
    const weaknessToggleId = charIndex === 0 ? 'weakness-toggle' : `weakness-toggle-${charIndex}`;
    const isAdvantage = document.getElementById(weaknessToggleId)?.checked || false;
    
    // 获取防御值
    const defInputId = charIndex === 0 ? 'def-input' : `def-input-${charIndex}`;
    const defense = parseInt(document.getElementById(defInputId)?.value) || 10;
    
    // 获取随机补正
    const randomBtnGroupId = charIndex === 0 ? 'random-btn-group' : `random-btn-group-${charIndex}`;
    const randomBtnGroup = document.getElementById(randomBtnGroupId);
    let randomFactor = 1; // 默认理论值
    if (randomBtnGroup) {
        const activeBtn = randomBtnGroup.querySelector('button.active');
        if (activeBtn) {
            randomFactor = parseFloat(activeBtn.getAttribute('data-value')) || 1;
        }
    }
    
    // 获取角色stats (从party中获取)
    // party[charIndex] 存储了各角色的加成统计
    const stats = {};
    if (typeof party !== 'undefined' && party[charIndex]) {
        STAT_CONFIG.forEach(cfg => {
            stats[cfg.key] = party[charIndex].stats[cfg.key] || 0;
        });
        // 添加 element_atk
        stats['element_atk'] = party[charIndex].stats['element_atk'] || 0;
    }
    
    // 备用乘区 (目前为0，未来可扩展)
    const backups = [0, 0, 0, 0, 0];
    
    // 执行计算
    const result = calculateDamage(panelAtk, stats, hpPercent, {
        isAdvantage: isAdvantage,
        defense: defense,
        randomFactor: randomFactor,
        backups: backups
    });
    
    return result;
}

// ==========================================
// 更新UI显示伤害结果
// ==========================================
function updateDamageDisplay(charIndex = 0) {
    // 获取角色stats
    const stats = {};
    if (typeof party !== 'undefined' && party[charIndex]) {
        STAT_CONFIG.forEach(cfg => {
            stats[cfg.key] = party[charIndex].stats[cfg.key] || 0;
        });
        // 添加 element_atk
        stats['element_atk'] = party[charIndex].stats['element_atk'] || 0;
        // 添加召唤石伤害上限加成
        stats['summon_dmg_cap'] = party[charIndex].stats['summon_dmg_cap'] || 0;
    }
    
    // 获取饰品加成
    const teshuStats = getTeshuStats();
    
    // 获取面板攻击力
    const panelAtkKey = `char-panel-atk-${charIndex}`;
    const panelAtkEl = document.getElementById(panelAtkKey);
    let panelAtk = 0;
    if (panelAtkEl) {
        const atkText = panelAtkEl.innerText.replace(/,/g, '').trim();
        panelAtk = parseInt(atkText) || 0;
    }
    
    // 获取HP百分比
    const hpPercent = parseInt(document.getElementById('current-hp-slider')?.value) || 100;
    
    // 获取防御值
    const defInputId = charIndex === 0 ? 'def-input' : `def-input-${charIndex}`;
    const defense = parseInt(document.getElementById(defInputId)?.value) || 10;
    
    // 获取随机补正
    const randomBtnGroupId = charIndex === 0 ? 'random-btn-group' : `random-btn-group-${charIndex}`;
    const randomBtnGroup = document.getElementById(randomBtnGroupId);
    let randomFactor = 1;
    if (randomBtnGroup) {
        const activeBtn = randomBtnGroup.querySelector('button.active');
        if (activeBtn) {
            randomFactor = parseFloat(activeBtn.getAttribute('data-value')) || 1;
        }
    }
    
    // 备用乘区
    const backups = [0, 0, 0, 0, 0];
    
    // 计算普通伤害（不含弱点补正）
    const resultNormal = calculateDamage(panelAtk, stats, hpPercent, {
        isAdvantage: false,
        defense: defense,
        randomFactor: randomFactor,
        backups: backups
    });
    
    // 计算对克属伤害（弱点补正 = 0.5）
    const resultAdvantage = calculateDamage(panelAtk, stats, hpPercent, {
        isAdvantage: true,
        defense: defense,
        randomFactor: randomFactor,
        backups: backups
    });
    
    // 获取普通基础伤害（属攻后 × 随机补正）
    let eleLogIndex = -1;
    for (let i = 0; i < resultNormal.logs.length; i++) {
        if (resultNormal.logs[i].name === "属攻+克属") {
            eleLogIndex = i;
            break;
        }
    }
    const eleDmgNormal = eleLogIndex >= 0 ? resultNormal.logs[eleLogIndex].value : 0;
    const baseDmgNormal = decimalMultiplyGameRound(eleDmgNormal, randomFactor);
    
    // 获取对克属基础伤害
    let eleLogIndexAdv = -1;
    for (let i = 0; i < resultAdvantage.logs.length; i++) {
        if (resultAdvantage.logs[i].name === "属攻+克属") {
            eleLogIndexAdv = i;
            break;
        }
    }
    const eleDmgAdv = eleLogIndexAdv >= 0 ? resultAdvantage.logs[eleLogIndexAdv].value : 0;
    const baseDmgAdv = decimalMultiplyGameRound(eleDmgAdv, randomFactor);
    
    // 获取伤害增幅相关数值 (不再在此处聚合总值，改为传给 applyDamageCap)
    const dmg_amp = aggregateZoneValue('dmg_amp', stats, teshuStats);
    
    // 职业增幅 (天司类)
    const currentJob = allClasses.find(c => c.id === currentMC.jobId);
    const isClass5 = currentJob && currentJob.type === 'class_5';
    const job_na_amp = isClass5 ? 0 : 0.03;
    const char_buff_amp = 0;
    
    const normal_dmg_amp = aggregateZoneValue('normal_dmg_amp', stats, teshuStats);
    const dmg_to_elemental_amp = aggregateZoneValue('dmg_to_elemental_amp', stats, teshuStats);
    
    // 予伤 (最后加算)
    const dmg_supp = stats['weapon_dmg_supp'] || 0;
    const na_dmg_supp = stats['weapon_na_dmg_supp'] || 0; // 普攻予伤
    const total_supp = dmg_supp + na_dmg_supp; // 总予伤
    
    // 准备额外增幅 (职业 + 角色Buff + 普攻增幅)
    // 注意: weapon_dmg_amp 和 weapon_na_dmg_amp 已经在 damage_cap.js 的 calculateAmp 中处理了
    // 所以这里只需要传 额外 的部分 (职业, 角色Buff, 或者是 damage_cap 中没涵盖的部分)
    // damage_cap.js 涵盖了: weapon_dmg_amp, weapon_na_dmg_amp, teshuStats['dmg_amp']
    // 剩下的: job_na_amp, char_buff_amp, normal_dmg_amp(如果它和weapon_na_dmg_amp不同源?)
    // aggregateZoneValue('normal_dmg_amp') 聚合了 'weapon_normal_dmg_amp'
    // damage_cap.js 中 calculateAmp('na') 聚合了 'weapon_na_dmg_amp'.
    // 需确认这两个key是否重复. constants.js中:
    // 'weapon_normal_dmg_amp' -> 来源 DAMAGE_ZONES['normal_dmg_amp']
    // 'weapon_na_dmg_amp' -> STAT_CONFIG key.
    // 看起来这是两个不同的key，或者是一个别名?
    // 查看 damage_calc.js: DAMAGE_ZONES['normal_dmg_amp'] = ['weapon_normal_dmg_amp']
    // 查看 constants.js: STAT_CONFIG 里有 'weapon_na_dmg_amp'
    // 假设它们是同一个逻辑概念，但 key 不同。为了安全起见，我们将所有非 weapon_dmg_amp 的增幅都算作 extraAmp
    
    // 重新计算 Extra Amp
    const extraAmpNormal = new Decimal(job_na_amp).plus(char_buff_amp).plus(normal_dmg_amp).toNumber();
    const extraAmpAdvantage = new Decimal(extraAmpNormal).plus(dmg_to_elemental_amp).toNumber();

    console.groupCollapsed(`[Debug Amp Composition]`);
    console.log(`Job NA Amp: ${job_na_amp}`);
    console.log(`Char Buff Amp: ${char_buff_amp}`);
    console.log(`Normal Dmg Amp (Stats): ${normal_dmg_amp}`);
    console.log(`Dmg to Ele Amp (Seraphic): ${dmg_to_elemental_amp}`);
    console.log(`Extra Amp Normal: ${extraAmpNormal}`);
    console.log(`Extra Amp Advantage: ${extraAmpAdvantage}`);
    console.groupEnd();

    // ====== 上限计算核心逻辑 ======

    // 1. 获取防御后伤害 (Raw Post-Def Damage)
    // baseDmgNormal 是 Step11 随机补正后的值 (已取整)
    // calculateDamage 返回的是 Step12 (防御计算) 后的值
    // resultNormal.damage 就是防御后的值
    const rawPostDefNormal = resultNormal.damage;
    const rawPostDefAdv = resultAdvantage.damage;

    // 2. 应用上限衰减 (非暴击)
    // applyDamageCap(rawDamage, stats, type, teshuStats, extraAmp, options)
    const capOptions = { isClass5: isClass5 };
    const capResultNormal = applyDamageCap(rawPostDefNormal, stats, 'na', teshuStats, extraAmpNormal, capOptions);
    const capResultAdv = applyDamageCap(rawPostDefAdv, stats, 'na', teshuStats, extraAmpAdvantage, capOptions);
    
    // 3. 加上予伤
    const naDmgNormal = capResultNormal.finalDamage + total_supp;
    const naDmgAdvantage = capResultAdv.finalDamage + total_supp;

    // 4. 暴击计算 (Crit Path)
    // 暴击伤害 = 衰减((Raw / Defense) * (1 + CritMult)) * Amp
    // 我们需要重新构建 暴击时的 Raw Damage (防御后)
    // 由于 resultNormal.damage 已经是除以防御并取整了，精度可能不够。
    // 理想情况下，我们应该拿到 Pre-Defense 的值。
    // 在 calculateDamage 中，返回的 logs 里包含 Step11 的值。
    
    // 获取 Step11 (随机补正后, 防御前) 的值
    const getPreDefVal = (result) => {
        const log = result.logs.find(l => l.name === "随机补正");
        return log ? log.value : 0;
    };
    const preDefNormalVal = getPreDefVal(resultNormal);
    const preDefAdvVal = getPreDefVal(resultAdvantage);
    
    // 获取暴击率和倍率
    const weaponCritRate = stats['weapon_critical_hit_rate'] || 0;
    const critRate = Decimal.min(weaponCritRate, 1.0).toNumber();
    const overflowCritRate = Decimal.max(new Decimal(weaponCritRate).minus(1.0).toNumber(), 0).toNumber();
    const excessCritDamageUp = Decimal.min(decimalMultiply(overflowCritRate, 0.5), 1.0).toNumber();
    const critBonus = new Decimal(0.5).plus(decimalMultiply(0.5, excessCritDamageUp)).toNumber();
    const totalCritMult = 1 + critBonus;

    // 计算暴击时的 防御后伤害 (Raw Crit Post-Def)
    // 暴击计算: (PreDef * CritMult) / Defense
    // const defense 已在函数开头定义，直接使用
    
    const rawCritPostDefNormal = new Decimal(preDefNormalVal).times(totalCritMult).div(defense).round().toNumber();
    const rawCritPostDefAdv = new Decimal(preDefAdvVal).times(totalCritMult).div(defense).round().toNumber();

    // 应用上限衰减 (暴击)
    const capCritResultNormal = applyDamageCap(rawCritPostDefNormal, stats, 'na', teshuStats, extraAmpNormal, capOptions);
    const capCritResultAdv = applyDamageCap(rawCritPostDefAdv, stats, 'na', teshuStats, extraAmpAdvantage, capOptions);
    
    // 加上予伤
    const critFinalNormal = capCritResultNormal.finalDamage + total_supp;
    const critFinalAdv = capCritResultAdv.finalDamage + total_supp;

    // ====== 调试日志 ======
    console.groupCollapsed(`最终伤害详细调试 [Slot ${charIndex}]`);
    console.log(`Defense: ${defense}, CritMult: ${totalCritMult}, Supp: ${total_supp}`);
    
    console.log("【Normal Path】");
    console.log(`Pre-Def: ${preDefNormalVal}`);
    console.log(`Post-Def (Raw): ${rawPostDefNormal}`);
    console.log(`Total Cap Coeff: ${capResultNormal.capCoef}`);
    console.log(`Decayed: ${capResultNormal.decayedDamage}`);
    console.log(`Amp Coeff: ${capResultNormal.ampCoef}`);
    console.log(`Final Non-Crit: ${naDmgNormal}`);
    console.log(`Post-Def (Crit): ${rawCritPostDefNormal}`);
    console.log(`Decayed (Crit): ${capCritResultNormal.decayedDamage}`);
    console.log(`Final Crit: ${critFinalNormal}`);

    console.log("【Advantage Path】");
    console.log(`Pre-Def: ${preDefAdvVal}`);
    console.log(`Post-Def (Raw): ${rawPostDefAdv}`);
    console.log(`Final Non-Crit: ${naDmgAdvantage}`);
    console.log(`Final Crit: ${critFinalAdv}`);
    console.groupEnd();
    
    // 更新显示
    const baseDmgEl = document.getElementById(charIndex === 0 ? 'base-dmg' : `base-dmg-${charIndex}`);
    const naDmgEl = document.getElementById(charIndex === 0 ? 'na-dmg' : `na-dmg-${charIndex}`);
    const critDmgEl = document.getElementById(charIndex === 0 ? 'crit-dmg' : `crit-dmg-${charIndex}`);
    
    if (baseDmgEl) {
        // 格式: 普通伤害 [对克属] 弱点伤害
        baseDmgEl.innerHTML = `${baseDmgNormal.toLocaleString()} <span class="advantage-tag">对克属</span> ${baseDmgAdv.toLocaleString()}`;
    }
    
    if (naDmgEl) {
        // 格式: 普通伤害 [对克属] 弱点伤害
        naDmgEl.innerHTML = `${naDmgNormal.toLocaleString()} <span class="advantage-tag">对克属</span> ${naDmgAdvantage.toLocaleString()}`;
    }
    
    if (critDmgEl) {
        // 格式: 暴击伤害(暴击率%) [对克属] 暴击伤害
        const critRatePercent = (critRate * 100).toFixed(0);
        critDmgEl.innerHTML = `${critFinalNormal.toLocaleString()} <span class="crit-rate">(${critRatePercent}%)</span> <span class="advantage-tag">对克属</span> ${critFinalAdv.toLocaleString()}`;
    }

    // 更新详细数据 (折叠区域)
    const theoryEl = document.getElementById(charIndex === 0 ? 'na-theory-0' : `na-theory-${charIndex}`);
    const capEl = document.getElementById(charIndex === 0 ? 'na-cap-0' : `na-cap-${charIndex}`);
    const detailCritEl = document.getElementById(charIndex === 0 ? 'na-crit-0' : `na-crit-${charIndex}`);

    if (theoryEl) {
        // 理论伤害 = 防御后伤害 * (1 + 伤害增幅) + 予伤
        const theoryNormal = new Decimal(rawPostDefNormal)
            .times(new Decimal(1).plus(capResultNormal.ampCoef))
            .floor()
            .plus(total_supp)
            .toNumber();
        
        // 非暴击时的理论伤害 (对克属)
        const theoryAdvNormal = new Decimal(rawPostDefAdv)
            .times(new Decimal(1).plus(capResultAdv.ampCoef))
            .floor()
            .plus(total_supp)
            .toNumber();
            
        let theoryAdvDisplay = theoryAdvNormal.toLocaleString();
        let critIconHtml = '';
        
        // 如果暴击率 > 0，显示暴击/非暴击切换功能
        if (critRate > 0) {
            // 暴击时的理论伤害
            const theoryCritAdv = new Decimal(rawCritPostDefAdv)
                .times(new Decimal(1).plus(capResultAdv.ampCoef))
                .floor()
                .plus(total_supp)
                .toNumber();
                
            // 默认显示暴击伤害
            theoryAdvDisplay = `<span id="theory-val-adv-${charIndex}" data-crit="${theoryCritAdv.toLocaleString()}" data-normal="${theoryAdvNormal.toLocaleString()}" data-mode="crit">${theoryCritAdv.toLocaleString()}</span>`;
            
            // 添加暴击图标 (可点击切换)
            critIconHtml = `<span class="crit-rate" style="font-size:0.7em; margin-left:4px; margin-right:4px; cursor:pointer;" onclick="toggleCritTheory(this, ${charIndex})" title="点击切换暴击/非暴击显示">暴击</span>`;
        }
        
        theoryEl.innerHTML = `${theoryNormal.toLocaleString()} <span class="advantage-tag" style="font-size:0.7em">对克属</span>${critIconHtml}${theoryAdvDisplay}`;
    }

    if (capEl) {
        // 95%衰减阈值 = 500,000 * C (即5%效率起始点)
        const thresholdNormal = new Decimal(500000)
            .times(capResultNormal.capCoef)
            .floor()
            .toNumber();
        // 上限阈值通常不区分克属，只显示一个值
        capEl.innerHTML = `${thresholdNormal.toLocaleString()}`;
    }

    if (detailCritEl) {
        const critRatePercent = (critRate * 100).toFixed(0);
        // 使用非等宽字体并调整字号以匹配平A预测伤害的大小
        const valStyle = "font-size:1.25em; color:#f1c40f; font-family: 'Microsoft YaHei', sans-serif;";
        detailCritEl.innerHTML = `<span class="crit-rate" style="font-size:0.8em">(${critRatePercent}%)</span> <span style="${valStyle}">${critFinalNormal.toLocaleString()}</span> <span class="advantage-tag" style="font-size:0.7em">对克属</span> <span style="${valStyle}">${critFinalAdv.toLocaleString()}</span>`;
    }
    
    return resultNormal;
}

// ==========================================
// 获取当前计算参数的摘要 (用于调试/导出)
// ==========================================
function getDamageParamsSummary(charIndex = 0) {
    const panelAtkKey = `char-panel-atk-${charIndex}`;
    const panelAtkEl = document.getElementById(panelAtkKey);
    const panelAtk = panelAtkEl ? parseInt(panelAtkEl.innerText.replace(/,/g, '')) || 0 : 0;
    
    const hpPercent = parseInt(document.getElementById('current-hp-slider')?.value) || 100;
    
    const weaknessToggleId = charIndex === 0 ? 'weakness-toggle' : `weakness-toggle-${charIndex}`;
    const isAdvantage = document.getElementById(weaknessToggleId)?.checked || false;
    
    const defInputId = charIndex === 0 ? 'def-input' : `def-input-${charIndex}`;
    const defense = parseInt(document.getElementById(defInputId)?.value) || 10;
    
    const randomBtnGroupId = charIndex === 0 ? 'random-btn-group' : `random-btn-group-${charIndex}`;
    const randomBtnGroup = document.getElementById(randomBtnGroupId);
    let randomFactor = 1;
    if (randomBtnGroup) {
        const activeBtn = randomBtnGroup.querySelector('button.active');
        if (activeBtn) {
            randomFactor = parseFloat(activeBtn.getAttribute('data-value')) || 1;
        }
    }
    
    // 获取stats
    const stats = {};
    if (typeof party !== 'undefined' && party[charIndex]) {
        STAT_CONFIG.forEach(cfg => {
            stats[cfg.key] = party[charIndex].stats[cfg.key] || 0;
        });
    }
    
    const teshuStats = getTeshuStats();
    
    return {
        panelAtk,
        hpPercent,
        isAdvantage,
        defense,
        randomFactor,
        p_mult: aggregateZoneValue('normal_atk', stats, teshuStats),
        e_mult: aggregateZoneValue('ex_atk', stats, teshuStats),
        h_mult: aggregateZoneValue('stamina', stats, teshuStats),
        ele_mult: aggregateZoneValue('element_atk', stats, teshuStats) + (isAdvantage ? 0.5 : 0),
        dmg_amp: aggregateZoneValue('dmg_amp', stats, teshuStats)
    };
}

// 切换理论伤害显示 (暴击/非暴击)
function toggleCritTheory(btn, charIndex) {
    const valEl = document.getElementById(`theory-val-adv-${charIndex}`);
    if (!valEl) return;
    
    const mode = valEl.getAttribute('data-mode');
    
    if (mode === 'crit') {
        // 切换到非暴击
        valEl.textContent = valEl.getAttribute('data-normal');
        valEl.setAttribute('data-mode', 'normal');
        
        // 更新按钮样式
        btn.textContent = '非暴击';
        btn.style.background = '#7f8c8d'; // 灰色
        btn.style.color = '#fff';
    } else {
        // 切换到暴击
        valEl.textContent = valEl.getAttribute('data-crit');
        valEl.setAttribute('data-mode', 'crit');
        
        // 更新按钮样式
        btn.textContent = '暴击';
        btn.style.background = ''; // 恢复CSS定义的渐变色
        btn.style.color = '';
    }
}

// ==========================================
// 暴击伤害计算 (使用 Decimal.js)
// ==========================================

/**
 * 计算暴击伤害
 @param {Decimal} rawDamageDecimal - 未取整、未加予伤的原始伤害 (Step12之前的浮点数)
 * @param {number} suppDamage - 固定予伤数值 (不参与倍率放大)
 * @param {number} critRate - 暴击率
 * @param {number} critBonus - 暴击倍率加成 (例如 0.5 代表 +50%)
 */
function calculateCriticalDamage(rawDamageDecimal, suppDamage, critRate, critBonus = 0.5) {
    // 暴击率上限100%
    const effectiveRate = Decimal.min(critRate, 1.0).toNumber();
    
    // 1. 计算总倍率 (1 + 0.5 + Bonus)
    const totalMultiplier = new Decimal(1).plus(critBonus);
    
    // 2. 用原始浮点数乘以倍率
    const amplifiedRaw = rawDamageDecimal.times(totalMultiplier);
    
    // 3. 四舍五入取整 (GBF暴击伤害通常使用 Round，而非 Ceil，除了部分特殊上限环境)
    // 使用 Decimal.round() 保持精度，然后加上予伤
    // 4. 最后加上固定予伤
    const finalCritDamage = amplifiedRaw.round().plus(suppDamage).toNumber();
    
    return {
        critDamage: finalCritDamage,
        critRate: effectiveRate
    };
}

// ==========================================
// 导出模块
// ==========================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DAMAGE_ZONES,
        BACKUP_ZONE_COUNT,
        gameRound,
        finalRound,
        ceilFixed,
        calculateStamina,
        aggregateZoneValue,
        getTeshuStats,
        calculateDamage,
        calculateDamageFromUI,
        updateDamageDisplay,
        getDamageParamsSummary,
        calculateCriticalDamage,
        toggleCritTheory
    };
}
