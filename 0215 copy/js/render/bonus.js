// ==========================================
//  GBF 模拟器 - 渲染模块 - 加成显示相关
// ==========================================

function getSpecialBuffDefaultEffectValue(buff, effectKey) {
    if (!buff) return undefined;
    if (Array.isArray(buff.description)) {
        for (const item of buff.description) {
            if (item && item.effect && Object.prototype.hasOwnProperty.call(item.effect, effectKey)) {
                return item.effect[effectKey];
            }
        }
    } else if (buff.stats && Object.prototype.hasOwnProperty.call(buff.stats, effectKey)) {
        return buff.stats[effectKey];
    }
    return undefined;
}

// 返回“应用了自定义值后的”特殊道具效果汇总（用于展示与分解，避免与计算不一致）
function getSpecialBuffEffectiveStats(buff) {
    const buffStats = {};
    if (!buff) return buffStats;

    if (Array.isArray(buff.description)) {
        buff.description.forEach(item => {
            if (!item || !item.effect) return;
            Object.keys(item.effect).forEach(k => {
                const customMap = (typeof specialBuffCustomValues !== 'undefined' && specialBuffCustomValues)
                    ? (specialBuffCustomValues[buff.id] || null)
                    : null;
                const rawVal = item.effect[k];
                const val = (customMap && typeof customMap[k] === 'number' && Number.isFinite(customMap[k]))
                    ? customMap[k]
                    : rawVal;
                buffStats[k] = (buffStats[k] || 0) + val;
            });
        });
    } else if (buff.stats) {
        Object.keys(buff.stats).forEach(k => {
            const customMap = (typeof specialBuffCustomValues !== 'undefined' && specialBuffCustomValues)
                ? (specialBuffCustomValues[buff.id] || null)
                : null;
            const rawVal = buff.stats[k];
            const val = (customMap && typeof customMap[k] === 'number' && Number.isFinite(customMap[k]))
                ? customMap[k]
                : rawVal;
            buffStats[k] = (buffStats[k] || 0) + val;
        });
    }

    return buffStats;
}

function updateSpecialBuffCustomValue(event, buffId, effectKey, percentStr) {
    try { if (event && typeof event.stopPropagation === 'function') event.stopPropagation(); } catch(e) {}

    if (typeof specialBuffCustomValues === 'undefined') {
        window.specialBuffCustomValues = {};
    }

    const raw = (percentStr ?? '').toString().trim();
    if (raw === '') {
        if (specialBuffCustomValues[buffId]) {
            delete specialBuffCustomValues[buffId][effectKey];
            if (Object.keys(specialBuffCustomValues[buffId]).length === 0) delete specialBuffCustomValues[buffId];
        }
    } else {
        const pct = Number.parseFloat(raw);
        if (!Number.isFinite(pct)) {
            // 非法输入：视为未设置，回退默认
            if (specialBuffCustomValues[buffId]) {
                delete specialBuffCustomValues[buffId][effectKey];
                if (Object.keys(specialBuffCustomValues[buffId]).length === 0) delete specialBuffCustomValues[buffId];
            }
        } else {
            const clampedPct = Math.max(0, Math.min(1000, pct));
            const dec = clampedPct / 100;
            if (!specialBuffCustomValues[buffId]) specialBuffCustomValues[buffId] = {};
            specialBuffCustomValues[buffId][effectKey] = dec;
        }
    }

    try { if (typeof recalculate === 'function') recalculate(); } catch(e) {}
    try { window.dispatchEvent(new CustomEvent('specialBuffsChanged')); } catch(e) {}
}

// 渲染特殊加成选项卡
function renderSpecialTab() {
    const container = document.getElementById('special-buffs-list');
    if(!container) return;
    
    let html = '<div class="section-title">特殊道具</div>';
    html += '<div style="display:grid; grid-template-columns: 1fr; gap:10px;">';
    
    specialBuffsData.forEach(buff => {
        const isChecked = activeSpecialBuffs.has(buff.id) ? 'checked' : '';
        
        // 处理图片路径
        const imgDisplay = buff.image ? `<img src="images/${buff.image}" style="width:40px;height:40px;object-fit:contain;margin-right:10px;border-radius:4px;background:#111;">` : '';
        
        // 处理描述显示（数组格式或字符串格式）
        let descHtml = '';
        if (Array.isArray(buff.description)) {
            // 新格式：数组，显示所有效果的描述
            descHtml = buff.description.map(item => item.desc).join(' / ');
        } else {
            descHtml = buff.description || "无描述";
        }
        
        const isSymbol = buff.id === 'symbolum_amicitiae';
        let customInputHtml = '';
        if (isSymbol) {
            const customVal = (typeof specialBuffCustomValues !== 'undefined' && specialBuffCustomValues && specialBuffCustomValues[buff.id])
                ? specialBuffCustomValues[buff.id]['dmg_amp']
                : undefined;
            const defaultVal = getSpecialBuffDefaultEffectValue(buff, 'dmg_amp');
            const valToShow = (typeof customVal === 'number' && Number.isFinite(customVal))
                ? (customVal * 100)
                : (typeof defaultVal === 'number' && Number.isFinite(defaultVal) ? (defaultVal * 100) : 0);

            customInputHtml = `
                <div style="display:flex; align-items:center; gap:6px; margin-left:10px;" onclick="event.stopPropagation()">
                    <span style="font-size:0.75em; color:#aaa;">加成(%)</span>
                    <input
                        type="number"
                        step="0.1"
                        min="0"
                        style="width:72px; padding:4px 6px; background:#111; border:1px solid #444; color:#eee; border-radius:4px;"
                        value="${valToShow}"
                        oninput="updateSpecialBuffCustomValue(event, '${buff.id}', 'dmg_amp', this.value)"
                        onchange="updateSpecialBuffCustomValue(event, '${buff.id}', 'dmg_amp', this.value)"
                        onmousedown="event.stopPropagation()"
                        onclick="event.stopPropagation()"
                    >
                </div>
            `;
        }

        html += `
            <div class="inventory-item" onclick="toggleSpecialBuff('${buff.id}')" style="cursor:pointer; background:${isChecked ? '#3a3a3a' : '#222'}; border:${isChecked ? '1px solid #f39c12' : '1px solid #444'}; display:flex; align-items:center; padding:8px;">
                <input type="checkbox" ${isChecked} style="pointer-events:none; margin-right:10px; width:16px; height:16px;">
                ${imgDisplay}
                <div style="flex:1;">
                    <div style="font-weight:bold; font-size:0.95em; color:${isChecked ? '#f39c12' : '#e0e0e0'}">${buff.name}</div>
                    <div style="font-size:0.8em; color:#888; margin-top:2px; line-height:1.3;">${descHtml}</div>
                </div>
                ${customInputHtml}
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// 切换特殊加成
function toggleSpecialBuff(id) {
    if (activeSpecialBuffs.has(id)) {
        activeSpecialBuffs.delete(id);
    } else {
        activeSpecialBuffs.add(id);
    }
    renderSpecialTab();
    recalculate();
    window.dispatchEvent(new CustomEvent('specialBuffsChanged'));
}

// 构建角色额外加成的汇总结果 (charabonussum)
// hpPercent: 可选，0~100。若传入则「总浑身（强壮）」按当前HP折算显示；不传则显示满血值
function buildCharabonusSummary(slotIndex, hpPercent) {
    const result = {};

    // 如果没有配置汇总规则，直接返回空对象，保持兼容
    if (typeof CHARABONUS_SUM_RULES === 'undefined') return result;

    let charData = null;
    if (typeof currentParty !== 'undefined' && Array.isArray(currentParty)) {
        charData = currentParty[slotIndex] || null;
    }
    if (!charData) return result;

    Object.entries(CHARABONUS_SUM_RULES).forEach(([key, groupKey]) => {
        const val = charData[key] || 0;
        if (!val) return;
        if (!result[groupKey]) result[groupKey] = 0;
        result[groupKey] += val;
    });

    // ====== 角色强化中的浑身 → 强壮汇总 ======
    // 使用 chara_ring_stamina / chara_earring_stamina / chara_lb_stamina
    // 每个来源独立按各自曲线计算，再在强壮乘区中相加
    let strongCaps = [];          // 预留给仍走通用强壮曲线的来源（目前为空）
    let lbStrongBonus = 0;        // LB浑身强壮
    let ringEarringStrong = 0;    // 戒指+耳饰浑身强壮（按新表）

    const ringStamina = charData['chara_ring_stamina'] || 0;
    const earringStamina = charData['chara_earring_stamina'] || 0;

    const hasHp = (typeof hpPercent === 'number');
    const hp01ForChar = hasHp ? Math.max(0, Math.min(1, hpPercent / 100)) : 1;

    // 戒指浑身：使用 getRingEarringStaminaStrongBonus 曲线
    if (ringStamina > 0) {
        if (typeof getRingEarringStaminaStrongBonus === 'function') {
            ringEarringStrong += getRingEarringStaminaStrongBonus(hp01ForChar, ringStamina);
        } else {
            // 兜底：走旧的 cap → 通用强壮曲线逻辑
            strongCaps.push((2 + ringStamina) / 100);
        }
    }

    // 耳饰浑身：使用同一套曲线，独立计算后累加
    if (earringStamina > 0) {
        if (typeof getRingEarringStaminaStrongBonus === 'function') {
            ringEarringStrong += getRingEarringStaminaStrongBonus(hp01ForChar, earringStamina);
        } else {
            strongCaps.push((2 + earringStamina) / 100);
        }
    }

    // LB浑身：优先使用每个LB格子的独立量数组（可正确处理多个浑身LB）
    if (typeof getLbStaminaStrongBonus === 'function') {
        const amounts = Array.isArray(charData['chara_lb_stamina_amounts']) ? charData['chara_lb_stamina_amounts'] : null;
        if (amounts && amounts.length > 0) {
            const hp01 = (typeof hpPercent === 'number')
                ? Math.max(0, Math.min(1, hpPercent / 100))
                : 1;
            lbStrongBonus = amounts.reduce((acc, amt) => acc + getLbStaminaStrongBonus(hp01, amt), 0);
        } else {
            // 兼容旧存档：只有累计值时，仍按 1/2/3 处理（多于3会被忽略）
            const lbStaminaLevel = charData['chara_lb_stamina'] || 0;
            if (lbStaminaLevel > 0) {
                if (typeof hpPercent === 'number') {
                    const hp01 = Math.max(0, Math.min(1, hpPercent / 100));
                    lbStrongBonus = getLbStaminaStrongBonus(hp01, lbStaminaLevel);
                } else {
                    lbStrongBonus = getLbStaminaStrongBonus(1, lbStaminaLevel);
                }
            }
        }
    }

    if (strongCaps.length > 0) {
        if (typeof hpPercent === 'number' && typeof calculateStrongBuffSum === 'function') {
            const hp01 = Math.max(0, Math.min(1, hpPercent / 100));
            result['strong'] = calculateStrongBuffSum(hp01, strongCaps);
        } else {
            // 未传入HP时，显示满血总强壮（各技能 max_cap 求和）
            const totalStrong = strongCaps.reduce((acc, v) => acc + v, 0);
            result['strong'] = (result['strong'] || 0) + totalStrong;
        }
    }

    if (ringEarringStrong) {
        result['strong'] = (result['strong'] || 0) + ringEarringStrong;
    }

    if (lbStrongBonus) {
        result['strong'] = (result['strong'] || 0) + lbStrongBonus;
    }

    // ====== 角色强化中的背水/逆境 → 逆境汇总（框架预留） ======
    // 目标：在这里把「戒指、耳饰、LB、武器附魔、角色技能」等提供的逆境类效果，
    //       按你提供的 HP 曲线换算为当前 HP 下的实际倍率，并汇总到 result['adversity']。
    //
    // 目前先预留结构，不进行任何数值计算，等待后续你给出具体字段和曲线：
    //   - ringAdversity: 戒指逆境
    //   - earringAdversity: 耳饰逆境
    //   - lbAdversity: LB 逆境
    //   - enchantAdversity: 武器附魔逆境
    //   - skillAdversity: 角色技能/被动逆境
    //
    // 示例（占位写法）：
    let ringAdversity = 0;
    let earringAdversity = 0;
    let lbAdversity = 0;
    let enchantAdversity = 0;
    let skillAdversity = 0;

    const hp01ForAdversity = hasHp ? Math.max(0, Math.min(1, hpPercent / 100)) : 1;
    // 戒指背水：使用 getRingEarringEnmityAdversityBonus 曲线
    const ringEnmity = charData['chara_ring_enmity'] || 0;
    if (ringEnmity > 0 && typeof getRingEarringEnmityAdversityBonus === 'function') {
        ringAdversity = getRingEarringEnmityAdversityBonus(hp01ForAdversity, ringEnmity);
    }

    // 耳饰背水：与戒指共用同一套背水+N → 逆境曲线，独立计算后累加
    const earringEnmity = charData['chara_earring_enmity'] || 0;
    if (earringEnmity > 0 && typeof getRingEarringEnmityAdversityBonus === 'function') {
        earringAdversity = getRingEarringEnmityAdversityBonus(hp01ForAdversity, earringEnmity);
    }

    // LB 背水：小/中/大 → 1/2/3 级，对应 getLbEnmityAdversityBonus 曲线
    const lbEnmityLevel = charData['chara_lb_enmity'] || 0;
    if (lbEnmityLevel > 0 && typeof getLbEnmityAdversityBonus === 'function') {
        lbAdversity = getLbEnmityAdversityBonus(hp01ForAdversity, lbEnmityLevel);
    }

    // enchantAdversity / skillAdversity：武器附魔逆境在 calc 已写入 stats；技能逆境待接

    const totalAdversity = ringAdversity + earringAdversity + lbAdversity + enchantAdversity + skillAdversity;
    if (totalAdversity) {
        result['adversity'] = (result['adversity'] || 0) + totalAdversity;
    }

    return result;
}

// 渲染常驻加成 (统合了角色被动、召唤石、职业等所有非武器加成)
function renderResidentBonuses(slotIndex = 0) {
    const container = document.getElementById('resident-bonuses-output');
    if(!container) return;
    
    // 如果 party 还未初始化或为空，则暂不渲染
    if (!party || !party[slotIndex] || !party[slotIndex].stats) return;

    let html = '';
    const isMC = (slotIndex === 0);
    
    // 按照 category 分组展示非武器相关的 stats 加成
    // 根据角色类型过滤显示分类
    const categories = [
        ...(isMC ? [
            { id: 'job', title: '职业相关加成' },
            { id: 'mc_lb', title: '主角LB加成（显示用）' }
        ] : [
            { id: 'chara', title: '角色被动加成' },
            { id: 'charabonussum', title: '角色强化加成(汇总)' },
            // STAT_CONFIG 里 category=charabonus 的条目需在此挂段，否则不会进入下方 forEach（与 constants 是否有定义无关）
            { id: 'charabonus', title: '角色强化加成(明细)' }
        ]),
        { id: 'summon', title: '召唤石常驻加成' },
        { id: 'special', title: '特殊道具加成' },
        { id: 'system', title: '综合/系统加成' }
    ];

    const teshuStats = getTeshuStats(); // 提取特殊道具加成用于匹配展示

    categories.forEach(cat => {
        let hasContent = false;
        let sectionHtml = `<div class="collapsible-section">`;
        sectionHtml += `<div class="collapsible-header" onclick="toggleCollapsible('${cat.id}-bonuses-content', this)" style="cursor:pointer; padding:5px 0; display:flex; align-items:center; color:#aaa;">`;
        sectionHtml += `<span class="collapse-icon">▼</span><span>${cat.title}</span>`;
        sectionHtml += `</div>`;
        sectionHtml += `<div id="${cat.id}-bonuses-content" class="collapsible-content">`;

        // 特殊处理：角色强化加成(汇总) 使用 CHARABONUS_SUM_RULES / GROUPS
        if (cat.id === 'charabonussum') {
            const currentHp = parseInt(document.getElementById('current-hp-slider')?.value, 10);
            const hpPercent = Number.isNaN(currentHp) ? undefined : currentHp;
            const summary = buildCharabonusSummary(slotIndex, hpPercent);

            if (typeof CHARABONUS_SUM_GROUPS !== 'undefined') {
                Object.keys(summary).forEach(groupKey => {
                    const cfgGroup = CHARABONUS_SUM_GROUPS[groupKey];
                    if (!cfgGroup) return;

                    let val = summary[groupKey];
                    if (Math.abs(val) <= 0.0001) return;

                    hasContent = true;

                    let displayVal;
                    if (cfgGroup.format === 'percent') {
                        displayVal = (val * 100).toFixed(2) + "%";
                    } else {
                        displayVal = Math.round(val).toString();
                    }

                    sectionHtml += `<div class="stat-line"><span>${cfgGroup.label}</span> <span class="val-highlight">${displayVal}</span></div>`;
                });
            }

            if (!hasContent) {
                sectionHtml += `<div class="stat-line"><span style="color:#666">暂无${cat.title}</span><span style="color:#666">-</span></div>`;
            }

            sectionHtml += `</div></div><hr style="border-color:#444; margin: 10px 0;">`;
            html += sectionHtml;
            return; // 本分类已处理，继续下一个
        }

        // 特殊处理：主角LB加成展示（与其他加成同样使用 format 规则）
        if (cat.id === 'mc_lb') {
            let hasContent = false;
            const mcLbTotals = (typeof window.getMcLbTotals === 'function') ? window.getMcLbTotals() : null;
            if (mcLbTotals) {
                (typeof MC_LB_DISPLAY_TABLE !== 'undefined' ? MC_LB_DISPLAY_TABLE : []).forEach(row => {
                    if (!row || !row.key) return;
                    let val = mcLbTotals[row.key] || 0;

                    if (row.cap !== null && row.cap !== undefined && typeof row.cap === 'number' && val > row.cap) {
                        val = row.cap;
                    }
                    // 仅在“接近 0”时隐藏；允许负数展示
                    if (Math.abs(val) <= 0.0001) return;

                    hasContent = true;
                    let displayVal = '';
                    if (row.format === 'percent') {
                        displayVal = (val * 100).toFixed(2) + '%';
                    } else {
                        displayVal = Math.round(val).toString();
                    }

                    sectionHtml += `<div class="stat-line"><span>${row.label || row.key}</span> <span class="val-highlight">${displayVal}</span></div>`;
                });
            }

            if (!hasContent) {
                sectionHtml += `<div class="stat-line"><span style="color:#666">暂无主角LB加成</span><span style="color:#666">-</span></div>`;
            }

            sectionHtml += `</div></div><hr style="border-color:#444; margin: 10px 0;">`;
            html += sectionHtml;
            return;
        }
        
        // 其他分类仍按 STAT_CONFIG 原始字段展示
        STAT_CONFIG.forEach(cfg => {
            if (cfg.category !== cat.id) return;
            
            let val = 0;
            if (cat.id === 'special') {
                const actualKey = cfg.key.replace('special_', '');
                val = teshuStats[actualKey] || 0;
            } else if (cat.id === 'charabonus') {
                // 角色额外加成保存在当前队伍角色数据上 (currentParty)，而不是 party[slotIndex].stats
                let charData = null;
                if (typeof currentParty !== 'undefined' && Array.isArray(currentParty)) {
                    charData = currentParty[slotIndex] || null;
                }
                if (charData) {
                    val = charData[cfg.key] || 0;
                } else {
                    val = 0;
                }
            } else {
                // 读取当前选中的角色被动等数据
                val = party[slotIndex].stats[cfg.key] || 0;
            }

            // 平A乱击段数：默认值为 1（等同“无乱击”），面板不展示
            if (cfg.key === 'weapon_na_ranshu' && Number(val) === 1) return;
            
            let isCapped = false;
            if (cfg.cap !== null && val > cfg.cap) {
                val = cfg.cap;
                isCapped = true;
            }

            // 仅在“接近 0”时隐藏；允许负数展示（例如 -100% TA）
            if (Math.abs(val) <= 0.0001) return;
            
            hasContent = true;
            
            let displayVal = val;
            let rowLabel = cfg.label;
            if (cfg.format === 'percent') displayVal = (val * 100).toFixed(2) + "%";
            else displayVal = val.toFixed(0);

            if (isCapped) {
                 displayVal += " (MAX)";
            }

            // 耳饰伤害上升：存等级 n，展示予伤 n×2000，仅显示「耳饰伤害上升  10000」
            if (cat.id === 'charabonus' && cfg.key === 'chara_earring_dmg_supp' && typeof getEarringDmgSuppFromLevel === 'function') {
                const suppFixed = getEarringDmgSuppFromLevel(val);
                displayVal = String(Math.round(suppFixed));
                rowLabel = '耳饰伤害上升';
            }

            sectionHtml += `<div class="stat-line"><span>${rowLabel}</span> <span class="${isCapped ? 'capped-val' : 'val-highlight'}">${displayVal}</span></div>`;
        });
        
        if (!hasContent) {
            sectionHtml += `<div class="stat-line"><span style="color:#666">暂无${cat.title}</span><span style="color:#666">-</span></div>`;
        }
        
        sectionHtml += `</div></div><hr style="border-color:#444; margin: 10px 0;">`;
        html += sectionHtml;
    });

    container.innerHTML = html;
}

// 切换折叠状态
function toggleCollapsible(contentId, header) {
    const content = document.getElementById(contentId);
    const icon = header.querySelector('.collapse-icon');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (icon) icon.textContent = '▼';
    } else {
        content.style.display = 'none';
        if (icon) icon.textContent = '▶';
    }
}

// 获取召唤石加成数据
function getSummonBonuses() {
    let total = 0;
    const details = [];
    
    const mainOnlySet = new Set();
    const friendOnlySet = new Set();
    const subOnlySet = new Set();
    
    // 先获取去重后的实际最大效果（简单做法：从召唤石数组直接记录）
    // 为了更准确地显示，我们可以直接利用在summon.js中的parseSummonEffects
    
    // 遍历所有召唤石槽位
    for (let i = 0; i < 8; i++) {
        const summon = currentSummons[i];
        if (!summon) continue;
        
        // 检查限制
        const isMainOnly = i === 0 && summon.mainonly;
        const isFriendOnly = i === 1 && summon.friendonly;
        const isSubOnly = i >= 2 && summon.subonly;
        
        let isDuplicate = false;
        if (isMainOnly) {
            if (mainOnlySet.has(summon.id)) isDuplicate = true;
            else mainOnlySet.add(summon.id);
        } else if (isFriendOnly) {
            if (friendOnlySet.has(summon.id)) isDuplicate = true;
            else friendOnlySet.add(summon.id);
        } else if (isSubOnly) {
            if (subOnlySet.has(summon.id)) isDuplicate = true;
            else subOnlySet.add(summon.id);
        }
        
        // 获取召唤石效果描述
        const selectedLevel = summon.selectedLevel || 250;
        let effectDescription = '';
        
        if (summon.effects) {
            // 根据位置获取效果描述
            if (i === 0) {
                // 主召位置
                effectDescription = summon.effects.main?.[selectedLevel]?.description || '';
            } else if (i === 1) {
                // 友召位置
                effectDescription = summon.effects.friend?.[selectedLevel]?.description || '';
            } else {
                // 副召位置
                effectDescription = summon.effects.sub?.[selectedLevel]?.description || '';
            }
        }
        
        // 如果有效果描述，并且不是重复不叠加的，则显示
        if (effectDescription && !isDuplicate) {
            const source = `${summon.name}（${getSummonSlotLabel(i)}）`;
            // 解析效果值用于计算total
            const bonuses = parseSummonEffects(summon, i);
            const effectValue = bonuses.optimus + bonuses.elementAtk + bonuses.damageCap;
            
            details.push({
                source: source,
                displayValue: effectDescription,
                value: effectValue
            });
            total += effectValue;
        }
    }
    
    return {
        total: total,
        details: details
    };
}

// 获取特殊道具加成数据
function getSpecialBonuses() {
    let total = 0;
    const details = [];
    
    // 遍历所有激活的特殊道具
    activeSpecialBuffs.forEach(id => {
        const buff = specialBuffsData.find(b => b.id === id);
        if (!buff) return;
        
        // 检查description是数组还是对象（兼容旧格式）
        if (Array.isArray(buff.description)) {
            // 新格式：数组，每个元素包含 desc 和 effect
            buff.description.forEach(item => {
                if (!item.desc || !item.effect) return;
                
                // 获取effect中的属性名和值
                const effectKey = Object.keys(item.effect)[0];
                const customMap = (typeof specialBuffCustomValues !== 'undefined' && specialBuffCustomValues)
                    ? (specialBuffCustomValues[buff.id] || null)
                    : null;
                const rawVal = item.effect[effectKey];
                const effectValue = (customMap && typeof customMap[effectKey] === 'number' && Number.isFinite(customMap[effectKey]))
                    ? customMap[effectKey]
                    : rawVal;
                
                if (effectValue === 0) return;
                
                // 跳过一些不需要显示的内部字段
                if (effectKey === 'optimus_boost' || effectKey === 'magna_boost') return;
                
                // 格式：效果描述（物品名）
                const source = `${item.desc}（${buff.name}）`;
                let displayValue = '';
                
                // 根据数值类型格式化显示
                if (Math.abs(effectValue) <= 1 && effectValue !== 0 && !Number.isInteger(effectValue)) {
                    displayValue = `+${(effectValue * 100).toFixed(2)}%`;
                    total += effectValue * 100;
                } else {
                    displayValue = `+${effectValue}`;
                    total += effectValue;
                }
                
                details.push({
                    source: source,
                    displayValue: displayValue,
                    value: effectValue
                });
            });
        } else if (buff.stats) {
            // 旧格式：直接使用stats对象
            for (const [key, value] of Object.entries(buff.stats)) {
                const customMap = (typeof specialBuffCustomValues !== 'undefined' && specialBuffCustomValues)
                    ? (specialBuffCustomValues[buff.id] || null)
                    : null;
                const effectiveValue = (customMap && typeof customMap[key] === 'number' && Number.isFinite(customMap[key]))
                    ? customMap[key]
                    : value;

                if (effectiveValue === 0) continue;
                
                // 跳过一些不需要显示的内部字段
                if (key === 'optimus_boost' || key === 'magna_boost') continue;
                
                const source = buff.name;
                let displayValue = '';
                
                // 根据数值类型格式化显示
                if (Math.abs(effectiveValue) <= 1 && effectiveValue !== 0 && !Number.isInteger(effectiveValue)) {
                    displayValue = `+${(effectiveValue * 100).toFixed(2)}%`;
                    total += effectiveValue * 100;
                } else {
                    displayValue = `+${effectiveValue}`;
                    total += effectiveValue;
                }
                
                details.push({
                    source: source,
                    displayValue: displayValue,
                    value: effectiveValue
                });
            }
        }
    });
    
    return {
        total: total,
        details: details
    };
}

// 渲染详细分解
function renderDetailedBreakdown(gridStats) {
    const container = document.getElementById('all-stats-breakdown');
    if(!container) return;
    
    // 合计计算
    let sumDA = gridStats['weapon_da'] || 0;
    let sumTA = gridStats['weapon_ta'] || 0;
    
    sumDA += (currentMC.bonuses['mc_da_base'] || 0) + (gridStats['mc_da_passive'] || 0);
    sumTA += (currentMC.bonuses['mc_ta_base'] || 0) + (gridStats['mc_ta_passive'] || 0);

    let inputEleVal = parseFloat(document.getElementById('aura-elemental').value) || 0;
    let sumEle = (inputEleVal / 100) + (gridStats['weapon_progression_element_atk'] || 0) + (gridStats['weapon_awaken_element_atk'] || 0) + (gridStats['summon_element_atk'] || 0); 

    let sumDmgAmp = gridStats['weapon_dmg_amp'] || 0;

    activeSpecialBuffs.forEach(id => {
        const buff = specialBuffsData.find(b => b.id === id);
        if(buff) {
            const buffStats = getSpecialBuffEffectiveStats(buff);
            if(buffStats['da']) sumDA += buffStats['da'];
            if(buffStats['ta']) sumTA += buffStats['ta'];
            if(buffStats['element_atk']) sumEle += buffStats['element_atk'];
            if(buffStats['dmg_amp']) sumDmgAmp += buffStats['dmg_amp'];
        }
    });

    const lbData = {};
    if (typeof window.getMcLbTotals === 'function') {
        const mcLbTotals = window.getMcLbTotals();
        if (mcLbTotals.baseAtk) lbData['LB攻击'] = mcLbTotals.baseAtk;
        if (mcLbTotals.baseHp) lbData['LB生命'] = mcLbTotals.baseHp;
        if (mcLbTotals.prof1) lbData['得意1系数'] = mcLbTotals.prof1;
        if (mcLbTotals.prof2) lbData['得意2系数'] = mcLbTotals.prof2;
        Object.keys(mcLbTotals.breakdown || {}).forEach(k => {
            lbData[k] = mcLbTotals.breakdown[k];
        });
    }

    // 从 gridStats 拆分出只属于特定分类的数据 (为了显示美观和避免重复)
    const pureWeaponStats = {};
    const jobStats = {};
    const summonStats = {};
    
    for (const [k, v] of Object.entries(gridStats)) {
        if (v === 0) continue;
        // 默认乱击段数为 1（等同“无乱击”），武器盘全局面板中不展示
        if (k === 'weapon_na_ranshu' && Number(v) === 1) continue;
        const cfg = STAT_CONFIG.find(c => c.key === k);
        if (cfg) {
            if (cfg.category === 'weapon') pureWeaponStats[k] = v;
            else if (cfg.category === 'job') jobStats[k] = v;
            else if (cfg.category === 'summon') summonStats[k] = v;
        }
    }

    const allSources = [
        { name: '武器盘', color: '#4db6ac', data: pureWeaponStats },
        { name: '职业/常驻', color: '#3498db', data: jobStats },
        { name: '召唤石', color: '#9b59b6', data: summonStats },
        { name: 'LB', color: '#e67e22', data: lbData }
    ];

    activeSpecialBuffs.forEach(id => {
        const buff = specialBuffsData.find(b => b.id === id);
        if(buff) {
            const buffStats = getSpecialBuffEffectiveStats(buff);
            allSources.push({ name: buff.name, color: '#f1c40f', data: buffStats });
        }
    });

    const formatVal = (k, v) => {
        const cfg = STAT_CONFIG.find(c => c.key === k);
        if (cfg && cfg.format === 'percent') return (v * 100).toFixed(2) + "%";
        if ((typeof v === 'number' && Math.abs(v) <= 8 && !Number.isInteger(v)) || 
            (k && (k.includes('rate') || k.includes('cap') || k.includes('amp') || k.includes('boost')))) {
            return (v * 100).toFixed(2) + "%";
        } 
        if (typeof v === 'number' && v > 0) return "+" + v;
        return v;
    };

    const getLabel = (k) => {
        if(DISPLAY_NAME_MAP[k]) return DISPLAY_NAME_MAP[k];
        const cfg = STAT_CONFIG.find(c => c.key === k);
        if(cfg) return cfg.label;
        return k;
    };

    let html = '';
    
    html += `<div class="breakdown-group" style="border: 1px solid #555; background: #222; border-radius: 4px; overflow: hidden; margin-bottom: 25px;">`;
    html += `<div class="breakdown-title" style="background: #333; color: #fff; border-left: 4px solid #fff; margin-bottom: 0; padding: 5px 10px;">全加成效果汇总 (All Effects)</div>`;
    html += `<div style="max-height: 400px; overflow-y: auto;">`;

    const summaryRowStyle = "border-bottom: 1px solid #444; background: #2f3542; display:flex; justify-content:space-between; padding:4px 8px;";
    const labelStyle = "color: #bbb; display:flex; align-items:center;";
    const tagStyle = "color: #ff7675; font-weight: bold; margin-right: 6px; font-size:0.9em; border:1px solid #ff7675; padding:0 4px; border-radius:3px;";
    const valueStyle = "color: #ff7675; font-weight:bold; font-size:1.1em;";

    html += `<div style="${summaryRowStyle}"><span style="${labelStyle}"><span style="${tagStyle}">合计</span>DA (连击率)</span><span style="${valueStyle}">${(sumDA * 100).toFixed(2)}%</span></div>`;
    html += `<div style="${summaryRowStyle}"><span style="${labelStyle}"><span style="${tagStyle}">合计</span>TA (连击率)</span><span style="${valueStyle}">${(sumTA * 100).toFixed(2)}%</span></div>`;
    html += `<div style="${summaryRowStyle}"><span style="${labelStyle}"><span style="${tagStyle}">合计</span>属性攻击力</span><span style="${valueStyle}">${(sumEle * 100).toFixed(2)}%</span></div>`;
    html += `<div style="${summaryRowStyle} border-bottom: 3px double #555;"><span style="${labelStyle}"><span style="${tagStyle}">合计</span>全伤害增幅 (Amp)</span><span style="${valueStyle}">${(sumDmgAmp * 100).toFixed(2)}%</span></div>`;

    let hasSummaryData = false;

    allSources.forEach(src => {
        if(!src.data || Object.keys(src.data).length === 0) return;

        for(const [k, v] of Object.entries(src.data)) {
            if(k === 'optimus_boost' || k === 'magna_boost') continue; 

            const label = getLabel(k);
            const valStr = formatVal(k, v); 
            const valColor = (v === 0) ? '#666' : src.color;

            html += `<div class="breakdown-row" style="border-bottom: 1px solid #2a2a2a;"><span style="color: #bbb;"><span style="color: ${src.color}; font-weight: bold; margin-right: 4px;">【${src.name}】</span>${label}</span><span class="breakdown-val" style="color: ${valColor};">${valStr}</span></div>`;
            hasSummaryData = true;
        }
    });

    if (!hasSummaryData) {
        html += `<div class="empty-data">暂无任何数据</div>`;
    }

    html += `</div></div>`; 

    const renderSection = (title, dataObj, color = "#4db6ac") => {
        if(!dataObj || Object.keys(dataObj).length === 0) return '';
        
        let sectionHtml = `<div class="breakdown-group"><div class="breakdown-title" style="border-left-color:${color}; color:${color}; background:transparent;">${title}</div>`;
        
        for(const [k, v] of Object.entries(dataObj)) {
            if(k === 'optimus_boost' || k === 'magna_boost') continue;

            const label = getLabel(k);
            const valStr = formatVal(k, v); 
            const valColor = (v === 0) ? '#666' : color; 
            
            sectionHtml += `<div class="breakdown-row"><span class="breakdown-key">${label}</span><span class="breakdown-val" style="color:${valColor}">${valStr}</span></div>`;
        }
        
        sectionHtml += '</div>';
        return sectionHtml;
    };

    html += renderSection('1. 武器盘数据 (Weapon Grid)', pureWeaponStats, '#4db6ac');
    html += renderSection('2. 职业与角色加成 (Job & Character)', jobStats, '#3498db');
    html += renderSection('3. 召唤石加成 (Summons)', summonStats, '#9b59b6');
    html += renderSection('4. LB 加成 (Limit Bonus)', lbData, '#e67e22');

    if (activeSpecialBuffs.size > 0) {
        let specialHtml = `<div class="breakdown-group"><div class="breakdown-title" style="border-left-color:#f1c40f; color:#f1c40f; background:transparent;">5. 特殊道具详情 (Special Items)</div>`;
        let hasSpecialData = false;
        
        activeSpecialBuffs.forEach(id => {
            const buff = specialBuffsData.find(b => b.id === id);
            if(buff) {
                const buffStats = getSpecialBuffEffectiveStats(buff);
                
                if(Object.keys(buffStats).length > 0) {
                    specialHtml += `<div class="bd-source-name" style="margin-top:8px;">${buff.name}</div>`;
                    for(const [k, v] of Object.entries(buffStats)) {
                         const label = getLabel(k);
                         const valStr = formatVal(k, v); 
                         const valColor = (v === 0) ? '#666' : '#f1c40f';
                         specialHtml += `<div class="breakdown-row"><span class="breakdown-key">${label}</span><span class="breakdown-val" style="color:${valColor}">${valStr}</span></div>`;
                    }
                    hasSpecialData = true;
                }
            }
        });
        specialHtml += '</div>';
        if(hasSpecialData) html += specialHtml;
    }

    container.innerHTML = html;
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        renderSpecialTab,
        toggleSpecialBuff,
        renderResidentBonuses,
        toggleCollapsible,
        getSummonBonuses,
        getSpecialBonuses,
        renderDetailedBreakdown
    };
}
