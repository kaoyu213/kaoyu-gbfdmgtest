'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const custom = require('../js/sim/manual_custom_skills.js');
const manual = require('../js/sim/manual_resolution.js');
const resolver = require('../js/sim/status_resolver.js');

function run(name, test) {
    test();
    console.log(`ok - ${name}`);
}

function harness(mode = 'scale', damages = [], environment = {}) {
    let skill = custom.buildSkill({
        id: 'shortcut_stack', type: 'buff', name: '快捷叠层测试', damages,
        stacking: { mode, max: 3, add: 1, target: 'self', durationType: 'permanent' },
        effects: [{ buffType: 'normal_atk', value: 10, unlockStacks: 1 },
            { buffType: 'dmg_cap', value: 5, unlockStacks: 2 }]
    });
    const storage = {};
    const track = { innerHTML: '' }, detail = { textContent: '' };
    let buttons = [];
    const board = {
        querySelector: (selector) => selector === '[data-manual-timeline-track]' ? track
            : selector === '[data-manual-detail]' ? detail : null,
        querySelectorAll: (selector) => {
            if (selector !== '[data-manual-repeat-stack]') return [];
            buttons = [...track.innerHTML.matchAll(/data-manual-repeat-stack="([^"]+)"/g)].map((match) => ({
                getAttribute: () => match[1],
                addEventListener(type, handler) { this[type] = handler; }
            }));
            return buttons;
        }
    };
    const window = {
        ManualCustomSkills: { get: (id) => skill && id === skill.id ? skill : null },
        ManualBattleResolution: manual,
        BurstSimulator: { calculateManualHitDamage: (hit, state) => 100 * (1 + resolver.collectZoneEntriesFromStatuses(
            state.actors[hit.actorSlot].statuses
        ).filter((entry) => entry.prop === 'normal_atk').reduce((sum, entry) => sum + entry.value, 0)) },
        localStorage: { setItem: (key, value) => { storage[key] = value; }, getItem: (key) => storage[key] || null }
    };
    const file = path.join(__dirname, '../js/sim/sim_manual.js');
    const source = fs.readFileSync(file, 'utf8');
    const anchor = 'global.ManualBurstSimulator = api;';
    assert.ok(source.includes(anchor));
    const instrumented = source.replace(anchor, `${anchor}
        global.testHooks = { state, createSkillBlock, createFixedAction, renderBlock, repeatStackSkill, renderTimeline, loadTimelineFromLocal,
            getManualOwnedSkills, renderOwnedSkillList, captureOwnedSkillLists, restoreOwnedSkillLists,
            readManualActorHp, renderManualActorHp, updateManualActorHp, setManualSettingsMode,
            getManualHpPercent, setManualHpPercent, normalizeHpSettings, addTurn, deleteTurn };`);
    vm.runInNewContext(instrumented, {
        window, document: { readyState: 'loading', addEventListener() {} }, console, ...environment
    }, { filename: file });
    const ui = window.testHooks;
    ui.state.initialized = true;
    ui.state.loadedStorageKey = 'test_shortcut';
    const original = ui.createSkillBlock(skill.id, 1);
    const fixed = [0, 1, 2, 3].map((slot) => ui.createFixedAction(1, slot, []));
    ui.state.turns = [{ number: 1, blocks: [original, ...fixed] }];
    const render = () => ui.renderTimeline(board);
    const click = (index = 0) => buttons[index].click({ stopPropagation() {} });
    return { ui, board, storage, original, fixed, track, detail, render, click, window,
        getSkill: () => skill, setSkill: (value) => { skill = value; } };
}

run('叠层快捷按钮是方块右侧的独立按钮，普通技能和固定行动不显示', () => {
    const h = harness();
    const html = h.ui.renderBlock(h.original);
    assert.ok(html.includes('manual-timeline-stack-row'));
    assert.ok(/<\/button>\s*<button[^>]+data-manual-repeat-stack/.test(html), '避免按钮嵌套及拖拽事件冲突');
    assert.ok(html.includes('＋叠层'));
    assert.ok(!h.ui.renderBlock(h.fixed[0]).includes('data-manual-repeat-stack'));
    h.setSkill(custom.buildSkill({ id: 'shortcut_stack', type: 'buff', name: '普通强化', effects: [
        { buffType: 'normal_atk', zone: 'independent', value: 10, durationType: 'permanent' }
    ] }));
    assert.ok(!h.ui.renderBlock(h.original).includes('data-manual-repeat-stack'));
});

run('点击快捷按钮在原方块后插入同技能，保持使用者、状态ID和基础行动顺序', () => {
    const h = harness();
    h.render();
    const before = h.ui.state.turns[0].blocks.find((block) => block.actorSlot === 1 && block.fixed).damage;
    h.click();
    const blocks = h.ui.state.turns[0].blocks;
    assert.strictEqual(blocks[0], h.original);
    assert.notStrictEqual(blocks[1].id, h.original.id);
    assert.strictEqual(blocks[1].skillId, h.original.skillId);
    assert.strictEqual(blocks[1].actorSlot, 1);
    assert.strictEqual(blocks[1].steps[0].id, h.original.steps[0].id);
    assert.strictEqual(blocks[1].fixed, false);
    assert.deepStrictEqual(Array.from(blocks.filter((block) => block.fixed), (block) => block.actorSlot), [0, 1, 2, 3]);
    assert.strictEqual(blocks[3].buffs[0].stacks, 2);
    assert.ok(blocks[3].damage > before);
    assert.ok(h.detail.textContent.includes('已自动保存到本地'));
    const snapshot = JSON.parse(h.storage.test_shortcut);
    assert.strictEqual(snapshot.turns[0].blocks[1].skillId, h.original.skillId);
    h.ui.state.turns = [];
    assert.ok(h.ui.loadTimelineFromLocal('test_shortcut'));
    h.render();
    assert.strictEqual(h.ui.state.turns[0].blocks[3].buffs[0].stacks, 2);
});

run('新插入方块可继续快捷叠层，依序强化累计解锁且不超过上限', () => {
    const h = harness('tier');
    h.render();
    h.click();
    h.click(1);
    h.click(2);
    const blocks = h.ui.state.turns[0].blocks;
    assert.strictEqual(new Set(blocks.map((block) => block.id)).size, blocks.length);
    const actor = blocks.find((block) => block.fixed && block.actorSlot === 1);
    assert.strictEqual(actor.buffs[0].stacks, 3);
    assert.ok(actor.buffs[0].tooltip.includes('+10%'));
    assert.ok(actor.buffs[0].tooltip.includes('+5%'));
    assert.ok(!actor.buffs[0].tooltip.includes('+30%'));
});

run('快捷重用读取最新定义并重复附加伤害，不创建新的技能定义', () => {
    const h = harness('scale', [{ multiplier: 1, hits: 2, decayMode: 'fuzzy', cap: 100000 }]);
    h.render();
    const modified = custom.buildSkill(Object.assign({ id: h.getSkill().id }, h.getSkill().manual_definition, {
        effects: [{ buffType: 'normal_atk', value: 20 }]
    }));
    h.setSkill(modified);
    h.click();
    const added = h.ui.state.turns[0].blocks[1];
    assert.strictEqual(added.skillId, modified.id);
    assert.strictEqual(added.hitCount, 2);
    assert.ok(added.damage > 0);
    assert.strictEqual(added.steps[1].effects[0].formula.value, 0.2);
});

run('旧存档技能不在技能库时仍保留快照，非叠层和无效方块不能快捷复制', () => {
    const h = harness();
    h.setSkill(null);
    h.render();
    h.click();
    assert.notStrictEqual(h.ui.state.turns[0].blocks[1].id, h.original.id);
    assert.strictEqual(h.ui.state.turns[0].blocks[1].steps[0].id, h.original.steps[0].id);
    const length = h.ui.state.turns[0].blocks.length;
    h.ui.repeatStackSkill(h.board, h.fixed[0].id);
    h.ui.repeatStackSkill(h.board, 'does-not-exist');
    assert.strictEqual(h.ui.state.turns[0].blocks.length, length);
});

run('回合轴技能方块直接显示描述，保留换行、转义HTML并同步编辑', () => {
    const h = harness();
    const description = '每次使用增加1层。\n<强化> & 后续行动生效';
    h.setSkill(Object.assign({}, h.getSkill(), { desc: description }));
    h.render();
    assert.ok(h.track.innerHTML.includes('manual-timeline-skill-description'));
    assert.ok(h.track.innerHTML.includes('每次使用增加1层。\n&lt;强化&gt; &amp; 后续行动生效'));
    assert.ok(!h.track.innerHTML.includes('<强化>'));
    h.setSkill(Object.assign({}, h.getSkill(), { desc: '修改后的描述' }));
    h.render();
    assert.ok(h.track.innerHTML.includes('修改后的描述'));
    assert.ok(!h.track.innerHTML.includes('后续行动生效'));
    h.click();
    assert.strictEqual(h.ui.state.turns[0].blocks[1].skillDescription, '修改后的描述');
    h.setSkill(null);
    h.ui.state.turns = [];
    assert.ok(h.ui.loadTimelineFromLocal('test_shortcut'));
    h.render();
    assert.ok(h.track.innerHTML.includes('修改后的描述'), '技能库缺失时仍读取本地描述快照');
});

run('无描述技能不显示空白描述行，兼容旧description字段及伤害技能', () => {
    const h = harness();
    h.render();
    assert.ok(!h.track.innerHTML.includes('manual-timeline-skill-description'));
    h.setSkill(custom.buildSkill({ id: 'shortcut_stack', type: 'damage', name: '描述测试伤害', desc: '造成两次风属性伤害',
        damages: [{ element: 'wind', multiplier: 1, hits: 2, decayMode: 'fuzzy', cap: 100000 }] }));
    h.render();
    assert.ok(h.track.innerHTML.includes('造成两次风属性伤害'));
    h.setSkill(Object.assign({}, h.getSkill(), { desc: '', description: '兼容旧字段' }));
    h.render();
    assert.ok(h.track.innerHTML.includes('兼容旧字段'));
    h.setSkill(Object.assign({}, h.getSkill(), { desc: '', description: '', manual_definition: { desc: '' } }));
    h.render();
    assert.ok(!h.track.innerHTML.includes('manual-timeline-skill-description'), '清空描述后不保留旧文字');
});

run('角色持有技能列表按拥有者读取全部技能，不受四格与槽位限制', () => {
    const skills = Array.from({ length: 7 }, (_, index) => ({
        id: `owned_${index}`, owner_type: 'character', owner_id: 'hero', kind: 'active',
        slot: index + 1, name: `技能${index + 1}`, desc: index === 6 ? '第七个技能\n<说明>' : '', steps: []
    }));
    const h = harness('scale', [], { currentParty: [null, { ID: 'hero' }, { ID: 'other' }] });
    h.window.SkillRegistry = { getByOwner: (type, id) => type === 'character' && id === 'hero' ? skills : [] };
    assert.strictEqual(h.ui.getManualOwnedSkills(1).length, 7);
    const html = h.ui.renderOwnedSkillList(1);
    assert.strictEqual((html.match(/data-manual-skill-id=/g) || []).length, 7);
    assert.ok(html.includes('技能7'));
    assert.ok(html.includes('第七个技能\n&lt;说明&gt;'));
    assert.ok(html.includes('data-manual-owner-slot="1"'));
    assert.ok(!html.includes('burst-skill-slot'));
    assert.ok(h.ui.renderOwnedSkillList(2).includes('暂无可用技能'));
    assert.ok(h.ui.renderOwnedSkillList(3).includes('暂无可用技能'));
});

run('主角技能、当前职业与旧格式角色归属正确合并去重，不混入其他角色和未归属自定义技能', () => {
    const shared = { id: 'mc_shared', kind: 'active', name: '主角技能', steps: [] };
    const job = { id: 'job_owned', kind: 'active', name: '职业技能', steps: [] };
    const old = { id: 'old_fifth', character_id: 'hero', slot: 5, name: '旧格式第五技能', steps: [] };
    const h = harness('scale', [], { currentMC: { jobId: 'test_job', skillIds: ['mc_shared'] },
        allClasses: [{ id: 'test_job', skill_refs: { active: ['job_owned', 'mc_shared'] } }],
        currentParty: [null, { ID: 'hero' }], globalCharaSkillMap: { old_fifth: old, alias: old } });
    h.window.SkillRegistry = {
        get: (id) => ({ mc_shared: shared, job_owned: job }[id]),
        getByOwner: (type, id) => type === 'main_character' ? [shared] : type === 'job' && id === 'test_job' ? [job] : []
    };
    h.window.ManualCustomSkills.list = () => [
        { id: 'unassigned', owner_type: 'manual_custom', owner_id: 'local' },
        { id: 'assigned', owner_type: 'character', owner_id: 'hero', name: '专属自定义' },
        { id: 'other', owner_type: 'character', owner_id: 'other' },
        { id: 'passive', owner_type: 'character', owner_id: 'hero', kind: 'passive' }
    ];
    assert.deepStrictEqual(Array.from(h.ui.getManualOwnedSkills(0), (skill) => skill.id), ['mc_shared', 'job_owned']);
    assert.deepStrictEqual(Array.from(h.ui.getManualOwnedSkills(1), (skill) => skill.id), ['old_fifth', 'assigned']);
});

run('手动角色面板替换原技能格为空列表或完整列表，数据隔离后仍保留使用者', () => {
    const h = harness();
    const element = { innerHTML: '四个旧技能格', classList: { add() {} }, setAttribute() {} };
    const selector = { getAttribute: () => '0', setAttribute() {}, addEventListener() {},
        closest: () => ({ querySelector: () => element, classList: { toggle() {} } }) };
    const captured = h.ui.captureOwnedSkillLists({ querySelectorAll: () => [selector] });
    h.ui.restoreOwnedSkillLists(captured);
    assert.ok(element.innerHTML.includes('暂无可用技能'));
    assert.ok(!element.innerHTML.includes('旧技能格'));
    h.window.SkillRegistry = { getByOwner: () => [{ id: 'mc_test', name: '狂怒', kind: 'active' }] };
    h.ui.restoreOwnedSkillLists(captured);
    assert.ok(element.innerHTML.includes('data-manual-owner-slot="0"'));
    assert.ok(element.innerHTML.includes('data-manual-skill-id="mc_test"'));
});

run('技能列表默认收起，点击角色独占展开，再次点击收起且不修改时间轴', () => {
    const h = harness();
    const lists = [0, 1, 2, 3].map((ownerSlot) => ({ ownerSlot,
        element: { hidden: false, classList: { add() {} }, setAttribute() {} },
        row: { selected: true, classList: { toggle(name, value) { this.selected = value; } } },
        selector: { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; },
            addEventListener(type, callback) { this[type] = callback; } }
    }));
    const before = JSON.stringify(h.ui.state.turns);
    h.ui.restoreOwnedSkillLists(lists);
    assert.ok(lists.every((list) => list.element.hidden));
    assert.ok(lists.every((list) => list.selector.attributes['aria-expanded'] === 'false'));
    const click = (slot) => lists[slot].selector.click({ stopPropagation() {} });
    click(0);
    assert.deepStrictEqual(lists.map((list) => list.element.hidden), [false, true, true, true]);
    click(2);
    assert.deepStrictEqual(lists.map((list) => list.element.hidden), [true, true, false, true]);
    assert.strictEqual(lists[2].selector.attributes['aria-expanded'], 'true');
    assert.strictEqual(lists[2].selector.attributes['aria-controls'], lists[2].element.id);
    // 刷新角色/技能时保留本次选中的角色，但不会把所有列表重新打开。
    h.ui.restoreOwnedSkillLists(lists);
    assert.deepStrictEqual(lists.map((list) => list.element.hidden), [true, true, false, true]);
    click(2);
    assert.ok(lists.every((list) => list.element.hidden));
    assert.strictEqual(JSON.stringify(h.ui.state.turns), before);
});

run('手动生命值默认满血，仅读取外部HP上限，当前百分比完全独立', () => {
    const values = { 'char-actual-hp-0': '31,705', 'char-current-hp-0': '15,853',
        'char-actual-hp-1': '8,000', 'char-current-hp-1': '1',
        'char-actual-hp-2': '10,000', 'char-current-hp-2': '0' };
    const h = harness('scale', [], { document: { readyState: 'loading', addEventListener() {},
        getElementById: (id) => id in values ? { textContent: values[id] } : null } });
    const hp = h.ui.readManualActorHp(0);
    assert.strictEqual(hp.maxHp, 31705);
    assert.strictEqual(hp.currentHp, 31705);
    assert.strictEqual(hp.percent, 100);
    h.ui.setManualHpPercent(0, 50);
    h.ui.setManualHpPercent(1, 1);
    h.ui.setManualHpPercent(2, 0);
    assert.ok(h.ui.renderManualActorHp(0).includes('15,853 / 31,705'));
    assert.ok(h.ui.renderManualActorHp(1).includes('aria-valuenow="80"'));
    assert.ok(h.ui.renderManualActorHp(1).includes('is-low'));
    assert.strictEqual(h.ui.readManualActorHp(2).currentHp, 0);
    assert.strictEqual(h.ui.readManualActorHp(3), null);
    assert.ok(h.ui.renderManualActorHp(3).includes('— / —'));
    assert.ok(!h.ui.renderManualActorHp(3).includes('role="meter"'));
    values['char-current-hp-0'] = '99,999';
    assert.strictEqual(h.ui.readManualActorHp(0).percent, 50);
    values['char-actual-hp-0'] = '-';
    assert.strictEqual(h.ui.readManualActorHp(0), null);
});

run('手动基础/进阶独立切换四个角色生命槽，刷新数值且不影响技能展开与时间轴', () => {
    const values = { 'char-actual-hp-0': '1000', 'char-current-hp-0': '500' };
    const h = harness('scale', [], { document: { readyState: 'loading', addEventListener() {},
        getElementById: (id) => id in values ? { textContent: values[id] } : null } });
    const bars = [0, 1, 2, 3].map((slot) => ({ hidden: true, innerHTML: '',
        getAttribute: () => String(slot), closest: () => ({ classList: { toggle() {} } }) }));
    const buttons = ['basic', 'advanced'].map((mode) => ({ getAttribute: () => mode,
        classList: { toggle() {} }, setAttribute(name, value) { this[name] = value; } }));
    const board = { querySelectorAll: (selector) => selector === '[data-manual-actor-hp]' ? bars
        : selector === '[data-manual-settings-mode]' ? buttons : [] };
    const timeline = JSON.stringify(h.ui.state.turns);
    h.ui.state.expandedOwnedSkillSlot = 2;
    h.ui.setManualSettingsMode(board, 'advanced');
    assert.ok(bars.every((bar) => !bar.hidden));
    assert.strictEqual(buttons[1]['aria-pressed'], 'true');
    assert.ok(bars[0].innerHTML.includes('1,000 / 1,000'));
    values['char-current-hp-0'] = '100';
    h.ui.updateManualActorHp(board);
    assert.ok(bars[0].innerHTML.includes('1,000 / 1,000'));
    h.ui.setManualSettingsMode(board, 'basic');
    assert.ok(bars.every((bar) => bar.hidden));
    assert.strictEqual(buttons[0]['aria-pressed'], 'true');
    assert.strictEqual(h.ui.state.expandedOwnedSkillSlot, 2);
    assert.strictEqual(JSON.stringify(h.ui.state.turns), timeline);
});

run('全部/单回合血量独立设置、重算和保存，新增回合继承默认值', () => {
    const h = harness();
    h.window.BurstSimulator.calculateManualHitDamage = (hit, runtime) => runtime.actors[hit.actorSlot].hpPercent;
    h.ui.setManualHpPercent(0, 70);
    h.ui.addTurn(h.board);
    h.ui.state.hpTurnScope = '2';
    h.ui.setManualHpPercent(0, 20);
    h.render();
    assert.strictEqual(h.ui.state.turns[0].blocks.find((b) => b.id === 'manual-fixed-1-0').damage, 210);
    assert.strictEqual(h.ui.state.turns[1].blocks.find((b) => b.id === 'manual-fixed-2-0').damage, 60);
    assert.strictEqual(h.ui.getManualHpPercent(h.ui.state.turns[1], 1), 100);
    assert.ok(h.ui.renderManualActorHp(0).includes('value="20"'));
    h.window.ManualBurstSimulator.saveTimeline();
    h.ui.state.hpDefaults = {};
    h.ui.state.turns = [];
    assert.ok(h.ui.loadTimelineFromLocal('test_shortcut'));
    assert.strictEqual(h.ui.getManualHpPercent(h.ui.state.turns[0], 0), 70);
    assert.strictEqual(h.ui.getManualHpPercent(h.ui.state.turns[1], 0), 20);
    h.ui.addTurn(h.board);
    assert.strictEqual(h.ui.getManualHpPercent(h.ui.state.turns[2], 0), 70);
    h.ui.state.hpTurnScope = 'all';
    assert.ok(h.ui.renderManualActorHp(0).includes('各回合不同'));
    h.ui.setManualHpPercent(0, 0);
    assert.ok(h.ui.state.turns.every((t) => h.ui.getManualHpPercent(t, 0) === 0));
});

run('删除回合后血量跟随原回合，选中回合重编号，旧存档默认100%', () => {
    const h = harness();
    h.ui.addTurn(h.board);
    h.ui.addTurn(h.board);
    h.ui.state.hpTurnScope = '3';
    h.ui.setManualHpPercent(1, 34);
    h.ui.deleteTurn(h.board, 2);
    assert.strictEqual(h.ui.state.hpTurnScope, '2');
    assert.strictEqual(h.ui.getManualHpPercent(h.ui.state.turns[1], 1), 34);
    h.ui.deleteTurn(h.board, 2);
    assert.strictEqual(h.ui.state.hpTurnScope, 'all');
    h.storage.test_shortcut = JSON.stringify({ version: 1, turns: [{ blocks: [] }] });
    assert.ok(h.ui.loadTimelineFromLocal('test_shortcut'));
    assert.strictEqual(h.ui.getManualHpPercent(h.ui.state.turns[0], 0), 100);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(h.ui.normalizeHpSettings({0: -5, 1: 200, 2: null, 3: 'bad'}))), {0: 0, 1: 100});
});
