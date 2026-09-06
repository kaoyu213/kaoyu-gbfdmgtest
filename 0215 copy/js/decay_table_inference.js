// ==========================================
//  技伤衰减表推算器
// ==========================================

(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.DecayTableInference = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    function asNumber(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function roundTo(value, step, mode) {
        var unit = Math.max(1, Math.round(asNumber(step, 1)));
        var scaled = value / unit;
        if (mode === 'floor') return Math.floor(scaled) * unit;
        if (mode === 'ceil') return Math.ceil(scaled) * unit;
        return Math.round(scaled) * unit;
    }

    function uniqueNumbers(values) {
        var seen = {};
        return values.filter(function (value) {
            var key = String(value);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
    }

    var FALLBACK_SKILL_SLOPE_TEMPLATES = [
        { id: 'known_80_60_5', slopes: [1, 0.8, 0.6, 0.05, 0.01] },
        { id: 'known_50_30_5', slopes: [1, 0.5, 0.3, 0.05, 0.01] },
        { id: 'known_60_40_10', slopes: [1, 0.6, 0.4, 0.1, 0.01] },
        { id: 'known_90_70_5', slopes: [1, 0.9, 0.7, 0.05, 0.01] },
        { id: 'known_70_50_5', slopes: [1, 0.7, 0.5, 0.05, 0.01] },
        { id: 'known_70_25_5', slopes: [1, 0.7, 0.25, 0.05, 0.01] },
        { id: 'known_60_30_5', slopes: [1, 0.6, 0.3, 0.05, 0.01] },
        { id: 'known_50_25_5', slopes: [1, 0.5, 0.25, 0.05, 0.01] }
    ];

    function normalizeSlopeTemplates(rawTemplates) {
        var source = Array.isArray(rawTemplates) && rawTemplates.length
            ? rawTemplates
            : FALLBACK_SKILL_SLOPE_TEMPLATES;
        var bySignature = {};
        source.forEach(function (raw, index) {
            var slopes = Array.isArray(raw) ? raw : raw && raw.slopes;
            if (!Array.isArray(slopes) || slopes.length !== 5) return;
            slopes = slopes.map(function (value) { return Math.round(asNumber(value, 0) * 100) / 100; });
            if (slopes[0] !== 1 || slopes.some(function (value) { return value <= 0 || value > 1; })) return;
            var signature = slopes.join('/');
            var id = Array.isArray(raw) ? 'known_' + index : String(raw.id || raw.tableId || ('known_' + index));
            var label = Array.isArray(raw) ? id : String(raw.label || id);
            if (!bySignature[signature]) {
                bySignature[signature] = { id: id, label: label, slopes: slopes, sources: [id] };
            } else if (bySignature[signature].sources.indexOf(id) < 0) {
                bySignature[signature].sources.push(id);
                bySignature[signature].label += ' / ' + label;
            }
        });
        return Object.keys(bySignature).map(function (signature) { return bySignature[signature]; });
    }

    function normalizeThresholdRanges(rawRanges) {
        var source = Array.isArray(rawRanges) ? rawRanges : [];
        return [0, 1, 2, 3].map(function (index) {
            var raw = source[index];
            if (raw == null || raw === '') return null;
            if (Number.isFinite(Number(raw))) {
                var exact = Math.round(Number(raw));
                if (exact <= 0) throw new Error('第' + (index + 1) + '个阈值约束必须大于0。');
                return { min: exact, max: exact };
            }
            var minimum = raw && raw.min != null && raw.min !== '' ? Math.round(Number(raw.min)) : NaN;
            var maximum = raw && raw.max != null && raw.max !== '' ? Math.round(Number(raw.max)) : NaN;
            if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum <= 0 || maximum <= 0) {
                throw new Error('第' + (index + 1) + '个阈值约束必须是正整数或完整的最小值/最大值区间。');
            }
            if (minimum > maximum) {
                throw new Error('第' + (index + 1) + '个阈值约束的最小值不能大于最大值。');
            }
            return { min: minimum, max: maximum };
        });
    }

    function normalizeSlopeConstraints(rawConstraints) {
        var source = Array.isArray(rawConstraints) ? rawConstraints : [];
        return [0, 1, 2, 3, 4].map(function (index) {
            var raw = source[index];
            if (raw == null || raw === '') return null;
            var slope = Number(raw);
            if (!Number.isFinite(slope) || slope <= 0 || slope > 1) {
                throw new Error('第' + (index + 1) + '段斜率必须大于0且不超过100%。');
            }
            slope = Math.round(slope * 10000) / 10000;
            if (index === 0 && Math.abs(slope - 1) > 1e-9) {
                throw new Error('第1段斜率必须为100%。');
            }
            return slope;
        });
    }

    function constrainSlopeTemplates(templates, constraints) {
        var hasConstraint = constraints.some(function (value) { return value != null; });
        if (!hasConstraint) return templates;
        var matches = templates.filter(function (template) {
            return constraints.every(function (slope, index) {
                return slope == null || Math.abs(template.slopes[index] - slope) < 1e-9;
            });
        });
        if (matches.length) return matches;

        var complete = constraints.every(function (value) { return value != null; });
        if (!complete) {
            throw new Error('当前锁定的部分斜率与现有技伤斜率模板不一致；若要使用新斜率，请填写完整5段斜率。');
        }
        for (var index = 1; index < constraints.length; index++) {
            if (constraints[index] >= constraints[index - 1]) {
                throw new Error('自定义斜率必须从第1段到第5段严格递减。');
            }
        }
        return [{
            id: 'custom_locked',
            label: '用户锁定的自定义斜率',
            slopes: constraints.slice(),
            sources: ['custom_locked']
        }];
    }

    function thresholdAllowed(value, range) {
        return !range || (value >= range.min && value <= range.max);
    }

    function thresholdChoices(value, step) {
        return uniqueNumbers([
            roundTo(value, step, 'floor'),
            roundTo(value, step, 'round'),
            roundTo(value, step, 'ceil')
        ]).filter(function (item) { return Number.isFinite(item) && item > 0; });
    }

    function fitLine(points, start, end) {
        var count = end - start;
        if (count < 2) return null;
        var sumX = 0;
        var sumY = 0;
        var sumXX = 0;
        var sumXY = 0;
        for (var i = start; i < end; i++) {
            var x = points[i].x;
            var y = points[i].y;
            sumX += x;
            sumY += y;
            sumXX += x * x;
            sumXY += x * y;
        }
        var denominator = count * sumXX - sumX * sumX;
        if (Math.abs(denominator) < 1e-9) return null;
        var slope = (count * sumXY - sumX * sumY) / denominator;
        return {
            slope: slope,
            intercept: (sumY - slope * sumX) / count
        };
    }

    function normalizeSamples(samples, options) {
        var normalized = samples.map(function (sample, index) {
            var settings = Object.assign({}, options, sample.settings || {});
            var capCoef = 1 + asNumber(settings.capBonusPercent, 0) / 100;
            var ampMultiplier = 1 + asNumber(settings.ampPercent, 0) / 100;
            var takenMultiplier = 1 + asNumber(settings.takenAmpPercent, 0) / 100;
            var supp = asNumber(settings.skillSupp, 0);
            var hits = Math.max(1, Math.round(asNumber(settings.hits, 1)));
            var totalMode = settings.finalMode === 'total';
            var taxMultiplier = ampMultiplier * takenMultiplier;
            if (capCoef <= 0 || taxMultiplier <= 0) throw new Error('第 ' + (index + 1) + ' 组的上限系数或增幅系数不合法。');
            var theory = asNumber(sample.theory, NaN);
            var enteredMin = asNumber(sample.finalMin != null ? sample.finalMin : sample.final, NaN);
            var enteredMax = asNumber(sample.finalMax != null ? sample.finalMax : sample.final, NaN);
            if (enteredMin > enteredMax) {
                var swap = enteredMin;
                enteredMin = enteredMax;
                enteredMax = swap;
            }
            var theoryMin = asNumber(sample.theoryMin, theory * 0.95);
            var theoryMax = asNumber(sample.theoryMax, theory * 1.05);
            if (theoryMin > theoryMax) {
                var theorySwap = theoryMin;
                theoryMin = theoryMax;
                theoryMax = theorySwap;
            }
            if (!Number.isFinite(theory) || theory <= 0 || !Number.isFinite(enteredMin) || enteredMin <= 0 || !Number.isFinite(enteredMax)) {
                throw new Error('第 ' + (index + 1) + ' 组必须提供大于0的理论伤害和实测范围。');
            }
            if (!Number.isFinite(theoryMin) || theoryMin <= 0 || !Number.isFinite(theoryMax) || theoryMax <= 0) {
                throw new Error('第 ' + (index + 1) + ' 组的理论伤害极值不合法。');
            }
            var enteredFinal = (enteredMin + enteredMax) / 2;
            var finalPerHit = totalMode ? enteredFinal / hits : enteredFinal;
            var observedDecayed = finalPerHit / taxMultiplier - supp;
            if (observedDecayed <= 0) throw new Error('第 ' + (index + 1) + ' 组逆推的衰减后伤害不大于0，请检查加成详情。');
            return {
                sourceIndex: index,
                theory: theory,
                theoryMin: theoryMin,
                theoryMax: theoryMax,
                actualFinal: enteredFinal,
                actualMin: enteredMin,
                actualMax: enteredMax,
                finalPerHit: finalPerHit,
                x: theory / capCoef,
                y: observedDecayed / capCoef,
                capCoef: capCoef,
                taxMultiplier: taxMultiplier,
                supp: supp,
                hits: hits,
                totalMode: totalMode,
                settings: settings,
                relaxation: Math.max(0, asNumber(settings.capRelaxationPercent, 0) / 100)
            };
        }).sort(function (left, right) { return left.x - right.x; });

        for (var i = 1; i < normalized.length; i++) {
            if (Math.abs(normalized[i].x - normalized[i - 1].x) < 1e-9) {
                throw new Error('理论伤害必须互不相同；同一理论值的多hit只算1组样本。');
            }
        }
        return normalized;
    }

    function effectiveSlope(baseSlope, relaxation) {
        if (baseSlope >= 1) return baseSlope;
        return Math.min(1, baseSlope * (1 + relaxation));
    }

    function decayDamage(rawDamage, capCoef, thresholds, slopes, relaxation) {
        var damage = Math.max(0, asNumber(rawDamage, 0));
        var cap = Math.max(0, asNumber(capCoef, 1));
        var previous = 0;
        var result = 0;
        for (var i = 0; i < slopes.length; i++) {
            var current = i < thresholds.length ? thresholds[i] * cap : Infinity;
            if (damage <= previous) break;
            var amount = Math.max(0, Math.min(damage, current) - previous);
            result += amount * effectiveSlope(slopes[i], relaxation);
            if (damage <= current) break;
            previous = current;
        }
        return result;
    }

    function applyPostDecayBonuses(damage, settings) {
        var supp = asNumber(settings.skillSupp, 0);
        var ampMultiplier = 1 + asNumber(settings.ampPercent, 0) / 100;
        var takenMultiplier = 1 + asNumber(settings.takenAmpPercent, 0) / 100;
        return Math.ceil((damage + supp) * ampMultiplier * takenMultiplier);
    }

    function predictFinal(sample, thresholds, slopes, options) {
        var settings = Object.assign({}, options, sample.settings || {});
        var capCoef = 1 + asNumber(settings.capBonusPercent, 0) / 100;
        var relaxation = Math.max(0, asNumber(settings.capRelaxationPercent, 0) / 100);
        var hits = Math.max(1, Math.round(asNumber(settings.hits, 1)));
        var perHit = applyPostDecayBonuses(
            decayDamage(sample.theory, capCoef, thresholds, slopes, relaxation),
            settings
        );
        return settings.finalMode === 'total' ? perHit * hits : perHit;
    }

    function predictUndecayedFinal(sample, options) {
        var settings = Object.assign({}, options, sample.settings || {});
        var hits = Math.max(1, Math.round(asNumber(settings.hits, 1)));
        var perHit = applyPostDecayBonuses(asNumber(sample.theory, 0), settings);
        return settings.finalMode === 'total' ? perHit * hits : perHit;
    }

    function predictFinalRange(sample, thresholds, slopes, options) {
        var centerTheory = asNumber(sample.theory, 0);
        var minimumTheory = asNumber(sample.theoryMin, centerTheory * 0.95);
        var maximumTheory = asNumber(sample.theoryMax, centerTheory * 1.05);
        var minimum = predictFinal(Object.assign({}, sample, { theory: minimumTheory }), thresholds, slopes, options);
        var maximum = predictFinal(Object.assign({}, sample, { theory: maximumTheory }), thresholds, slopes, options);
        return {
            min: Math.min(minimum, maximum),
            max: Math.max(minimum, maximum),
            center: predictFinal(sample, thresholds, slopes, options)
        };
    }

    function predictUndecayedFinalRange(sample, options) {
        var centerTheory = asNumber(sample.theory, 0);
        var minimumTheory = asNumber(sample.theoryMin, centerTheory * 0.95);
        var maximumTheory = asNumber(sample.theoryMax, centerTheory * 1.05);
        var minimum = predictUndecayedFinal(Object.assign({}, sample, { theory: minimumTheory }), options);
        var maximum = predictUndecayedFinal(Object.assign({}, sample, { theory: maximumTheory }), options);
        return {
            min: Math.min(minimum, maximum),
            max: Math.max(minimum, maximum),
            center: predictUndecayedFinal(sample, options)
        };
    }

    function thresholdIsInGap(value, points, leftEnd, rightStart, step) {
        var left = leftEnd > 0 ? points[leftEnd - 1].x : 0;
        var right = rightStart < points.length ? points[rightStart].x : Infinity;
        var tolerance = Math.max(step, (right - left) * 0.05);
        return value >= Math.max(0, left - tolerance) && value <= right + tolerance;
    }

    function thresholdComplexity(thresholds) {
        return thresholds.reduce(function (score, value) {
            if (value % 100000 === 0) return score;
            if (value % 50000 === 0) return score + 0.05;
            if (value % 10000 === 0) return score + 0.1;
            if (value % 5000 === 0) return score + 0.2;
            if (value % 1000 === 0) return score + 0.4;
            return score + 1;
        }, 0);
    }

    function evaluateCandidate(points, thresholds, slopes, options, splitCounts) {
        var squared = 0;
        var maxError = 0;
        var predictions = points.map(function (point) {
            var predictedRange = predictFinalRange(point, thresholds, slopes, options);
            var undecayedRange = predictUndecayedFinalRange(point, options);
            var minimumError = predictedRange.min - point.actualMin;
            var maximumError = predictedRange.max - point.actualMax;
            var endpointError = Math.abs(minimumError) >= Math.abs(maximumError) ? minimumError : maximumError;
            squared += (minimumError * minimumError + maximumError * maximumError) / 2;
            maxError = Math.max(maxError, Math.abs(minimumError), Math.abs(maximumError));
            return {
                theory: point.theory,
                theoryMin: point.theoryMin,
                theoryMax: point.theoryMax,
                actual: point.actualFinal,
                actualMin: point.actualMin,
                actualMax: point.actualMax,
                predicted: predictedRange.center,
                predictedMin: predictedRange.min,
                predictedMax: predictedRange.max,
                undecayed: undecayedRange.center,
                undecayedMin: undecayedRange.min,
                undecayedMax: undecayedRange.max,
                minimumError: minimumError,
                maximumError: maximumError,
                error: endpointError
            };
        });
        var rmse = Math.sqrt(squared / points.length);
        var typical = points.reduce(function (sum, point) { return sum + point.actualFinal; }, 0) / points.length;
        var penalty = thresholdComplexity(thresholds) * Math.max(1, typical * 0.00001);
        var displayCap = decayDamage(thresholds[3], 1, thresholds, slopes, 0) / 10000;
        var fuzzyDisplayCap = Math.max(0, asNumber(options.fuzzyDisplayCap, 0));
        var fuzzyTolerance = Math.max(1, asNumber(options.fuzzyCapTolerance, 10000));
        var fuzzyDifference = fuzzyDisplayCap > 0
            ? Math.abs(displayCap * 10000 - fuzzyDisplayCap)
            : 0;
        // Wiki 基础上限通常误差不超过1万。超出范围时使用足够大的连续惩罚，
        // 让阈值优化先回到允许区间；最终还会再次执行硬过滤。
        var fuzzyPenalty = fuzzyDisplayCap > 0
            ? Math.max(0, fuzzyDifference - fuzzyTolerance) * 1000
            : 0;
        return {
            thresholds: thresholds.slice(),
            slopes: slopes.slice(),
            displayCap: Math.round(displayCap * 100) / 100,
            rmse: rmse,
            relativeRmse: rmse / Math.max(1, typical),
            maxError: maxError,
            score: rmse + penalty + fuzzyPenalty,
            fuzzyDifference: fuzzyDifference,
            predictions: predictions,
            splitCounts: splitCounts.slice()
        };
    }

    function predictFinalForPoint(theory, point, thresholds, slopes) {
        var perHit = Math.ceil((
            decayDamage(theory, point.capCoef, thresholds, slopes, point.relaxation) + point.supp
        ) * point.taxMultiplier);
        return point.totalMode ? perHit * point.hits : perHit;
    }

    /**
     * 穷举阶段只计算排名需要的端点误差，避免为每张合法表创建完整预测对象、
     * 中心值和无衰减对照。最终入选的少量候选再走 evaluateCandidate 补全详情。
     */
    function evaluateCandidateFast(points, thresholds, slopes, options, typicalFinal, displayCapDamage) {
        var squared = 0;
        var maxError = 0;
        for (var pointIndex = 0; pointIndex < points.length; pointIndex++) {
            var point = points[pointIndex];
            var predictedMinimum = predictFinalForPoint(point.theoryMin, point, thresholds, slopes);
            var predictedMaximum = predictFinalForPoint(point.theoryMax, point, thresholds, slopes);
            if (predictedMinimum > predictedMaximum) {
                var swap = predictedMinimum;
                predictedMinimum = predictedMaximum;
                predictedMaximum = swap;
            }
            var minimumError = predictedMinimum - point.actualMin;
            var maximumError = predictedMaximum - point.actualMax;
            squared += (minimumError * minimumError + maximumError * maximumError) / 2;
            maxError = Math.max(maxError, Math.abs(minimumError), Math.abs(maximumError));
        }
        var rmse = Math.sqrt(squared / points.length);
        var typical = Math.max(1, asNumber(typicalFinal, 1));
        var penalty = thresholdComplexity(thresholds) * Math.max(1, typical * 0.00001);
        var capDamage = Number.isFinite(displayCapDamage)
            ? displayCapDamage
            : decayDamage(thresholds[3], 1, thresholds, slopes, 0);
        var displayCap = capDamage / 10000;
        var fuzzyDisplayCap = Math.max(0, asNumber(options.fuzzyDisplayCap, 0));
        var fuzzyTolerance = Math.max(1, asNumber(options.fuzzyCapTolerance, 10000));
        var fuzzyDifference = fuzzyDisplayCap > 0
            ? Math.abs(displayCap * 10000 - fuzzyDisplayCap)
            : 0;
        var fuzzyPenalty = fuzzyDisplayCap > 0
            ? Math.max(0, fuzzyDifference - fuzzyTolerance) * 1000
            : 0;
        return {
            thresholds: thresholds.slice(),
            slopes: slopes.slice(),
            displayCap: Math.round(displayCap * 100) / 100,
            rmse: rmse,
            relativeRmse: rmse / Math.max(1, typical),
            maxError: maxError,
            score: rmse + penalty + fuzzyPenalty,
            fuzzyDifference: fuzzyDifference,
            splitCounts: []
        };
    }

    function distanceFromInterval(value, minimum, maximum) {
        var low = Math.min(minimum, maximum);
        var high = Math.max(minimum, maximum);
        if (value < low) return low - value;
        if (value > high) return value - high;
        return 0;
    }

    /**
     * 固定前三个阈值后，预测伤害随第四阈值单调不减。
     * 用第四阈值合法区间两端形成每组样本的“最佳可能预测区间”；实际值到该区间
     * 的距离就是这一整条分支不可能突破的误差下界，可安全跳过劣于当前候选的分支。
     */
    function fourthThresholdErrorLowerBound(points, firstThresholds, minimumT4, maximumT4, slopes) {
        var minimumThresholds = firstThresholds.concat(minimumT4);
        var maximumThresholds = firstThresholds.concat(maximumT4);
        var squared = 0;
        for (var pointIndex = 0; pointIndex < points.length; pointIndex++) {
            var point = points[pointIndex];
            var lowMinimum = predictFinalForPoint(point.theoryMin, point, minimumThresholds, slopes);
            var highMinimum = predictFinalForPoint(point.theoryMin, point, maximumThresholds, slopes);
            var lowMaximum = predictFinalForPoint(point.theoryMax, point, minimumThresholds, slopes);
            var highMaximum = predictFinalForPoint(point.theoryMax, point, maximumThresholds, slopes);
            var minimumDistance = distanceFromInterval(point.actualMin, lowMinimum, highMinimum);
            var maximumDistance = distanceFromInterval(point.actualMax, lowMaximum, highMaximum);
            squared += (minimumDistance * minimumDistance + maximumDistance * maximumDistance) / 2;
        }
        return Math.sqrt(squared / points.length);
    }

    function buildThresholdCombinations(choiceSets, index, current, output) {
        if (index === choiceSets.length) {
            output.push(current.slice());
            return;
        }
        choiceSets[index].forEach(function (value) {
            if (current.length && value <= current[current.length - 1]) return;
            current.push(value);
            buildThresholdCombinations(choiceSets, index + 1, current, output);
            current.pop();
        });
    }

    function buildNextTargets(candidates, points, step, thresholdRanges) {
        var selected = candidates.slice(0, Math.min(8, candidates.length));
        var targets = [];
        for (var stage = 0; stage < 4; stage++) {
            var lockedRange = thresholdRanges && thresholdRanges[stage];
            if (lockedRange && lockedRange.min === lockedRange.max) continue;
            var values = selected.map(function (candidate) { return candidate.thresholds[stage]; })
                .sort(function (left, right) { return left - right; });
            if (!values.length) continue;
            var low = values[0];
            var high = values[values.length - 1];
            var target = roundTo(values[Math.floor(values.length / 2)], step, 'round');
            var nearest = points.reduce(function (distance, point) {
                return Math.min(distance, Math.abs(point.x - target));
            }, Infinity);
            targets.push({
                stage: stage + 1,
                target: target,
                low: low,
                high: high,
                score: (high - low) + nearest
            });
        }
        return targets.sort(function (left, right) { return right.score - left.score; }).slice(0, 3);
    }

    function keepBestCandidate(list, candidate, limit) {
        list.push(candidate);
        list.sort(function (left, right) {
            if (left.score !== right.score) return left.score - right.score;
            return left.rmse - right.rmse;
        });
        if (list.length > limit) list.length = limit;
    }

    /**
     * 对每一种已知斜率模板穷举四个整数阈值。
     * 基础上限是阈值的线性组合：
     * C=(1-s2)t1+(s2-s3)t2+(s3-s4)t3+s4*t4。
     * 因此枚举前三个阈值后可直接解出 t4 的合法整数区间，避免四重暴力循环。
     */
    function buildExhaustiveCandidates(points, options, step, slopeTemplates) {
        var thresholdRanges = options.thresholdRanges || [null, null, null, null];
        var fuzzy = Math.max(0, asNumber(options.fuzzyDisplayCap, 0));
        var tolerance = Math.max(1, asNumber(options.fuzzyCapTolerance, 10000));
        var observedCap = points.reduce(function (maximum, point) { return Math.max(maximum, point.y); }, 0);
        var capMinimum = fuzzy > 0 ? Math.max(step, fuzzy - tolerance) : Math.max(step, observedCap * 0.5);
        var capMaximum = fuzzy > 0 ? fuzzy + tolerance : Math.max(capMinimum + step, observedCap * 1.5);
        var maximumObservedTheory = points[points.length - 1].x;
        // 已有正式技伤表的第四阈值/基础上限最大约4.65倍，取5倍覆盖同类结构。
        var maximumLockedThreshold = thresholdRanges.reduce(function (maximum, range, index) {
            // 较早阈值锁在默认搜索上界之外时，仍需为后续严格递增的阈值预留网格空间。
            return range ? Math.max(maximum, range.max + (3 - index) * step) : maximum;
        }, 0);
        var maximumThreshold = roundTo(Math.max(
            maximumObservedTheory * 1.25,
            capMaximum * 5,
            step * 8,
            maximumLockedThreshold
        ), step, 'ceil');
        var maximumIndex = Math.max(4, Math.floor(maximumThreshold / step));
        var keepPerTemplate = Math.max(3, Math.round(asNumber(options.keepCandidatesPerTemplate, 12)));
        var typicalFinal = points.reduce(function (sum, point) { return sum + point.actualFinal; }, 0) / points.length;
        var allBest = [];
        var evaluatedCount = 0;
        var prunedCandidateCount = 0;
        var prunedBranchCount = 0;

        slopeTemplates.forEach(function (template) {
            var slopes = template.slopes;
            var coefficients = [
                1 - slopes[1],
                slopes[1] - slopes[2],
                slopes[2] - slopes[3],
                slopes[3]
            ];
            if (coefficients.some(function (value) { return value <= 0; })) return;
            var templateBest = [];

            for (var i1 = 1; i1 <= maximumIndex - 3; i1++) {
                var t1 = i1 * step;
                if (!thresholdAllowed(t1, thresholdRanges[0])) continue;
                var minimumAtT1 = coefficients[0] * t1
                    + coefficients[1] * ((i1 + 1) * step)
                    + coefficients[2] * ((i1 + 2) * step)
                    + coefficients[3] * ((i1 + 3) * step);
                if (minimumAtT1 > capMaximum + 1e-6) break;

                for (var i2 = i1 + 1; i2 <= maximumIndex - 2; i2++) {
                    var t2 = i2 * step;
                    if (!thresholdAllowed(t2, thresholdRanges[1])) continue;
                    var minimumAtT2 = coefficients[0] * t1
                        + coefficients[1] * t2
                        + coefficients[2] * ((i2 + 1) * step)
                        + coefficients[3] * ((i2 + 2) * step);
                    if (minimumAtT2 > capMaximum + 1e-6) break;

                    for (var i3 = i2 + 1; i3 <= maximumIndex - 1; i3++) {
                        var t3 = i3 * step;
                        if (!thresholdAllowed(t3, thresholdRanges[2])) continue;
                        var partial = coefficients[0] * t1 + coefficients[1] * t2 + coefficients[2] * t3;
                        var minimumWithNextT4 = partial + coefficients[3] * ((i3 + 1) * step);
                        if (minimumWithNextT4 > capMaximum + 1e-6) break;

                        var minimumI4 = Math.max(i3 + 1, Math.ceil((capMinimum - partial) / (coefficients[3] * step) - 1e-9));
                        var maximumI4 = Math.min(maximumIndex, Math.floor((capMaximum - partial) / (coefficients[3] * step) + 1e-9));
                        if (thresholdRanges[3]) {
                            minimumI4 = Math.max(minimumI4, Math.ceil(thresholdRanges[3].min / step));
                            maximumI4 = Math.min(maximumI4, Math.floor(thresholdRanges[3].max / step));
                        }
                        if (minimumI4 > maximumI4) continue;
                        if (!options.disableDataPruning && templateBest.length >= keepPerTemplate) {
                            var worstKeptScore = templateBest[templateBest.length - 1].score;
                            var branchLowerBound = fourthThresholdErrorLowerBound(
                                points,
                                [t1, t2, t3],
                                minimumI4 * step,
                                maximumI4 * step,
                                slopes
                            );
                            if (branchLowerBound > worstKeptScore + 1e-9) {
                                prunedBranchCount++;
                                prunedCandidateCount += maximumI4 - minimumI4 + 1;
                                continue;
                            }
                        }
                        for (var i4 = minimumI4; i4 <= maximumI4; i4++) {
                            var thresholds = [t1, t2, t3, i4 * step];
                            if (!thresholdAllowed(thresholds[3], thresholdRanges[3])) continue;
                            var candidate = evaluateCandidateFast(
                                points,
                                thresholds,
                                slopes,
                                options,
                                typicalFinal,
                                partial + coefficients[3] * thresholds[3]
                            );
                            if (fuzzy > 0 && candidate.fuzzyDifference > tolerance + 1e-6) continue;
                            candidate.slopeTemplateId = template.id;
                            candidate.slopeTemplateLabel = template.label;
                            candidate.searchMethod = 'exhaustive';
                            evaluatedCount++;
                            keepBestCandidate(templateBest, candidate, keepPerTemplate);
                        }
                    }
                }
            }
            templateBest = templateBest.map(function (candidate) {
                var detailed = evaluateCandidate(points, candidate.thresholds, slopes, options, []);
                detailed.slopeTemplateId = template.id;
                detailed.slopeTemplateLabel = template.label;
                detailed.searchMethod = 'exhaustive_branch_and_bound';
                return detailed;
            });
            allBest = allBest.concat(templateBest);
        });

        allBest.sort(function (left, right) {
            if (left.score !== right.score) return left.score - right.score;
            return left.rmse - right.rmse;
        });
        return {
            candidates: allBest,
            evaluatedCount: evaluatedCount,
            prunedCandidateCount: prunedCandidateCount,
            prunedBranchCount: prunedBranchCount,
            capMinimum: capMinimum,
            capMaximum: capMaximum,
            maximumThreshold: maximumThreshold
        };
    }

    function infer(samples, rawOptions) {
        var options = Object.assign({
            capBonusPercent: 0,
            ampPercent: 0,
            takenAmpPercent: 0,
            skillSupp: 0,
            capRelaxationPercent: 0,
            hits: 1,
            finalMode: 'per_hit',
            thresholdStep: 50000,
            fuzzyDisplayCap: 0,
            fuzzyCapTolerance: 10000,
            slopeTemplates: null,
            thresholdRanges: null,
            slopeConstraints: null,
            disableDataPruning: false,
            keepCandidatesPerTemplate: 12,
            maxCandidates: 3
        }, rawOptions || {});
        var points = normalizeSamples(samples, options);
        if (points.length < 1) throw new Error('至少需要1组理论伤害和实测范围才能开始穷举估算。');

        var relaxation = points[0].relaxation;
        if (points.some(function (point) { return Math.abs(point.relaxation - relaxation) > 1e-9; })) {
            throw new Error('各样本的D上限缓和必须保持一致。');
        }
        var step = Math.max(1, Math.round(asNumber(options.thresholdStep, 50000)));
        var thresholdRanges = normalizeThresholdRanges(options.thresholdRanges);
        thresholdRanges.forEach(function (range, index) {
            if (!range) return;
            var firstGridValue = Math.ceil(range.min / step) * step;
            if (firstGridValue > range.max) {
                throw new Error('第' + (index + 1) + '个阈值锁定范围内没有符合当前取整单位的整数；请扩大范围或减小阈值取整单位。');
            }
        });
        var slopeConstraints = normalizeSlopeConstraints(options.slopeConstraints);
        var slopeTemplates = constrainSlopeTemplates(normalizeSlopeTemplates(options.slopeTemplates), slopeConstraints);
        if (!slopeTemplates.length) throw new Error('没有可用于推算的已知技伤斜率模板。');
        options.thresholdRanges = thresholdRanges;
        options.slopeConstraints = slopeConstraints;
        var candidates = [];
        var signatures = {};
        var n = points.length;

        for (var b1 = 0; b1 <= n - 8; b1++) {
            for (var b2 = b1 + 2; b2 <= n - 6; b2++) {
                for (var b3 = b2 + 2; b3 <= n - 4; b3++) {
                    for (var b4 = b3 + 2; b4 <= n - 2; b4++) {
                        var fitted = [
                            { slope: 1, intercept: 0 },
                            fitLine(points, b1, b2),
                            fitLine(points, b2, b3),
                            fitLine(points, b3, b4),
                            fitLine(points, b4, n)
                        ];
                        if (fitted.some(function (line) { return !line; })) continue;

                        var baseSlopes = [1];
                        var validSlopes = true;
                        for (var lineIndex = 1; lineIndex < fitted.length; lineIndex++) {
                            var rawBaseSlope = fitted[lineIndex].slope / (1 + relaxation);
                            var roundedSlope = Math.max(0.01, Math.min(0.99, Math.round(rawBaseSlope * 100) / 100));
                            if (roundedSlope >= baseSlopes[lineIndex - 1]) {
                                validSlopes = false;
                                break;
                            }
                            baseSlopes.push(roundedSlope);
                        }
                        if (!validSlopes) continue;
                        var matchedSlopeTemplate = slopeTemplates.find(function (template) {
                            return template.slopes.every(function (slope, index) {
                                return Math.abs(slope - baseSlopes[index]) < 1e-9;
                            });
                        });
                        if (!matchedSlopeTemplate) continue;
                        baseSlopes = matchedSlopeTemplate.slopes.slice();

                        var intersections = [];
                        for (var crossing = 1; crossing < fitted.length; crossing++) {
                            var leftLine = fitted[crossing - 1];
                            var rightLine = fitted[crossing];
                            var denominator = leftLine.slope - rightLine.slope;
                            if (denominator <= 0) {
                                intersections = [];
                                break;
                            }
                            intersections.push((rightLine.intercept - leftLine.intercept) / denominator);
                        }
                        if (intersections.length !== 4 || intersections.some(function (value) { return !Number.isFinite(value) || value <= 0; })) continue;

                        var boundaries = [b1, b2, b3, b4];
                        var choices = intersections.map(function (value, index) {
                            return thresholdChoices(value, step).filter(function (candidate) {
                                var leftEnd = boundaries[index];
                                var rightStart = boundaries[index];
                                return thresholdIsInGap(candidate, points, leftEnd, rightStart, step)
                                    && thresholdAllowed(candidate, thresholdRanges[index]);
                            });
                        });
                        if (choices.some(function (set) { return set.length === 0; })) continue;

                        var combinations = [];
                        buildThresholdCombinations(choices, 0, [], combinations);
                        combinations.forEach(function (thresholds) {
                            var signature = thresholds.join('/') + '|' + baseSlopes.join('/');
                            if (signatures[signature]) return;
                            signatures[signature] = true;
                            var evaluated = evaluateCandidate(
                                points,
                                thresholds,
                                baseSlopes,
                                options,
                                [b1, b2 - b1, b3 - b2, b4 - b3, n - b4]
                            );
                            evaluated.slopeTemplateId = matchedSlopeTemplate.id;
                            evaluated.slopeTemplateLabel = matchedSlopeTemplate.label;
                            candidates.push(evaluated);
                        });
                    }
                }
            }
        }

        var strictCandidateFound = candidates.length > 0;
        var fuzzyDisplayCap = Math.max(0, asNumber(options.fuzzyDisplayCap, 0));
        var fuzzyCapTolerance = Math.max(1, asNumber(options.fuzzyCapTolerance, 10000));
        var exhaustiveSearch = buildExhaustiveCandidates(points, options, step, slopeTemplates);
        // 最终排名只使用完整穷举结果；前面的分段回归仅用于判断样本是否直接覆盖了转折点。
        candidates = exhaustiveSearch.candidates;
        if (!candidates.length) {
            var hasLockedConstraint = thresholdRanges.some(function (range) { return !!range; })
                || slopeConstraints.some(function (slope) { return slope != null; });
            if (hasLockedConstraint) {
                throw new Error('已锁定的阈值或斜率与当前样本、Wiki基础上限或阈值取整单位冲突；锁定内容未被修改，请检查新样本或放宽对应约束。');
            }
            throw new Error('当前样本无法生成近似表，请检查是否存在重复理论伤害或无效伤害范围。');
        }
        candidates.sort(function (left, right) {
            if (left.score !== right.score) return left.score - right.score;
            return left.rmse - right.rmse;
        });
        var selected = candidates.slice(0, Math.max(1, Math.round(options.maxCandidates)));
        var best = selected[0];
        var typicalFinal = Math.max(1, points.reduce(function (sum, point) { return sum + point.actualFinal; }, 0) / points.length);
        var relativeRmse = best.rmse / typicalFinal;
        var relativeMaxError = best.maxError / typicalFinal;
        var fitStatus = relativeRmse <= 0.01 && relativeMaxError <= 0.02
            ? 'credible'
            : relativeRmse <= 0.03 && relativeMaxError <= 0.06
                ? 'tentative'
                : 'no_match';
        if (points.length < 3 && fitStatus !== 'no_match') fitStatus = 'exploratory';
        var approximateResult = points.length < 8 || fitStatus !== 'credible';
        best.approximate = approximateResult;
        best.confidence = fitStatus === 'no_match' ? '不可信'
            : points.length === 1 ? '极低'
            : points.length === 2 ? '低'
            : approximateResult ? '探索'
            : relativeRmse <= 0.0001 && points.length >= 10 ? '高'
            : relativeRmse <= 0.002 ? '中'
                : '低';
        best.relativeRmse = relativeRmse;
        best.relativeMaxError = relativeMaxError;

        var endpointErrors = [];
        best.predictions.forEach(function (prediction) {
            endpointErrors.push(prediction.minimumError, prediction.maximumError);
        });
        var meanSignedError = endpointErrors.reduce(function (sum, value) { return sum + value; }, 0)
            / Math.max(1, endpointErrors.length);
        var systematicDirection = endpointErrors.every(function (value) { return value < 0; }) ? 'below'
            : endpointErrors.every(function (value) { return value > 0; }) ? 'above'
                : 'mixed';

        var warnings = [];
        if (fitStatus === 'no_match') {
            warnings.push('未找到可信对应表：以下仅展示约束范围内误差最低的候选，不应直接写入正式衰减表。');
        } else if (fitStatus === 'tentative') {
            warnings.push('当前候选端点误差仍偏大，只能作为待验证结果。');
        } else if (fitStatus === 'exploratory') {
            warnings.push('当前只有' + points.length + '组样本；已开始完整穷举，但大量阈值表仍可能产生相同或相近结果，当前候选仅用于决定下一组测试。');
        }
        if (approximateResult) warnings.push('当前数据尚不能唯一锁定五段表，以下为允许较大偏差的探索性近似；继续按推荐区间补点会自动收敛。');
        if (!strictCandidateFound) warnings.push('当前结果来自已知斜率模板下的阈值优化，尚未观察到足以直接识别全部转折点的数据。');
        warnings.push('斜率仅从现有技伤衰减表的' + slopeTemplates.length + '种已知模板中选择，本次采用：' + (best.slopeTemplateLabel || best.slopeTemplateId) + '。');
        warnings.push('已按' + step.toLocaleString() + '的阈值网格执行完整分支限界穷举：实际评分'
            + exhaustiveSearch.evaluatedCount.toLocaleString() + '张，并利用全部样本的误差下界安全剪枝'
            + exhaustiveSearch.prunedCandidateCount.toLocaleString() + '张；结果不是局部搜索。');
        var aboveRawCount = points.filter(function (point) { return point.y > point.x * 1.03; }).length;
        if (aboveRawCount >= 2) {
            warnings.push('有' + aboveRawCount + '组样本在扣除已记录的伤害上升与增幅后仍高于理论伤害，可能还存在未记录乘区；这些样本会保留并参与近似，但无法形成零误差表。');
        }
        if (systematicDirection === 'below') {
            warnings.push('所有预测极值均低于实测，平均少' + Math.round(Math.abs(meanSignedError)).toLocaleString() + '；这更像遗漏了增伤乘区、伤害上升或上限缓和，而不是阈值位置误差。');
        } else if (systematicDirection === 'above') {
            warnings.push('所有预测极值均高于实测，平均多' + Math.round(Math.abs(meanSignedError)).toLocaleString() + '；请优先检查理论倍率、防御值和已记录加成。');
        }
        if (points.length < 12) warnings.push('样本少于12组，建议在各疑似转折点前后继续补点。');
        if (fuzzyDisplayCap > 0) warnings.push('基础上限已硬性限制在Wiki值±' + Math.round(fuzzyCapTolerance / 10000 * 100) / 100 + '万内。');
        var lockedThresholdCount = thresholdRanges.filter(function (range) { return !!range; }).length;
        var lockedSlopeCount = slopeConstraints.filter(function (slope) { return slope != null; }).length;
        if (lockedThresholdCount || lockedSlopeCount) {
            warnings.push('本次穷举已将' + lockedThresholdCount + '个阈值约束和' + lockedSlopeCount + '段斜率作为硬条件；后续新增样本不会改写它们。');
        }

        return {
            best: best,
            candidates: selected,
            sampleCount: points.length,
            approximate: approximateResult,
            fitStatus: fitStatus,
            diagnostics: {
                relativeRmse: relativeRmse,
                relativeMaxError: relativeMaxError,
                meanSignedError: meanSignedError,
                systematicDirection: systematicDirection
            },
            slopeTemplateCount: slopeTemplates.length,
            evaluatedCount: exhaustiveSearch.evaluatedCount,
            prunedCandidateCount: exhaustiveSearch.prunedCandidateCount,
            prunedBranchCount: exhaustiveSearch.prunedBranchCount,
            searchMethod: 'exhaustive',
            searchBounds: {
                capMinimum: exhaustiveSearch.capMinimum,
                capMaximum: exhaustiveSearch.capMaximum,
                maximumThreshold: exhaustiveSearch.maximumThreshold,
                thresholdStep: step,
                thresholdRanges: thresholdRanges
            },
            constraints: {
                thresholdRanges: thresholdRanges,
                slopeConstraints: slopeConstraints
            },
            nextTargets: buildNextTargets(candidates, points, step, thresholdRanges),
            warning: warnings.join(' ')
        };
    }

    function parseSampleText(text) {
        var samples = [];
        String(text || '').split(/\r?\n/).forEach(function (line, lineIndex) {
            var trimmed = line.trim();
            if (!trimmed || trimmed.charAt(0) === '#') return;
            var columns = trimmed.split(/[\t,，;；]+/).map(function (item) { return item.trim(); });
            if (columns.length < 2 || !columns[0] || !columns[1]) {
                throw new Error('第 ' + (lineIndex + 1) + ' 行格式应为：理论伤害, 最终伤害。');
            }
            samples.push({ theory: Number(columns[0]), final: Number(columns[1]) });
        });
        return samples;
    }

    function buildStages(candidate) {
        return candidate.slopes.map(function (slope, index) {
            return { limit: index < candidate.thresholds.length ? candidate.thresholds[index] : null, slope: slope };
        });
    }

    function buildConfig(candidate, metadata) {
        var display = String(candidate.displayCap).replace(/\.0+$/, '');
        return {
            id: 'skill_inferred_' + display,
            entry: {
                type: 'skill',
                multiplier: metadata && metadata.multiplier != null ? Number(metadata.multiplier) : null,
                damage_limit_type: metadata && metadata.damageLimitType ? String(metadata.damageLimitType) : '',
                displayCap: candidate.displayCap,
                label: '技伤推算衰减表 上限' + display + '万',
                stages: buildStages(candidate)
            }
        };
    }

    return {
        infer: infer,
        parseSampleText: parseSampleText,
        decayDamage: decayDamage,
        predictFinal: predictFinal,
        predictFinalRange: predictFinalRange,
        predictUndecayedFinal: predictUndecayedFinal,
        predictUndecayedFinalRange: predictUndecayedFinalRange,
        buildStages: buildStages,
        buildConfig: buildConfig,
        normalizeSlopeTemplates: normalizeSlopeTemplates,
        normalizeThresholdRanges: normalizeThresholdRanges,
        normalizeSlopeConstraints: normalizeSlopeConstraints
    };
});
