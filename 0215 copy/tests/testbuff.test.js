'use strict';

const assert = require('assert');

function run(name, test) {
    test();
    process.stdout.write(`ok - ${name}\n`);
}

function assertClose(actual, expected) {
    assert.ok(Math.abs(Number(actual) - Number(expected)) < 1e-10, `${actual} != ${expected}`);
}

class TestDecimal {
    constructor(value) { this.value = Number(value instanceof TestDecimal ? value.value : value) || 0; }
    plus(value) { return new TestDecimal(this.value + Number(value instanceof TestDecimal ? value.value : value)); }
    minus(value) { return new TestDecimal(this.value - Number(value instanceof TestDecimal ? value.value : value)); }
    times(value) { return new TestDecimal(this.value * Number(value instanceof TestDecimal ? value.value : value)); }
    div(value) { return new TestDecimal(this.value / Number(value instanceof TestDecimal ? value.value : value)); }
    ceil() { return new TestDecimal(Math.ceil(this.value)); }
    toNumber() { return this.value; }
    static min(left, right) { return new TestDecimal(Math.min(Number(left) || 0, Number(right) || 0)); }
}

global.Decimal = TestDecimal;
global.window = {
    buffSettings: {
        dmgAmp: 0.1,
        naDmgAmp: 0.2,
        skillDmgAmp: 0.3,
        caDmgAmp: 0.4,
        ranshu: 2,
        criticalMultiplier: 0.5,
        naCap: 0.1,
        skillCap: 0.2,
        caCap: 0.3,
        skillDmg: 0.4
    }
};

const damageCap = require('../js/damage_cap.js');
const normalDamage = require('../js/na_dmg_calc.js');
const buffZones = require('../js/buff_zones.js');
global.BuffRegistry = require('../js/buff_registry.js').BuffRegistry;
global.party = [{ stats: {} }];
const bonusRender = require('../js/render/bonus.js');

run('testbuff字段进入统一All Effects汇总', () => {
    const result = bonusRender.buildAllEffectsForSlot(0, {
        isAdvantage: false,
        persist: false
    });
    assertClose(result.totals.na_dmg_cap, 0.1);
    assertClose(result.totals.skill_dmg_cap, 0.2);
    assertClose(result.totals.ca_dmg_cap, 0.3);
    assertClose(result.totals.skill_dmg, 0.4);
    assertClose(result.totals.na_dmg_amp, 0.3);
    assertClose(result.totals.skill_dmg_amp, 0.4);
    assertClose(result.totals.ca_dmg_amp, 0.5);
    assert.strictEqual(result.totals.na_ranshu, 2);
    assert.strictEqual(result.totals.critical_hit, 1);

    const ignored = bonusRender.buildAllEffectsForSlot(0, {
        ignoreTestBuffSettings: true,
        isAdvantage: false,
        persist: false
    });
    assert.strictEqual(ignored.totals.skill_dmg, undefined);
    assert.strictEqual(ignored.totals.na_dmg_cap, undefined);
});

run('testbuff三种伤害增幅分别进入对应伤害类型', () => {
    assertClose(damageCap.calculateAmp({}, 'na', {}, {}), 0.3);
    assertClose(damageCap.calculateAmp({}, 'skill', {}, {}), 0.4);
    assertClose(damageCap.calculateAmp({}, 'ca', {}, {}), 0.5);
    assert.strictEqual(damageCap.calculateAmp({}, 'na', {}, { ignoreTestBuffSettings: true }), 0);
});

run('testbuff三种伤害上限分别进入对应上限类型', () => {
    assertClose(damageCap.calculateTotalCap({}, 'na', {}, {}), 1.1);
    assertClose(damageCap.calculateTotalCap({}, 'skill', {}, {}), 1.2);
    assertClose(damageCap.calculateTotalCap({}, 'ca', {}, {}), 1.3);
    assertClose(damageCap.calculateTotalCap({}, 'na', {}, { ignoreTestBuffSettings: true }), 1);
});

run('testbuff暴击倍率是100%发动的独立来源且可从回合模拟排除', () => {
    const sources = normalDamage.getIndependentCritSources(0, {});
    const testSource = sources.find((source) => source.source === 'testbuff_critical');
    assert.deepStrictEqual(testSource, {
        source: 'testbuff_critical',
        label: 'testbuff独立暴击',
        rate: 1,
        bonus: 0.5,
        zone: 'independent'
    });
    assert.strictEqual(normalDamage.getCritMultiplierByMode('expected', sources), 1.5);
    assert.strictEqual(normalDamage.getIndependentCritSources(0, {}, {
        ignoreTestBuffSettings: true
    }).some((source) => source.source === 'testbuff_critical'), false);
});

run('testbuff新增字段都拥有正式分区规则', () => {
    [
        'na_ranshu', 'na_dmg_amp', 'skill_dmg_amp', 'ca_dmg_amp',
        'na_dmg_cap', 'skill_dmg_cap', 'ca_dmg_cap', 'skill_dmg'
    ].forEach((buffType) => {
        assert.strictEqual(buffZones.getZoneRule(buffType, 'testbuff'), 'sum');
    });
    assert.strictEqual(buffZones.getZoneRule('critical_hit', 'independent'), 'sum');
});

run('手动模拟的破坏属性追击不会再次读取静态testbuff', () => {
    global.fixPrecision = (value) => Number(value) || 0;
    global.aggregateZoneValue = (zoneName, stats) => {
        const totals = stats && stats._charabuffZoneEffectTotals;
        const buffType = zoneName === 'marriage_perpetuity_atk' ? 'perpetuity_atk' : zoneName;
        return totals && Number(totals[buffType]) || 0;
    };
    global.applyDamageCap = (rawDamage) => ({
        decayedDamage: new TestDecimal(rawDamage),
        ampCoef: 0,
        takenDmgAmpCoef: 0
    });
    global.applyWorldCap = (damage) => new TestDecimal(damage);
    global.getTeshuStats = () => ({});

    window.buffSettings.marriage = 1;
    delete require.cache[require.resolve('../js/bonus_dmg.js')];
    require('../js/bonus_dmg.js');

    const common = {
        panelAtk: 1000,
        stats: {
            weapon_bonus_na_destruction: 0.2,
            _charabuffZoneEffectTotals: {}
        },
        hpPercent: 100,
        teshuStats: {},
        isAdv: false,
        defense: 10,
        defenseDown: 0,
        randomFactor: 1,
        ranshuForUi: 1,
        totalSupp: 0,
        totalCritMult: 1,
        extraAmpNormal: 0,
        extraAmpAdvantage: 0,
        calcOptions: {},
        capOptions: {}
    };
    const staticResult = window.BonusDmgCalc.calcNaBonusDamage(common);
    const manualResult = window.BonusDmgCalc.calcNaBonusDamage(Object.assign({}, common, {
        capOptions: { ignoreTestBuffSettings: true }
    }));

    assert.strictEqual(staticResult.chaseDesPerHit, 60);
    assert.strictEqual(manualResult.chaseDesPerHit, 30);
    window.buffSettings.marriage = 0;
});
