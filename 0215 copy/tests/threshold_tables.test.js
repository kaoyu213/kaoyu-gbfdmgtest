'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const dataPath = path.join(root, 'js', 'threshold_tables.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

function validateStages(name, stages) {
    assert.ok(Array.isArray(stages) && stages.length > 0, `${name}: stages 不能为空`);
    let previous = 0;
    stages.forEach((stage, index) => {
        assert.strictEqual(typeof stage.slope, 'number', `${name}: 第 ${index + 1} 段 slope 必须为数字`);
        assert.ok(stage.slope >= 0 && stage.slope <= 1, `${name}: 第 ${index + 1} 段 slope 超出 0~1`);
        if (stage.limit === null) {
            assert.strictEqual(index, stages.length - 1, `${name}: 只有末段 limit 可为 null`);
            return;
        }
        assert.ok(Number.isFinite(stage.limit) && stage.limit > previous, `${name}: 第 ${index + 1} 段 limit 必须递增`);
        previous = stage.limit;
    });
    assert.strictEqual(stages[stages.length - 1].limit, null, `${name}: 末段 limit 必须为 null（无穷大）`);
}

async function main() {
    assert.ok(data.tables && Object.keys(data.tables).length > 0, 'tables 不能为空');
    assert.ok(data.tables[data.fallbackTableId], 'fallbackTableId 必须指向存在的表');
    Object.entries(data.tables).forEach(([id, entry]) => validateStages(`tables.${id}`, entry.stages));
    Object.entries(data.tables)
        .filter(([, entry]) => entry.type === 'skill')
        .forEach(([id, entry]) => {
            assert.ok(Object.hasOwn(entry, 'damage_limit_type'), `${id}: 技伤表缺少 damage_limit_type`);
            assert.strictEqual(typeof entry.damage_limit_type, 'string', `${id}: damage_limit_type 必须是字符串`);
        });
    const expectedSkillTables = {
        'skill_18.5': {
            damageLimitType: '100018',
            stages: [[100000, 1], [150000, 0.6], [250000, 0.4], [400000, 0.1], [null, 0.01]]
        },
        'skill_21.5': {
            damageLimitType: '1000004',
            stages: [[100000, 1], [200000, 0.5], [300000, 0.3], [1000000, 0.05], [null, 0.01]]
        },
        'skill_48.5': {
            damageLimitType: '3000008',
            stages: [[300000, 1], [400000, 0.9], [500000, 0.7], [1000000, 0.05], [null, 0.01]]
        },
        'skill_73': {
            damageLimitType: '6000001',
            stages: [[600000, 1], [700000, 0.7], [800000, 0.5], [1000000, 0.05], [null, 0.01]]
        },
        'skill_80': {
            damageLimitType: '7000002',
            stages: [[700000, 1], [800000, 0.7], [900000, 0.25], [1000000, 0.05], [null, 0.01]]
        },
        'skill_116': {
            damageLimitType: '1000001',
            stages: [[1000000, 1], [1200000, 0.6], [1300000, 0.3], [1500000, 0.05], [null, 0.01]]
        },
        'skill_58': {
            damageLimitType: '5000001',
            stages: [[500000, 1], [600000, 0.5], [700000, 0.25], [800000, 0.05], [null, 0.01]]
        }
    };
    Object.entries(expectedSkillTables).forEach(([id, expected]) => {
        const actual = data.tables[id];
        assert.ok(actual, `${id}: 衰减表不存在`);
        assert.strictEqual(actual.damage_limit_type, expected.damageLimitType, `${id}: damage_limit_type 错误`);
        assert.deepStrictEqual(actual.stages.map(stage => [stage.limit, stage.slope]), expected.stages, `${id}: stages 错误`);
    });
    Object.entries(data.worldCap || {}).forEach(([mode, stages]) => validateStages(`worldCap.${mode}`, stages));
    Object.entries(data.customEditorExample || {}).forEach(([name, stages]) => validateStages(`customEditorExample.${name}`, stages));

    (data.testPresets || []).forEach((preset) => {
        assert.ok(preset.id && preset.label, 'testPresets 每项必须有 id 和 label');
        assert.notStrictEqual(Boolean(preset.tableId), Boolean(preset.worldCapMode), `${preset.id}: 必须且只能引用一种衰减表`);
        if (preset.tableId) assert.ok(data.tables[preset.tableId], `${preset.id}: tableId 不存在`);
        if (preset.worldCapMode) assert.ok(data.worldCap[preset.worldCapMode], `${preset.id}: worldCapMode 不存在`);
    });

    const context = {
        window: {},
        fetch: async () => ({ ok: true, json: async () => data }),
        console
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'js', 'threshold_registry.js'), 'utf8'), context);
    await context.window.ThresholdRegistry.loadThresholdData();
    assert.strictEqual(context.window.ThresholdRegistry.getFallback().tableId, data.fallbackTableId);
    assert.strictEqual(context.window.ThresholdRegistry.getTestPresets().length, data.testPresets.length);
    assert.strictEqual(context.window.ThresholdRegistry.getWorldCap('660').at(-1).limit, Infinity);
    assert.strictEqual(context.window.ThresholdRegistry.getById('skill_18.5').damage_limit_type, '100018');
    assert.strictEqual(context.window.ThresholdRegistry.getById('skill_116').damage_limit_type, '1000001');

    const zhanTable = context.window.ThresholdRegistry.getById('na_zhan_116');
    assert.ok(zhanTable, '必须存在斩专用平A衰减表');
    assert.strictEqual(zhanTable.type, 'na');
    assert.strictEqual(zhanTable.displayCap, 116);
    assert.deepStrictEqual(
        Array.from(zhanTable.stages, (stage) => [stage.limit, stage.slope]),
        [
            [1000000, 1.0],
            [1200000, 0.6],
            [1300000, 0.3],
            [1500000, 0.05],
            [Infinity, 0.01]
        ]
    );

    ['damage_cap.js', 'init.js', 'na_dmg_calc.js', 'decay_table_inference.js', 'decay_table_inference_ui.js'].forEach((filename) => {
        new vm.Script(fs.readFileSync(path.join(root, 'js', filename), 'utf8'), { filename });
    });
    const testHtml = fs.readFileSync(path.join(root, 'decay_test.html'), 'utf8');
    const inlineScriptPattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
    let scriptMatch;
    while ((scriptMatch = inlineScriptPattern.exec(testHtml))) {
        if (scriptMatch[1].trim()) new vm.Script(scriptMatch[1], { filename: 'decay_test.html:inline' });
    }
    const indexHtml = fs.readFileSync(path.join(root, 'index1.html'), 'utf8');
    assert.ok(indexHtml.includes('id="main-workspace-decay-inference"'), 'Index 必须包含衰减表推算工作区');
    assert.ok(indexHtml.includes('js/decay_table_inference.js'), 'Index 必须加载衰减表推算模块');
    inlineScriptPattern.lastIndex = 0;
    while ((scriptMatch = inlineScriptPattern.exec(indexHtml))) {
        if (scriptMatch[1].trim()) new vm.Script(scriptMatch[1], { filename: 'index1.html:inline' });
    }

    const productionSources = [
        path.join(root, 'js', 'damage_cap.js'),
        path.join(root, 'decay_test.html')
    ].map(file => fs.readFileSync(file, 'utf8')).join('\n');
    assert.ok(!/const\s+(?:WORLD_CAP_)?THRESHOLD_TABLE/.test(productionSources), '不应在代码中重新声明预置衰减表');
    assert.ok(!/\{\s*limit\s*:\s*\d+\s*,\s*slope\s*:/.test(productionSources), '预置衰减数值必须只存在于 threshold_tables.json');

    process.stdout.write('ok - 衰减表统一配置、引用和注册表解析均有效\n');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
