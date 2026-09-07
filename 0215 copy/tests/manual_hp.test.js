'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Decimal {
    constructor(v) { this.v = Number(v instanceof Decimal ? v.v : v) || 0; }
    plus(v) { return new Decimal(this.v + new Decimal(v).v); }
    minus(v) { return new Decimal(this.v - new Decimal(v).v); }
    times(v) { return new Decimal(this.v * new Decimal(v).v); }
    div(v) { return new Decimal(this.v / new Decimal(v).v); }
    ceil() { return new Decimal(Math.ceil(this.v)); }
    floor() { return new Decimal(Math.floor(this.v)); }
    round() { return new Decimal(Math.round(this.v)); }
    toDecimalPlaces(n) { return new Decimal(Math.round(this.v * 10 ** n) / 10 ** n); }
    toNumber() { return this.v; }
    toFixed(n) { return this.v.toFixed(n); }
    isZero() { return this.v === 0; }
    isNegative() { return this.v < 0; }
    lt(v) { return this.v < new Decimal(v).v; }
    lte(v) { return this.v <= new Decimal(v).v; }
    static min(a, b) { return new Decimal(Math.min(new Decimal(a).v, new Decimal(b).v)); }
    static max(a, b) { return new Decimal(Math.max(new Decimal(a).v, new Decimal(b).v)); }
    static pow(a, b) { return new Decimal(new Decimal(a).v ** new Decimal(b).v); }
}

const root = path.join(__dirname, '..', 'js');
function load(context, file) {
    let source = fs.readFileSync(path.join(root, file), 'utf8');
    if (file === 'sim/sim_burst.js') source = source.replace('window.BurstSimulator = {',
        'window.hpTest = { getActorStats, getActorCalculationContext, getActorDamageHpPercent, applyManualWeaponHp, getActorFormulaBonuses }; window.BurstSimulator = {');
    vm.runInContext(source, context, { filename: file });
}
function harness() {
    const external = { value: '100' };
    const context = { Decimal, console: { ...console, log() {}, groupCollapsed() {}, groupEnd() {} },
        document: { getElementById: (id) => id === 'current-hp-slider' ? external
            : id.startsWith('char-panel-atk-') ? { textContent: '10000' } : null },
        currentParty: [{ chara_ring_stamina: 5, chara_ring_enmity: 2, chara_lb_stamina: 3 }],
        formatNumber: String
    };
    context.window = context;
    vm.createContext(context);
    for (const file of ['constants.js', 'calc.js', 'buff_directory.js', 'buff_zones.js', 'buff_registry.js',
        'damage_calc.js', 'na_dmg_calc.js', 'damage_cap.js', 'ca_dmg_calc.js', 'skill_dmg_calc.js',
        'bonus_dmg.js', 'render/bonus.js', 'sim/condition_evaluator.js', 'sim/status_resolver.js', 'sim/manual_resolution.js', 'sim/sim_burst.js']) load(context, file);
    // Pure test cap: exercise actual HP/formula/echo paths without unrelated threshold loading.
    context.applyDamageCap = (raw) => ({ decayedDamage: new Decimal(raw), ampCoef: 0, takenDmgAmpCoef: 0 });
    context.applyWorldCap = (raw) => new Decimal(raw);
    const fixtures = [{ prop: 'weapon_stamina', value: 'linear_hp:0%:20%', slvl: 15, boost: 3 },
        { prop: 'weapon_enmity', value: 'linear_hp_down:0%:10%', slvl: 15, boost: 1 }];
    // Use real keys from this repository.
    const keys = vm.runInContext("STAT_CONFIG.filter(c => c.zone === 'weapon_grid' && ['stamina','enmity'].includes(c.prop)).map(c => ({key:c.key,prop:c.prop}))", context);
    fixtures[0].prop = keys.find(k => k.prop === 'stamina').key;
    fixtures[1].prop = keys.find(k => k.prop === 'enmity').key;
    function setExternal(percent) {
        external.value = String(percent);
        const stats = { weapon_bonus_na_own_element: 0.2, weapon_bonus_na_destruction: 0.2 };
        stats._hpDependentWeaponEntries = fixtures.map(entry => {
            const appliedValue = context.parseSkillValue(entry.value, entry.slvl, {}, percent) * (1 + entry.boost);
            stats[entry.prop] = appliedValue;
            return { ...entry, appliedValue, context: {} };
        });
        context.fixtureParty = [0, 1, 2, 3].map(() => ({ element: '火', stats: { ...stats } }));
        vm.runInContext('party = fixtureParty;', context);
        context.BurstSimulator.prepareManualDamageCalculation({ defense: 10 });
    }
    setExternal(100);
    return { context, external, setExternal, fixtures };
}
function run(name, test) { test(); console.log(`ok - ${name}`); }
function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`); }

run('独立HP重算武器加护后浑身/背水与角色强化；静态HP变化不影响手动值', () => {
    const { context: c, setExternal, fixtures } = harness();
    const manual = { manualTimeline: true, turn: 1, actors: { 0: { hpPercent: 50, statuses: [] } }, enemy: { statuses: [] } };
    const before = JSON.stringify(c.fixtureParty);
    const stats = c.hpTest.getActorStats(0, manual);
    close(stats[fixtures[0].prop], 0.4);
    close(stats[fixtures[1].prop], 0.1);
    assert.strictEqual(JSON.stringify(c.fixtureParty), before);
    const totals = c.hpTest.getActorCalculationContext(0, manual).effectTotals;
    const bonus = c.hpTest.getActorFormulaBonuses(0, 50, { exactHpPercent: true });
    setExternal(20);
    close(c.hpTest.getActorStats(0, manual)[fixtures[0].prop], 0.4);
    close(c.hpTest.getActorStats(0, manual)[fixtures[1].prop], 0.1);
    assert.strictEqual(JSON.stringify(c.hpTest.getActorCalculationContext(0, manual).effectTotals), JSON.stringify(totals));
    assert.strictEqual(JSON.stringify(c.hpTest.getActorFormulaBonuses(0, 50, { exactHpPercent: true })), JSON.stringify(bonus));
});

run('真实手动桥接平A/奥义/技伤读取角色HP，外部移动后伤害不变', () => {
    const { context: c, setExternal } = harness();
    const state = c.ManualBattleResolution.createState();
    const hits = ['normal_attack', 'ca', 'skill'].map(damageType => ({ actorSlot: 0, damageType, multiplier: 2 }));
    const damage = hit => {
        const result = c.BurstSimulator.calculateManualHitDamage(hit, state, { defense: 10 });
        return Number(result && typeof result === 'object' ? result.damage : result);
    };
    state.actors[0].hpPercent = 100;
    const full = hits.map(damage);
    assert.ok(full.every(d => d > 0), JSON.stringify(full));
    state.actors[0].hpPercent = 40;
    const low = hits.map(damage);
    const echoes = c.BurstSimulator.getManualBonusHitSources(state, 0, { defense: 10 }).map(e => e.damage);
    assert.strictEqual(echoes.length, 2, '验证普通追击与破坏属性追击');
    assert.ok(echoes.every(d => d > 0));
    assert.ok(low.every((d, i) => d > 0 && d !== full[i]), JSON.stringify({ full, low }));
    setExternal(10);
    assert.deepStrictEqual(hits.map(damage), low);
    assert.strictEqual(JSON.stringify(c.BurstSimulator.getManualBonusHitSources(state, 0, { defense: 10 }).map(e => e.damage)), JSON.stringify(echoes));
    assert.strictEqual(c.hpTest.getActorDamageHpPercent(0, { manualTimeline: true, actors: {} }), 100);
});

run('每回合在技能/普攻/追击前设置独立HP，下一回合恢复默认而非继承覆盖', () => {
    const { context: c } = harness();
    const seen = [];
    const turns = [1, 2, 3].map(number => ({ number, blocks: [
        { id: `skill${number}`, type: 'damage', actorSlot: 0, steps: [{ do: 'damage', mult: 1, hits: 2 }] },
        { id: `ta${number}`, type: 'actor_action', actorSlot: 0, actionMode: 'ta' },
        { id: `other${number}`, type: 'actor_action', actorSlot: 1, actionMode: 'ca' }
    ] }));
    const result = c.ManualBattleResolution.resolveTimeline(turns, {
        getActorHpPercent: (turn, slot) => slot === 0 && turn.number === 2 ? 20 : 100,
        getBonusHits: () => [{ id: 'echo', multiplier: 0.2 }],
        calculateHit: (hit, ctx) => { seen.push([ctx.state.turn, hit.actorSlot, ctx.state.actors[hit.actorSlot].hpPercent]); return ctx.state.actors[hit.actorSlot].hpPercent; }
    });
    assert.strictEqual(result.damageByBlockId.skill2, 40);
    assert.strictEqual(result.damageByBlockId.ta2, 120);
    assert.strictEqual(result.damageByBlockId.ta3, 600);
    assert.ok(seen.filter(x => x[1] === 1).every(x => x[2] === 100));
});

run('手动1%按真正百分比计算，静态1HP的原有语义保持不变', () => {
    const { context: c } = harness();
    close(c.parseSkillValue('linear_hp:0:100', 1, {}, 1), 0);
    close(c.parseSkillValue('linear_hp:0:100', 1, {}, 1, { exactHpPercent: true }), 1);
    assert.notStrictEqual(c.getLbStaminaStrongBonus(0.01, 1, { exactHpPercent: true }), c.getLbStaminaStrongBonus(0.01, 1));
});

run('常规/方阵浑身背水和武器附魔曲线按手动HP重新求值，重复调用不累加', () => {
    const { context: c } = harness();
    for (const curve of ['stamina_normal_big', 'stamina_omega_big', 'enmity_omega_small', 'ex-stamina1', 'ex-enmity1']) {
        const old = c.calculateCurveValue(curve, 15, 10) * 4;
        const stats = { curveStat: old + 0.25, _hpDependentWeaponEntries: [{
            prop: 'curveStat', value: `curve:${curve}`, slvl: 15, boost: 3, appliedValue: old
        }] };
        const expected = new Decimal(c.calculateCurveValue(curve, 15, 75, { exactHpPercent: true }))
            .times(4).plus(0.25).toDecimalPlaces(10).toNumber();
        close(c.hpTest.applyManualWeaponHp({ ...stats }, 75).curveStat, expected);
        close(c.hpTest.applyManualWeaponHp({ ...stats }, 75).curveStat, expected);
        close(stats.curveStat, old + 0.25);
    }
});

run('HP条件Buff按当前回合角色血量判断，80%边界不会读取外部100%', () => {
    const { context: c } = harness();
    const state = { manualTimeline: true, turn: 1, actors: { 0: { hpPercent: 81, statuses: [{
        id: 'hp_conditional', effects: [{ conditions: { path: 'actor.hpPercent', op: '>', value: 80 },
            formula: { prop: 'dmg_supp', zone: 'summon', value: 50000 } }]
    }] } }, enemy: { statuses: [] } };
    assert.strictEqual(c.hpTest.getActorCalculationContext(0, state).effectTotals.na_dmg_supp, 50000);
    state.actors[0].hpPercent = 80;
    assert.strictEqual(c.hpTest.getActorCalculationContext(0, state).effectTotals.na_dmg_supp || 0, 0);
});
