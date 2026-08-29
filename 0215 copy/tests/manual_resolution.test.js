'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const manual = require('../js/sim/manual_resolution.js');
const customSkills = require('../js/sim/manual_custom_skills.js');
const buffDirectory = require('../js/buff_directory.js');
const { BuffRegistry } = require('../js/buff_registry.js');

function run(name, test) {
    test();
    process.stdout.write(`ok - ${name}\n`);
}

function status(id, duration, effects) {
    return {
        id,
        name: id,
        duration,
        effects: effects || []
    };
}

run('旧 turns 字段继续按持续回合解析', () => {
    assert.deepStrictEqual(manual.normalizeDuration({ turns: 3 }), {
        type: 'turns',
        value: 3,
        tick: 'turn_end'
    });
});

run('持续时间支持回合、行动、hit三种类型及别名', () => {
    assert.deepStrictEqual(manual.normalizeDuration({ duration: { type: 'turn', value: 2 } }), {
        type: 'turns', value: 2, tick: 'turn_end'
    });
    assert.deepStrictEqual(manual.normalizeDuration({ duration: { type: 'actions', value: 2 } }), {
        type: 'action', value: 2, tick: 'attack_action_end'
    });
    assert.deepStrictEqual(manual.normalizeDuration({ duration: { type: 'hits', value: 30 } }), {
        type: 'hit', value: 30, tick: 'damage_hit_end'
    });
});

run('持续回合仍只在回合结束时扣除', () => {
    const state = manual.createState();
    manual.applyStatus(state, {
        ownerSlot: 0,
        target: 'self',
        status: status('three_turns', { type: 'turns', value: 3 })
    });
    manual.resolveNormalAttack(state, { actorSlot: 0, mode: 'ta' }, { calculateHit: () => 1 });
    assert.strictEqual(manual.getStatusRemaining(state.actors[0].statuses[0]), 3);
    manual.finishTurn(state);
    assert.strictEqual(manual.getStatusRemaining(state.actors[0].statuses[0]), 2);
});

run('持续行动按完整行动扣除，TA不会被当作三次行动', () => {
    const state = manual.createState();
    manual.applyStatus(state, {
        ownerSlot: 0,
        target: 'self',
        status: status('two_actions', { type: 'action', value: 2 })
    });
    const first = manual.resolveNormalAttack(state, { actorSlot: 0, mode: 'ta' }, { calculateHit: () => 1 });
    assert.strictEqual(first.hitCount, 3);
    assert.strictEqual(manual.getStatusRemaining(state.actors[0].statuses[0]), 1);
    manual.resolveNormalAttack(state, { actorSlot: 0, mode: 'sa' }, { calculateHit: () => 1 });
    assert.strictEqual(state.actors[0].statuses.length, 0);
});

run('持续次数在每个hit后扣除，后续hit重新读取Buff与Debuff', () => {
    const state = manual.createState();
    manual.applyStatus(state, {
        ownerSlot: 0,
        target: 'enemy',
        status: status('next_two_hits', { type: 'hit', value: 2 })
    });
    const seen = [];
    const result = manual.resolveSkillDamage(state, {
        actorSlot: 0,
        hits: 3,
        mult: 1
    }, {
        calculateHit: (hit, context) => {
            seen.push(context.enemyStatuses.some((item) => item.status_id === 'next_two_hits'));
            return 100;
        }
    });
    assert.strictEqual(result.totalDamage, 300);
    assert.deepStrictEqual(seen, [true, true, false]);
    assert.strictEqual(state.enemy.statuses.length, 0);
});

run('lm小美1技能的10段伤害会消耗10次hit持续时间', () => {
    const skillData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'charaskills.json'), 'utf8'));
    const skill = skillData.skills.find((item) => item.id === 'skill_3040547000_1');
    const state = manual.createState();
    manual.applyStatus(state, {
        ownerSlot: 0,
        target: 'enemy',
        status: status('thirty_hit_amp', { type: 'hit', value: 30 })
    });
    const result = manual.resolveSkill(state, skill, { ownerSlot: 2 }, { calculateHit: () => 100000 });
    assert.strictEqual(result.hitCount, 10);
    assert.strictEqual(result.totalDamage, 1000000);
    assert.strictEqual(manual.getStatusRemaining(state.enemy.statuses[0]), 20);
});

run('TA携带一种追击拆成3个基础hit和3个追击hit', () => {
    const state = manual.createState();
    manual.applyStatus(state, {
        ownerSlot: 0,
        target: 'enemy',
        status: status('thirty_hit_amp', { type: 'hit', value: 30 })
    });
    const result = manual.resolveNormalAttack(state, {
        actorSlot: 0,
        mode: 'ta',
        bonusHits: [{ id: 'echo_a', value: 0.2 }]
    }, { calculateHit: () => 1 });
    assert.strictEqual(result.hitCount, 6);
    assert.deepStrictEqual(result.hits.map((entry) => entry.hit.kind), [
        'base', 'bonus', 'base', 'bonus', 'base', 'bonus'
    ]);
    assert.strictEqual(manual.getStatusRemaining(state.enemy.statuses[0]), 24);
});

run('追击可以从角色当前状态中生成独立hit', () => {
    const state = manual.createState();
    manual.applyStatus(state, {
        ownerSlot: 0,
        target: 'self',
        status: status('earth_echo', { type: 'turns', value: 1 }, [{
            prop: 'bonus_na_earth',
            zone: 'A2',
            value: 0.5
        }])
    });
    const result = manual.resolveNormalAttack(state, {
        actorSlot: 0,
        mode: 'da'
    }, { calculateHit: () => 1 });
    assert.strictEqual(result.hitCount, 4);
    assert.strictEqual(result.hits.filter((entry) => entry.hit.kind === 'bonus').length, 2);
});

run('自定义技能目录仅返回拥有正式分区的 Buff 类别', () => {
    const catalog = customSkills.getBuffCatalog();
    assert.strictEqual(catalog.length, 85);
    catalog.forEach((entry) => {
        assert.ok(entry.zones.length > 0, entry.buffType);
        assert.ok(entry.zones.every((zone) => zone.id !== 'testbuff'), entry.buffType);
    });
    assert.ok(customSkills.getBuffType('element_dmg_cut').zones.some((zone) => zone.id === 'charabonus'));
});

run('累积 Buff 使用原加成类别的新分区和独立图标', () => {
    const cumulativeIcons = {
        skill_dmg_supp: 'buff icon/skill_dmg_supp_cumulative.png',
        dmg_cap: 'buff icon/dmg_cap_cumulative.png',
        def_mod: 'buff icon/indep_cumulative_def.png',
        ca_dmg_cap: 'buff icon/ca_dmg_cap_cumulative.png',
        ca_dmg: 'buff icon/ca_dmg_cumulative.png',
        ca_dmg_supp: 'buff icon/ca_dmg_supp_cumulative.png',
        dmg_supp: 'buff icon/dmg_supp_cumulative.png'
    };
    Object.entries(cumulativeIcons).forEach(([buffType, icon]) => {
        const entry = customSkills.getBuffType(buffType);
        const cumulative = entry.zones.find((zone) => zone.id === 'cumulative');
        assert.ok(cumulative, buffType);
        assert.strictEqual(cumulative.rule, 'sum');
        assert.strictEqual(buffDirectory.getBuffDisplayMeta(buffType, 'cumulative').icon, icon);
    });
    assert.strictEqual(
        buffDirectory.getBuffDisplayMeta('skill_dmg_supp', 'cumulative').icon,
        'buff icon/skill_dmg_supp_cumulative.png'
    );
    assert.strictEqual(
        buffDirectory.getBuffDisplayMeta('dmg_cap', 'cumulative').label,
        '全上限【累积】'
    );
    assert.strictEqual(
        buffDirectory.getBuffDisplayMeta('def_mod', 'cumulative').label,
        '防御【累积】'
    );

    const skill = customSkills.buildSkill({
        type: 'buff',
        name: '累积技伤上升测试',
        effects: [{
            target: 'self',
            buffType: 'skill_dmg_supp',
            zone: 'cumulative',
            value: 50000,
            durationType: 'turns',
            durationValue: 3
        }]
    });
    assert.strictEqual(skill.steps[0].prop, 'skill_dmg_supp');
    assert.strictEqual(skill.steps[0].zone, 'cumulative');
    assert.strictEqual(skill.steps[0].icon, 'buff icon/skill_dmg_supp_cumulative.png');
    assert.strictEqual(skill.steps[0].name, '技伤伤害上升【累积】+50000点');

    const registry = new BuffRegistry();
    registry.addByProp('dmg_cap', 'chara_skill', '普通全上限', 0.1);
    registry.addByProp('dmg_cap', 'cumulative', '累积全上限1', 0.02);
    registry.addByProp('dmg_cap', 'cumulative', '累积全上限2', 0.03);
    assert.ok(Math.abs(registry.getTotal('dmg_cap') - 0.15) < 1e-12);
});

run('Buff目录中已配置的图标路径全部存在', () => {
    Object.entries(buffDirectory.BUFF_DIRECTORY).forEach(([buffType, entry]) => {
        if (entry.icon) {
            assert.ok(fs.existsSync(path.join(__dirname, '..', 'images', entry.icon)), `${buffType}: ${entry.icon}`);
        }
        Object.entries(entry.zoneIcons || {}).forEach(([zone, icon]) => {
            assert.ok(fs.existsSync(path.join(__dirname, '..', 'images', icon)), `${buffType}.${zone}: ${icon}`);
        });
    });
});

run('斩Buff绑定专用图标并在独立区取最高值', () => {
    const zhan = customSkills.getBuffType('indep_zhan_atk');
    assert.ok(zhan);
    assert.strictEqual(zhan.label, '独立攻刃【斩】');
    assert.deepStrictEqual(zhan.zones.map((zone) => zone.id), ['independent']);
    assert.strictEqual(zhan.zones[0].rule, 'max');
    assert.strictEqual(
        buffDirectory.getBuffDisplayMeta('indep_zhan_atk', 'independent').icon,
        'buff icon/zhan.png'
    );

    const registry = new BuffRegistry();
    registry.addByProp('indep_zhan_atk', 'independent', '斩25%', 0.25);
    registry.addByProp('indep_zhan_atk', 'independent', '斩50%', 0.5);
    assert.strictEqual(registry.getTotal('indep_zhan_atk'), 0.5);
});

run('自定义强化技能会生成多条标准 buff steps', () => {
    const skill = customSkills.buildSkill({
        type: 'buff',
        name: '测试复合强化',
        effects: [
            {
                target: 'ally_party',
                buffType: 'normal_atk',
                zone: 'chara_skill',
                value: 30,
                durationType: 'turns',
                durationValue: 3
            },
            {
                target: 'self',
                buffType: 'bonus_na',
                subtype: 'water',
                zone: 'E',
                value: 20,
                durationType: 'action',
                durationValue: 2
            },
            {
                target: 'enemy',
                buffType: 'dmg_supp',
                zone: 'enemy_db',
                value: 100000,
                durationType: 'hit',
                durationValue: 30
            }
        ]
    });
    assert.strictEqual(skill.steps.length, 3);
    assert.strictEqual(skill.steps[0].value, 0.3);
    assert.strictEqual(skill.steps[0].duration.type, 'turns');
    assert.strictEqual(skill.steps[1].prop, 'bonus_na_water');
    assert.strictEqual(skill.steps[1].value, 0.2);
    assert.strictEqual(skill.steps[2].format, 'fixed');
    assert.strictEqual(skill.steps[2].value, 100000);
    assert.strictEqual(skill.steps[2].duration.value, 30);
});

run('自定义伤害技能在精确表和模糊上限之间二选一', () => {
    const exact = customSkills.buildSkill({
        type: 'damage',
        name: '10hit精确技伤',
        multiplier: 1,
        hits: 10,
        decayMode: 'exact',
        thresholdTable: 'skill_10.75'
    });
    assert.strictEqual(exact.steps[0].threshold_table, 'skill_10.75');
    assert.strictEqual(Object.hasOwn(exact.steps[0], 'cap'), false);

    const fuzzy = customSkills.buildSkill({
        type: 'damage',
        name: '10hit模糊技伤',
        multiplier: 1,
        hits: 10,
        decayMode: 'fuzzy',
        cap: 100000
    });
    assert.strictEqual(fuzzy.steps[0].cap, 100000);
    assert.strictEqual(Object.hasOwn(fuzzy.steps[0], 'threshold_table'), false);
});

run('手动逐hit结算保留自定义技能的衰减表ID', () => {
    const skill = customSkills.buildSkill({
        type: 'damage',
        name: '衰减表传递',
        multiplier: 1,
        hits: 2,
        decayMode: 'exact',
        thresholdTable: 'skill_test'
    });
    const result = manual.resolveSkill(manual.createState(), skill, { ownerSlot: 1 }, { calculateHit: () => 1 });
    assert.deepStrictEqual(result.hits.map((entry) => entry.hit.thresholdTableId), ['skill_test', 'skill_test']);
});

run('自定义技能可在本地技能库中新建、复制和删除', () => {
    const data = {};
    const storage = {
        getItem: (key) => Object.hasOwn(data, key) ? data[key] : null,
        setItem: (key, value) => { data[key] = String(value); }
    };
    customSkills.load(storage);
    const saved = customSkills.save({
        type: 'damage',
        name: '本地技能',
        multiplier: 2,
        hits: 3,
        decayMode: 'fuzzy',
        cap: 200000
    }, storage);
    assert.strictEqual(customSkills.list().length, 1);
    const copied = customSkills.duplicate(saved.id, storage);
    assert.strictEqual(customSkills.list().length, 2);
    assert.notStrictEqual(copied.id, saved.id);
    assert.strictEqual(customSkills.remove(saved.id, storage), true);
    assert.strictEqual(customSkills.list().length, 1);
});
