'use strict';

const assert = require('assert');

class TestDecimal {
    constructor(value) { this.value = Number(value instanceof TestDecimal ? value.value : value) || 0; }
    plus(value) { return new TestDecimal(this.value + Number(value instanceof TestDecimal ? value.value : value)); }
    minus(value) { return new TestDecimal(this.value - Number(value instanceof TestDecimal ? value.value : value)); }
    times(value) { return new TestDecimal(this.value * Number(value instanceof TestDecimal ? value.value : value)); }
    div(value) { return new TestDecimal(this.value / Number(value instanceof TestDecimal ? value.value : value)); }
    ceil() { return new TestDecimal(Math.ceil(this.value)); }
    floor() { return new TestDecimal(Math.floor(this.value)); }
    toDecimalPlaces(places) {
        const scale = Math.pow(10, Number(places) || 0);
        return new TestDecimal(Math.round(this.value * scale) / scale);
    }
    toNumber() { return this.value; }
}

function run(name, test) {
    test();
    process.stdout.write(`ok - ${name}\n`);
}

function assertClose(actual, expected) {
    assert.ok(Math.abs(Number(actual) - Number(expected)) < 1e-10, `${actual} != ${expected}`);
}

global.Decimal = TestDecimal;
global.window = { buffSettings: { element: 0, elementScope: 'all' } };

const directory = require('../js/buff_directory.js');
const zones = require('../js/buff_zones.js');
const constants = require('../js/constants.js');
global.parseBuffProp = directory.parseBuffProp;
global.getZoneRule = zones.getZoneRule;
global.getZoneCap = zones.getZoneCap;
global.BUFF_TYPE_ZONE_RULES = zones.BUFF_TYPE_ZONE_RULES;

const damage = require('../js/damage_calc.js');
Object.assign(global, damage);

global.applyDamageCap = (rawDamage, stats, type, teshuStats, extraAmp, options) => {
    const ampType = type === 'na' ? 'na_dmg_amp'
        : type === 'skill' ? 'skill_dmg_amp'
        : type === 'ca' ? 'ca_dmg_amp'
        : null;
    const effectAmp = ampType && options && options.effectTotals
        ? Number(options.effectTotals[ampType]) || 0
        : 0;
    return {
        decayedDamage: new TestDecimal(rawDamage),
        ampCoef: effectAmp + (Number(extraAmp) || 0),
        takenDmgAmpCoef: 0
    };
};
global.applyWorldCap = (damageValue) => new TestDecimal(damageValue);
global.sumNaFinalWithRanshu = () => ({ sum: 0 });
global.aggregateZoneValue = (zoneName, stats) => {
    const buffType = zoneName === 'marriage_perpetuity_atk' ? 'perpetuity_atk' : zoneName;
    return stats && stats._charabuffZoneEffectTotals
        ? Number(stats._charabuffZoneEffectTotals[buffType]) || 0
        : 0;
};
global.fixPrecision = (value) => Number(value) || 0;
global.getTeshuStats = () => ({});

require('../js/bonus_dmg.js');

run('妈武插件与玲珑佩使用不同的克属增幅类型', () => {
    const wonders = require('../wonders.json');
    const skills = require('../skills.json');
    const yupei = wonders.find((item) => item.id === 'yupei');
    const yupeiAmp = yupei.description.find((item) => item.effect && item.effect.element_pair_dmg_amp);
    const anklet = skills.find((skill) => skill.id === 'anklet_of_na');
    const ankletAmp = anklet.effects.find((effect) => effect.prop === 'weapon_dmg_to_elemental_amp');

    assert.strictEqual(yupeiAmp.effect.element_pair_dmg_amp, 0.05);
    assert.strictEqual(ankletAmp.value, '0.3');
    assert.strictEqual(zones.getZoneRule('element_pair_dmg_amp', 'independent'), 'sum');
});

run('属攻按本次伤害属性筛选，全属性不包含破坏属性', () => {
    const stats = { _elementAtkEntries: [] };
    damage.addElementAtkEntry(stats, { sourceId: 'all', scope: 'all', zone: 'independent', value: 0.1 });
    damage.addElementAtkEntry(stats, { sourceId: 'light', scope: 'light', zone: 'independent', value: 0.3 });
    damage.addElementAtkEntry(stats, { sourceId: 'water', scope: 'water', zone: 'independent', value: 0.5 });

    assertClose(damage.resolveElementAtkForDamage(stats, {}, {
        actorElement: 'light', damageElement: 'light', enemyElement: 'fire', mainElement: 'light'
    }), 0.4);
    assertClose(damage.resolveElementAtkForDamage(stats, {}, {
        actorElement: 'light', damageElement: 'water', enemyElement: 'fire', mainElement: 'light'
    }), 0.6);
    const destruction = damage.resolveElementMultiplierForDamage(stats, {}, {
        actorElement: 'light', damageElement: 'destruction', enemyElement: 'fire', mainElement: 'light'
    });
    assertClose(destruction.elementAtk, 0);
    assertClose(destruction.multiplier, 1.5);
});

run('玲珑佩属攻只作用于角色本属性伤害', () => {
    const teshuStats = {
        element_atk: 0.1,
        _elementAtkEntries: [{
            sourceId: 'special:yupei:element_atk', scope: 'own_element', zone: 'independent', value: 0.1
        }]
    };
    assertClose(damage.resolveElementAtkForDamage({}, teshuStats, {
        actorElement: 'fire', damageElement: 'fire', enemyElement: 'wind', mainElement: 'fire'
    }), 0.1);
    assertClose(damage.resolveElementAtkForDamage({}, teshuStats, {
        actorElement: 'fire', damageElement: 'light', enemyElement: 'dark', mainElement: 'fire'
    }), 0);
});

run('特殊道具区按来源区分玲珑佩本属性属攻和戴冠者全属性属攻', () => {
    global.activeSpecialBuffs = new Set(['yupei', 'signum_heredis']);
    global.specialBuffsData = require('../wonders.json');
    global.specialBuffCustomValues = {};

    const teshuStats = damage.getTeshuStats();
    assertClose(teshuStats.element_atk, 0.13);
    assertClose(damage.resolveElementAtkForDamage({}, teshuStats, {
        actorElement: 'fire', damageElement: 'fire', enemyElement: 'wind', mainElement: 'fire'
    }), 0.13);
    assertClose(damage.resolveElementAtkForDamage({}, teshuStats, {
        actorElement: 'fire', damageElement: 'light', enemyElement: 'dark', mainElement: 'fire'
    }), 0.03);

    delete global.activeSpecialBuffs;
    delete global.specialBuffsData;
    delete global.specialBuffCustomValues;
});

run('全属性与指定属性位于同一取高分区时先合并候选再取高', () => {
    const stats = { _elementAtkEntries: [] };
    damage.addElementAtkEntry(stats, { sourceId: 'all_skill', scope: 'all', zone: 'chara_skill', value: 0.2 });
    damage.addElementAtkEntry(stats, { sourceId: 'wind_skill', scope: 'wind', zone: 'chara_skill', value: 0.5 });
    assertClose(damage.resolveElementAtkForDamage(stats, {}, {
        actorElement: 'light', damageElement: 'wind', enemyElement: 'earth', mainElement: 'light'
    }), 0.5);
});

run('武器属攻封顶会同步明细，其他属攻来源继续独立相加', () => {
    const stats = {
        weapon_element_atk: 0.45,
        _elementAtkEntries: []
    };
    for (let i = 0; i < 3; i += 1) {
        damage.addElementAtkEntry(stats, {
            sourceId: `awakening_${i}`,
            statKey: 'weapon_element_atk',
            scope: 'wind',
            zone: 'weapon_grid',
            value: 0.15
        });
    }

    damage.applyWeaponStatCaps(stats, constants.STAT_CONFIG);

    assertClose(stats.weapon_element_atk, 0.4);
    assertClose(
        stats._elementAtkEntries
            .filter((entry) => entry.statKey === 'weapon_element_atk')
            .reduce((sum, entry) => sum + entry.value, 0),
        0.4
    );
    assertClose(damage.resolveElementAtkForDamage(stats, {}, {
        actorElement: 'wind', damageElement: 'wind', enemyElement: 'water', mainElement: 'wind'
    }), 0.4);

    stats.weapon_progression_element_atk = 0.2;
    stats.summon_element_atk = 0.2;
    damage.addElementAtkEntry(stats, {
        sourceId: 'progression',
        statKey: 'weapon_progression_element_atk',
        scope: 'wind',
        zone: 'weapon_grid',
        value: 0.2
    });
    damage.addElementAtkEntry(stats, {
        sourceId: 'summon',
        statKey: 'summon_element_atk',
        scope: 'main_element',
        zone: 'summon',
        value: 0.2
    });
    assertClose(damage.resolveElementAtkForDamage(stats, {}, {
        actorElement: 'wind', damageElement: 'wind', enemyElement: 'water', mainElement: 'wind'
    }), 0.8);
});

run('未达到上限的武器属攻明细保持原值', () => {
    const stats = { weapon_element_atk: 0.3, _elementAtkEntries: [] };
    damage.addElementAtkEntry(stats, {
        sourceId: 'awakening_1', statKey: 'weapon_element_atk', scope: 'wind', zone: 'weapon_grid', value: 0.15
    });
    damage.addElementAtkEntry(stats, {
        sourceId: 'awakening_2', statKey: 'weapon_element_atk', scope: 'wind', zone: 'weapon_grid', value: 0.15
    });

    damage.applyWeaponStatCaps(stats, constants.STAT_CONFIG);

    assertClose(stats.weapon_element_atk, 0.3);
    assert.deepStrictEqual(stats._elementAtkEntries.map((entry) => entry.value), [0.15, 0.15]);
});

run('属性关系分别应用有利1.5、不利0.75和中性1.0补正', () => {
    const favorable = damage.resolveElementMultiplierForDamage({}, {}, {
        actorElement: 'earth', damageElement: 'earth', enemyElement: 'water'
    });
    const unfavorable = damage.resolveElementMultiplierForDamage({}, {}, {
        actorElement: 'water', damageElement: 'water', enemyElement: 'earth'
    });
    const neutral = damage.resolveElementMultiplierForDamage({}, {}, {
        actorElement: 'wind', damageElement: 'wind', enemyElement: 'water'
    });
    assertClose(favorable.multiplier, 1.5);
    assertClose(favorable.elementalCorrection, 0.5);
    assertClose(unfavorable.multiplier, 0.75);
    assertClose(unfavorable.elementalCorrection, -0.25);
    assertClose(neutral.multiplier, 1);
    assertClose(neutral.elementalCorrection, 0);
    assertClose(damage.resolveElementMultiplierForDamage({}, {}, {
        actorElement: 'water', damageElement: 'water', enemyElement: 'earth', forceAdvantage: true
    }).multiplier, 1.5);
    assertClose(damage.resolveElementMultiplierForDamage({}, {}, {
        actorElement: 'light', damageElement: 'light', enemyElement: 'dark'
    }).multiplier, 1.5);
    assertClose(damage.resolveElementMultiplierForDamage({}, {}, {
        actorElement: 'dark', damageElement: 'dark', enemyElement: 'light'
    }).multiplier, 1.5);
});

run('暴击资格按本次伤害属性独立判断，无属性敌人允许元素伤害暴击', () => {
    assert.strictEqual(damage.isCritEligibleForDamage({
        actorElement: 'wind', damageElement: 'wind', enemyElement: 'earth'
    }), true);
    assert.strictEqual(damage.isCritEligibleForDamage({
        actorElement: 'wind', damageElement: 'wind', enemyElement: 'water'
    }), false);
    assert.strictEqual(damage.isCritEligibleForDamage({
        actorElement: 'wind', damageElement: 'earth', enemyElement: 'water'
    }), true);
    assert.strictEqual(damage.isCritEligibleForDamage({
        actorElement: 'wind', damageElement: 'wind', enemyElement: 'non_elemental'
    }), true);
    assert.strictEqual(damage.isCritEligibleForDamage({
        actorElement: 'wind', damageElement: 'non_elemental', enemyElement: 'non_elemental'
    }), false);
    assert.strictEqual(damage.isCritEligibleForDamage({
        actorElement: 'wind', damageElement: 'destruction', enemyElement: 'water'
    }), true);
});

run('回合状态已有类型化属攻时不会再叠加旧式汇总字段', () => {
    const stats = {
        _elementAtkEntries: [],
        _charabuffZoneEffectTotals: { element_atk: 0.7 }
    };
    damage.addElementAtkEntry(stats, {
        sourceId: 'status:runtime:wind_skill', scope: 'wind', zone: 'chara_skill', value: 0.5
    });
    assertClose(damage.resolveElementAtkForDamage(stats, {}, {
        actorElement: 'light', damageElement: 'wind', enemyElement: 'earth', mainElement: 'light'
    }), 0.5);
});

run('异属性平A追击按追击属性重算属攻与克属补正', () => {
    const stats = { _elementAtkEntries: [] };
    damage.addElementAtkEntry(stats, { sourceId: 'all', scope: 'all', zone: 'independent', value: 0.1 });
    damage.addElementAtkEntry(stats, { sourceId: 'light', scope: 'light', zone: 'independent', value: 0.3 });
    damage.addElementAtkEntry(stats, { sourceId: 'water', scope: 'water', zone: 'independent', value: 0.5 });

    const result = window.BonusDmgCalc.calcNaBonusDamage({
        panelAtk: 1000,
        stats,
        hpPercent: 100,
        charIndex: 0,
        teshuStats: {},
        isAdv: false,
        actorElement: 'light',
        damageElement: 'light',
        enemyElement: 'fire',
        mainElement: 'light',
        rawCritPostDefUsed: 1400,
        defense: 10,
        defenseDown: 0,
        randomFactor: 1,
        ranshuForUi: 1,
        totalSupp: 0,
        totalCritMult: 1,
        extraAmpNormal: 0,
        extraAmpAdvantage: 0,
        capOptions: { worldCapMode: 'none' },
        dynamicBuffEntries: [{
            sourceId: 'water_echo', prop: 'bonus_na_water', zone: 'E', value: 0.2
        }]
    });

    // 光本体元素倍率1.4；水追击为 1 + 全属攻0.1 + 水属攻0.5 + 克属0.5 = 2.1。
    // 1400 × 2.1 / 1.4 × 20% = 420。
    assert.strictEqual(result.chasePerHit, 420);
    assert.strictEqual(result.chaseEffects[0].element, 'water');
    assertClose(result.chaseEffects[0].elementAtk, 0.6);
    assertClose(result.chaseEffects[0].weaknessBonus, 0.5);
});

run('跨属时本体不能暴击，但克属追击按自身属性独立暴击', () => {
    const result = window.BonusDmgCalc.calcNaBonusDamage({
        panelAtk: 1000,
        stats: {},
        hpPercent: 100,
        charIndex: 0,
        teshuStats: {},
        actorElement: 'wind',
        damageElement: 'wind',
        enemyElement: 'water',
        mainElement: 'wind',
        rawPostDefUsed: 1000,
        defense: 10,
        defenseDown: 0,
        randomFactor: 1,
        ranshuForUi: 1,
        totalSupp: 0,
        totalCritMult: 1.5,
        extraAmpNormalBase: 0,
        extraAmpAdvantageBase: 0,
        critOnlyAmpPotential: 0,
        capOptions: { worldCapMode: 'none' },
        dynamicBuffEntries: [{
            sourceId: 'earth_echo', prop: 'bonus_na_earth', zone: 'E', value: 0.2
        }]
    });

    // 风本体打水为中性；土追击打水为有利：1000 × 1.5属克 × 1.5暴击 × 20% = 450。
    assert.strictEqual(result.chasePerHit, 450);
    assert.strictEqual(result.chaseEffects[0].critEligible, true);
});

run('异属性追击克制敌人时不越权触发角色六属性配对增幅', () => {
    const params = {
        panelAtk: 1000,
        stats: {},
        hpPercent: 100,
        charIndex: 0,
        teshuStats: {
            element_atk: 0.1,
            _elementAtkEntries: [{
                sourceId: 'special:yupei:element_atk', scope: 'own_element', zone: 'independent', value: 0.1
            }]
        },
        isAdv: false,
        actorElement: 'fire',
        damageElement: 'fire',
        enemyElement: 'dark',
        mainElement: 'fire',
        rawPostDefUsed: 1000,
        defense: 10,
        defenseDown: 0,
        randomFactor: 1,
        ranshuForUi: 1,
        totalSupp: 0,
        totalCritMult: 1,
        extraAmpNormalBase: 0,
        critOnlyAmpPotential: 0,
        capOptions: {
            worldCapMode: 'none',
            effectTotals: {
                na_dmg_amp: 0,
                dmg_to_elemental_amp: 0.1,
                element_pair_dmg_amp: 0.05
            }
        },
        dynamicBuffEntries: [{
            sourceId: 'light_echo', prop: 'bonus_na_light', zone: 'E', value: 0.2
        }]
    };
    const result = window.BonusDmgCalc.calcNaBonusDamage(params);
    const withoutPairAmp = window.BonusDmgCalc.calcNaBonusDamage({
        ...params,
        capOptions: {
            ...params.capOptions,
            effectTotals: {
                ...params.capOptions.effectTotals,
                element_pair_dmg_amp: 0
            }
        }
    });
    const withoutAnyElementalAmp = window.BonusDmgCalc.calcNaBonusDamage({
        ...params,
        capOptions: {
            ...params.capOptions,
            effectTotals: {
                ...params.capOptions.effectTotals,
                dmg_to_elemental_amp: 0,
                element_pair_dmg_amp: 0
            }
        }
    });

    // 火角色打暗为中性；光追击打暗为克属，只读取泛用克属增幅10%，
    // 不读取玲珑佩的火属攻，也不读取按“火角色→风敌人”判断的配对增幅5%。
    assertClose(result.chaseEffects[0].elementAtk, 0);
    assert.strictEqual(result.chasePerHit, withoutPairAmp.chasePerHit);
    assert.ok(result.chasePerHit > withoutAnyElementalAmp.chasePerHit);
});

run('角色克制敌人时异属性追击仍读取角色六属性配对增幅', () => {
    const result = window.BonusDmgCalc.calcNaBonusDamage({
        panelAtk: 1000,
        stats: {},
        hpPercent: 100,
        charIndex: 0,
        teshuStats: {},
        isAdv: true,
        actorElement: 'fire',
        damageElement: 'fire',
        enemyElement: 'wind',
        mainElement: 'fire',
        rawPostDefUsed: 1000,
        defense: 10,
        defenseDown: 0,
        randomFactor: 1,
        ranshuForUi: 1,
        totalSupp: 0,
        totalCritMult: 1,
        extraAmpNormalBase: 0,
        critOnlyAmpPotential: 0,
        capOptions: {
            worldCapMode: 'none',
            effectTotals: {
                // All Effects 已按火角色对风敌人把配对增幅合并进本体平A增幅。
                na_dmg_amp: 0.05,
                element_pair_dmg_amp: 0.05
            }
        },
        dynamicBuffEntries: [{
            sourceId: 'light_echo', prop: 'bonus_na_light', zone: 'E', value: 0.2
        }]
    });

    // 火本体对风的元素倍率为1.5，光追击对风为1.0；配对增幅仍由火角色→风敌人触发。
    // 1000 × (1 / 1.5) × 1.05 × 20% = 140。
    assert.strictEqual(result.chasePerHit, 140);
});

run('破坏属性追击读取角色基础值修正，但不读取骑空艇与支援', () => {
    const common = {
        panelAtk: 1005,
        stats: { weapon_bonus_na_destruction: 0.2 },
        hpPercent: 100,
        charIndex: 0,
        teshuStats: { airship_sp_atk1: 9, airship_sp_atk2: 9 },
        actorElement: 'wind',
        damageElement: 'wind',
        enemyElement: 'water',
        mainElement: 'wind',
        defense: 10,
        defenseDown: 0,
        randomFactor: 1,
        ranshuForUi: 1,
        totalSupp: 0,
        totalCritMult: 1,
        extraAmpNormalBase: 0,
        critOnlyAmpPotential: 0,
        capOptions: { worldCapMode: 'none' }
    };

    window.baseValues = { 0: { original: 101, adjustment: 0 } };
    assert.strictEqual(window.BonusDmgCalc.calcNaBonusDamage(common).chaseDesPerHit, 31);

    window.baseValues[0].adjustment = -1;
    assert.strictEqual(window.BonusDmgCalc.calcNaBonusDamage(common).chaseDesPerHit, 30);
    assert.strictEqual(window.BonusDmgCalc.calcNaBonusDamage({
        ...common,
        ignoreBaseValueAdjustment: true
    }).chaseDesPerHit, 31);
    delete window.baseValues;
});

run('破坏追击读取泛用克属增幅，但排除六属性配对增幅', () => {
    const result = window.BonusDmgCalc.calcNaBonusDamage({
        panelAtk: 1000,
        stats: { weapon_bonus_na_destruction: 0.2 },
        hpPercent: 100,
        charIndex: 0,
        teshuStats: { element_pair_dmg_amp: 0.05 },
        isAdv: false,
        actorElement: 'wind',
        damageElement: 'wind',
        enemyElement: 'water',
        mainElement: 'wind',
        defense: 10,
        defenseDown: 0,
        randomFactor: 1,
        ranshuForUi: 1,
        totalSupp: 0,
        totalCritMult: 1,
        extraAmpNormalBase: 0,
        critOnlyAmpPotential: 0,
        capOptions: {
            worldCapMode: 'none',
            effectTotals: {
                dmg_amp: 0.037,
                na_dmg_amp: 0.087,
                dmg_to_elemental_amp: 0.30,
                element_pair_dmg_amp: 0.05
            }
        }
    });

    // 基底150；平A专属5% + 全伤害3.7% + 武器克属30% = 38.7%。
    // 玲珑佩的六属性配对增幅5%不适用于破坏属性。
    assert.strictEqual(result.chaseDesPerHit, 42);
});

run('testbuff属攻默认全属性，也可限定指定属性', () => {
    window.buffSettings.element = 0.25;
    window.buffSettings.elementScope = 'wind';
    assertClose(damage.resolveElementAtkForDamage({}, {}, {
        actorElement: 'light', damageElement: 'wind', enemyElement: 'earth'
    }), 0.25);
    assertClose(damage.resolveElementAtkForDamage({}, {}, {
        actorElement: 'light', damageElement: 'light', enemyElement: 'dark'
    }), 0);
    window.buffSettings.element = 0;
    window.buffSettings.elementScope = 'all';
});
