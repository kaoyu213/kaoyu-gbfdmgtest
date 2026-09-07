'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const manual = require('../js/sim/manual_resolution.js');
const customSkills = require('../js/sim/manual_custom_skills.js');
const buffDirectory = require('../js/buff_directory.js');
const buffZones = require('../js/buff_zones.js');
const { BuffRegistry } = require('../js/buff_registry.js');
const statusResolver = require('../js/sim/status_resolver.js');

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

function stackSkill(mode, overrides = {}) {
    return customSkills.buildSkill(Object.assign({
        id: `test_stack_${mode}`, type: 'buff', name: mode === 'scale' ? '蓄势强化' : '阶梯强化',
        stacking: { mode, max: 3, add: 1, target: 'self', durationType: 'permanent' },
        effects: mode === 'scale'
            ? [{ buffType: 'normal_atk', value: 10 }, { buffType: 'dmg_supp', value: 1000 }]
            : [{ buffType: 'normal_atk', value: 10, unlockStacks: 1 },
                { buffType: 'def_mod', value: 20, unlockStacks: 2 },
                { buffType: 'dmg_supp', value: 3000, unlockStacks: 3 }]
    }, overrides));
}

function stackEntries(state, slot = 0) {
    return statusResolver.collectZoneEntriesFromStatuses(state.actors[slot].statuses);
}

run('叠层强化共用一个状态，百分比和固定值按层数相乘且达到上限停止', () => {
    const skill = stackSkill('scale');
    assert.strictEqual(skill.steps.length, 1);
    assert.strictEqual(skill.buff_display_mode, 'large');
    assert.ok(skill.steps[0].effects.every((effect) => effect.formula.zone === 'independent'));
    const state = manual.createState();
    for (let i = 1; i <= 5; i++) {
        manual.resolveSkill(state, skill, { ownerSlot: 0 });
        assert.strictEqual(state.actors[0].statuses.length, 1);
        assert.strictEqual(state.actors[0].statuses[0].stacks, Math.min(i, 3));
        const entries = stackEntries(state);
        assert.ok(Math.abs(entries[0].value - Math.min(i, 3) * 0.1) < 1e-9);
        assert.strictEqual(entries[1].value, Math.min(i, 3) * 1000);
    }
    const icon = manual.projectStatusBuffs(state.actors[0].statuses)[0];
    assert.strictEqual(icon.initial, '蓄');
    assert.strictEqual(icon.stacks, 3);
    assert.ok(icon.tooltip.includes('+30%'));
    assert.ok(icon.tooltip.includes('3,000'));
    assert.ok(icon.tooltip.includes('当前3层 / 上限3层'));
    assert.strictEqual(skill.steps[0].effects[0].formula.value, 0.1, '投影不能修改技能定义');
});

run('依序强化逐层累计A、A+B、A+B+C，之前解锁效果不重复倍乘', () => {
    const skill = stackSkill('tier');
    const state = manual.createState();
    for (let count = 1; count <= 3; count++) {
        manual.resolveSkill(state, skill, { ownerSlot: 0 });
        const entries = stackEntries(state);
        assert.deepStrictEqual(entries.map((entry) => entry.prop), ['normal_atk', 'def_mod', 'dmg_supp'].slice(0, count));
        assert.deepStrictEqual(entries.map((entry) => entry.value), [0.1, 0.2, 3000].slice(0, count));
        assert.strictEqual(manual.projectStatusBuffs(state.actors[0].statuses).length, 1);
    }
});

run('依序强化可同层解锁多项并从未解锁状态跨层解锁', () => {
    const skill = stackSkill('tier', {
        effects: [{ buffType: 'normal_atk', value: 10, unlockStacks: 2 },
            { buffType: 'dmg_cap', value: 5, unlockStacks: 2 }]
    });
    const state = manual.createState();
    manual.resolveSkill(state, skill, { ownerSlot: 0 });
    assert.deepStrictEqual(stackEntries(state), []);
    assert.ok(manual.projectStatusBuffs(state.actors[0].statuses)[0].tooltip.includes('尚未解锁'));
    manual.resolveSkill(state, skill, { ownerSlot: 0 });
    assert.strictEqual(stackEntries(state).length, 2);
});

run('首次数值也受层数上限限制，重复施加保留定义的每次增加量', () => {
    const skill = stackSkill('scale', {
        stacking: { mode: 'scale', max: 3, add: 5, durationType: 'permanent' }
    });
    const state = manual.createState();
    manual.resolveSkill(state, skill, { ownerSlot: 0 });
    assert.strictEqual(state.actors[0].statuses[0].stacks, 3);
    assert.strictEqual(manual.createRuntimeStatus({ stacking: { mode: 'add', max: 2, add: 8 } }).stacks, 2);
});

run('全体叠层各自独立，同名不同技能不共用计层', () => {
    const party = stackSkill('scale', { stacking: { mode: 'scale', target: 'ally_party', max: 3, add: 1, durationType: 'permanent' } });
    const self = stackSkill('scale');
    const unrelated = stackSkill('scale', { id: 'another_same_name' });
    const state = manual.createState();
    manual.resolveSkill(state, party, { ownerSlot: 0 });
    manual.resolveSkill(state, self, { ownerSlot: 1 });
    assert.deepStrictEqual([0, 1, 2, 3].map((slot) => state.actors[slot].statuses[0].stacks), [1, 2, 1, 1]);
    assert.strictEqual(state.actors[4].statuses.length, 0);
    manual.resolveSkill(state, unrelated, { ownerSlot: 1 });
    assert.strictEqual(state.actors[1].statuses.length, 2);
});

run('叠层统一持续时间可刷新或保留，到期整组移除后重新从首层开始', () => {
    for (const refreshDuration of [true, false]) {
        const skill = stackSkill('scale', { stacking: {
            mode: 'scale', max: 3, add: 1, durationType: 'turns', durationValue: 2, refreshDuration
        } });
        const state = manual.createState();
        manual.resolveSkill(state, skill, { ownerSlot: 0 });
        manual.finishTurn(state);
        manual.resolveSkill(state, skill, { ownerSlot: 0 });
        assert.strictEqual(manual.getStatusRemaining(state.actors[0].statuses[0]), refreshDuration ? 2 : 1);
        manual.finishTurn(state);
        if (refreshDuration) manual.finishTurn(state);
        assert.strictEqual(state.actors[0].statuses.length, 0);
        manual.resolveSkill(state, skill, { ownerSlot: 0 });
        assert.strictEqual(state.actors[0].statuses[0].stacks, 1);
    }
});

run('持续行动的叠层Buff覆盖完整TA并统一到期，不对每个效果单独扣次', () => {
    const skill = stackSkill('scale', { stacking: {
        mode: 'scale', max: 3, add: 2, durationType: 'action', durationValue: 1
    } });
    const state = manual.createState();
    manual.resolveSkill(state, skill, { ownerSlot: 0 });
    const amounts = [];
    manual.resolveNormalAttack(state, { actorSlot: 0, mode: 'ta' }, { calculateHit: () => {
        amounts.push(stackEntries(state)[0].value);
        return 1;
    } });
    assert.deepStrictEqual(amounts, [0.2, 0.2, 0.2]);
    assert.strictEqual(state.actors[0].statuses.length, 0);
});

run('伤害后叠层使用旧层数结算伤害，再获得新层数', () => {
    const skill = stackSkill('scale', { damages: [{ multiplier: 1, hits: 2, decayMode: 'fuzzy', cap: 100000 }] });
    const state = manual.createState();
    const seen = [];
    for (let i = 0; i < 3; i++) manual.resolveSkill(state, skill, { ownerSlot: 0 }, {
        calculateHit: () => { seen.push(stackEntries(state)[0]?.value || 0); return 100; }
    });
    assert.deepStrictEqual(seen, [0, 0, 0.1, 0.1, 0.2, 0.2]);
});

run('伤害后增加层数但不刷新时，原行动持续次数仍被本次伤害消耗', () => {
    for (const refreshDuration of [false, true]) {
        const skill = stackSkill('scale', {
            stacking: { mode: 'scale', max: 3, add: 1, durationType: 'action', durationValue: 2, refreshDuration },
            damages: [{ multiplier: 1, hits: 1, decayMode: 'fuzzy', cap: 100000 }]
        });
        const result = manual.resolveTimeline([{ number: 1, blocks: [0, 1].map((index) => ({
            id: `stack_damage_${index}`, type: 'buff', actorSlot: 0, skillId: skill.id, steps: skill.steps
        })) }], { calculateHit: () => 100 });
        assert.strictEqual(result.state.actors[0].statuses[0].stacks, 2);
        assert.strictEqual(manual.getStatusRemaining(result.state.actors[0].statuses[0]), refreshDuration ? 2 : 1);
    }
});

run('时间轴删除、移动和修改技能后从头重算层数、图标及伤害', () => {
    let skill = stackSkill('scale');
    const block = (id) => ({ id, type: 'buff', skillId: skill.id, actorSlot: 0, steps: skill.steps });
    const action = { id: 'attack', type: 'actor_action', actorSlot: 0, actionMode: 'sa' };
    const evaluate = (blocks) => manual.resolveTimeline([{ number: 1, blocks }], {
        getSkillById: () => skill,
        calculateHit: (hit, context) => 100 * (1 + statusResolver.collectZoneEntriesFromStatuses(context.actorStatuses)
            .filter((entry) => entry.prop === 'normal_atk').reduce((sum, entry) => sum + entry.value, 0))
    });
    const first = block('first'), second = block('second');
    const full = evaluate([first, second, action]);
    assert.strictEqual(full.buffsByBlockId.attack[0].stacks, 2);
    assert.strictEqual(full.damageByBlockId.attack, 120);
    assert.strictEqual(evaluate([first, action]).buffsByBlockId.attack[0].stacks, 1);
    assert.strictEqual(evaluate([first, action, second]).buffsByBlockId.attack[0].stacks, 1);
    assert.deepStrictEqual(evaluate([action]).buffsByBlockId.attack, []);
    skill = stackSkill('scale', { effects: [{ buffType: 'normal_atk', value: 20 }] });
    assert.strictEqual(evaluate([first, second, action]).damageByBlockId.attack, 140);
});

run('叠层追击按当前层数计算；依序追击未解锁时不产生额外hit', () => {
    const state = manual.createState();
    const scale = stackSkill('scale', { effects: [{ buffType: 'bonus_na', subtype: 'water', zone: 'E', value: 10 }] });
    manual.resolveSkill(state, scale, { ownerSlot: 0 });
    manual.resolveSkill(state, scale, { ownerSlot: 0 });
    assert.strictEqual(manual.collectBonusHitSources(state, 0)[0].value, 0.2);
    const tierState = manual.createState();
    const tier = stackSkill('tier', { effects: [{ buffType: 'bonus_na', subtype: 'water', zone: 'E', value: 10, unlockStacks: 2 }] });
    manual.resolveSkill(tierState, tier, { ownerSlot: 0 });
    assert.strictEqual(manual.resolveNormalAttack(tierState, { actorSlot: 0, mode: 'ta' }, { calculateHit: () => 1 }).hitCount, 3);
    manual.resolveSkill(tierState, tier, { ownerSlot: 0 });
    assert.strictEqual(manual.resolveNormalAttack(tierState, { actorSlot: 0, mode: 'ta' }, { calculateHit: () => 1 }).hitCount, 6);
});

run('敌方叠层DB在hit耗尽前逐hit生效，到期整组清除', () => {
    const skill = stackSkill('scale', { stacking: {
        mode: 'scale', target: 'enemy', max: 3, add: 2, durationType: 'hit', durationValue: 2
    }, effects: [{ buffType: 'taken_dmg_supp', zone: 'enemy_db', value: 1000 }] });
    const state = manual.createState();
    manual.resolveSkill(state, skill, { ownerSlot: 0 });
    const seen = [];
    manual.resolveNormalAttack(state, { actorSlot: 0, mode: 'ta' }, { calculateHit: () => {
        seen.push(statusResolver.collectZoneEntriesFromStatuses(state.enemy.statuses)[0]?.value || 0);
        return 1;
    } });
    assert.deepStrictEqual(seen, [2000, 2000, 0]);
});

run('叠层定义校验层数和门槛，不允许将二动三动当作数值倍乘', () => {
    for (const value of [0, -1, 1.5, Infinity]) {
        assert.throws(() => stackSkill('scale', { stacking: { mode: 'scale', max: value } }), /正整数/);
    }
    assert.throws(() => stackSkill('tier', { effects: [{ buffType: 'normal_atk', value: 10, unlockStacks: 4 }] }), /超过/);
    assert.throws(() => stackSkill('scale', { effects: [{ buffType: 'double_strike', value: 2 }] }), /不能按层数相乘/);
    const tier = stackSkill('tier', { effects: [{ buffType: 'double_strike', value: 2, unlockStacks: 2 }] });
    assert.strictEqual(tier.steps[0].effects[0].min_stacks, 2);
});

run('叠层自定义技能保存、重新载入、编辑及复制均保留层数定义', () => {
    const data = {};
    const storage = { getItem: (key) => data[key] || null, setItem: (key, value) => { data[key] = value; } };
    customSkills.load(storage);
    const original = stackSkill('tier');
    const saved = customSkills.save(Object.assign({ id: original.id }, original.manual_definition), storage);
    customSkills.load(storage);
    assert.deepStrictEqual(customSkills.get(saved.id).steps, saved.steps);
    const copy = customSkills.duplicate(saved.id, storage);
    assert.deepStrictEqual(copy.manual_definition.stacking, saved.manual_definition.stacking);
    assert.notStrictEqual(copy.steps[0].id, saved.steps[0].id);
    const edited = customSkills.save(Object.assign({ id: saved.id }, saved.manual_definition, {
        stacking: Object.assign({}, saved.manual_definition.stacking, { add: 2 })
    }), storage);
    assert.strictEqual(edited.steps[0].stacking.add, 2);
    assert.strictEqual(edited.steps[0].id, saved.steps[0].id);
});

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

run('永久Buff不需要持续数值并在悬停信息中显示永久', () => {
    const skill = customSkills.buildSkill({
        type: 'buff',
        name: '永久强化',
        effects: [{
            target: 'self',
            buffType: 'normal_atk',
            zone: 'independent',
            value: 10,
            durationType: 'permanent'
        }]
    });
    assert.deepStrictEqual(skill.steps[0].duration, { type: 'permanent' });
    const state = manual.createState();
    manual.resolveSkill(state, skill, { ownerSlot: 0 }, { calculateHit: () => 0 });
    const displayed = manual.projectStatusBuffs(state.actors[0].statuses);
    assert.ok(displayed[0].tooltip.includes('永久'));
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

run('基础行动选择不行动时为0hit且不消耗持续行动Buff', () => {
    const state = manual.createState();
    manual.applyStatus(state, {
        ownerSlot: 0,
        target: 'self',
        status: status('one_action', { type: 'action', value: 1 })
    });
    const result = manual.resolveAction(state, {
        type: 'actor_action',
        actorSlot: 0,
        mode: 'none'
    }, { calculateHit: () => 999999 });
    assert.strictEqual(result.type, 'no_action');
    assert.strictEqual(result.hitCount, 0);
    assert.strictEqual(result.totalDamage, 0);
    assert.strictEqual(manual.getStatusRemaining(state.actors[0].statuses[0]), 1);
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

run('手动时间轴删除狂怒3后会重新投影并清除角色Buff图标', () => {
    const skillData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'charaskills.json'), 'utf8'));
    const rage = skillData.skills.find((item) => item.id === 'mc_skill_rage_3');
    const actions = [0, 1, 2, 3].map((actorSlot) => ({
        id: `turn_1_action_${actorSlot}`,
        type: 'actor_action',
        actorSlot,
        actionMode: 'ta'
    }));
    actions.splice(1, 0, {
        id: 'turn_1_extra_action_0',
        type: 'extra_action',
        actorSlot: 0,
        actionMode: 'ta'
    });
    const rageBlock = {
        id: 'rage_block',
        type: 'buff',
        actorSlot: 0,
        skillId: rage.id,
        steps: rage.steps
    };
    const turns = [{ number: 1, blocks: [rageBlock, ...actions] }];

    const applied = manual.projectTimelineBuffs(turns, { actorCount: 4 });
    actions.forEach((action) => {
        assert.deepStrictEqual(applied[action.id].map((buff) => buff.icon), ['buff icon/normal_atk.png']);
    });

    turns[0].blocks.splice(0, 1);
    const removed = manual.projectTimelineBuffs(turns, { actorCount: 4 });
    actions.forEach((action) => assert.deepStrictEqual(removed[action.id], []));
});

run('已放置技能按skillId读取更新后的技能效果', () => {
    const staleSteps = [{
        do: 'buff',
        id: 'editable_effect',
        target: 'self',
        name: '旧效果+10%',
        prop: 'normal_atk',
        zone: 'chara_skill',
        value: 0.1,
        duration: { type: 'permanent' }
    }];
    const latestSkill = {
        id: 'editable_skill',
        name: '更新后的技能',
        steps: [{
            do: 'buff',
            id: 'editable_effect',
            target: 'self',
            name: '新效果+30%',
            prop: 'normal_atk',
            zone: 'chara_skill',
            value: 0.3,
            duration: { type: 'permanent' }
        }]
    };
    const result = manual.resolveTimeline([{
        number: 1,
        blocks: [{
            id: 'placed_skill_block',
            type: 'buff',
            actorSlot: 0,
            skillId: latestSkill.id,
            steps: staleSteps
        }, {
            id: 'actor_action_0',
            type: 'actor_action',
            fixed: true,
            actorSlot: 0,
            actionMode: 'sa'
        }]
    }], {
        actorCount: 4,
        getSkillById: (skillId) => skillId === latestSkill.id ? latestSkill : null,
        calculateHit: () => 0
    });
    const applied = result.state.actors[0].statuses[0];
    assert.strictEqual(applied.name, '新效果+30%');
    assert.strictEqual(applied.effects[0].formula.value, 0.3);
});

run('狂怒3移动到行动后只影响后续角色行动', () => {
    const skillData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'charaskills.json'), 'utf8'));
    const rage = skillData.skills.find((item) => item.id === 'mc_skill_rage_3');
    const first = { id: 'before_rage', type: 'actor_action', actorSlot: 0, actionMode: 'sa' };
    const second = { id: 'after_rage', type: 'actor_action', actorSlot: 1, actionMode: 'sa' };
    const projected = manual.projectTimelineBuffs([{
        number: 1,
        blocks: [first, { id: 'rage', type: 'buff', actorSlot: 0, steps: rage.steps }, second]
    }], { actorCount: 4 });

    assert.deepStrictEqual(projected.before_rage, []);
    assert.deepStrictEqual(projected.after_rage.map((buff) => buff.statusId), ['status_rage_3_normal_atk']);
});

run('手动时间轴TA逐hit计算并把三次平A相加到方块与角色汇总', () => {
    const seen = [];
    const result = manual.resolveTimeline([{
        number: 1,
        blocks: [{ id: 'mc_ta', type: 'actor_action', actorSlot: 0, actionMode: 'ta' }]
    }], {
        actorCount: 4,
        calculateHit: (hit) => {
            seen.push({ kind: hit.kind, hitIndex: hit.hitIndex });
            return hit.hitIndex * 100;
        }
    });

    assert.deepStrictEqual(seen, [
        { kind: 'base', hitIndex: 1 },
        { kind: 'base', hitIndex: 1 },
        { kind: 'base', hitIndex: 1 }
    ]);
    assert.strictEqual(result.damageByBlockId.mc_ta, 300);
    assert.strictEqual(result.hitCountByBlockId.mc_ta, 3);
    assert.strictEqual(result.byCharacter[0], 300);
    assert.strictEqual(result.totalDamage, 300);
});

run('手动时间轴按方块导出技伤hit数', () => {
    const result = manual.resolveTimeline([{
        number: 1,
        blocks: [{
            id: 'ten_hit_skill',
            type: 'damage',
            actorSlot: 1,
            steps: [{ do: 'damage', damage_type: 'skill', mult: 1, hits: 10 }]
        }]
    }], { calculateHit: () => 100 });

    assert.strictEqual(result.hitCountByBlockId.ten_hit_skill, 10);
    assert.strictEqual(result.damageByBlockId.ten_hit_skill, 1000);
});

run('手动时间轴hit数接受伤害计算器返回的乱击实际段数', () => {
    const result = manual.resolveTimeline([{
        number: 1,
        blocks: [{ id: 'ranshu_ta', type: 'actor_action', actorSlot: 0, actionMode: 'ta' }]
    }], {
        calculateHit: () => ({ damage: 100, hitCount: 2 })
    });

    assert.strictEqual(result.hitCountByBlockId.ranshu_ta, 6);
    assert.strictEqual(result.damageByBlockId.ranshu_ta, 300);
});

run('手动时间轴每个平Ahit都会重新读取当前Buff状态', () => {
    const skillData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'charaskills.json'), 'utf8'));
    const rage = skillData.skills.find((item) => item.id === 'mc_skill_rage_3');
    const action = { id: 'mc_ta_with_rage', type: 'actor_action', actorSlot: 0, actionMode: 'ta' };
    const withRage = manual.resolveTimeline([{
        number: 1,
        blocks: [{ id: 'rage', type: 'buff', actorSlot: 0, steps: rage.steps }, action]
    }], {
        calculateHit: (hit, context) => context.actorStatuses.some((status) => (
            status.status_id === 'status_rage_3_normal_atk'
        )) ? 130 : 100
    });
    const withoutRage = manual.resolveTimeline([{
        number: 1,
        blocks: [action]
    }], { calculateHit: () => 100 });

    assert.strictEqual(withRage.damageByBlockId.mc_ta_with_rage, 390);
    assert.strictEqual(withoutRage.damageByBlockId.mc_ta_with_rage, 300);
});

run('手动技能Buff会转换为状态聚合器可读取的标准formula结构', () => {
    const skillData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'charaskills.json'), 'utf8'));
    const rage = skillData.skills.find((item) => item.id === 'mc_skill_rage_3');
    const state = manual.createState({ actorCount: 4 });
    manual.resolveSkill(state, rage, { ownerSlot: 0 }, { calculateHit: () => 0 });
    const effect = state.actors[0].statuses[0].effects[0];

    assert.strictEqual(effect.effect_type, 'stat_mod');
    assert.deepStrictEqual(effect.formula, {
        prop: 'normal_atk',
        zone: 'chara_skill',
        value: 0.3,
        format: 'percent'
    });
});

run('自定义技能目录仅返回拥有正式分区的 Buff 类别', () => {
    const catalog = customSkills.getBuffCatalog();
    assert.strictEqual(catalog.length, 88);
    catalog.forEach((entry) => {
        assert.ok(entry.zones.length > 0, entry.buffType);
        assert.ok(entry.zones.every((zone) => zone.id !== 'testbuff'), entry.buffType);
    });
    assert.ok(customSkills.getBuffType('element_dmg_cut').zones.some((zone) => zone.id === 'charabonus'));
    assert.ok(customSkills.getBuffType('element_pair_dmg_amp').zones.some((zone) => zone.id === 'independent'));
});

run('效果对象选择敌方时只返回可用的敌方DB目录', () => {
    const enemyCatalog = customSkills.getBuffCatalog('enemy');
    assert.deepStrictEqual(enemyCatalog.map((entry) => entry.buffType), [
        'taken_dmg_amp', 'taken_dmg_supp', 'def_down'
    ]);
    assert.strictEqual(customSkills.getBuffType('normal_atk', 'enemy'), null);
    assert.strictEqual(customSkills.getBuffType('def_down', 'self'), null);
    assert.deepStrictEqual(
        customSkills.getBuffType('taken_dmg_supp', 'enemy').zones.map((zone) => [zone.id, zone.rule]),
        [
            ['enemy_db', 'sum'],
            ['enemy_sp', 'sum'],
            ['cumulative', 'sum'],
            ['independent', 'sum']
        ]
    );
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

run('独立攻刃【久远】使用普刃图标', () => {
    assert.strictEqual(
        buffDirectory.getBuffDisplayMeta('perpetuity_atk', 'independent').icon,
        'buff icon/normal_atk.png'
    );
});

run('斩Buff绑定专用图标并在独立区取最高值', () => {
    const zhan = customSkills.getBuffType('indep_zhan_atk');
    assert.ok(zhan);
    assert.strictEqual(zhan.label, '攻击力大幅提高');
    assert.strictEqual(zhan.optionLabel, '攻击力大幅提高');
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

    const skill = customSkills.buildSkill({
        type: 'buff',
        displayMode: 'small',
        name: '斩25%',
        effects: [{
            target: 'self',
            buffType: 'indep_zhan_atk',
            value: 25,
            durationType: 'action',
            durationValue: 1
        }]
    });
    assert.strictEqual(skill.steps[0].prop, 'indep_zhan_atk');
    assert.strictEqual(skill.steps[0].zone, 'independent');
    assert.strictEqual(skill.steps[0].icon, 'buff icon/zhan.png');
});

run('无旧式静态字段映射的新乘区仍会从战斗Buff汇总进入伤害公式', () => {
    const previousDecimal = global.Decimal;
    class AggregateDecimal {
        constructor(value) { this.value = Number(value) || 0; }
        plus(value) {
            return new AggregateDecimal(this.value + Number(value instanceof AggregateDecimal ? value.value : value));
        }
        toDecimalPlaces() { return new AggregateDecimal(this.value); }
        toNumber() { return this.value; }
    }
    global.Decimal = AggregateDecimal;
    const damageCalc = require('../js/damage_calc.js');
    const total = damageCalc.aggregateZoneValue('indep_zhan_atk', {
        _charabuffZoneEffectTotals: { indep_zhan_atk: 0.25 }
    }, {});
    global.Decimal = previousDecimal;
    assert.strictEqual(total, 0.25);
});

run('小Buff乱击使用专用图标且所有来源统一取最高段数', () => {
    const ranshu = customSkills.getBuffType('na_ranshu');
    assert.ok(ranshu);
    assert.strictEqual(ranshu.label, '乱击');
    assert.strictEqual(ranshu.optionLabel, '乱击');
    assert.strictEqual(
        buffDirectory.getBuffDisplayMeta('na_ranshu', 'chara_skill').icon,
        'buff icon/luanji.png'
    );
    assert.strictEqual(buffZones.getZoneRules('na_ranshu').combineRule, 'max');

    const registry = new BuffRegistry();
    registry.addByProp('na_ranshu', 'weapon_grid', '武器乱击2段', 2);
    registry.addByProp('na_ranshu', 'chara_skill', '技能乱击3段', 3);
    registry.addByProp('na_ranshu', 'independent', '独立乱击2段', 2);
    assert.strictEqual(registry.getTotal('na_ranshu'), 3);

    const skill = customSkills.buildSkill({
        type: 'buff',
        displayMode: 'small',
        name: '乱击测试',
        effects: [{
            target: 'self',
            buffType: 'na_ranshu',
            value: 3,
            durationType: 'action',
            durationValue: 1
        }]
    });
    assert.strictEqual(skill.steps[0].prop, 'na_ranshu');
    assert.strictEqual(skill.steps[0].zone, 'chara_skill');
    assert.strictEqual(skill.steps[0].value, 3);
    assert.strictEqual(skill.steps[0].name, '乱击3段');
    assert.strictEqual(skill.steps[0].icon, 'buff icon/luanji.png');
});

run('伤害计算统一从All Effects读取乱击最终段数', () => {
    const damageCalc = require('../js/damage_calc.js');
    assert.strictEqual(damageCalc.resolveNaRanshuHits({ weapon_na_ranshu: 2 }, null), 2);
    assert.strictEqual(damageCalc.resolveNaRanshuHits({ weapon_na_ranshu: 2 }, { na_ranshu: 3 }), 3);
    assert.strictEqual(damageCalc.resolveNaRanshuHits({}, {}), 1);
});

run('小Buff猛乱击使用7651图标并在普通乱击取高后叠加', () => {
    const fierceRanshu = customSkills.getBuffType('na_ranshu_bonus');
    assert.ok(fierceRanshu);
    assert.strictEqual(fierceRanshu.label, '猛乱击');
    assert.strictEqual(fierceRanshu.optionLabel, '猛乱击');
    assert.strictEqual(fierceRanshu.defaultValue, 1);
    assert.strictEqual(fierceRanshu.fixedValue, 1);
    assert.strictEqual(
        buffDirectory.getBuffDisplayMeta('na_ranshu_bonus', 'chara_skill').icon,
        'buff icon/status_7651.png'
    );

    const registry = new BuffRegistry();
    registry.addByProp('na_ranshu_bonus', 'chara_skill', '猛乱击A', 1);
    registry.addByProp('na_ranshu_bonus', 'chara_skill', '猛乱击B', 1);
    registry.addByProp('na_ranshu_bonus', 'independent', '猛乱击C', 1);
    assert.strictEqual(registry.getTotal('na_ranshu_bonus'), 3);

    const damageCalc = require('../js/damage_calc.js');
    assert.strictEqual(
        damageCalc.resolveNaRanshuHits(
            { weapon_na_ranshu: 2 },
            { na_ranshu: 3, na_ranshu_bonus: 2 }
        ),
        5
    );
    assert.strictEqual(
        damageCalc.resolveNaRanshuHits({}, { na_ranshu_bonus: 2 }),
        3
    );

    const skill = customSkills.buildSkill({
        type: 'buff',
        displayMode: 'small',
        name: '猛乱击测试',
        effects: [{
            target: 'self',
            buffType: 'na_ranshu_bonus',
            value: 1,
            durationType: 'action',
            durationValue: 1
        }]
    });
    assert.strictEqual(skill.steps[0].prop, 'na_ranshu_bonus');
    assert.strictEqual(skill.steps[0].zone, 'chara_skill');
    assert.strictEqual(skill.steps[0].value, 1);
    assert.strictEqual(skill.steps[0].name, '猛乱击+1段');
    assert.strictEqual(skill.steps[0].icon, 'buff icon/status_7651.png');
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
                buffType: 'taken_dmg_supp',
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

run('自定义强化技能可先结算多段伤害再获得Buff', () => {
    const skill = customSkills.buildSkill({
        type: 'buff',
        name: '伤害后强化',
        damages: [{
            element: 'wind',
            multiplier: 1.5,
            hits: 2,
            decayMode: 'fuzzy',
            cap: 100000
        }],
        effects: [{
            target: 'self',
            buffType: 'normal_atk',
            zone: 'chara_skill',
            value: 30,
            durationType: 'action',
            durationValue: 1
        }]
    });

    assert.deepStrictEqual(skill.steps.map((step) => step.do), ['damage', 'buff']);
    assert.strictEqual(skill.steps[0].element, 'wind');
    assert.strictEqual(skill.manual_definition.damages.length, 1);

    const statusCountsDuringDamage = [];
    const result = manual.resolveTimeline([{
        number: 1,
        blocks: [{
            id: 'damage_then_buff',
            type: 'buff',
            actorSlot: 0,
            skillId: skill.id,
            steps: skill.steps
        }]
    }], {
        getSkillById: (skillId) => skillId === skill.id ? skill : null,
        calculateHit: (hit, context) => {
            statusCountsDuringDamage.push(context.actorStatuses.length);
            return 100;
        }
    });

    assert.deepStrictEqual(statusCountsDuringDamage, [0, 0]);
    assert.strictEqual(result.damageByBlockId.damage_then_buff, 200);
    assert.strictEqual(result.hitCountByBlockId.damage_then_buff, 2);
    assert.strictEqual(result.state.actors[0].statuses.length, 1);
    assert.strictEqual(manual.getStatusRemaining(result.state.actors[0].statuses[0]), 1);
});

run('敌方减防技能保留语义类型与分区图标，敌方状态可投影显示', () => {
    const skill = customSkills.buildSkill({
        type: 'buff',
        name: '累计减防测试',
        effects: [{
            target: 'enemy',
            buffType: 'def_down',
            zone: 'cumulative',
            value: 10,
            durationType: 'turns',
            durationValue: 1
        }]
    });
    assert.strictEqual(skill.steps[0].effect_type, 'enemy_defense_down');
    assert.strictEqual(skill.steps[0].icon, 'buff icon/status_1427.png');

    const result = manual.resolveTimeline([{
        number: 1,
        blocks: [{
            id: 'enemy_db_block',
            type: 'buff',
            actorSlot: 0,
            skillId: skill.id,
            steps: skill.steps
        }]
    }], { calculateHit: () => 0 });
    assert.strictEqual(result.enemyBuffs.length, 1);
    assert.strictEqual(result.enemyBuffs[0].icon, 'buff icon/status_1427.png');
    assert.ok(result.enemyBuffs[0].tooltip.includes('防御力下降'));
});

run('自定义大Buff默认使用独立区并聚合为一个首字图标', () => {
    const skill = customSkills.buildSkill({
        type: 'buff',
        displayMode: 'large',
        name: '星界祝福',
        effects: [
            {
                target: 'self',
                buffType: 'normal_atk',
                value: 30,
                durationType: 'turns',
                durationValue: 3
            },
            {
                target: 'self',
                buffType: 'dmg_cap',
                value: 10,
                durationType: 'turns',
                durationValue: 3
            }
        ]
    });

    assert.strictEqual(skill.buff_display_mode, 'large');
    assert.strictEqual(skill.manual_definition.displayMode, 'large');
    assert.deepStrictEqual(skill.steps.map((step) => step.zone), ['independent', 'independent']);
    assert.ok(skill.steps.every((step) => step.unique === true));
    assert.ok(skill.steps.every((step) => step.status_display.group_id === skill.id));

    const result = manual.resolveTimeline([{
        number: 1,
        blocks: [
            { id: 'large_buff', type: 'buff', actorSlot: 0, steps: skill.steps },
            { id: 'action', type: 'actor_action', actorSlot: 0, actionMode: 'sa' }
        ]
    }], { calculateHit: () => 1 });
    const displayed = result.buffsByBlockId.action;
    assert.strictEqual(displayed.length, 1);
    assert.strictEqual(displayed[0].displayMode, 'large');
    assert.strictEqual(displayed[0].initial, '星');
    assert.ok(displayed[0].tooltip.includes('普刃+30%'));
    assert.ok(displayed[0].tooltip.includes('全上限+10%'));
});

run('小Buff悬停信息包含具体加成数值', () => {
    const skill = customSkills.buildSkill({
        type: 'buff',
        name: '小Buff测试',
        effects: [{
            target: 'self',
            buffType: 'normal_atk',
            zone: 'chara_skill',
            value: 25,
            durationType: 'action',
            durationValue: 2
        }]
    });
    const result = manual.resolveTimeline([{
        number: 1,
        blocks: [
            { id: 'small_buff', type: 'buff', actorSlot: 0, steps: skill.steps },
            { id: 'action', type: 'actor_action', actorSlot: 0, actionMode: 'sa' }
        ]
    }], { calculateHit: () => 1 });
    assert.strictEqual(result.buffsByBlockId.action.length, 1);
    assert.ok(result.buffsByBlockId.action[0].tooltip.includes('普刃+25%'));
    assert.ok(result.buffsByBlockId.action[0].tooltip.includes('剩余2次行动'));
});

run('小Buff悬停信息会忽略空格差异并去除重复加成行', () => {
    const displayed = manual.projectStatusBuffs([{
        status_id: 'na_amp_30',
        name: '平A伤害增幅+30%',
        duration: { type: 'turns', value: 1 },
        remaining_turns: 1,
        effects: [{
            effect_type: 'stat_mod',
            formula: {
                prop: 'na_dmg_amp',
                zone: 'independent',
                value: 0.3,
                format: 'percent',
                label: '平A伤害增幅'
            }
        }]
    }]);
    assert.deepStrictEqual(displayed[0].tooltip.split('\n'), [
        '平A伤害增幅+30%',
        '剩余1回合'
    ]);
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

run('自定义伤害技能支持多段独立属性并按定义顺序逐hit结算', () => {
    const skill = customSkills.buildSkill({
        type: 'damage',
        name: '复合属性技伤',
        damages: [{
            element: 'own_element',
            multiplier: 1.5,
            hits: 2,
            decayMode: 'exact',
            thresholdTable: 'skill_first'
        }, {
            element: 'light',
            multiplier: 0.8,
            hits: 3,
            decayMode: 'fuzzy',
            cap: 50000
        }]
    });

    assert.strictEqual(skill.steps.length, 2);
    assert.strictEqual(Object.hasOwn(skill.steps[0], 'element'), false);
    assert.strictEqual(skill.steps[0].threshold_table, 'skill_first');
    assert.strictEqual(skill.steps[1].element, 'light');
    assert.strictEqual(skill.steps[1].cap, 50000);
    assert.deepStrictEqual(skill.manual_definition.damages.map((damage) => damage.element), ['own_element', 'light']);

    const result = manual.resolveSkill(manual.createState(), skill, { ownerSlot: 0 }, { calculateHit: () => 10 });
    assert.strictEqual(result.hitCount, 5);
    assert.strictEqual(result.totalDamage, 50);
    assert.deepStrictEqual(result.hits.map((entry) => entry.hit.element), [null, null, 'light', 'light', 'light']);
    assert.deepStrictEqual(result.hits.map((entry) => entry.hit.multiplier), [1.5, 1.5, 0.8, 0.8, 0.8]);
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
