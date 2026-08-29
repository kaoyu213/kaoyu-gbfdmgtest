// ==========================================
//  GBF 模拟器 - 渲染模块 - 召唤石相关
// ==========================================

// 召唤石位置标签
const SUMMON_SLOT_LABELS = ['主召', '友召', 'Sum 1', 'Sum 2', 'Sum 3', 'Sum 4', 'Sub 1', 'Sub 2'];

// 获取召唤石槽位标签
function getSummonSlotLabel(index) {
    const labels = ['主召', '友召', 'Sum 1', 'Sum 2', 'Sum 3', 'Sum 4', 'Sub 1', 'Sub 2'];
    return labels[index] || `槽位${index}`;
}

function refreshSummonBattleDock() {
    if (window.BurstSimulator && typeof window.BurstSimulator.refresh === 'function') {
        window.BurstSimulator.refresh();
    }
}

// 获取主手武器的属性
function getMainHandElement() {
    const mainHand = currentGrid[0];
    return mainHand ? mainHand.element : null;
}

// 解析召唤石效果，返回神石、属攻和伤害上限加成
function parseSummonEffects(summon, slotIndex) {
    let optimusBonus = 0;
    let elementAtkBonus = 0;
    let damageCapBonus = 0;

    if (window.SummonRegistry && typeof window.SummonRegistry.getBuildEffectEntries === 'function') {
        window.SummonRegistry.getBuildEffectEntries(summon, slotIndex).forEach((entry) => {
            const percentValue = (Number(entry.value) || 0) * 100;
            if (entry.stat_key === 'summon_optimus') optimusBonus += percentValue;
            if (entry.stat_key === 'summon_element_atk') elementAtkBonus += percentValue;
            if (entry.stat_key === 'summon_dmg_cap') damageCapBonus += percentValue;
        });
        return { optimus: optimusBonus, elementAtk: elementAtkBonus, damageCap: damageCapBonus };
    }
    
    if (!summon.effects) return { optimus: 0, elementAtk: 0, damageCap: 0 };
    
    // 获取召唤石属性，如果是"mc"则使用主手武器属性
    let summonElement = summon.element;
    if (summonElement === 'mc') {
        summonElement = getMainHandElement();
    }
    
    const selectedLevel = summon.selectedLevel || 250;
    let effectData = null;
    
    // 根据位置获取效果数据
    if (slotIndex === 0) {
        // 主召位置
        effectData = summon.effects.main?.[selectedLevel];
    } else if (slotIndex === 1) {
        // 友召位置
        effectData = summon.effects.friend?.[selectedLevel];
    } else {
        // 副召位置 - 这里通常不加成神石/属攻，但可能加伤害上限
        effectData = summon.effects.sub?.[selectedLevel];
    }
    
    if (!effectData?.effect) return { optimus: 0, elementAtk: 0, damageCap: 0 };
    
    // 解析效果字符串，格式如: "element_optiums:120%;summon_element_atk:30%"
    const effects = effectData.effect.split(';');
    effects.forEach(eff => {
        const [key, value] = eff.split(':');
        if (!key || !value) return;
        
        const numValue = parseFloat(value.replace('%', ''));
        if (isNaN(numValue)) return;
        
        // 神石加成 (element_optiums)
        if (key.includes('element_optiums')) {
            optimusBonus += numValue;
        }
        // 属攻加成 (element_atk)
        if (key.includes('element_atk')) {
            elementAtkBonus += numValue;
        }
        // 伤害上限加成 (damage_cap)
        if (key.includes('damage_cap')) {
            damageCapBonus += numValue;
        }
    });
    
    return { optimus: optimusBonus, elementAtk: elementAtkBonus, damageCap: damageCapBonus };
}

// 渲染召唤石列表（点击填充到召唤石设定区域）
function renderSummons() {
    const container = document.getElementById('summons-list-container');
    if (!container) return;

    if (allSummons.length === 0) {
        container.innerHTML = '<div style="padding:10px;text-align:center;color:#888">暂无召唤石数据</div>';
        return;
    }

    container.innerHTML = allSummons.map(s => {
        const color = getElementColor(s.element) || '#888';
        const imgHtml = s.image ? `<img src="images/${s.image}" style="width:100px;height:100px;object-fit:contain;margin-right:10px;">` : `<div style="width:100px;height:100px;display:flex;align-items:center;justify-content:center;background:#222;border-radius:4px;color:#666;font-size:0.8em;">无图</div>`;
        
        // 获取最大等级
        const maxLevel = s.maxLevel || 250;
        
        // 获取最大等级的效果（新结构）
        let mainEffect = '';
        let friendEffect = '';
        let subEffect = '';
        
        if (s.effects) {
            // 新结构：effects.main[等级]
            const mainEffects = s.effects.main || {};
            const friendEffects = s.effects.friend || {};
            const subEffects = s.effects.sub || {};
            
            // 查找最大等级的效果
            const availableLevels = s.availableLevels || [];
            const sortedLevels = [...availableLevels].sort((a, b) => a - b);
            const actualMaxLevel = sortedLevels.length > 0 ? sortedLevels[sortedLevels.length - 1] : maxLevel;
            
            mainEffect = mainEffects[actualMaxLevel]?.description || '无';
            friendEffect = friendEffects[actualMaxLevel]?.description || '无';
            subEffect = subEffects[actualMaxLevel]?.description || '无';
        } else if (s.main_summon_effect) {
            // 旧结构兼容
            mainEffect = s.main_summon_effect.description || '无';
            friendEffect = s.friend_summon_effect?.description || '无';
            subEffect = s.sub_summon_effect?.description || '无';
        }
        
        return `
        <div style="display:flex;align-items:flex-start;padding:10px; cursor:pointer;" onclick="addSummonToSlot('${s.id}')">
            ${imgHtml}
            <div style="flex-grow:1">
                <div style="font-weight:bold; font-size:1em; display:flex; justify-content:space-between;">
                    <span>${s.name}</span>
                    <span style="font-size:0.8em; color:${color}">${s.element}</span>
                </div>
                <div style="font-size:0.8em; color:#aaa; margin-top:4px;">
                    ${s.type} | 最大等级: ${maxLevel}
                </div>
                <div style="font-size:0.75em; color:#26a69a; margin-top:4px;">
                    主召: ${mainEffect}
                </div>
                <div style="font-size:0.7em; color:#888; margin-top:2px;">
                    友召: ${friendEffect}
                </div>
                <div style="font-size:0.7em; color:#f39c12; margin-top:2px;">
                    副召: ${subEffect}
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// 渲染主面板召唤石区域
function renderMainSummonSlots() {
    for (let i = 0; i < 8; i++) {
        const slotEl = document.getElementById('main-summon-' + i);
        if (!slotEl) continue;
        
        const summon = currentSummons[i];
        
        if (summon) {
            const color = getElementColor(summon.element) || '#888';
            const imgHtml = summon.image 
                ? `<img src="images/${summon.image}" style="width:100%;height:100%;object-fit:contain;position:absolute;top:0;left:0;" alt="${summon.name}">`
                : '';
            
            slotEl.innerHTML = `
                ${imgHtml}
                <div style="position:absolute;bottom:5px;left:0;right:0;text-align:center;background:rgba(0,0,0,0.7);padding:2px 0;font-size:0.75em;color:#fff;">
                    ${summon.name}
                </div>
            `;
            slotEl.style.background = color;
            
            // 点击删除召唤石
            slotEl.onclick = () => removeSummonFromSlot(i);
        } else {
            const labels = ['主召', '友召', 'Sum 1', 'Sum 2', 'Sum 3', 'Sum 4', 'Sub 1', 'Sub 2'];
            slotEl.innerHTML = labels[i];
            slotEl.style.background = '';
            slotEl.onclick = () => selectSummonSlot(i);
        }
    }
}

// 添加召唤石到召唤石设定区域（按顺序填充到第一个空位）
function addSummonToSlot(summonId) {
    const summon = allSummons.find(s => s.id === summonId);
    if (!summon) return;
    
    // 找到第一个空位
    let emptyIndex = -1;
    for (let i = 0; i < 8; i++) {
        if (currentSummons[i] === null) {
            emptyIndex = i;
            break;
        }
    }
    
    if (emptyIndex === -1) {
        alert('召唤石设定区域已满！');
        return;
    }
    
    // 复制召唤石数据
    const newSummon = JSON.parse(JSON.stringify(summon));
    
    // 设置默认等级为可用等级中的最大等级
    const availableLevels = summon.availableLevels || [100, 150, 200, 250];
    const maxLevel = Math.max(...availableLevels);
    newSummon.selectedLevel = maxLevel;
    
    currentSummons[emptyIndex] = newSummon;
    
    // 同步更新主面板召唤石显示
    renderMainSummonSlots();
    
    // 渲染召唤石选框
    renderSummonSlots();
    
    // 更新神石/属攻输入框
    updateAuraFromSummons();
    refreshSummonBattleDock();
}

// 更新召唤石加成到输入框
function updateAuraFromSummons() {
    let totalOptimus = 0;
    let totalElementAtk = 0;
    let totalDamageCap = 0;
    
    // 用于记录带*only标签的同名召唤石加成（只记录最大值）
    const mainOnlyMap = new Map();
    const friendOnlyMap = new Map();
    const subOnlyMap = new Map();
    
    // 计算所有召唤石的神石、属攻和伤害上限加成
    for (let i = 0; i < 8; i++) {
        const summon = currentSummons[i];
        if (summon) {
            const bonuses = parseSummonEffects(summon, i);
            
            // 检查对应位置的only标签
            const isMainOnly = i === 0 && summon.mainonly;
            const isFriendOnly = i === 1 && summon.friendonly;
            const isSubOnly = i >= 2 && summon.subonly;
            
            if (isMainOnly) {
                const currentMax = mainOnlyMap.get(summon.id) || {optimus: 0, elementAtk: 0, damageCap: 0};
                mainOnlyMap.set(summon.id, {
                    optimus: Math.max(currentMax.optimus, bonuses.optimus),
                    elementAtk: Math.max(currentMax.elementAtk, bonuses.elementAtk),
                    damageCap: Math.max(currentMax.damageCap, bonuses.damageCap || 0)
                });
            } else if (isFriendOnly) {
                const currentMax = friendOnlyMap.get(summon.id) || {optimus: 0, elementAtk: 0, damageCap: 0};
                friendOnlyMap.set(summon.id, {
                    optimus: Math.max(currentMax.optimus, bonuses.optimus),
                    elementAtk: Math.max(currentMax.elementAtk, bonuses.elementAtk),
                    damageCap: Math.max(currentMax.damageCap, bonuses.damageCap || 0)
                });
            } else if (isSubOnly) {
                const currentMax = subOnlyMap.get(summon.id) || {optimus: 0, elementAtk: 0, damageCap: 0};
                subOnlyMap.set(summon.id, {
                    optimus: Math.max(currentMax.optimus, bonuses.optimus),
                    elementAtk: Math.max(currentMax.elementAtk, bonuses.elementAtk),
                    damageCap: Math.max(currentMax.damageCap, bonuses.damageCap || 0)
                });
            } else {
                // 不受限的直接累加
                totalOptimus += bonuses.optimus;
                totalElementAtk += bonuses.elementAtk;
                totalDamageCap += bonuses.damageCap || 0;
            }
        }
    }
    
    // 将only限制的召唤石加成（取最大值）累加到总和中
    const addMapBonuses = (map) => {
        map.forEach(bonuses => {
            totalOptimus += bonuses.optimus;
            totalElementAtk += bonuses.elementAtk;
            totalDamageCap += bonuses.damageCap || 0;
        });
    };
    
    addMapBonuses(mainOnlyMap);
    addMapBonuses(friendOnlyMap);
    addMapBonuses(subOnlyMap);
    
    // 注意：已移除自动修改输入框的逻辑，让输入框完全由用户掌控。
    // 但是我们将把这些加护数据也保存在全局变量中，供显示或排查使用（最终真正生效的是calc.js重新解析的那一遍）
    window.summonOptimusBonus = totalOptimus / 100;
    window.summonElementAtkBonus = totalElementAtk / 100;
    
    // 存储伤害上限加成到全局变量，供calc.js使用（此处作为一种降级兼容，现在主要依赖calc.js自身解析）
    window.summonDamageCapBonus = totalDamageCap / 100; // 转换为小数形式
    
    // 触发重新计算
    try { recalculate(); } catch(e) { console.error('recalculate error:', e); }
}

// 辅助函数：获取指定等级或最近的下限等级效果（如果有描述则使用，否则找上一个有效描述）
function getEffectForLevel(effectsObj, targetLevel) {
    const levels = Object.keys(effectsObj).map(Number).sort((a, b) => a - b);
    if (levels.length === 0) return '';
    
    // 先找到小于等于目标等级的最大等级
    let applicableLevel = null;
    for (const level of levels) {
        if (level <= targetLevel) {
            applicableLevel = level;
        } else {
            break;
        }
    }
    
    if (applicableLevel === null) return '';
    
    // 检查该等级是否有描述，如果没有则向前找有描述的等级
    let resultLevel = applicableLevel;
    for (const level of levels.sort((a, b) => b - a)) {
        if (level <= targetLevel && effectsObj[level]?.description) {
            resultLevel = level;
            break;
        }
    }
    
    return effectsObj[resultLevel]?.description || '';
}

// 渲染召唤石选择器 (8行布局，仅显示)
function renderSummonSlots() {
    const container = document.getElementById('summon-settings-container');
    if (!container) return;
    
    // 获取当前召唤石ATK/HP值
const summonAtk = document.getElementById('summon-atk')?.value || '4651';
    const summonHp = document.getElementById('summon-hp')?.value || '1513';
    
    let html = '<div class="summon-slot-selector">';
    
    // 添加召唤石合计ATK和HP输入框
    html += `
        <div class="summon-stats-input-panel" style="display:flex; gap:15px; margin-bottom:15px; padding:10px; background:#2a2a2a; border-radius:4px;">
            <div class="summon-stat-group" style="flex:1;">
                <label style="color:#aaa; font-size:0.85em; display:block; margin-bottom:4px;">召唤石合计ATK</label>
<input type="number" id="summon-atk-panel" value="${summonAtk}" step="5" style="width:100%; padding:6px; background:#333; border:1px solid #555; color:#fff; border-radius:4px;" onchange="syncSummonStats()">
            </div>
            <div class="summon-stat-group" style="flex:1;">
                <label style="color:#aaa; font-size:0.85em; display:block; margin-bottom:4px;">召唤石合计HP</label>
                <input type="number" id="summon-hp-panel" value="${summonHp}" step="100" style="width:100%; padding:6px; background:#333; border:1px solid #555; color:#fff; border-radius:4px;" onchange="syncSummonStats()">
            </div>
        </div>
        
    `;
    
    for (let i = 0; i < 8; i++) {
        const summon = currentSummons[i];
        const label = SUMMON_SLOT_LABELS[i];
        
        if (summon) {
            const color = getElementColor(summon.element) || '#888';
            const imgHtml = summon.image 
                ? `<img src="images/${summon.image}" class="summon-select-img" alt="${summon.name}">`
                : `<div class="summon-select-img" style="display:flex;align-items:center;justify-content:center;background:#222;color:#666;font-size:0.7em;">无图</div>`;
            
            // 获取当前选择的等级
            const selectedLevel = summon.selectedLevel || 250;
            
            // 获取可用等级列表
            let levelOptions = '';
            let currentEffect = '';
            
            // 根据位置确定显示哪个效果
            const getPositionEffect = () => {
                if (summon.effects) {
                    const availableLevels = summon.availableLevels || [100, 150, 200, 210, 220, 230, 240, 250];
                    const sortedLevels = [...availableLevels].sort((a, b) => a - b);
                    
                    sortedLevels.forEach(level => {
                        const selected = level === selectedLevel ? 'selected' : '';
                        levelOptions += `<option value="${level}" ${selected}>${level}级</option>`;
                    });
                    
                    // 根据槽位位置获取对应效果
                    if (i === 0) {
                        const mainEffects = summon.effects.main || {};
                        return mainEffects[selectedLevel]?.description || getEffectForLevel(mainEffects, selectedLevel);
                    } else if (i === 1) {
                        const friendEffects = summon.effects.friend || {};
                        return friendEffects[selectedLevel]?.description || getEffectForLevel(friendEffects, selectedLevel);
                    } else {
                        const subEffects = summon.effects.sub || {};
                        return subEffects[selectedLevel]?.description || getEffectForLevel(subEffects, selectedLevel);
                    }
                } else {
                    // 旧结构兼容
                    if (i === 0) {
                        return summon.main_summon_effect?.description || '';
                    } else if (i === 1) {
                        return summon.friend_summon_effect?.description || '';
                    } else {
                        return summon.sub_summon_effect?.description || '';
                    }
                }
            };
            
            currentEffect = getPositionEffect();
            
            // 获取位置标签
            const getPositionLabel = () => {
                if (i === 0) return '主召';
                if (i === 1) return '友召';
                return '副召';
            };
            
            // 生成效果描述HTML（只显示当前位置的效果）
            let effectHtml = '';
            if (currentEffect) {
                const positionLabel = getPositionLabel();
                effectHtml = `<div class="summon-effect-desc"><div><span class="effect-label">${positionLabel}:</span>${currentEffect}</div></div>`;
            }
            
            // 等级选择器移到选框外面
            const levelSelectHtml = levelOptions ? `<select class="summon-level-select" onchange="changeSummonLevel(${i}, this.value)" onclick="event.stopPropagation()">${levelOptions}</select>` : '';
            
            html += `
                <div class="summon-select-row">
                    <div class="summon-select-label">${label}</div>
                    <div class="summon-select-box filled" onclick="removeSummonFromSlot(${i})" style="cursor:pointer;">
                        ${imgHtml}
                        <div class="summon-select-info">
                            <div class="summon-select-name">${summon.name}</div>
                            ${effectHtml}
                        </div>
                    </div>
                    <div style="flex-shrink: 0; margin-left: 5px;">
                        ${levelSelectHtml}
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="summon-select-row">
                    <div class="summon-select-label">${label}</div>
                    <div class="summon-select-box empty">
                        <span class="summon-select-placeholder">请从左侧召唤图鉴选择</span>
                    </div>
                </div>
            `;
        }
    }
    
    html += '</div>';
    
    container.innerHTML = html;
}

// 切换召唤石等级
function changeSummonLevel(slotIndex, level) {
    if (currentSummons[slotIndex]) {
        currentSummons[slotIndex].selectedLevel = parseInt(level);
        renderSummonSlots();
        // 更新神石/属攻输入框
        updateAuraFromSummons();
        refreshSummonBattleDock();
    }
}

// 从召唤石设定区域移除召唤石
function removeSummonFromSlot(index) {
    currentSummons[index] = null;
    
    // 同步更新主面板召唤石显示
    renderMainSummonSlots();
    
    renderSummonSlots();
    
    // 更新神石/属攻输入框
    updateAuraFromSummons();
    refreshSummonBattleDock();
}

// 同步召唤石ATK/HP数据（两侧输入框同步）
function syncSummonStats() {
    const summonAtkPanel = document.getElementById('summon-atk-panel');
    const summonHpPanel = document.getElementById('summon-hp-panel');
    const summonAtk = document.getElementById('summon-atk');
    const summonHp = document.getElementById('summon-hp');
    
    if (summonAtkPanel && summonAtk) {
        summonAtk.value = summonAtkPanel.value;
    }
    if (summonHpPanel && summonHp) {
        summonHp.value = summonHpPanel.value;
    }
    
    // 触发重新计算
    try { recalculate(); } catch(e) { console.error('recalculate error:', e); }
}

// 同步召唤石ATK/HP数据（从左侧面板到面板）
function syncSummonStatsFromMain() {
    const summonAtkPanel = document.getElementById('summon-atk-panel');
    const summonHpPanel = document.getElementById('summon-hp-panel');
    const summonAtk = document.getElementById('summon-atk');
    const summonHp = document.getElementById('summon-hp');
    
    if (summonAtk && summonAtkPanel) {
        summonAtkPanel.value = summonAtk.value;
    }
    if (summonHp && summonHpPanel) {
        summonHpPanel.value = summonHp.value;
    }
    
    // 触发重新计算
    try { recalculate(); } catch(e) { console.error('recalculate error:', e); }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SUMMON_SLOT_LABELS,
        getSummonSlotLabel,
        getMainHandElement,
        parseSummonEffects,
        renderSummons,
        renderMainSummonSlots,
        addSummonToSlot,
        updateAuraFromSummons,
        getEffectForLevel,
        renderSummonSlots,
        changeSummonLevel,
        removeSummonFromSlot,
        syncSummonStats,
        syncSummonStatsFromMain
    };
}
