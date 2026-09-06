'use strict';

const assert = require('assert');

class TestDecimal {
    constructor(value) { this.value = Number(value) || 0; }
    plus(value) { return new TestDecimal(this.value + Number(value instanceof TestDecimal ? value.value : value)); }
    times(value) { return new TestDecimal(this.value * Number(value instanceof TestDecimal ? value.value : value)); }
    ceil() { return new TestDecimal(Math.ceil(this.value)); }
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

let receivedThresholdTableId = '';
global.applyDamageCap = (rawDamage, stats, type, teshu, extraAmp, options) => {
    receivedThresholdTableId = options.thresholdTableId;
    return {
        decayedDamage: 100000,
        capCoef: 1,
        capRelaxation: 0,
        ampCoef: 0.2,
        takenDmgAmpCoef: 0.1,
        thresholdTableId: options.thresholdTableId
    };
};
global.applyWorldCap = (value) => new TestDecimal(value);

const cappedResult = global.SkillDmgCalc.calculateSkillDamage(100000, {}, 100, {
    defense: 10,
    charIndex: 0,
    skillBaseMult: 2,
    applyCap: true,
    capOptions: { thresholdTableId: 'skill_18.5' },
    effectTotals: {
        skill_dmg: 0.5,
        skill_dmg_supp: 112000,
        skill_dmg_amp: 0.2,
        taken_dmg_amp: 0.1
    }
});

assert.strictEqual(receivedThresholdTableId, 'skill_18.5');
assert.strictEqual(cappedResult.value, 279840);
assert.ok(cappedResult.value < cappedResult.undecayedValue);

process.stdout.write('ok - 技伤预测支持无衰减与指定JSON衰减表\n');

// 理论总伤面板：原技能和冴手分别显示，且同一技能的多段只结算一次冴手。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
function createPanelNode() {
    return {
        textContent: '', title: '', style: {}, children: [], hidden: false,
        replaceChildren() { this.children = []; },
        appendChild(child) { this.children.push(child); }
    };
}
const panelNodes = {
    'theoretical-skill-total': createPanelNode(),
    'theoretical-skill-chases': createPanelNode()
};
const chasePanel = panelNodes['theoretical-skill-chases'];
let activeSlot = 0;
const panelContext = {
    Decimal: TestDecimal,
    party: [{ dynamicBuffEntries: [] }],
    document: {
        createElement: createPanelNode,
        querySelector: () => ({ getAttribute: () => String(activeSlot) }),
        getElementById: (id) => panelNodes[id] || null
    },
    BonusDmgCalc: require('../js/bonus_dmg.js'),
    SkillDmgCalc: { calculateSkillDamage: (atk, stats, hp, options) => ({ value: options.skillBaseMult * 1000 }) }
};
panelContext.window = panelContext;
vm.createContext(panelContext);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/na_dmg_calc.js'), 'utf8'), panelContext);
const panelCalcContext = { stats: { weapon_bonus_skill_own_element: 0.1 }, actorElement: 'dark' };
panelContext.updateTheoreticalSkillOutput(0, [{ baseDamage: 5000000, chaseBaseDamage: 5000000 }], panelCalcContext);
assert.strictEqual(panelNodes['theoretical-skill-total'].textContent, (5000000).toLocaleString());
assert.strictEqual(chasePanel.children[0].children[1].textContent, (500000).toLocaleString());
assert.strictEqual(chasePanel.hidden, false);
assert.strictEqual(chasePanel.children[0].children[0].style.color, '#7F45C9');
assert.strictEqual(chasePanel.children[0].children[1].style.color, '#7F45C9');

panelContext.getCheckedDamageSkillSteps = () => [
    { skillId: 'first', skill: { name: '多段技伤' }, action: { damage: { multiplier: 1, hits: 2 } } },
    { skillId: 'first', skill: { name: '多段技伤' }, action: { damage: { multiplier: 2, hits: 3 } } }
];
const perHitNode = { innerHTML: '' };
assert.strictEqual(panelContext.renderCheckedSkillDamageRows(0, perHitNode, panelCalcContext), true);
assert.strictEqual(panelNodes['theoretical-skill-total'].textContent, (8000).toLocaleString());
assert.strictEqual(chasePanel.children[0].children[1].textContent, (800).toLocaleString());
assert.ok(chasePanel.children[0].title.includes('1 HIT'));

panelContext.party[0].dynamicBuffEntries = [{ prop: 'bonus_skill_water', zone: 'chara_skill', value: 0.2 }];
panelContext.updateTheoreticalSkillOutput(0, [{ baseDamage: 1000, chaseBaseDamage: 1000 }], panelCalcContext);
assert.strictEqual(panelNodes['theoretical-skill-total'].textContent, (1000).toLocaleString());
assert.strictEqual(chasePanel.children.length, 2);
const waterRow = chasePanel.children.find((row) => row.children[0].textContent.startsWith('水'));
const darkRow = chasePanel.children.find((row) => row.children[0].textContent.startsWith('暗'));
assert.strictEqual(waterRow.children[1].textContent, '200');
assert.strictEqual(waterRow.children[1].style.color, '#3980D9');
assert.strictEqual(darkRow.children[1].textContent, '100');
panelContext.party[0].dynamicBuffEntries = [];
panelContext.updateTheoreticalSkillOutput(0, [{ baseDamage: 1000, chaseBaseDamage: 1000 }], { stats: {}, actorElement: 'dark' });
assert.strictEqual(chasePanel.children.length, 0);
assert.strictEqual(chasePanel.hidden, true);

activeSlot = 1;
panelContext.updateTheoreticalSkillOutput(0, null);
assert.strictEqual(panelNodes['theoretical-skill-total'].textContent, (1000).toLocaleString());
panelContext.updateTheoreticalSkillOutput(1, null);
assert.strictEqual(panelNodes['theoretical-skill-total'].textContent, '-');
assert.strictEqual(chasePanel.hidden, true);
process.stdout.write('ok - 理论技能输出与冴手分开显示，支持多段、分属性着色、无Buff隐藏及角色切换\n');
