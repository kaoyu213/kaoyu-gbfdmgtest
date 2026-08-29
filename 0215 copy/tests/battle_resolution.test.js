'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const conditionsApi = require('../js/sim/condition_evaluator.js');
const statusResolver = require('../js/sim/status_resolver.js');
const charabuffRegistry = require('../js/charabuff_registry.js');
const skillRegistry = require('../js/skill_registry.js');
const summonRegistry = require('../js/summon_registry.js');
const buffDirectory = require('../js/buff_directory.js');
const buffZones = require('../js/buff_zones.js');
const {
    EffectExecutorRegistry,
    ResolutionEngine,
    registerEffectExecutor,
    installEffectExecutors
} = require('../js/sim/resolution_engine.js');

function createHarness() {
    const state = { turn: 1, phase: 'attack', actors: {}, counters: {}, flags: {} };
    const output = [];
    const effects = new EffectExecutorRegistry();
    effects.register('record', (command) => { output.push(command.value); });
    effects.register('emit', (command) => ({
        events: [{ type: command.event, payload: command.payload || {} }]
    }));
    const engine = new ResolutionEngine({
        state,
        effects,
        conditions: conditionsApi.evaluator,
        normalizeSteps: (steps) => steps.map((step) => Object.assign({}, step, {
            type: step.type || step.do
        }))
    });
    return { state, output, effects, engine };
}

function run(name, test) {
    test();
    process.stdout.write(`ok - ${name}\n`);
}

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'));
}

run('新增的8类 Buff 都拥有 charabonus 相加分区', () => {
    [
        'indep_cumulative_atk',
        'indep_unjudged_atk',
        'indep_special_enmity_atk',
        'taken_dmg_amp',
        'dmg_taken_lowered',
        'lowering_dmg_taken',
        'element_dmg_cut',
        'element_dmg_lowered'
    ].forEach((buffType) => {
        assert.ok(buffZones.getZoneNames(buffType).includes('charabonus'), buffType);
        assert.strictEqual(buffZones.getZoneRule(buffType, 'charabonus'), 'sum', buffType);
    });
});

run('属性减免和属性减轻可正确解析属性子类型', () => {
    assert.deepStrictEqual(buffDirectory.parseBuffProp('element_dmg_cut_fire'), {
        buffType: 'element_dmg_cut',
        subtype: 'fire'
    });
    assert.deepStrictEqual(buffDirectory.parseBuffProp('element_dmg_lowered_dark'), {
        buffType: 'element_dmg_lowered',
        subtype: 'dark'
    });
});

run('行动范围 Buff 保留 duration 与内嵌触发器定义', () => {
    const [action] = statusResolver.getSkillActions({
        id: 'action_buff_test',
        steps: [{
            do: 'buff',
            id: 'one_action',
            prop: 'normal_atk',
            zone: 'chara_skill',
            value: 1,
            duration: { type: 'action', value: 1, tick: 'attack_action_end' },
            triggers: [{ event: 'damage_resolved', steps: [] }]
        }]
    }, { skillId: 'action_buff_test' });
    assert.deepStrictEqual(action.status.duration, {
        type: 'action', value: 1, tick: 'attack_action_end'
    });
    assert.strictEqual(action.status.triggers[0].event, 'damage_resolved');
});

run('可叠层 Buff 保留叠层上限与初始层数', () => {
    const [action] = statusResolver.getSkillActions({
        id: 'stack_test',
        steps: [{
            do: 'buff',
            id: 'mark',
            stacking: { mode: 'add', add: 1, max: 5, refresh_duration: false },
            effects: []
        }]
    }, { skillId: 'stack_test' });
    assert.strictEqual(action.status.stacks, 1);
    assert.strictEqual(action.status.stacking.max, 5);
    assert.strictEqual(action.status.stacking.refresh_duration, false);
});

run('递归条件支持 all / any / not 和路径引用', () => {
    const condition = {
        all: [
            { path: 'event.attackActionIndex', op: '>=', value: 2 },
            { any: [
                { field: 'multiattack', op: '==', value: 'ta' },
                { not: { path: 'state.flags.disabled', op: 'truthy' } }
            ] }
        ]
    };
    assert.strictEqual(conditionsApi.evaluator.evaluate(condition, {
        event: { attackActionIndex: 2, multiattack: 'sa' },
        state: { flags: { disabled: false } }
    }), true);
});

run('interrupt 在原动作剩余步骤之前插入', () => {
    const { engine, output } = createHarness();
    engine.registerTriggerSource({
        id: 'interrupt_trigger',
        ownerSlot: 1,
        trigger: { event: 'pulse', insertion: 'interrupt' },
        steps: [{ do: 'record', value: 'inserted' }]
    });
    engine.resolveAction({
        id: 'root',
        commands: [
            { type: 'record', value: 'root-1' },
            { type: 'emit', event: 'pulse' },
            { type: 'record', value: 'root-2' }
        ]
    });
    assert.deepStrictEqual(output, ['root-1', 'inserted', 'root-2']);
});

run('follow_up 在当前动作全部完成后结算', () => {
    const { engine, output } = createHarness();
    engine.registerTriggerSource({
        id: 'follow_trigger',
        ownerSlot: 1,
        trigger: { event: 'pulse', insertion: 'follow_up' },
        steps: [{ do: 'record', value: 'follow' }]
    });
    engine.resolveAction({
        id: 'root',
        commands: [
            { type: 'record', value: 'root-1' },
            { type: 'emit', event: 'pulse' },
            { type: 'record', value: 'root-2' }
        ]
    });
    assert.deepStrictEqual(output, ['root-1', 'root-2', 'follow']);
});

run('replace 可替换命中的原命令', () => {
    const { engine, output } = createHarness();
    engine.registerTriggerSource({
        id: 'replace_trigger',
        ownerSlot: 1,
        trigger: {
            event: 'before_command',
            insertion: 'replace',
            conditions: { path: 'event.command.value', op: '==', value: 'original' }
        },
        steps: [{ do: 'record', value: 'replacement' }]
    });
    engine.resolveAction({ id: 'root', commands: [{ type: 'record', value: 'original' }] });
    assert.deepStrictEqual(output, ['replacement']);
});

run('共享计数器达到阈值后触发并保留余数', () => {
    const { engine, output, state } = createHarness();
    engine.registerTriggerSource({
        id: 'ta_counter_trigger',
        ownerSlot: 2,
        skillId: 'passive_ta_counter',
        trigger: {
            event: 'triple_attack_resolved',
            watch: 'ally_party',
            counter: { id: 'party_ta', scope: 'party_shared', threshold: 3 }
        },
        steps: [{ do: 'record', value: 'proc' }]
    });
    engine.resolveAction({
        id: 'root',
        commands: [0, 1, 2, 3].map((actorSlot) => ({
            type: 'emit',
            event: 'triple_attack_resolved',
            payload: { actorSlot }
        }))
    });
    assert.deepStrictEqual(output, ['proc']);
    assert.strictEqual(state.counters['party_shared|party_ta'], 1);
});

run('优先级、每回合限制和 trace 均为确定性结果', () => {
    const { engine, output } = createHarness();
    engine.registerTriggerSource({
        id: 'low', ownerSlot: 1,
        trigger: { event: 'pulse', priority: 1, limits: { max_per_turn: 1 } },
        steps: [{ do: 'record', value: 'low' }]
    });
    engine.registerTriggerSource({
        id: 'high', ownerSlot: 3,
        trigger: { event: 'pulse', priority: 10, limits: { max_per_turn: 1 } },
        steps: [{ do: 'record', value: 'high' }]
    });
    engine.resolveAction({
        id: 'root',
        commands: [
            { type: 'emit', event: 'pulse' },
            { type: 'emit', event: 'pulse' }
        ]
    });
    assert.deepStrictEqual(output, ['high', 'low']);
    assert.ok(engine.getTrace().some((entry) => entry.type === 'trigger' && entry.triggerId === 'high'));
});

run('新效果类型可在主循环之外注册', () => {
    const output = [];
    registerEffectExecutor('external_effect', (command) => output.push(command.value));
    const effects = installEffectExecutors(new EffectExecutorRegistry());
    const engine = new ResolutionEngine({ effects, state: { turn: 1 } });
    engine.resolveAction({ id: 'external', commands: [{ type: 'external_effect', value: 42 }] });
    assert.deepStrictEqual(output, [42]);
});

run('follow_up 不会递归触发同一来源', () => {
    const { engine, output } = createHarness();
    engine.registerTriggerSource({
        id: 'self_follow',
        trigger: { event: 'pulse', insertion: 'follow_up' },
        steps: [
            { do: 'emit', event: 'pulse' },
            { do: 'record', value: 'once' }
        ]
    });
    engine.resolveAction({ id: 'root', commands: [{ type: 'emit', event: 'pulse' }] });
    assert.deepStrictEqual(output, ['once']);
});

run('达到每回合触发上限后不继续偷跑计数器', () => {
    const { engine, output, state } = createHarness();
    engine.registerTriggerSource({
        id: 'limited_counter',
        trigger: {
            event: 'pulse',
            counter: { id: 'three', scope: 'party_shared', threshold: 3 },
            limits: { max_per_turn: 1 }
        },
        steps: [{ do: 'record', value: 'proc' }]
    });
    engine.resolveAction({
        id: 'turn-1',
        commands: Array.from({ length: 5 }, () => ({ type: 'emit', event: 'pulse' }))
    });
    assert.strictEqual(state.counters['party_shared|three'], 0);
    state.turn = 2;
    engine.resolveAction({ id: 'turn-2', commands: [{ type: 'emit', event: 'pulse' }] });
    assert.deepStrictEqual(output, ['proc']);
    assert.strictEqual(state.counters['party_shared|three'], 1);
});

run('敌方减防 charabuff 同时适配静态值与敌方状态', () => {
    const row = {
        id: 'enemy_def_down_50',
        name: '敌方防御下降50%',
        target: 'enemy_single',
        contexts: ['static', 'battle'],
        duration: { type: 'permanent' },
        effects: [{ prop: 'def_down', zone: 'normal', value: '50%' }]
    };
    charabuffRegistry.load([row]);
    assert.strictEqual(charabuffRegistry.getStaticEnemyDefenseDown([row]), 0.5);
    const skill = charabuffRegistry.toBattleSkill(row);
    const [action] = statusResolver.getSkillActions(skill, { skillId: skill.id });
    assert.strictEqual(action.target, 'enemy_single');
    assert.strictEqual(action.status.duration.type, 'permanent');
    assert.strictEqual(action.status.effects[0].effect_type, 'enemy_defense_down');
    assert.strictEqual(action.status.effects[0].zone, 'normal');
    assert.strictEqual(action.status.effects[0].value, 0.5);
});

run('普通减防上限50%，独立减防可突破且最终上限99%', () => {
    const breakdown = charabuffRegistry.resolveEnemyDefenseDownEffects([
        { definition: { prop: 'def_down', zone: 'normal', value: '40%' }, sourceId: 'normal_40' },
        { definition: { prop: 'def_down', zone: 'normal', value: '30%' }, sourceId: 'normal_30' },
        { definition: { prop: 'def_down', zone: 'independent', value: '10%' }, sourceId: 'independent_10' }
    ]);
    assert.strictEqual(breakdown.normal, 0.5);
    assert.strictEqual(breakdown.independent, 0.1);
    assert.strictEqual(breakdown.total, 0.6);

    const capped = charabuffRegistry.resolveEnemyDefenseDownEffects([
        { prop: 'def_down', zone: 'normal', value: '80%' },
        { prop: 'def_down', zone: 'independent', value: '80%' }
    ]);
    assert.strictEqual(capped.total, 0.99);
});

run('己方全体一回合二动 charabuff 转换为 extra_attack 状态', () => {
    const row = {
        id: 'party_double_strike_1t',
        name: '己方全体二动',
        target: 'ally_party',
        contexts: ['battle'],
        duration: { type: 'turns', value: 1, tick: 'turn_end' },
        effects: [{ prop: 'charabuff_double_strike', value: '1' }]
    };
    charabuffRegistry.load([row]);
    const skill = charabuffRegistry.toBattleSkill(row);
    const [action] = statusResolver.getSkillActions(skill, { skillId: skill.id });
    assert.strictEqual(action.target, 'ally_party');
    assert.deepStrictEqual(action.status.duration, { type: 'turns', value: 1, tick: 'turn_end' });
    assert.strictEqual(action.status.effects[0].effect_type, 'extra_attack');
    assert.strictEqual(action.status.effects[0].count, 1);
});

run('召唤石注册表只暴露已装备主动，并只在副召位启用Sub被动', () => {
    const summons = readJson('summons.json');
    const skillData = readJson('charaskills.json');
    summonRegistry.load(summons);
    skillRegistry.load(skillData.skills);
    const getSummon = (id) => Object.assign({}, summonRegistry.get(id), { selectedLevel: 1 });
    const equipped = new Array(8).fill(null);
    equipped[0] = getSummon('test_summon_1_position_double_strike');
    equipped[1] = getSummon('test_summon_2_multihit_party_buff');
    equipped[2] = getSummon('test_summon_3_constraint_feather');
    equipped[6] = getSummon('test_summon_4_high_hp_supplemental');

    const active = summonRegistry.collectActiveSkills(equipped, skillRegistry);
    assert.deepStrictEqual(active.map((entry) => entry.sourceSkillId), [
        'summon_test_1_call',
        'summon_test_2_call'
    ]);
    assert.ok(active.every((entry) => entry.ownerSlot === 0));

    const passives = summonRegistry.collectPassiveSkills(equipped, skillRegistry);
    assert.deepStrictEqual(passives.map((entry) => entry.skillId), [
        'summon_test_3_sub_passive',
        'summon_test_4_sub_passive'
    ]);

    const wrongSlot = new Array(8).fill(null);
    wrongSlot[0] = getSummon('test_summon_3_constraint_feather');
    assert.strictEqual(summonRegistry.collectPassiveSkills(wrongSlot, skillRegistry).length, 0);
});

run('150级天司副召提供召唤石区15%全伤害上限且同名Sub不重复', () => {
    const summons = readJson('summons.json');
    summonRegistry.load(summons);
    const archangel = Object.assign({}, summonRegistry.get('archangel'), { selectedLevel: 150 });
    const [effect] = summonRegistry.getBuildEffectEntries(archangel, 2);
    assert.strictEqual(effect.stat_key, 'summon_dmg_cap');
    assert.strictEqual(effect.prop, 'dmg_cap');
    assert.strictEqual(effect.zone, 'summon');
    assert.strictEqual(effect.target, 'ally_all');
    assert.strictEqual(effect.value, 0.15);

    const equipped = new Array(8).fill(null);
    equipped[2] = archangel;
    equipped[3] = Object.assign({}, archangel);
    const collected = summonRegistry.collectBuildEffects(equipped);
    assert.strictEqual(collected.length, 1);
    assert.strictEqual(collected[0].value, 0.15);

    const level100 = Object.assign({}, archangel, { selectedLevel: 100 });
    assert.strictEqual(summonRegistry.getBuildEffectEntries(level100, 2)[0].value, 0.1);
});

run('测试召唤石1使用主角为1号位的显式1至3号位目标', () => {
    const skill = skillRegistry.get('summon_test_1_call');
    const [action] = statusResolver.getSkillActions(skill, { skillId: skill.id, ownerSlot: 0 });
    assert.strictEqual(action.target, 'ally_slots');
    assert.deepStrictEqual(action.target_slots, [0, 1, 2]);
    assert.strictEqual(action.status.effects[0].effect_type, 'extra_attack');
    assert.strictEqual(action.status.duration.value, 1);
});

run('测试召唤石2解析为15次1倍伤害、全体独立10万伤害上升和主角二动', () => {
    const skill = skillRegistry.get('summon_test_2_call');
    const actions = statusResolver.getSkillActions(skill, { skillId: skill.id, ownerSlot: 0 });
    assert.strictEqual(actions[0].type, 'damage');
    assert.strictEqual(actions[0].damage.hits, 15);
    assert.strictEqual(actions[0].damage.multiplier, 1);
    assert.strictEqual(actions[1].target, 'ally_party');
    assert.strictEqual(actions[1].status.effects[0].formula.prop, 'dmg_supp');
    assert.strictEqual(actions[1].status.effects[0].formula.zone, 'independent');
    assert.strictEqual(actions[1].status.effects[0].value, 100000);
    assert.strictEqual(actions[2].target, 'self');
    assert.strictEqual(actions[2].status.effects[0].effect_type, 'extra_attack');
});

run('约束之羽会按技能和奥义各增加2层，并在12层时只赋予一次全体增幅', () => {
    const passive = skillRegistry.get('summon_test_3_sub_passive');
    const state = { turn: 1, phase: 'skill', actors: { 0: { statuses: [] } }, counters: {}, flags: {} };
    const effects = new EffectExecutorRegistry();
    let featherStacks = 0;
    let partyAmpApplications = 0;
    effects.register('apply_status', (command) => {
        const status = command.status || {};
        if (status.status_id === 'summon_constraint_feather') {
            featherStacks = Math.min(12, featherStacks + Math.max(1, Number(status.stacking && status.stacking.add) || 1));
            return {
                events: [{
                    type: 'status_applied',
                    payload: { actorSlot: 0, statusId: status.status_id, stacks: featherStacks }
                }]
            };
        }
        if (status.status_id === 'summon_constraint_feather_party_amp') partyAmpApplications++;
        return {};
    });
    const engine = new ResolutionEngine({
        state,
        effects,
        conditions: conditionsApi.evaluator,
        normalizeSteps: (steps, context) => statusResolver.getSkillActions({ steps }, context)
    });
    passive.triggers.forEach((trigger, index) => engine.registerTriggerSource({
        id: `summon_feather_${index}`,
        ownerSlot: 0,
        skillId: passive.id,
        skill: passive,
        trigger,
        steps: trigger.steps
    }));

    engine.emitLifecycle('skill_used', { actorSlot: 0 });
    engine.emitLifecycle('charge_attack_resolved', { actorSlot: 0 });
    assert.strictEqual(featherStacks, 4);
    for (let i = 0; i < 4; i++) engine.emitLifecycle('skill_used', { actorSlot: 0 });
    assert.strictEqual(featherStacks, 12);
    assert.strictEqual(partyAmpApplications, 1);
    engine.emitLifecycle('charge_attack_resolved', { actorSlot: 0 });
    assert.strictEqual(featherStacks, 12);
    assert.strictEqual(partyAmpApplications, 1);
});

run('高血量召唤石Sub只在生命值严格大于80%时提供召唤石区5万伤害上升', () => {
    const passive = skillRegistry.get('summon_test_4_sub_passive');
    const [action] = statusResolver.getSkillActions(passive, { skillId: passive.id, ownerSlot: 0 });
    const highHpEntries = statusResolver.collectZoneEntriesFromStatuses([action.status], {
        actor: { hpPercent: 81 }
    });
    const boundaryEntries = statusResolver.collectZoneEntriesFromStatuses([action.status], {
        actor: { hpPercent: 80 }
    });
    assert.strictEqual(highHpEntries.length, 1);
    assert.strictEqual(highHpEntries[0].prop, 'dmg_supp');
    assert.strictEqual(highHpEntries[0].zone, 'summon');
    assert.strictEqual(highHpEntries[0].value, 50000);
    assert.strictEqual(boundaryEntries.length, 0);
    assert.strictEqual(statusResolver.isStatusDisplayActive(action.status, { actor: { hpPercent: 81 } }), true);
    assert.strictEqual(statusResolver.isStatusDisplayActive(action.status, { actor: { hpPercent: 80 } }), false);
});
