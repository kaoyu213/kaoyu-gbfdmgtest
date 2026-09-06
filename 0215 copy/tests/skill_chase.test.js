'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const bonus = require('../js/bonus_dmg.js');
const manual = require('../js/sim/manual_resolution.js');
const custom = require('../js/sim/manual_custom_skills.js');

function run(name, test) {
    test();
    process.stdout.write(`ok - ${name}\n`);
}
const chase = (element, zone, value) => ({ prop: 'bonus_skill_' + element, zone, value });
const damageSkill = { id: 'five_hits', steps: [{ do: 'damage', mult: 1, hits: 5, element: 'fire' }] };

function setup(hitDuration = 6) {
    const state = manual.createState();
    state.actors[0].element = 'fire';
    state.actors[0].stats = { weapon_bonus_skill_own_element: 0.1 };
    for (const target of ['self', 'enemy']) manual.applyStatus(state, {
        ownerSlot: 0, target,
        status: { id: target + '_limited', duration: { type: 'hit', value: hitDuration }, effects: [] }
    });
    return state;
}

run('冴手定义界面只开放六属性和三个分区，百分数转成小数保存', () => {
    const entry = custom.getBuffCatalog('ally').find((item) => item.buffType === 'bonus_skill');
    assert.deepStrictEqual(entry.subtypes, ['fire', 'water', 'earth', 'wind', 'light', 'dark']);
    assert.deepStrictEqual(entry.zones.map((item) => item.id), ['weapon_grid', 'chara_skill', 'independent']);
    const skill = custom.buildSkill({ type: 'buff', name: '冴手', effects: [{
        target: 'self', buffType: 'bonus_skill', subtype: 'water', zone: 'chara_skill',
        value: 10, durationType: 'permanent'
    }] });
    assert.strictEqual(skill.steps[0].prop, 'bonus_skill_water');
    assert.strictEqual(skill.steps[0].value, 0.1);
    assert.throws(() => custom.buildSkill({ type: 'buff', name: '无效冴手', effects: [{
        target: 'self', buffType: 'bonus_skill', subtype: 'destruction', zone: 'chara_skill',
        value: 10, durationType: 'permanent'
    }] }));
});

run('武器自属性映射、同属性同区取高、独立区相加，分区和属性分别保留', () => {
    const effects = bonus.resolveSkillChaseEffects({
        actorElement: '火', stats: { weapon_bonus_skill_own_element: 0.3, weapon_bonus_skill_destruction: 0.2 },
        dynamicBuffEntries: [
            chase('fire', 'weapon_grid', 0.1), chase('fire', 'chara_skill', 0.1),
            chase('fire', 'chara_skill', 0.2), chase('water', 'chara_skill', 0.3),
            chase('fire', 'independent', 0.1), chase('fire', 'independent', 0.2)
        ]
    });
    assert.strictEqual(effects.length, 4);
    const find = (element, zone) => effects.find((effect) => effect.element === element && effect.zone === zone).pct;
    assert.strictEqual(find('fire', 'weapon_grid'), 0.2);
    assert.strictEqual(find('fire', 'chara_skill'), 0.2);
    assert.strictEqual(find('water', 'chara_skill'), 0.3);
    assert.ok(Math.abs(find('fire', 'independent') - 0.3) < 1e-10);
    assert.deepStrictEqual(bonus.resolveSkillChaseEffects({ dynamicBuffEntries: [chase('fire', 'invalid', 1), chase('fire', 'independent', Infinity)] }), []);
});

run('5 hit 技伤加1 hit冴手只消耗5次己方Buff和敌方Debuff', () => {
    const state = setup();
    let calculated = 0;
    let callbacks = 0;
    const result = manual.resolveSkill(state, damageSkill, { ownerSlot: 0 }, {
        calculateHit: () => { calculated++; return 1000000; },
        afterHit: () => { callbacks++; }
    });
    assert.strictEqual(result.baseSkillDamage, 5000000);
    assert.strictEqual(result.skillChaseDamage, 500000);
    assert.strictEqual(result.totalDamage, 5500000);
    assert.strictEqual(result.hitCount, 6);
    assert.strictEqual(calculated, 5);
    assert.strictEqual(callbacks, 5);
    assert.strictEqual(manual.getStatusRemaining(state.enemy.statuses[0]), 1);
    assert.strictEqual(manual.getStatusRemaining(state.actors[0].statuses[0]), 1);
    assert.strictEqual(result.hits[5].hit.consumesHitDurations, false);
    assert.strictEqual(result.hits[5].durationChanges, null);
});

run('原技能中途次数到期时按各hit实际最终伤害求和，不重新计算追击予伤', () => {
    const state = setup(2);
    const result = manual.resolveSkill(state, damageSkill, { ownerSlot: 0 }, {
        calculateHit: (hit, context) => context.enemyStatuses.length ? 1200000 : 1000000
    });
    assert.strictEqual(result.baseSkillDamage, 5400000);
    assert.strictEqual(result.skillChaseDamage, 540000);
    assert.strictEqual(result.hitCount, 6);
    assert.strictEqual(state.enemy.statuses.length, 0);
});

run('一个技能含多个伤害步骤时只按完整技能总和追加一次冴手', () => {
    const state = setup(20);
    const result = manual.resolveSkill(state, { steps: [
        { do: 'damage', mult: 1, hits: 2, element: 'fire' },
        { do: 'damage', mult: 2, hits: 3, element: 'water' }
    ] }, { ownerSlot: 0 }, { calculateHit: (hit) => hit.multiplier * 1000 });
    assert.strictEqual(result.totalDamage, 8800);
    assert.strictEqual(result.hitCount, 6);
    assert.strictEqual(result.skillChaseHits.length, 1);
});

run('运行时角色冴手Buff生效且到期移除，零伤害/无属性/奥义不触发', () => {
    const state = setup(30);
    state.actors[0].stats = {};
    manual.applyStatus(state, { ownerSlot: 0, target: 'self', status: {
        id: 'water_chase', duration: { type: 'turns', value: 1 },
        effects: [{ formula: chase('water', 'chara_skill', 0.2) }]
    } });
    const opts = { calculateHit: () => 1000 };
    assert.strictEqual(manual.resolveSkill(state, damageSkill, { ownerSlot: 0 }, opts).skillChaseDamage, 1000);
    for (const spec of [{ hits: 2, element: 'non_elemental' }, { hits: 2, damage_type: 'ca' }, { hits: 2, damage_type: 'normal_attack' }]) {
        assert.strictEqual(manual.resolveSkillDamage(state, spec, opts).skillChaseHits.length, 0);
    }
    assert.strictEqual(manual.resolveSkill(state, damageSkill, { ownerSlot: 0 }, { calculateHit: () => 0 }).skillChaseHits.length, 0);
    manual.finishTurn(state);
    assert.strictEqual(manual.resolveSkill(state, damageSkill, { ownerSlot: 0 }, opts).skillChaseDamage, 0);
});

run('冴手没有独立衰减或世界上限，按最终总伤害乘比例向上取整', () => {
    const effects = [{ element: 'dark', zone: 'chara_skill', pct: 0.5 }];
    assert.strictEqual(bonus.calcSkillChaseDamage(20000001, effects)[0].damage, 10000001);
});

run('手动时间轴透传武器冴手来源并同步HIT、角色和总伤害', () => {
    const result = manual.resolveTimeline([{ blocks: [{ id: 'skill', type: 'damage', actorSlot: 0, steps: damageSkill.steps }] }], {
        calculateHit: () => 1000,
        getSkillChaseEffects: () => [{ element: 'fire', zone: 'weapon_grid', pct: 0.1 }]
    });
    assert.strictEqual(result.hitCountByBlockId.skill, 6);
    assert.strictEqual(result.damageByBlockId.skill, 5500);
    assert.strictEqual(result.byCharacter[0], 5500);
    assert.strictEqual(result.totalDamage, 5500);
});

// 用浏览器模块的真实执行器验证完整技能、插入触发及无事件内核的备用路径。
function createBurstHarness() {
    const context = { console, party: [{ element: '火' }], currentParty: [],
        document: { getElementById: () => null },
        formatNumber: (value) => String(value),
        SkillDmgCalc: { calculateSkillDamage: (atk, stats, hp, opts) => ({ value: 1000 + (opts.effectTotals.skill_dmg_supp || 0) }) }
    };
    context.window = context;
    vm.createContext(context);
    const root = path.join(__dirname, '..', 'js');
    for (const file of ['buff_directory.js', 'buff_zones.js', 'buff_registry.js', 'bonus_dmg.js', 'sim/status_resolver.js', 'sim/manual_resolution.js', 'sim/resolution_engine.js', 'sim/sim_burst.js']) {
        let source = fs.readFileSync(path.join(root, file), 'utf8');
        if (file === 'sim/sim_burst.js') source = source.replace('window.BurstSimulator = {',
            'window.testApi = { createResolutionRuntime, calculateSkillAction, getResolvedSkillActions }; window.BurstSimulator = {');
        vm.runInContext(source, context, { filename: file });
    }
    const state = context.ManualBattleResolution.createState();
    state.turn = 1;
    state.cooldowns = {};
    state.simulationBaseSnapshot = { actors: { 0: { stats: { weapon_bonus_skill_own_element: 0.1 }, panelAttack: 1000, effectTotals: {}, isAdvantage: false } } };
    context.ManualBattleResolution.applyStatus(state, { target: 'enemy', ownerSlot: 0, status: {
        id: 'six_hits', duration: { type: 'hit', value: 6 }, effects: [{ formula: { prop: 'taken_dmg_supp', zone: 'enemy_db', value: 100 } }]
    } });
    const result = { totalDamage: 0, byCharacter: {}, events: [], logs: [] };
    const action = { id: 'cast', type: 'skill', ownerSlot: 0, skillId: damageSkill.id, skill: damageSkill };
    return { context, state, result, action };
}

for (const useRuntime of [false, true]) run(`爆发模拟${useRuntime ? '事件内核' : '备用路径'}与手动一致：5+1hit、Debuff剩1次`, () => {
    const { context, state, result, action } = createBurstHarness();
    const runtime = useRuntime ? context.testApi.createResolutionRuntime(state) : null;
    context.testApi.calculateSkillAction(action, result, state, runtime);
    assert.strictEqual(result.totalDamage, 6050);
    assert.strictEqual(result.events[0].hitCount, 6);
    assert.strictEqual(result.events[0].skillChaseDamage, 550);
    assert.strictEqual(state.enemy.statuses[0].remaining_hits, 1);
    context.testApi.calculateSkillAction(Object.assign({}, action, { id: 'second_cast' }), result, state, runtime);
    assert.strictEqual(result.totalDamage, 11660);
    assert.strictEqual(result.events[1].skillChaseDamage, 510);
    assert.strictEqual(state.enemy.statuses.length, 0);
});

run('自动触发的多步骤技能按自身完整伤害追加冴手，不递归复制', () => {
    const { context, state, result, action } = createBurstHarness();
    const runtime = context.testApi.createResolutionRuntime(state);
    runtime.registerTriggerSource({ id: 'auto_skill', ownerSlot: 0, skillId: 'auto_skill', trigger: { event: 'test_event' }, steps: [
        { do: 'damage', mult: 1, hits: 2, element: 'fire' },
        { do: 'damage', mult: 1, hits: 3, element: 'water' }
    ] });
    runtime.emitLifecycle('test_event', {}, { result, action, battleState: state });
    assert.strictEqual(result.totalDamage, 6050);
    assert.strictEqual(result.events[0].skillChaseHits.length, 1);
    assert.strictEqual(state.enemy.statuses[0].remaining_hits, 1);
});
