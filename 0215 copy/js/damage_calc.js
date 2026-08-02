// ==========================================
//  GBF 模拟器 - 伤害计算模块
// ==========================================

// ==========================================
// 乘区来源配置 - 定义每个乘区对应的数据来源
// ==========================================
const DAMAGE_ZONES = {
    // 普刃来源
    normal_atk: [
        'weapon_normal_atk'
    ],
    // M攻刃来源
    omega_atk: [
        'weapon_omega_atk'
    ],
    // OD攻刃来源
    odious_atk: [
        'weapon_odious_atk'
    ],
    // EX攻刃来源
    ex_atk: ['weapon_ex_atk', 'weapon_special_ex_atk'],
    // 浑身来源
    stamina: ['weapon_normal_stamina'],
    stamina_omega: [ 'weapon_omega_stamina'],


    // 背水来源
    enmity: ['weapon_normal_enmity'],
    enmity_omega: ['weapon_omega_enmity'],




    // 属攻来源 (觉醒 + 进境 + 召唤石属攻等总和)
    element_atk: [
        'weapon_awaken_element_atk',
        'weapon_progression_element_atk',
        'summon_element_atk', // 召唤石属攻
        'element_atk', // 手动输入的统筹字段(如果后续还需要的话保留支持)
        'weapon_element_atk',
        'chara_earring_element_atk', // 耳饰属性攻击（存于 currentParty，需 overlay 进 stats）
        'chara_lb_element_atk' // 非主角 LB 属攻（存于 currentParty；主角已并入 party[0].stats.element_atk）
    ],
    // HP 加成来源（目前只使用这三种，后续可按需扩展）
    hp: [
        'weapon_hp',        // 武器守护
        'weapon_ax_hp',     // 武器附魔HP
        'chara_marriage_hp' // 婚戒HP%
    ],
    // 全伤害增幅来源
    dmg_amp: ['weapon_dmg_amp'],
    // 普通攻击伤害增幅来源
    normal_dmg_amp: [
        'weapon_normal_dmg_amp',
        'job_na_amp'
    ],
    // 伤害上升(固定值)
    dmg_supp: [
        'weapon_dmg_supp'
    ],
    na_dmg_supp: [
        'weapon_na_dmg_supp',
        'weapon_special_na_dmg_supp'
    ],
    // 对有利属性伤害增幅来源 (仅弱点补正时生效)
    dmg_to_elemental_amp: ['weapon_dmg_to_elemental_amp'],

    // 独立攻刃【久远乘区】来源
    marriage_perpetuity_atk: [
        'marriage_perpetuity_atk'
    ]
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
// 强壮/浑身类 Buff 通用曲线 (根据血量比例线性衰减，带硬上限)
// - hpPercent01: 当前HP比例 (0.0~1.0)
// - maxCap: 满血时硬上限 (如14%传0.14)，与 minValue 独立
// - minValue: 0%HP 时的底层保底加成 (如5%传0.05)
// 公式：单体实际效果 = min( maxCap, minValue + hp_percent * minValue * 2 )
// ==========================================
function calculateStrongBuff(hpPercent01, maxCap, minValue) {
    if (!maxCap || maxCap <= 0) return 0;
    if (minValue == null || minValue < 0) minValue = 0;

    const hp = Math.max(0, Math.min(1, hpPercent01 || 0));

    const theoretical = new Decimal(minValue)
        .plus(new Decimal(minValue).times(2).times(hp))
        .toNumber();

    return Math.min(theoretical, maxCap);
}

// ==========================================
// 单条强壮技能的 min_value 映射（示例表）：
//  - 8%  → 3%
//  - 10% → 4%
//  - 14%以上 → 5%
// 后续如有更多档位，可在此扩展。该函数仅针对“单条技能”使用。
// ==========================================
function getStrongMinValueForSingleSkill(maxCap) {
    if (!maxCap || maxCap <= 0) return 0;
    if (maxCap <= 0.08) return 0.03;
    if (maxCap <= 0.10) return 0.04;
    return 0.05;
}

// ==========================================
// 多条强壮技能的总和：对 capList 中每一条独立套用 calculateStrongBuff，再累加
// - hpPercent01: 0.0~1.0
// - capList: [0.08, 0.06] 等，每个元素是一条技能的 max_cap
// ==========================================
function calculateStrongBuffSum(hpPercent01, capList) {
    if (!Array.isArray(capList) || capList.length === 0) return 0;
    const hp = Math.max(0, Math.min(1, hpPercent01 || 0));
    let total = 0;

    capList.forEach(cap => {
        if (!cap || cap <= 0) return;
        const minVal = getStrongMinValueForSingleSkill(cap);
        const eff = calculateStrongBuff(hp, cap, minVal);
        total += eff;
    });

    return total;
}

// ==========================================
// 浑身LB → 强壮加成（按表分段线性插值）
// - hpPercent01: 当前HP比例 (0.0~1.0)
// - amount: 小/中/大 对应 1/2/3
// 返回值为小数（如 3% 返回 0.03）
// ==========================================
function getLbStaminaStrongBonus(hpPercent01, amount) {
    const amt = Number(amount) || 0;
    if (amt !== 1 && amt !== 2 && amt !== 3) return 0;

    let hp = Math.max(0, Math.min(1, Number(hpPercent01) || 0));
    // 游戏中的“1HP”应视为 0% 档，避免在 0~25% 区间插值出 2.04%/1.04% 这类值
    if (hp <= 0.01) {
        hp = 0;
    }

    // 5个参考点：100/75/50/25/0（中间按线性插值）
    const hpBp = [1, 0.75, 0.5, 0.25, 0];
    const table = {
        1: [0.03, 0.025, 0.02, 0.015, 0.01],   // 小
        2: [0.04, 0.0375, 0.03, 0.0225, 0.015],// 中
        3: [0.06, 0.05, 0.04, 0.03, 0.02]      // 大
    };

    const values = table[amt];
    if (!values) return 0;

    // 边界
    if (hp >= hpBp[0]) return values[0];
    if (hp <= hpBp[hpBp.length - 1]) return values[values.length - 1];

    // 寻找所在区间并线性插值
    for (let i = 0; i < hpBp.length - 1; i++) {
        const hiHp = hpBp[i];
        const loHp = hpBp[i + 1];
        if (hp <= hiHp && hp >= loHp) {
            const hiVal = values[i];
            const loVal = values[i + 1];
            const denom = (hiHp - loHp);
            if (!denom) return loVal;
            const t = (hp - loHp) / denom; // 0..1
            return loVal + (hiVal - loVal) * t;
        }
    }

    return 0;
}

// ==========================================
// 戒指/耳饰浑身 +N → 强壮加成（按表分段线性插值）
// - hpPercent01: 当前HP比例 (0.0~1.0)
// - amountPlus: 浑身+N 中的 N（整数）
// 规则：
//  - 100%~減少ライン: 维持最大值 max
//  - 減少ライン~0%: 从 max 线性下降到 min
//  - 1HP 视为 0% 档，取 min（确保 1血时为整数百分比）
// ==========================================
function getRingEarringStaminaStrongBonus(hpPercent01, amountPlus) {
    const amt = Math.floor(Number(amountPlus) || 0);
    if (amt <= 0) return 0;

    let hp = Math.max(0, Math.min(1, Number(hpPercent01) || 0));
    // 1HP 视为 0% 档，避免 1.04%/2.04% 这类小数
    if (hp <= 0.01) {
        hp = 0;
    }

    // 按网友总结表配置：max 为满血值，line 为減少ライン(HP比例)，min 为 0%HP 值
    const cfgMap = {
        1:  { max: 0.03, line: 1.0,     min: 0.01 },          // 渾身+1
        2:  { max: 0.03, line: 1.0,     min: 0.01 },          // 渾身+2
        // 3 暂无明确规则，沿用通用强壮曲线
        4:  { max: 0.06, line: 1.0,     min: 0.02 },          // 渾身+4
        5:  { max: 0.07, line: 2/3,     min: 0.03 },          // 渾身+5, 減少ライン 66.67%
        6:  { max: 0.08, line: 5/6,     min: 0.03 },          // 渾身+6, 減少ライン 83.33%
        7:  { max: 0.09, line: 1.0,     min: 0.03 },          // 渾身+7
        8:  { max: 0.10, line: 0.75,    min: 0.04 },          // 渾身+8, 減少ライン 75%
        9:  { max: 0.11, line: 0.875,   min: 0.04 },          // 渾身+9, 減少ライン 87.5%
        10: { max: 0.12, line: 1.0,     min: 0.04 }           // 渾身+10
        // 11、12 暂未配置
    };

    const cfg = cfgMap[amt];

    // 对表内支持的 +N，用表驱动曲线；否则退回旧的强壮曲线（保证兼容性）
    if (cfg) {
        const { max, line, min } = cfg;
        if (hp >= line) return max;
        if (line <= 0) return min;
        // 0~line 线性插值：hp=0 → min, hp=line → max
        const t = hp / line; // 0..1
        return new Decimal(min)
            .plus(new Decimal(max).minus(min).times(t))
            .toDecimalPlaces(10)
            .toNumber();
    }

    // 兜底：仍按旧的“强壮通用曲线”处理
    const cap = (2 + amt) / 100; // 与旧实现一致：max_cap = (2+N)%
    const hp01 = hp;
    const minVal = getStrongMinValueForSingleSkill(cap);
    return calculateStrongBuff(hp01, cap, minVal);
}

// ==========================================
// 戒指/耳饰背水 +N → 逆境加成（按表分段线性插值）
// - hpPercent01: 当前HP比例 (0.0~1.0)
// - amountPlus: 背水+N 中的 N（整数）
// 现状参考表（单位：%），小数部分为测试/推测值：
//   HP%       100~75   75      50      0
//   +1          1      2      2.26     5
//   +2          1      2      2.33     6
//   +3          1      3      3.37     7.5
//   +4          1      3      3.50     9
//   +5          1      4      (表中暂无) 10
//   +6          1      4      4.50    11
//   +7          1      4      4.67    12
//   +8          1      5      (表中暂无) 12.5
//   +9          1      5      5.73    13.75
//   +10         1      5      (表中暂无) 15
//
// 规则：
//  - 100%~75%: 固定 1%
//  - 75%~50%: 线性插值 (75% → 50%)
//  - 50%~0% : 线性插值 (50% → 0%)
//  - 对于表中未给出 50% 数值的档位，暂时采用「75%→0%」一条直线近似，
//    后续如有更精确表格可以在曲线表中补上 v50 即可，无需改动插值逻辑。
//
// 返回值为小数（如 5% 返回 0.05），用于“逆境乘区”或“总背水（逆境）”汇总。
// ==========================================
function getRingEarringEnmityAdversityBonus(hpPercent01, amountPlus) {
    const amt = Math.floor(Number(amountPlus) || 0);
    if (amt <= 0) return 0;

    let hp = Math.max(0, Math.min(1, Number(hpPercent01) || 0));
    // 1HP 视为 0% 档，避免出现 1.04% 这类小数边界
    if (hp <= 0.01) {
        hp = 0;
    }

    // 曲线表：以小数形式存储
    const cfgMap = {
        1:  { v100_75: 0.01, v75: 0.02,   v50: 0.0226,  v0: 0.05   },
        2:  { v100_75: 0.01, v75: 0.02,   v50: 0.0233,  v0: 0.06   },
        3:  { v100_75: 0.01, v75: 0.03,   v50: 0.0337,  v0: 0.075  },
        4:  { v100_75: 0.01, v75: 0.03,   v50: 0.0350,  v0: 0.09   },
        5:  { v100_75: 0.01, v75: 0.04,   v50: null,    v0: 0.10   },
        6:  { v100_75: 0.01, v75: 0.04,   v50: 0.0450,  v0: 0.11   },
        7:  { v100_75: 0.01, v75: 0.04,   v50: 0.0467,  v0: 0.12   },
        8:  { v100_75: 0.01, v75: 0.05,   v50: null,    v0: 0.125  },
        9:  { v100_75: 0.01, v75: 0.05,   v50: 0.0573,  v0: 0.1375 },
        10: { v100_75: 0.01, v75: 0.05,   v50: null,    v0: 0.15   }
    };

    const cfg = cfgMap[amt];
    if (!cfg) return 0;

    const { v100_75, v75, v50, v0 } = cfg;

    // 100%~75%: 恒定 v100_75
    if (hp >= 0.75) {
        return v100_75;
    }

    // 若定义了 50% 节点，按 75->50 与 50->0 两段线性插值；
    // 否则用 75->0 一条线性插值（近似）。
    if (v50 != null) {
        if (hp >= 0.5) {
            // 75% (0.75) → 50% (0.5)
            const t = (0.75 - hp) / (0.25); // 0..1
            return new Decimal(v75)
                .plus(new Decimal(v50).minus(v75).times(t))
                .toDecimalPlaces(10)
                .toNumber();
        } else {
            // 50% (0.5) → 0% (0)
            const t = (0.5 - hp) / (0.5); // 0..1
            return new Decimal(v50)
                .plus(new Decimal(v0).minus(v50).times(t))
                .toDecimalPlaces(10)
                .toNumber();
        }
    } else {
        // 75% (0.75) → 0% (0) 单段线性
        const t = (0.75 - hp) / 0.75; // 0..1
        return new Decimal(v75)
            .plus(new Decimal(v0).minus(v75).times(t))
            .toDecimalPlaces(10)
            .toNumber();
    }
}

// ==========================================
// LB背水 小/中/大 → 逆境加成（按官方表分段线性插值）
// - hpPercent01: 当前HP比例 (0.0~1.0)
// - amount: 小/中/大 对应 1/2/3 级
//
// 对应表（单位：%）：
//          小(1)   中(2)   大(3)
//   HP100   1      1       1
//   HP75    1      2       3
//   HP50   1.17   2.33     3
//   HP0     3      6       9
//
// 规则：
//  - 100%~75%: 恒定 1%
//  - 75%~50%: 线性插值 (75% → 50%)
//  - 50%~0% : 线性插值 (50% → 0%)
//
// 返回值为小数（如 3% 返回 0.03），计入“逆境乘区”与其他逆境 Buff 同框。
// ==========================================
function getLbEnmityAdversityBonus(hpPercent01, amount) {
    const amt = Number(amount) || 0;
    if (amt !== 1 && amt !== 2 && amt !== 3) return 0;

    let hp = Math.max(0, Math.min(1, Number(hpPercent01) || 0));
    // 1HP 视为 0% 档
    if (hp <= 0.01) {
        hp = 0;
    }

    const table = {
        1: { v100_75: 0.01, v75: 0.01,  v50: 0.0117, v0: 0.03 },
        2: { v100_75: 0.01, v75: 0.02,  v50: 0.0233, v0: 0.06 },
        // 大：50% 处应为 3.5%
        3: { v100_75: 0.01, v75: 0.03,  v50: 0.035,  v0: 0.09 }
    };

    const cfg = table[amt];
    if (!cfg) return 0;

    const { v100_75, v75, v50, v0 } = cfg;

    // 100%~75%: 恒定 1%，但 75% 本身按表格值处理，归入下一段
    // 即：hp > 75% 时为 1%，hp = 75% 时走 75% 档（v75）
    if (hp > 0.75) {
        return v100_75;
    }

    // 75%~50% 区间：v75 → v50
    if (hp >= 0.5) {
        const t = (0.75 - hp) / 0.25; // 0..1
        return new Decimal(v75)
            .plus(new Decimal(v50).minus(v75).times(t))
            .toDecimalPlaces(10)
            .toNumber();
    }

    // 50%~0% 区间：v50 → v0
    const t = (0.5 - hp) / 0.5; // 0..1
    return new Decimal(v50)
        .plus(new Decimal(v0).minus(v50).times(t))
        .toDecimalPlaces(10)
        .toNumber();
}

// ==========================================
// 附魔浑身(weapon_ax_stamina) → 强壮加成（按图表分段线性插值）
// - hpPercent01: 当前HP比例 (0.0~1.0)
// - baseAtFull: 满血时的附魔浑身值（用来判定曲线类型：0.03/0.04/0.05）
// 返回值为小数（如 3% 返回 0.03）
// 参考点：HP=100/75/50/25/0，与戒指/耳饰浑身 +1/+2/+3 曲线一致
// ==========================================
function getAxStaminaStrongBonus(hpPercent01, baseAtFull) {
    const full = Number(baseAtFull) || 0;
    if (full <= 0) return 0;

    const hp = Math.max(0, Math.min(1, Number(hpPercent01) || 0));

    // 以满血值判定类型：3%/4%/5% 分别对应 +1/+2/+3
    let type = 0;
    if (Math.abs(full - 0.03) <= 0.002) type = 1;
    else if (Math.abs(full - 0.04) <= 0.002) type = 2;
    else if (Math.abs(full - 0.05) <= 0.002) type = 3;
    else return full; // 未识别则按固定值处理，方便你临时测试

    const hpBp = [1, 0.75, 0.5, 0.25, 0];
    const table = {
        1: [0.03, 0.025, 0.02, 0.015, 0.01], // +1
        2: [0.04, 0.04, 0.04, 0.03, 0.02],   // +2
        3: [0.05, 0.05, 0.04, 0.03, 0.02]    // +3
    };

    const values = table[type];
    if (!values) return full;

    if (hp >= hpBp[0]) return values[0];
    if (hp <= hpBp[hpBp.length - 1]) return values[values.length - 1];

    for (let i = 0; i < hpBp.length - 1; i++) {
        const hiHp = hpBp[i];
        const loHp = hpBp[i + 1];
        if (hp <= hiHp && hp >= loHp) {
            const hiVal = values[i];
            const loVal = values[i + 1];
            const denom = hiHp - loHp;
            if (!denom) return loVal;
            const t = (hp - loHp) / denom;
            return loVal + (hiVal - loVal) * t;
        }
    }

    return full;
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

/**
 * 耳饰属攻在 currentParty，不在 party.stats；写入 stats 供 aggregateZoneValue('element_atk') 汇总
 */
function overlayCharaEarringElementAtkFromParty(stats, charIndex) {
    if (!stats || typeof currentParty === 'undefined' || !currentParty[charIndex]) return;
    const v = Number(currentParty[charIndex].chara_earring_element_atk);
    if (v > 0) stats['chara_earring_element_atk'] = v;
}

/**
 * 非主角 LB 属攻在 currentParty，不在 party.stats；写入 stats 供 aggregateZoneValue('element_atk') 汇总。
 * 主角槽位 0 的 LB 属攻已由 calc.js 计入 party[0].stats.element_atk，此处跳过避免重复。
 */
function overlayCharaLbElementAtkFromParty(stats, charIndex) {
    if (!stats || charIndex <= 0) return;
    if (typeof currentParty === 'undefined' || !currentParty[charIndex]) return;
    const v = Number(currentParty[charIndex].chara_lb_element_atk);
    if (v > 0) stats['chara_lb_element_atk'] = v;
}

/**
 * 非主角 LB 奥义伤害在 currentParty，不在 party.stats；写入 stats['chara_lb_ca_dmg']。
 * 奥义公式中该键归入 CA_DMG_OTHER_KEYS（非武器盘乘区 (1+其余)）。
 * 主角 LB 奥义伤害已由 calc.js 计入 party[0].stats.mc_ca_passive，此处跳过槽位 0。
 */
function overlayCharaLbCaDmgFromParty(stats, charIndex) {
    if (!stats || charIndex <= 0) return;
    if (typeof currentParty === 'undefined' || !currentParty[charIndex]) return;
    const v = Number(currentParty[charIndex].chara_lb_ca_dmg);
    if (v > 0) stats['chara_lb_ca_dmg'] = v;
}

/**
 * 非主角角色的戒指/神器/觉醒奥义伤害加成在 currentParty，不在 party.stats；
 * 这些键归入 CA_DMG_OTHER_KEYS（非武器盘乘区 (1+其余)）。
 * 写入 stats 供奥义计算读取。
 * 主角的相关属性已由 calc.js 计入 party[0].stats，此处跳过槽位 0。
 */
function overlayCharaOtherCaDmgFromParty(stats, charIndex) {
    if (!stats || charIndex <= 0) return;
    if (typeof currentParty === 'undefined' || !currentParty[charIndex]) return;
    const c = currentParty[charIndex];
    const keys = ['chara_ring_ca_dmg', 'chara_artifacts_ca_dmg', 'chara_awakening_ca_dmg'];
    keys.forEach(key => {
        const v = Number(c[key]);
        if (v > 0) stats[key] = v;
    });
}

/**
 * 非主角角色的上限加成（LB、戒指、神器、觉醒、婚戒等）在 currentParty，不在 party.stats；
 * 写入 stats 供 calculateTotalCap 读取。
 * 主角的上限已由 calc.js 计入 party[0].stats，此处跳过槽位 0。
 */
function overlayCharaCapsFromParty(stats, charIndex) {
    if (!stats || charIndex <= 0) return;
    if (typeof currentParty === 'undefined' || !currentParty[charIndex]) return;
    const c = currentParty[charIndex];

    // 奥义上限（直接赋值，与 overlayCharaLbCaDmgFromParty 一致，避免重复调用导致累加）
    const caCapKeys = [
        'chara_lb_ca_dmg_cap',
        'chara_ring_ca_dmg_cap',
        'chara_artifacts_ca_dmg_cap',
        'chara_artifacts_special_ca_dmg_cap',
        'chara_awakening_ca_dmg_cap'
    ];
    caCapKeys.forEach(key => {
        const v = Number(c[key]);
        if (v > 0) stats[key] = v;
    });

    // 全上限（婚戒等，直接赋值）
    const allCapKeys = [
        'chara_marriage_dmg_cap'
    ];
    allCapKeys.forEach(key => {
        const v = Number(c[key]);
        if (v > 0) stats[key] = v;
    });
}

// ==========================================
// 伤害上升分区（予伤）
// - 耳饰「伤害上升」：仅当耳饰类型选「伤害上升」时才会写入 chara_earring_dmg_supp（词条等级 n，约 5～12）；
//   予伤固定值 = n × 2000（例：5 级 → 5×2000）。换其他耳饰类型时该键会被清空，无耳饰予伤。
// - 武器盘：仅武器词条 weapon_dmg_supp / weapon_na_dmg_supp / 奥义侧见 ca_dmg_calc
// 未来：同区内取高、区与区加算；当前为各区数值直接加总（与现行「全部相加」一致）
// ==========================================
const EARRING_DMG_SUPP_PER_LEVEL = 2000;

/** @param {number} level 耳饰伤害上升词条的等级 n（非百分比，与 UI 中 5～12 一致） */
function getEarringDmgSuppFromLevel(level) {
    const n = Number(level) || 0;
    return n > 0 ? EARRING_DMG_SUPP_PER_LEVEL * n : 0;
}

/** @deprecated 使用 getEarringDmgSuppFromLevel */
function getEarringDmgSuppFromEffect(effectAmount) {
    return getEarringDmgSuppFromLevel(effectAmount);
}

/**
 * 平 A 用：武器盘区（全伤害上升 + 平 A 予伤 + 对应饰品键）与耳饰区（等级×2000）。
 * @param {object} stats party[slot].stats
 * @param {object} teshuStats getTeshuStats()
 * @param {number} charIndex 队伍槽位
 */
function getDmgSuppZonesForNa(stats, teshuStats, charIndex) {
    const weaponGrid = aggregateZoneValue('dmg_supp', stats, teshuStats)
        + aggregateZoneValue('na_dmg_supp', stats, teshuStats);
    let earring = 0;
    let artifacts = 0;
    if (typeof currentParty !== 'undefined' && currentParty[charIndex]) {
        const charData = currentParty[charIndex];
        earring = getEarringDmgSuppFromLevel(charData.chara_earring_dmg_supp);
        artifacts = Number(charData.chara_artifacts_na_dmg_supp || 0);
        if (!Number.isFinite(artifacts)) artifacts = 0;
    }
    return {
        weaponGrid,
        earring,
        artifacts,
        total: weaponGrid + earring + artifacts
    };
}

if (typeof window !== 'undefined') {
    window.overlayCharaEarringElementAtkFromParty = overlayCharaEarringElementAtkFromParty;
    window.overlayCharaLbElementAtkFromParty = overlayCharaLbElementAtkFromParty;
    window.overlayCharaLbCaDmgFromParty = overlayCharaLbCaDmgFromParty;
    window.overlayCharaOtherCaDmgFromParty = overlayCharaOtherCaDmgFromParty;
    window.overlayCharaCapsFromParty = overlayCharaCapsFromParty;
    window.EARRING_DMG_SUPP_PER_LEVEL = EARRING_DMG_SUPP_PER_LEVEL;
    window.EARRING_DMG_SUPP_PER_EFFECT = EARRING_DMG_SUPP_PER_LEVEL;
    window.getEarringDmgSuppFromLevel = getEarringDmgSuppFromLevel;
    window.getEarringDmgSuppFromEffect = getEarringDmgSuppFromEffect;
    window.getDmgSuppZonesForNa = getDmgSuppZonesForNa;
}

// ==========================================
// HP 加成汇总 & 实际生命值计算
// ==========================================

// 计算某个角色的「总HP加成」(小数形式，如 30% = 0.3)
// stats: party[slot].stats
// teshuStats: getTeshuStats() 的结果
function getHpBonusForChar(stats, teshuStats) {
    if (!stats) return 0;
    const allTeshu = teshuStats || {};

    // 只会从 DAMAGE_ZONES.hp 里的 key 取值：
    // weapon_hp, weapon_ax_hp, chara_marriage_hp
    const total = aggregateZoneValue('hp', stats, allTeshu);

    return new Decimal(total).toDecimalPlaces(10).toNumber();
}

// 根据 面板HP + 汇总HP加成，计算「实际生命值」
// 返回值：{ hpBonus, actualHp }
function getActualHp(panelHp, stats, teshuStats) {
    const baseHp = Number(panelHp) || 0;
    const hpBonus = getHpBonusForChar(stats, teshuStats);

    const actualHp = new Decimal(baseHp)
        .times(new Decimal(1).plus(hpBonus))
        .ceil()
        .toNumber();

    return { hpBonus, actualHp };
}

// ==========================================
// 获取角色饰品加成
// ==========================================
function getTeshuStats() {
    const teshuStats = {};
    
    if (typeof activeSpecialBuffs !== 'undefined' && activeSpecialBuffs) {
        activeSpecialBuffs.forEach(id => {
            const teshuItem = specialBuffsData.find(item => item.id === id);
            if (!teshuItem) return;

            const customMap = (typeof specialBuffCustomValues !== 'undefined' && specialBuffCustomValues)
                ? (specialBuffCustomValues[teshuItem.id] || null)
                : null;
            
            // 新格式：从 description 数组中提取 effect
            if (Array.isArray(teshuItem.description)) {
                teshuItem.description.forEach(item => {
                    if (!item.effect) return;
                    Object.keys(item.effect).forEach(key => {
                        const rawVal = item.effect[key];
                        const val = (customMap && typeof customMap[key] === 'number' && Number.isFinite(customMap[key]))
                            ? customMap[key]
                            : rawVal;
                        teshuStats[key] = (teshuStats[key] || 0) + val;
                    });
                });
            }
            // 旧格式：直接使用 stats 对象
            else if (teshuItem.stats) {
                Object.keys(teshuItem.stats).forEach(key => {
                    const rawVal = teshuItem.stats[key];
                    const val = (customMap && typeof customMap[key] === 'number' && Number.isFinite(customMap[key]))
                        ? customMap[key]
                        : rawVal;
                    teshuStats[key] = (teshuStats[key] || 0) + val;
                });
            }
        });
    }
    
    return teshuStats;
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
    const defDownInputId = charIndex === 0 ? 'def-down-input' : `def-down-input-${charIndex}`;
    const defense = parseInt(document.getElementById(defInputId)?.value) || 10;
    const defenseDown = Math.min(80, Math.max(0, parseInt(document.getElementById(defDownInputId)?.value) || 0));
    
    const randomBtnGroupId = charIndex === 0 ? 'random-btn-group' : `random-btn-group-${charIndex}`;
    const randomBtnGroup = document.getElementById(randomBtnGroupId);
    let randomFactor = 1;
    if (randomBtnGroup) {
        const activeBtn = randomBtnGroup.querySelector('button.active');
        if (activeBtn) {
            randomFactor = parseFloat(activeBtn.getAttribute('data-value')) || 1;
        }
    }
    
    const stats = {};
    if (typeof party !== 'undefined' && party[charIndex]) {
        STAT_CONFIG.forEach(cfg => {
            stats[cfg.key] = party[charIndex].stats[cfg.key] || 0;
        });
    }
    if (typeof overlayCharaEarringElementAtkFromParty === 'function') {
        overlayCharaEarringElementAtkFromParty(stats, charIndex);
    }
    if (typeof overlayCharaLbElementAtkFromParty === 'function') {
        overlayCharaLbElementAtkFromParty(stats, charIndex);
    }
    
    const teshuStats = getTeshuStats();
    
    return {
        panelAtk,
        hpPercent,
        isAdvantage,
        defense,
        defenseDown,
        randomFactor,
        p_mult: aggregateZoneValue('normal_atk', stats, teshuStats),
        e_mult: aggregateZoneValue('ex_atk', stats, teshuStats),
        h_mult: aggregateZoneValue('stamina', stats, teshuStats),
        ele_mult: aggregateZoneValue('element_atk', stats, teshuStats) + (isAdvantage ? 0.5 : 0),
        dmg_amp: aggregateZoneValue('dmg_amp', stats, teshuStats)
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
        overlayCharaEarringElementAtkFromParty,
        overlayCharaLbElementAtkFromParty,
        overlayCharaLbCaDmgFromParty,
        EARRING_DMG_SUPP_PER_LEVEL,
        getEarringDmgSuppFromLevel,
        getEarringDmgSuppFromEffect,
        getDmgSuppZonesForNa,
        getTeshuStats,
        getDamageParamsSummary,
        getHpBonusForChar,
        getActualHp
    };
}
