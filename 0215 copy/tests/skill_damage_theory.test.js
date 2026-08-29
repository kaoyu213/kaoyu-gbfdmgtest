'use strict';

const assert = require('assert');

class TestDecimal {
    constructor(value) { this.value = Number(value) || 0; }
    plus(value) { return new TestDecimal(this.value + Number(value instanceof TestDecimal ? value.value : value)); }
    times(value) { return new TestDecimal(this.value * Number(value instanceof TestDecimal ? value.value : value)); }
    toNumber() { return this.value; }
}

global.window = global;
global.Decimal = TestDecimal;
global.currentParty = [{ chara_earring_dmg_supp: 6 }];
global.getEarringDmgSuppFromLevel = (level) => Number(level || 0) * 2000;
global.getTeshuStats = () => ({});
global.getAllEffectsTotalForSlot = () => 999999;
global.calculateAmp = (stats, type, teshu, options) => Number(options.effectTotals.skill_dmg_amp) || 0;
global.calculateTakenDamageAmp = (options) => Number(options.effectTotals.taken_dmg_amp) || 0;
global.CaDmgCalc = {
    getEffectiveDefense: (defense) => defense,
    getBaseDamageBeforeDefense: () => 1000000,
    getCritMultiplier: () => 1
};

require('../js/skill_dmg_calc.js');

const result = global.SkillDmgCalc.calculateSkillDamage(100000, {}, 100, {
    defense: 10,
    charIndex: 0,
    skillBaseMult: 2,
    applyCap: false,
    effectTotals: {
        skill_dmg: 0.5,
        skill_dmg_supp: 112000,
        skill_dmg_amp: 0.2,
        taken_dmg_amp: 0.1
    }
});

assert.strictEqual(result.steps.afterMultCrit, 250000);
assert.strictEqual(result.steps.afterSupp, 362000);
assert.strictEqual(result.steps.afterAmp, 434400);
assert.ok(Math.abs(result.steps.final - 477840) < 1e-6);
assert.strictEqual(result.undecayedValue, Math.ceil(result.steps.final));
assert.strictEqual(result.theoryValue, result.undecayedValue);
assert.strictEqual(result.skillDmgBonusUsed, 0.5);
assert.strictEqual(result.skillAmpUsed, 0.2);
assert.strictEqual(result.takenDmgAmpUsed, 0.1);

process.stdout.write('ok - 技伤无衰减理论值使用当前完整加成且不读取旧缓存\n');
