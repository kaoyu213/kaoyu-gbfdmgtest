'use strict';

const assert = require('assert');
const inference = require('../js/decay_table_inference.js');

function run(name, test) {
    test();
    process.stdout.write(`ok - ${name}\n`);
}

run('可从多组单hit极值恢复斜率模板和近似阈值', () => {
    const thresholds = [500000, 600000, 700000, 800000];
    const slopes = [1, 0.5, 0.25, 0.05, 0.01];
    const settings = {
        capBonusPercent: 0,
        ampPercent: 0,
        takenAmpPercent: 0,
        skillSupp: 0,
        capRelaxationPercent: 0,
        hits: 1,
        finalMode: 'per_hit'
    };
    const samples = [100000, 300000, 520000, 580000, 620000, 680000, 720000, 780000, 850000, 1000000]
        .map((theory) => {
            const theoryMin = theory * 0.95;
            const theoryMax = theory * 1.05;
            const finalMin = inference.predictFinal({ theory: theoryMin }, thresholds, slopes, settings);
            const finalMax = inference.predictFinal({ theory: theoryMax }, thresholds, slopes, settings);
            return { theory, theoryMin, theoryMax, finalMin, finalMax, settings };
        });
    const result = inference.infer(samples, { thresholdStep: 50000, fuzzyDisplayCap: 580000 });
    assert.strictEqual(result.best.thresholds.length, 4);
    assert.deepStrictEqual(result.best.slopes, slopes);
    assert.ok(result.best.displayCap >= 57 && result.best.displayCap <= 59);
    assert.strictEqual(result.best.rmse, 0);
    assert.strictEqual(result.fitStatus, 'credible');
});

run('预测极值分别与实测上下限比较', () => {
    const candidate = {
        thresholds: [100000, 150000, 250000, 400000],
        slopes: [1, 0.6, 0.4, 0.1, 0.01]
    };
    const settings = { hits: 1, finalMode: 'per_hit' };
    const theories = [50000, 90000, 110000, 140000, 170000, 220000, 270000, 350000, 450000, 600000];
    const samples = theories.map((theory) => {
        const theoryMin = theory * 0.95;
        const theoryMax = theory * 1.05;
        const finalMin = inference.predictFinal({ theory: theoryMin }, candidate.thresholds, candidate.slopes, settings);
        const finalMax = inference.predictFinal({ theory: theoryMax }, candidate.thresholds, candidate.slopes, settings);
        return { theory, theoryMin, theoryMax, finalMin, finalMax, settings };
    });
    const result = inference.infer(samples, { thresholdStep: 50000 });
    assert.strictEqual(result.best.rmse, 0);
});

run('无衰减理论伤害包含伤害上升、增幅和被伤增幅', () => {
    const sample = {
        theory: 100000,
        theoryMin: 95000,
        theoryMax: 105000,
        settings: {
            skillSupp: 12000,
            ampPercent: 10,
            takenAmpPercent: 20,
            hits: 1,
            finalMode: 'per_hit'
        }
    };
    const center = inference.predictUndecayedFinal(sample, {});
    const range = inference.predictUndecayedFinalRange(sample, {});
    assert.strictEqual(center, Math.ceil((100000 + 12000) * 1.1 * 1.2));
    assert.strictEqual(range.min, Math.ceil((95000 + 12000) * 1.1 * 1.2));
    assert.strictEqual(range.max, Math.ceil((105000 + 12000) * 1.1 * 1.2));
});

run('Wiki模糊上限作为硬约束参与极值推算', () => {
    const thresholds = [500000, 600000, 700000, 800000];
    const slopes = [1, 0.5, 0.25, 0.05, 0.01];
    const settings = { hits: 1, finalMode: 'per_hit' };
    const samples = [100000, 300000, 520000, 580000, 620000, 680000, 720000, 780000, 850000, 1000000]
        .map((theory) => {
            const theoryMin = theory * 0.95;
            const theoryMax = theory * 1.05;
            const finalMin = inference.predictFinal({ theory: theoryMin }, thresholds, slopes, settings) - 5;
            const finalMax = inference.predictFinal({ theory: theoryMax }, thresholds, slopes, settings) + 5;
            return { theory, theoryMin, theoryMax, finalMin, finalMax, settings };
        });
    const result = inference.infer(samples, {
        thresholdStep: 50000,
        fuzzyDisplayCap: 580000,
        maxCandidates: 3
    });
    assert.deepStrictEqual(result.best.thresholds, thresholds);
    assert.strictEqual(result.best.displayCap, 58);
});

run('三组样本也会先给探索性近似结果', () => {
    const result = inference.infer([
        { theory: 100000, final: 100000 },
        { theory: 300000, final: 220000 },
        { theory: 600000, final: 280000 }
    ], { thresholdStep: 50000, fuzzyDisplayCap: 290000 });
    assert.strictEqual(result.approximate, true);
    assert.strictEqual(result.best.thresholds.length, 4);
    assert.strictEqual(result.best.slopes.length, 5);
    assert.ok(result.nextTargets.length > 0);
});

run('截图中的10组不完全一致数据仍返回近似表和下一步目标', () => {
    const rows = [
        [53383, 173911, 52, 3.7, 100000],
        [119875, 256685, 52, 3.7, 100000],
        [167126, 323507, 52, 3.7, 100000],
        [175088, 332437, 52, 3.7, 100000],
        [357510, 554494, 52, 3.7, 100000],
        [485237, 662378, 52, 3.7, 100000],
        [626158, 903036, 76.2, 3.7, 210000],
        [783436, 1116291, 100.4, 3.7, 300000],
        [1123570, 1007371, 81.15, 3.7, 232500],
        [2500733, 1549238, 159, 14.3, 300000]
    ];
    const samples = rows.map(([theory, final, capBonusPercent, ampPercent, skillSupp]) => ({
        theory,
        finalMin: final,
        finalMax: final,
        settings: { capBonusPercent, ampPercent, skillSupp, hits: 1, finalMode: 'per_hit' }
    }));
    const result = inference.infer(samples, { thresholdStep: 50000, fuzzyDisplayCap: 290000 });
    assert.strictEqual(result.approximate, true);
    assert.ok(Number.isFinite(result.best.rmse));
    assert.strictEqual(result.best.thresholds.length, 4);
    assert.ok(Math.abs(result.best.displayCap * 10000 - 290000) <= 10000);
    assert.ok(result.nextTargets.length > 0);
    assert.strictEqual(result.fitStatus, 'no_match');
    assert.strictEqual(result.searchMethod, 'exhaustive');
    assert.ok(result.evaluatedCount > 0);
    assert.ok(result.candidates.every(candidate => candidate.thresholds.every(limit => limit % 50000 === 0)));
    const knownSignatures = new Set(inference.normalizeSlopeTemplates().map(template => template.slopes.join('/')));
    assert.ok(result.candidates.every(candidate => knownSignatures.has(candidate.slopes.join('/'))));
    assert.ok(result.best.slopeTemplateId);
});

run('近似推算不会生成现有技伤表之外的任意斜率', () => {
    const result = inference.infer([
        { theory: 100000, final: 118000 },
        { theory: 250000, final: 241000 },
        { theory: 500000, final: 331000 },
        { theory: 900000, final: 362000 }
    ], { thresholdStep: 50000, fuzzyDisplayCap: 350000 });
    const knownSignatures = new Set(inference.normalizeSlopeTemplates().map(template => template.slopes.join('/')));
    assert.ok(knownSignatures.has(result.best.slopes.join('/')));
    assert.ok(result.best.displayCap >= 34 && result.best.displayCap <= 36);
});

run('实测数据即使强烈指向远处也不能突破Wiki基础上限一万误差', () => {
    const samples = [
        { theory: 100000, final: 500000 },
        { theory: 500000, final: 1200000 },
        { theory: 1000000, final: 1800000 },
        { theory: 2500000, final: 2600000 }
    ];
    const result = inference.infer(samples, {
        thresholdStep: 50000,
        fuzzyDisplayCap: 290000,
        fuzzyCapTolerance: 10000
    });
    assert.ok(Math.abs(result.best.displayCap * 10000 - 290000) <= 10000);
    assert.strictEqual(result.approximate, true);
    assert.strictEqual(result.fitStatus, 'no_match');
    assert.strictEqual(result.best.confidence, '不可信');
});

run('一组样本即可开始穷举并返回极低置信度候选', () => {
    const thresholds = [500000, 600000, 700000, 800000];
    const slopes = [1, 0.5, 0.25, 0.05, 0.01];
    const settings = { hits: 1, finalMode: 'per_hit' };
    const theory = 650000;
    const theoryMin = theory * 0.95;
    const theoryMax = theory * 1.05;
    const result = inference.infer([
        {
            theory,
            theoryMin,
            theoryMax,
            finalMin: inference.predictFinal({ theory: theoryMin, settings }, thresholds, slopes, {}),
            finalMax: inference.predictFinal({ theory: theoryMax, settings }, thresholds, slopes, {}),
            settings
        }
    ], { thresholdStep: 50000, fuzzyDisplayCap: 580000 });
    assert.strictEqual(result.sampleCount, 1);
    assert.strictEqual(result.approximate, true);
    assert.strictEqual(result.fitStatus, 'exploratory');
    assert.strictEqual(result.best.confidence, '极低');
    assert.ok(result.evaluatedCount > 0);
    assert.ok(result.nextTargets.length > 0);
});

run('没有样本时才拒绝生成探索性近似', () => {
    assert.throws(
        () => inference.infer([], {}),
        /至少需要1组/
    );
});
