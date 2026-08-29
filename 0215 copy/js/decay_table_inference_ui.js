// ==========================================
//  Index 内的技伤衰减表推算小工具
// ==========================================

(function (global) {
    'use strict';

    var STORAGE_KEY = 'gbf-decay-inference-samples-v1';
    var CURRENT_THEORY_VERSION = 2;
    // 用户在本次改造前已经录入、但旧版本尚未支持持久化的10条样本。
    // 仅在本机没有任何已保存样本时恢复一次；之后以 localStorage 为准。
    var INITIAL_RECOVERY_SAMPLES = [
        { theory: 53383, finalMin: 173911, finalMax: 173911, multiplier: 2, settings: { capBonusPercent: 52, ampPercent: 3.7, takenAmpPercent: 0, skillSupp: 100000, capRelaxationPercent: 0, hits: 1, finalMode: 'per_hit' }, charIndex: 0 },
        { theory: 119875, finalMin: 256685, finalMax: 256685, multiplier: 2, settings: { capBonusPercent: 52, ampPercent: 3.7, takenAmpPercent: 0, skillSupp: 100000, capRelaxationPercent: 0, hits: 1, finalMode: 'per_hit' }, charIndex: 0 },
        { theory: 167126, finalMin: 323507, finalMax: 323507, multiplier: 2, settings: { capBonusPercent: 52, ampPercent: 3.7, takenAmpPercent: 0, skillSupp: 100000, capRelaxationPercent: 0, hits: 1, finalMode: 'per_hit' }, charIndex: 0 },
        { theory: 175088, finalMin: 332437, finalMax: 332437, multiplier: 2, settings: { capBonusPercent: 52, ampPercent: 3.7, takenAmpPercent: 0, skillSupp: 100000, capRelaxationPercent: 0, hits: 1, finalMode: 'per_hit' }, charIndex: 0 },
        { theory: 357510, finalMin: 554494, finalMax: 554494, multiplier: 2, settings: { capBonusPercent: 52, ampPercent: 3.7, takenAmpPercent: 0, skillSupp: 100000, capRelaxationPercent: 0, hits: 1, finalMode: 'per_hit' }, charIndex: 0 },
        { theory: 485237, finalMin: 662378, finalMax: 662378, multiplier: 2, settings: { capBonusPercent: 52, ampPercent: 3.7, takenAmpPercent: 0, skillSupp: 100000, capRelaxationPercent: 0, hits: 1, finalMode: 'per_hit' }, charIndex: 0 },
        { theory: 626158, finalMin: 903036, finalMax: 903036, multiplier: 2, settings: { capBonusPercent: 76.2, ampPercent: 3.7, takenAmpPercent: 0, skillSupp: 210000, capRelaxationPercent: 0, hits: 1, finalMode: 'per_hit' }, charIndex: 0 },
        { theory: 783436, finalMin: 1116291, finalMax: 1116291, multiplier: 2, settings: { capBonusPercent: 100.4, ampPercent: 3.7, takenAmpPercent: 0, skillSupp: 300000, capRelaxationPercent: 0, hits: 1, finalMode: 'per_hit' }, charIndex: 0 },
        { theory: 1123570, finalMin: 1007371, finalMax: 1007371, multiplier: 2, settings: { capBonusPercent: 81.15, ampPercent: 3.7, takenAmpPercent: 0, skillSupp: 232500, capRelaxationPercent: 0, hits: 1, finalMode: 'per_hit' }, charIndex: 0 },
        { theory: 2500733, finalMin: 1549238, finalMax: 1549238, multiplier: 2, settings: { capBonusPercent: 159, ampPercent: 14.3, takenAmpPercent: 0, skillSupp: 300000, capRelaxationPercent: 0, hits: 1, finalMode: 'per_hit' }, charIndex: 0 }
    ];

    var state = {
        samples: [],
        result: null,
        currentSnapshot: null,
        savedMetadata: null
    };

    function cloneSamples(samples) {
        return JSON.parse(JSON.stringify(samples || []));
    }

    function isCurrentTheorySample(sample) {
        return Number(sample && sample.theoryVersion) === CURRENT_THEORY_VERSION;
    }

    function inferenceSamples() {
        return state.samples.filter(isCurrentTheorySample);
    }

    function saveSamples() {
        try {
            state.savedMetadata = {
                multiplier: numberValue('decay-infer-multiplier', null),
                fuzzyCapWan: numberValue('decay-infer-fuzzy-cap', null),
                damageLimitType: el('decay-infer-limit-type') ? el('decay-infer-limit-type').value : '',
                thresholdStep: numberValue('decay-infer-threshold-step', 50000)
            };
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
                samples: state.samples,
                metadata: state.savedMetadata
            }));
        } catch (error) {
            console.warn('[DecayTableInferenceUI] 样本持久化失败:', error);
        }
    }

    function loadSamples() {
        try {
            var saved = global.localStorage.getItem(STORAGE_KEY);
            if (saved != null) {
                var parsed = JSON.parse(saved);
                state.samples = Array.isArray(parsed.samples) ? parsed.samples : [];
                state.savedMetadata = parsed.metadata || null;
                return;
            }
        } catch (error) {
            console.warn('[DecayTableInferenceUI] 样本恢复失败:', error);
        }
        state.samples = cloneSamples(INITIAL_RECOVERY_SAMPLES);
        state.savedMetadata = { multiplier: 2, fuzzyCapWan: 29, damageLimitType: '', thresholdStep: 50000 };
        try {
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
                samples: state.samples,
                metadata: state.savedMetadata
            }));
        } catch (error) {
            console.warn('[DecayTableInferenceUI] 初始样本备份失败:', error);
        }
    }

    function applySavedMetadata() {
        var metadata = state.savedMetadata || {};
        if (metadata.multiplier > 0 && el('decay-infer-multiplier')) el('decay-infer-multiplier').value = metadata.multiplier;
        if (metadata.fuzzyCapWan > 0 && el('decay-infer-fuzzy-cap')) el('decay-infer-fuzzy-cap').value = metadata.fuzzyCapWan;
        if (metadata.damageLimitType && el('decay-infer-limit-type')) el('decay-infer-limit-type').value = metadata.damageLimitType;
        if (metadata.thresholdStep > 0 && el('decay-infer-threshold-step')) el('decay-infer-threshold-step').value = metadata.thresholdStep;
    }

    function el(id) {
        return document.getElementById(id);
    }

    function numberValue(id, fallback) {
        var value = Number(el(id) && el(id).value);
        return Number.isFinite(value) ? value : fallback;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDamage(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return '-';
        return Math.round(number).toLocaleString();
    }

    function formatPercent(value) {
        var number = Number(value) || 0;
        return number.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1') + '%';
    }

    function setStatus(message, kind) {
        var node = el('decay-infer-status');
        if (!node) return;
        node.textContent = message || '';
        node.className = 'decay-infer-status' + (kind ? ' is-' + kind : '');
    }

    function selectedCharIndex() {
        return Math.max(0, Math.min(5, Math.round(numberValue('decay-infer-char', 0))));
    }

    function refreshCharacterOptions() {
        var select = el('decay-infer-char');
        if (!select) return;
        var selectedValue = select.value;
        for (var slot = 0; slot <= 5; slot++) {
            var option = select.querySelector('option[value="' + slot + '"]');
            if (!option) continue;
            if (slot === 0) {
                option.textContent = '主角';
                continue;
            }
            var partySlots = typeof currentParty !== 'undefined' ? currentParty : global.currentParty;
            var charData = partySlots ? partySlots[slot] : null;
            var name = charData && (charData['名称'] || charData.name);
            option.textContent = name ? String(name) : '角色' + (slot + 1) + '（空位）';
        }
        select.value = selectedValue;
    }

    function syncMultiplierAndRecalculate() {
        var charIndex = selectedCharIndex();
        var multiplier = numberValue('decay-infer-multiplier', NaN);
        if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error('请先输入Wiki提供的技能倍率。');
        var sourceInput = el('skill-mult-input-' + charIndex);
        if (sourceInput) sourceInput.value = String(multiplier);
        if (typeof global.recalculate === 'function') global.recalculate();
        var snapshot = typeof global.getSkillDamageInferenceSnapshot === 'function'
            ? global.getSkillDamageInferenceSnapshot(charIndex, multiplier)
            : (global.skillDamageInferenceSnapshots && global.skillDamageInferenceSnapshots[charIndex]);
        if (!snapshot || !Number.isFinite(Number(snapshot.theory))) {
            throw new Error('当前盘面未能生成技伤理论值，请检查角色、倍率和盘面数据。');
        }
        return snapshot;
    }

    function sampleUndecayedRange(sample) {
        var storedMin = Number(sample && sample.undecayedTheoryMin);
        var storedMax = Number(sample && sample.undecayedTheoryMax);
        var storedCenter = Number(sample && sample.undecayedTheory);
        if (Number.isFinite(storedMin) && storedMin > 0 && Number.isFinite(storedMax) && storedMax > 0) {
            return {
                min: Math.min(storedMin, storedMax),
                max: Math.max(storedMin, storedMax),
                center: Number.isFinite(storedCenter) ? storedCenter : (storedMin + storedMax) / 2
            };
        }
        if (global.DecayTableInference
            && typeof global.DecayTableInference.predictUndecayedFinalRange === 'function') {
            return global.DecayTableInference.predictUndecayedFinalRange(sample || {}, {});
        }
        var settings = sample && sample.settings ? sample.settings : {};
        var raw = Number(sample && sample.theory) || 0;
        var rawMin = Number(sample && sample.theoryMin);
        var rawMax = Number(sample && sample.theoryMax);
        if (!Number.isFinite(rawMin)) rawMin = raw * 0.95;
        if (!Number.isFinite(rawMax)) rawMax = raw * 1.05;
        var post = function (value) {
            return Math.ceil((value + (Number(settings.skillSupp) || 0))
                * (1 + (Number(settings.ampPercent) || 0) / 100)
                * (1 + (Number(settings.takenAmpPercent) || 0) / 100));
        };
        return { min: post(rawMin), max: post(rawMax), center: post(raw) };
    }

    function captureSample() {
        try {
            var finalMin = numberValue('decay-infer-final-min', NaN);
            var finalMax = numberValue('decay-infer-final-max', NaN);
            if (!Number.isFinite(finalMin) || finalMin <= 0 || !Number.isFinite(finalMax) || finalMax <= 0) {
                throw new Error('请输入游戏内实测的单hit最小与最大伤害。');
            }
            if (finalMin > finalMax) {
                var swap = finalMin;
                finalMin = finalMax;
                finalMax = swap;
            }
            var snapshot = syncMultiplierAndRecalculate();
            state.samples.push({
                theory: Number(snapshot.theory),
                theoryMin: Number.isFinite(Number(snapshot.theoryMin)) ? Number(snapshot.theoryMin) : Number(snapshot.theory) * 0.95,
                theoryMax: Number.isFinite(Number(snapshot.theoryMax)) ? Number(snapshot.theoryMax) : Number(snapshot.theory) * 1.05,
                undecayedTheory: Number(snapshot.undecayedTheory),
                undecayedTheoryMin: Number(snapshot.undecayedTheoryMin),
                undecayedTheoryMax: Number(snapshot.undecayedTheoryMax),
                finalMin: finalMin,
                finalMax: finalMax,
                settings: Object.assign({}, snapshot.settings),
                breakdown: Object.assign({}, snapshot.breakdown || {}),
                theoryVersion: CURRENT_THEORY_VERSION,
                multiplier: Number(snapshot.multiplier),
                charIndex: snapshot.charIndex
            });
            state.samples.sort(function (left, right) { return left.theory - right.theory; });
            state.currentSnapshot = snapshot;
            saveSamples();
            el('decay-infer-final-min').value = '';
            el('decay-infer-final-max').value = '';
            renderSamples();
            if (inferenceSamples().length >= 1) {
                inferTable({ automatic: true });
                if (state.result && state.result.fitStatus === 'no_match') {
                    setStatus('已加入第 ' + state.samples.length + ' 组样本，但仍未找到可信匹配；请查看系统性偏差提示。', 'error');
                } else {
                    setStatus('已加入第 ' + state.samples.length + ' 组样本，并自动更新近似范围。', 'success');
                }
            } else {
                renderGuidance();
                setStatus('已加入新版样本；当前共保留 ' + state.samples.length + ' 条，其中新版可推算样本 '
                    + inferenceSamples().length + ' 条。', 'success');
            }
        } catch (error) {
            setStatus(error.message, 'error');
        }
    }

    function removeSample(index) {
        state.samples.splice(index, 1);
        state.result = null;
        saveSamples();
        renderSamples();
        renderGuidance();
        renderEmptyResult();
    }

    function clearSamples() {
        if (state.samples.length && !global.confirm('确认清空全部衰减表推算样本？清空后无法从页面恢复。')) return;
        state.samples = [];
        state.result = null;
        saveSamples();
        renderSamples();
        renderGuidance();
        renderEmptyResult();
        setStatus('样本已清空。', 'success');
    }

    function renderSamples() {
        var body = el('decay-infer-sample-body');
        var count = el('decay-infer-sample-count');
        if (!body || !count) return;
        var currentCount = inferenceSamples().length;
        count.textContent = String(state.samples.length) + '（新版 ' + currentCount + '）';
        if (!state.samples.length) {
            body.innerHTML = '<tr><td colspan="6" class="decay-infer-empty">换盘后输入实测范围，再点击“加入当前盘面”</td></tr>';
            return;
        }
        body.innerHTML = state.samples.map(function (sample, index) {
            var settings = sample.settings || {};
            var undecayed = sampleUndecayedRange(sample);
            var details = (isCurrentTheorySample(sample) ? '新版口径' : '旧口径（保留，不参与新版推算）')
                + ' / 上限+' + formatPercent(settings.capBonusPercent)
                + ' / 增幅' + formatPercent(settings.ampPercent)
                + ' / 被伤' + formatPercent(settings.takenAmpPercent)
                + ' / 伤害上升' + formatDamage(settings.skillSupp);
            return '<tr>'
                + '<td>' + (index + 1) + '</td>'
                + '<td><strong>无衰减 ' + formatDamage(undecayed.min) + ' ～ ' + formatDamage(undecayed.max) + '</strong><br><small>衰减前本体 '
                + formatDamage(sample.theoryMin != null ? sample.theoryMin : sample.theory * 0.95)
                + ' ～ ' + formatDamage(sample.theoryMax != null ? sample.theoryMax : sample.theory * 1.05) + '</small></td>'
                + '<td>' + formatDamage(sample.finalMin) + ' ～ ' + formatDamage(sample.finalMax) + '</td>'
                + '<td>' + escapeHtml(String(sample.multiplier)) + '倍</td>'
                + '<td class="decay-infer-detail-cell">' + escapeHtml(details) + '</td>'
                + '<td><button type="button" class="decay-infer-link-btn" data-decay-remove="' + index + '">删除</button></td>'
                + '</tr>';
        }).join('');
        body.querySelectorAll('[data-decay-remove]').forEach(function (button) {
            button.addEventListener('click', function () { removeSample(Number(button.dataset.decayRemove)); });
        });
    }

    function renderGuidance() {
        var node = el('decay-infer-guidance');
        if (!node) return;
        if (state.result && Array.isArray(state.result.nextTargets) && state.result.nextTargets.length) {
            var currentSettings = state.currentSnapshot && state.currentSnapshot.settings
                ? state.currentSnapshot.settings
                : (state.samples.length ? state.samples[state.samples.length - 1].settings : {});
            var capCoef = 1 + Number(currentSettings.capBonusPercent || 0) / 100;
            var nextParts = state.result.nextTargets.map(function (item) {
                var target = item.target * capCoef;
                var low = item.low * capCoef;
                var high = item.high * capCoef;
                return '<span class="decay-infer-target" title="候选理论区间：' + formatDamage(low) + '～' + formatDamage(high) + '">'
                    + formatDamage(target) + '</span>';
            });
            node.innerHTML = '<strong>下一组优先测试：</strong>' + nextParts.join(' ')
                + '<br><small>已按当前技伤上限加成折算为页面理论单hit；优先取最接近的盘面即可，不要求完全相等。</small>';
            return;
        }
        var fuzzyCapWan = numberValue('decay-infer-fuzzy-cap', 0);
        if (!(fuzzyCapWan > 0)) {
            node.textContent = '输入Wiki的模糊基础上限后，这里会给出换盘采样目标。';
            return;
        }
        var cap = fuzzyCapWan * 10000;
        var step = Math.max(1, numberValue('decay-infer-threshold-step', 50000));
        var ratios = [0.35, 0.6, 0.85, 1.1, 1.45, 1.9, 2.6, 3.5, 5, 7];
        var targets = ratios.map(function (ratio) { return Math.max(step, Math.round(cap * ratio / step) * step); });
        var parts = targets.map(function (target) {
            var covered = inferenceSamples().some(function (sample) {
                return Math.abs(sample.theory - target) <= Math.max(step, target * 0.1);
            });
            return '<span class="decay-infer-target' + (covered ? ' is-covered' : '') + '">' + formatDamage(target) + '</span>';
        });
        node.innerHTML = '建议调整盘面，使单hit理论伤害覆盖：' + parts.join(' ') + '<br><small>绿色表示已有接近样本；1组即可开始穷举估算，建议12～16组逐步锁定。</small>';
    }

    function getKnownSkillSlopeTemplates() {
        if (!global.ThresholdRegistry || typeof global.ThresholdRegistry.getAll !== 'function') return [];
        return global.ThresholdRegistry.getAll('skill')
            .filter(function (table) { return table.tableId !== 'skill_test'; })
            .map(function (table) {
                return {
                    id: table.tableId,
                    label: table.tableId + '（' + table.displayCap + '万）',
                    slopes: table.stages.map(function (stage) { return Number(stage.slope); })
                };
            });
    }

    function inferTable(runOptions) {
        try {
            if (!global.DecayTableInference) throw new Error('衰减表推算模块未加载。');
            var usableSamples = inferenceSamples();
            if (usableSamples.length < 1) {
                var legacyCount = state.samples.length - usableSamples.length;
                throw new Error('至少需要1组新版理论样本；当前有' + usableSamples.length + '组。原有'
                    + legacyCount + '组旧口径记录已保留，但不会参与修复后的推算。');
            }
            state.result = global.DecayTableInference.infer(usableSamples, {
                thresholdStep: numberValue('decay-infer-threshold-step', 50000),
                fuzzyDisplayCap: Math.max(0, numberValue('decay-infer-fuzzy-cap', 0)) * 10000,
                fuzzyCapTolerance: 10000,
                slopeTemplates: getKnownSkillSlopeTemplates(),
                maxCandidates: 3
            });
            renderResult(state.result);
            renderGuidance();
            if (!(runOptions && runOptions.automatic)) {
                var noCredibleMatch = state.result.fitStatus === 'no_match';
                setStatus(noCredibleMatch
                    ? '未找到可信匹配；下方仅显示最低误差候选，请先排查遗漏加成。'
                    : state.result.approximate
                        ? '已给出探索性近似；请按推荐理论伤害继续补点。'
                    : '推算完成：当前数据已能锁定整数五段表。', noCredibleMatch ? 'error' : 'success');
            }
        } catch (error) {
            state.result = null;
            renderEmptyResult(error.message);
            setStatus(error.message, 'error');
        }
    }

    function renderEmptyResult(message) {
        var node = el('decay-infer-result');
        if (!node) return;
        node.innerHTML = '<div class="decay-infer-empty-result">' + escapeHtml(message || '收集样本后点击“开始推算”。') + '</div>';
    }

    function rangeText(start, end) {
        return formatDamage(start) + ' ～ ' + (end == null ? '∞' : formatDamage(end));
    }

    function candidateSummary(candidate, index) {
        return '<div class="decay-infer-candidate">'
            + '<strong>候选' + (index + 1) + '</strong>'
            + '<span>模板 ' + escapeHtml(candidate.slopeTemplateLabel || candidate.slopeTemplateId || '已知技伤斜率') + '</span>'
            + '<span>上限 ' + candidate.displayCap + '万</span>'
            + '<span>端点RMSE ' + formatDamage(candidate.rmse) + '（' + formatPercent((candidate.relativeRmse || 0) * 100) + '）</span>'
            + '<span>阈值 ' + candidate.thresholds.map(formatDamage).join(' / ') + '</span>'
            + '<span>斜率 ' + candidate.slopes.map(function (slope) { return Math.round(slope * 100) + '%'; }).join(' / ') + '</span>'
            + '</div>';
    }

    function renderResult(result) {
        var node = el('decay-infer-result');
        if (!node) return;
        var best = result.best;
        var cumulativeCaps = best.thresholds.map(function (threshold) {
            return global.DecayTableInference.decayDamage(threshold, 1, best.thresholds, best.slopes, 0);
        });
        var stageRows = best.slopes.map(function (slope, index) {
            var start = index === 0 ? 0 : best.thresholds[index - 1];
            var end = index < best.thresholds.length ? best.thresholds[index] : null;
            return '<tr><td>' + (index + 1) + '</td>'
                + '<td>' + rangeText(start, end) + '</td>'
                + '<td>' + Math.round(slope * 100) + '%</td>'
                + '<td>' + Math.round((1 - slope) * 100) + '%</td>'
                + '<td>' + (index < cumulativeCaps.length ? formatDamage(cumulativeCaps[index]) : '-') + '</td></tr>';
        }).join('');
        var predictionRows = best.predictions.map(function (prediction) {
            var minimumError = Number(prediction.minimumError) || 0;
            var maximumError = Number(prediction.maximumError) || 0;
            var hasEndpointError = minimumError !== 0 || maximumError !== 0;
            return '<tr><td>' + formatDamage(prediction.undecayedMin) + ' ～ ' + formatDamage(prediction.undecayedMax) + '</td>'
                + '<td>' + formatDamage(prediction.theoryMin) + ' ～ ' + formatDamage(prediction.theoryMax) + '</td>'
                + '<td>' + formatDamage(prediction.actualMin) + ' ～ ' + formatDamage(prediction.actualMax) + '</td>'
                + '<td>' + formatDamage(prediction.predictedMin) + ' ～ ' + formatDamage(prediction.predictedMax) + '</td>'
                + '<td class="' + (hasEndpointError ? 'is-error-value' : 'is-zero-error') + '">下限 '
                + (minimumError > 0 ? '+' : '') + formatDamage(minimumError) + ' / 上限 '
                + (maximumError > 0 ? '+' : '') + formatDamage(maximumError) + '</td></tr>';
        }).join('');
        var config = global.DecayTableInference.buildConfig(best, {
            multiplier: numberValue('decay-infer-multiplier', null),
            damageLimitType: el('decay-infer-limit-type').value.trim()
        });
        var json = '"' + config.id + '": ' + JSON.stringify(config.entry, null, 2);
        var noMatch = result.fitStatus === 'no_match';
        var resultTitle = noMatch
            ? '未找到可信匹配；最低误差候选：'
            : result.approximate ? '当前近似：' : '最优推算：';
        var searchBounds = result.searchBounds || {};

        node.innerHTML = '<div class="decay-infer-result-head">'
            + '<div><strong>' + resultTitle + best.displayCap + '万</strong><span>置信度：' + escapeHtml(best.confidence) + '</span></div>'
            + '<div>端点RMSE ' + formatDamage(best.rmse) + '（' + formatPercent(best.relativeRmse * 100) + '） / 最大误差 ' + formatDamage(best.maxError) + '</div>'
            + '<div class="decay-infer-template-line">斜率模板：' + escapeHtml(best.slopeTemplateLabel || best.slopeTemplateId || '已知技伤斜率') + '</div>'
            + '<div class="decay-infer-template-line">完整穷举：' + formatDamage(result.evaluatedCount) + ' 张 / 阈值单位 '
            + formatDamage(searchBounds.thresholdStep) + ' / 第四阈值搜索上界 ' + formatDamage(searchBounds.maximumThreshold) + '</div>'
            + '</div>'
            + (result.warning ? '<div class="decay-infer-warning">' + escapeHtml(result.warning) + '</div>' : '')
            + '<h4>推算分段</h4><div class="decay-infer-table-wrap"><table class="decay-infer-table"><thead><tr><th>段</th><th>理论区间</th><th>余量斜率</th><th>衰减率</th><th>分段累计上限</th></tr></thead><tbody>' + stageRows + '</tbody></table></div>'
            + '<h4>极值范围对比</h4><div class="decay-infer-table-wrap"><table class="decay-infer-table"><thead><tr><th>无衰减理论极值</th><th>衰减前本体极值</th><th>实测极值</th><th>候选预测极值</th><th>极值偏差</th></tr></thead><tbody>' + predictionRows + '</tbody></table></div>'
            + '<h4>可能结果</h4><div class="decay-infer-candidates">' + result.candidates.map(candidateSummary).join('') + '</div>'
            + '<h4>' + (noMatch ? '最低误差候选配置（不建议入库）' : '统一配置') + '</h4><textarea id="decay-infer-export" class="decay-infer-export" readonly>' + escapeHtml(json) + '</textarea>'
            + '<button type="button" class="decay-infer-primary" id="decay-infer-copy">' + (noMatch ? '复制排查用JSON' : '复制JSON') + '</button>';
        el('decay-infer-copy').addEventListener('click', copyResult);
    }

    function copyResult() {
        var textarea = el('decay-infer-export');
        if (!textarea) return;
        var done = function () { setStatus('已复制推算结果JSON。', 'success'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textarea.value).then(done).catch(function () {
                textarea.select();
                document.execCommand('copy');
                done();
            });
        } else {
            textarea.select();
            document.execCommand('copy');
            done();
        }
    }

    function refresh() {
        refreshCharacterOptions();
        renderSamples();
        var charIndex = selectedCharIndex();
        var multiplier = numberValue('decay-infer-multiplier', NaN);
        var snapshot = typeof global.getSkillDamageInferenceSnapshot === 'function' && Number.isFinite(multiplier)
            ? global.getSkillDamageInferenceSnapshot(charIndex, multiplier)
            : (global.skillDamageInferenceSnapshots && global.skillDamageInferenceSnapshots[charIndex]);
        state.currentSnapshot = snapshot || null;
        var preview = el('decay-infer-current-theory');
        if (preview) {
            if (snapshot) {
                var undecayed = sampleUndecayedRange(snapshot);
                preview.textContent = '无衰减 ' + formatDamage(undecayed.min) + ' ～ ' + formatDamage(undecayed.max)
                    + '｜衰减前本体 ' + formatDamage(snapshot.theoryMin) + ' ～ ' + formatDamage(snapshot.theoryMax);
            } else {
                preview.textContent = '点击加入时自动计算';
            }
        }
        var breakdownNode = el('decay-infer-current-breakdown');
        if (breakdownNode) {
            var breakdown = snapshot && snapshot.breakdown;
            breakdownNode.textContent = breakdown
                ? '公式：基础税后 ' + formatDamage(breakdown.baseDamageAfterDefense)
                    + ' ×（Wiki倍率 ' + Number(breakdown.baseMultiplier || 0)
                    + ' + 技伤倍率加成 ' + formatPercent(Number(breakdown.skillDamageBonus || 0) * 100) + '）'
                    + ' × 暴击 ' + Number(breakdown.critMultiplier || 1).toFixed(3)
                    + '；再加伤害上升 ' + formatDamage(breakdown.skillSupp)
                    + '、乘增幅 ' + formatPercent(breakdown.ampPercent)
                    + '、乘被伤 ' + formatPercent(breakdown.takenAmpPercent) + '。'
                : '点击加入时自动读取当前盘面的完整加成。';
        }
        renderGuidance();
    }

    function init() {
        if (!el('decay-inference-board')) return;
        loadSamples();
        applySavedMetadata();
        el('decay-infer-add').addEventListener('click', captureSample);
        el('decay-infer-run').addEventListener('click', inferTable);
        el('decay-infer-clear').addEventListener('click', clearSamples);
        el('decay-infer-fuzzy-cap').addEventListener('input', renderGuidance);
        el('decay-infer-fuzzy-cap').addEventListener('change', saveSamples);
        el('decay-infer-multiplier').addEventListener('input', refresh);
        el('decay-infer-multiplier').addEventListener('change', saveSamples);
        el('decay-infer-threshold-step').addEventListener('input', renderGuidance);
        el('decay-infer-threshold-step').addEventListener('change', saveSamples);
        el('decay-infer-limit-type').addEventListener('change', saveSamples);
        el('decay-infer-char').addEventListener('change', refresh);
        global.addEventListener('skillDamageInferenceSnapshotUpdated', function (event) {
            if (event.detail && event.detail.charIndex === selectedCharIndex()) refresh();
        });
        global.addEventListener('damageCalculationUpdated', refresh);
        refresh();
        if (inferenceSamples().length >= 1) {
            if (global.ThresholdRegistry && typeof global.ThresholdRegistry.loadThresholdData === 'function') {
                global.ThresholdRegistry.loadThresholdData().then(function () {
                    inferTable({ automatic: true });
                });
            } else {
                inferTable({ automatic: true });
            }
        } else renderEmptyResult();
    }

    global.DecayTableInferenceUI = {
        init: init,
        refresh: refresh,
        refreshCharacterOptions: refreshCharacterOptions,
        getSamples: function () { return cloneSamples(state.samples); }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
