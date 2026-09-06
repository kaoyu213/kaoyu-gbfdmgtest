'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class TestDecimal {
    constructor(value) {
        this.value = value instanceof TestDecimal ? value.value : Number(value);
        if (Number.isNaN(this.value)) this.value = 0;
    }
    plus(value) { return new TestDecimal(this.value + new TestDecimal(value).value); }
    minus(value) { return new TestDecimal(this.value - new TestDecimal(value).value); }
    times(value) { return new TestDecimal(this.value * new TestDecimal(value).value); }
    div(value) { return new TestDecimal(this.value / new TestDecimal(value).value); }
    ceil() { return new TestDecimal(Math.ceil(this.value)); }
    floor() { return new TestDecimal(Math.floor(this.value)); }
    round() { return new TestDecimal(Math.round(this.value)); }
    toDecimalPlaces(places) {
        const factor = 10 ** Number(places || 0);
        return new TestDecimal(Math.round(this.value * factor) / factor);
    }
    toNumber() { return this.value; }
    toFixed(places) { return this.value.toFixed(places); }
    isZero() { return this.value === 0; }
    isNegative() { return this.value < 0; }
    lt(value) { return this.value < new TestDecimal(value).value; }
    lte(value) { return this.value <= new TestDecimal(value).value; }
    static min(left, right) {
        return new TestDecimal(Math.min(new TestDecimal(left).value, new TestDecimal(right).value));
    }
    static max(left, right) {
        return new TestDecimal(Math.max(new TestDecimal(left).value, new TestDecimal(right).value));
    }
    static pow(base, exponent) {
        return new TestDecimal(Math.pow(new TestDecimal(base).value, new TestDecimal(exponent).value));
    }
}

const root = path.join(__dirname, '..');
const thresholdData = JSON.parse(fs.readFileSync(path.join(root, 'js', 'threshold_tables.json'), 'utf8'));
const silentConsole = Object.assign({}, console, {
    groupCollapsed() {},
    groupEnd() {},
    log() {}
});
const context = {
    Decimal: TestDecimal,
    Math,
    Number,
    Infinity,
    console: silentConsole
};
context.window = context;
context.ThresholdRegistry = {
    resolve(type, displayCap, tableId) {
        const tables = thresholdData.tables;
        let id = tableId;
        if (!id) {
            id = Object.keys(tables).find((key) => tables[key].type === type && tables[key].isDefault)
                || Object.keys(tables).find((key) => tables[key].type === type)
                || thresholdData.fallbackTableId;
        }
        const entry = tables[id];
        return {
            tableId: id,
            stages: entry.stages.map((stage) => ({
                limit: stage.limit === null ? Infinity : stage.limit,
                slope: stage.slope
            }))
        };
    }
};

vm.createContext(context);
['damage_calc.js', 'na_dmg_calc.js', 'damage_cap.js'].forEach((filename) => {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', filename), 'utf8'), context, { filename });
});

const baseStats = { _charabuffZoneEffectTotals: {} };
const zhanStats = { _charabuffZoneEffectTotals: { indep_zhan_atk: 0.25 } };
const formulaOptions = {
    isAdvantage: false,
    defense: 10,
    defenseDown: 0,
    randomFactor: 1,
    charIndex: 0,
    ignoreBaseValueAdjustment: true,
    ignoreTestBuffSettings: true
};
const baseRaw = context.calculateDamage(1000000, baseStats, 100, formulaOptions).damage;
const zhanRaw = context.calculateDamage(1000000, zhanStats, 100, formulaOptions).damage;

assert.ok(baseRaw > 0);
assert.ok(Math.abs((zhanRaw / baseRaw) - 1.25) < 1e-10, '25%斩必须作为1.25倍独立乘区进入基础伤害');

const capOptions = {
    charIndex: 0,
    ignoreTestBuffSettings: true,
    effectTotals: {
        na_dmg_cap: 0,
        na_dmg_amp: 0,
        dmg_cap_relaxation: 0,
        taken_dmg_amp: 0
    }
};
const baseCap = context.applyDamageCap(2000000, baseStats, 'na', {}, 0, capOptions);
const zhanCap = context.applyDamageCap(2000000, zhanStats, 'na', {}, 0, capOptions);

assert.strictEqual(baseCap.thresholdTableId, 'na_1.0_44.5');
assert.strictEqual(zhanCap.thresholdTableId, 'na_zhan_116');
assert.ok(zhanCap.decayedDamage > baseCap.decayedDamage, '斩专用平A衰减表必须提高结算伤害');

process.stdout.write('ok - 斩进入独立攻击乘区并自动切换平A专用衰减表\n');
