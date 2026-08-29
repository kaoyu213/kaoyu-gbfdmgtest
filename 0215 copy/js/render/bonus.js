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

function normalizeCharaJsonBaseRate(key, value) {
    var n = Number(value) || 0;
    return (key === '角色基础da' || key === '角色基础ta') ? n / 100 : n;
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
        const val = normalizeCharaJsonBaseRate(key, charData[key] || 0);
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

    renderAllEffectsSummary(slotIndex, container);
    return;

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

/** 
 * 纯数据函数：构建当前槽位的 All Effects 汇总
 * @param {number} charIndex - 队伍槽位
 * @returns {{ totals: object, sources: array }}
 */
function buildAllEffectsForSlot(charIndex, options) {
    options = options || {};
    var includeScenarioBuffs = options.includeScenarioBuffs !== false;
    var additionalZoneEntries = Array.isArray(options.additionalZoneEntries)
        ? options.additionalZoneEntries
        : [];
    var totals = {};
    var sources = [];

    if (typeof party === 'undefined' || !party[charIndex] || !party[charIndex].stats) {
        return { totals: totals, sources: sources };
    }

    var stats = party[charIndex].stats;
    var registry = (typeof BuffRegistry !== 'undefined') ? new BuffRegistry() : null;
    var allBuffTypes = new Set();
    var specialCfgByEffectKey = {};

    function rememberBuffType(prop) {
        if (!prop) return;
        if (typeof parseBuffProp === 'function') {
            var parsed = parseBuffProp(prop);
            if (parsed && parsed.buffType) allBuffTypes.add(parsed.buffType);
        } else {
            allBuffTypes.add(prop);
        }
    }

    function registerEffect(prop, zone, sourceId, value) {
        var n = Number(value) || 0;
        if (!prop || !zone || n === 0) return;
        rememberBuffType(prop);
        if (registry) registry.addByProp(prop, zone, sourceId, n);
    }

    function sumRegisteredEntries(buffType, zoneFilter) {
        var sum = 0;
        sources.forEach(function(src) {
            if (!src || !src.entries) return;
            Object.keys(src.entries).forEach(function(entryKey) {
                var entry = src.entries[entryKey];
                if (!entry || entry.prop !== buffType) return;
                if (typeof zoneFilter === 'function' && !zoneFilter(src.zone, entry)) return;
                var n = Number(entry.value) || 0;
                if (n !== 0) sum += n;
            });
        });
        return sum;
    }

    function isAdvantageEnabledForSlot() {
        if (typeof options.isAdvantage === 'boolean') return options.isAdvantage;
        if (typeof window !== 'undefined' && window.damageViewStates && window.damageViewStates[charIndex]) {
            return !!window.damageViewStates[charIndex].isAdvantage;
        }
        if (typeof document !== 'undefined') {
            var weaknessId = charIndex === 0 ? 'weakness-toggle' : 'weakness-toggle-' + charIndex;
            var weaknessToggle = document.getElementById(weaknessId);
            return !!(weaknessToggle && weaknessToggle.checked);
        }
        return false;
    }

    function applyFormulaReadyTotals() {
        var allAmp = Number(totals.dmg_amp) || 0;
        var elementalAmp = isAdvantageEnabledForSlot() ? (Number(totals.dmg_to_elemental_amp) || 0) : 0;
        ['na_dmg_amp', 'skill_dmg_amp', 'ca_dmg_amp'].forEach(function(bt) {
            var base = Number(totals[bt]) || 0;
            var combined = base + allAmp + elementalAmp;
            if (combined !== 0) totals[bt] = combined;
        });

        var allCap = Number(totals.dmg_cap) || 0;
        ['na_dmg_cap', 'skill_dmg_cap', 'ca_dmg_cap', 'cb_dmg_cap', 'fc_dmg_cap'].forEach(function(bt) {
            var base = Number(totals[bt]) || 0;
            var combined = base + allCap;
            if (combined !== 0) totals[bt] = combined;
        });

        var allSupp = Number(totals.dmg_supp) || 0;
        ['na_dmg_supp', 'skill_dmg_supp', 'ca_dmg_supp', 'counter_dmg_supp', 'cb_dmg_supp'].forEach(function(bt) {
            var base = Number(totals[bt]) || 0;
            var combined = base + allSupp;
            if (combined !== 0) totals[bt] = combined;
        });

        var caWeaponGrid = sumRegisteredEntries('ca_dmg', function(zone, entry) {
            return entry.caDmgPart === 'weapon_grid' || (!entry.caDmgPart && zone === 'weapon_grid');
        });
        var caOther = sumRegisteredEntries('ca_dmg', function(zone, entry) {
            return entry.caDmgPart === 'other' || (!entry.caDmgPart && zone !== 'weapon_grid');
        });
        if (caWeaponGrid !== 0) totals.ca_dmg_weapon_grid = caWeaponGrid;
        if (caOther !== 0) totals.ca_dmg_other = caOther;
    }

    if (typeof STAT_CONFIG !== 'undefined') {
        STAT_CONFIG.forEach(function(cfg) {
            if (cfg && cfg.category === 'special' && cfg.key && cfg.key.indexOf('special_') === 0) {
                specialCfgByEffectKey[cfg.key.replace('special_', '')] = cfg;
            }
        });
    }

    var weaponGridEntries = {};
    if (typeof STAT_CONFIG !== 'undefined') {
        STAT_CONFIG.forEach(function(cfg) {
            if (cfg && cfg.zone === 'weapon_grid' && cfg.prop) {
                var v = stats[cfg.key];
                if (typeof v !== 'number' || v === 0) return;
                if (cfg.key === 'weapon_na_ranshu' && Number(v) === 1) return;
                registerEffect(cfg.prop, cfg.zone, cfg.key, v);
                weaponGridEntries[cfg.key] = { label: cfg.label, value: v, format: cfg.format, prop: cfg.prop, zone: cfg.zone };
            }
        });
    }
    if (Object.keys(weaponGridEntries).length > 0) {
        sources.push({ zone: 'weapon_grid', name: '武器盘', color: '#4db6ac', entries: weaponGridEntries });
    }

    var summonEntries = {};
    if (typeof STAT_CONFIG !== 'undefined') {
        STAT_CONFIG.forEach(function(cfg) {
            if (cfg && cfg.zone === 'summon' && cfg.prop) {
                var v = stats[cfg.key];
                if (typeof v !== 'number' || v === 0) return;
                registerEffect(cfg.prop, cfg.zone, cfg.key, v);
                summonEntries[cfg.key] = { label: cfg.label, value: v, format: cfg.format, prop: cfg.prop, zone: cfg.zone };
            }
        });
    }
    if (Object.keys(summonEntries).length > 0) {
        sources.push({ zone: 'summon', name: '召唤石', color: '#9b59b6', entries: summonEntries });
    }

    // “属攻”面板输入已经由 calc.js 写入 stats.element_atk 并参与伤害计算。
    // 此处只把原始输入登记到 All Effects，不能再次写回 stats，否则会重复计算。
    var panelInputEntries = {};
    var panelElementAtk = 0;
    if (typeof document !== 'undefined') {
        var panelElementAtkInput = document.getElementById('aura-elemental');
        if (panelElementAtkInput) {
            panelElementAtk = (parseFloat(panelElementAtkInput.value) || 0) / 100;
        }
    }
    if (panelElementAtk !== 0) {
        registerEffect('element_atk', 'independent', 'panel_input:element_atk', panelElementAtk);
        panelInputEntries['panel_input:element_atk'] = {
            label: '属攻输入框',
            value: panelElementAtk,
            format: 'percent',
            prop: 'element_atk',
            zone: 'independent'
        };
    }
    if (Object.keys(panelInputEntries).length > 0) {
        sources.push({ zone: 'independent', name: '面板输入', color: '#00cec9', entries: panelInputEntries });
    }

    var passiveEntries = {};
    if (typeof STAT_CONFIG !== 'undefined') {
        STAT_CONFIG.forEach(function(cfg) {
            if (!cfg || !cfg.prop || !cfg.zone) return;
            if (cfg.category !== 'job' && cfg.category !== 'chara' && cfg.category !== 'system') return;
            if (cfg.key === 'marriage_perpetuity_atk') return;
            var v = stats[cfg.key];
            if (typeof v !== 'number' || v === 0) return;
            registerEffect(cfg.prop, cfg.zone, cfg.key, v);
            passiveEntries[cfg.key] = { label: cfg.label, value: v, format: cfg.format, prop: cfg.prop, zone: cfg.zone };
        });
    }
    if (Object.keys(passiveEntries).length > 0) {
        sources.push({ zone: 'passive', name: '角色/职业被动', color: '#74b9ff', entries: passiveEntries });
    }

    var rawStatEntries = {};
    if (typeof STAT_CONFIG !== 'undefined') {
        STAT_CONFIG.forEach(function(cfg) {
            if (!cfg || !cfg.key || (cfg.prop && cfg.zone)) return;
            if (cfg.key.charAt(0) === '_') return;
            var v = stats[cfg.key];
            if (typeof v !== 'number' || v === 0) return;
            if (cfg.key === 'weapon_na_ranshu' && Number(v) === 1) return;
            if (cfg.category === 'charabonus' || cfg.category === 'special') return;
            rawStatEntries[cfg.key] = {
                label: cfg.label,
                value: v,
                format: cfg.format,
                source: cfg.category || 'raw'
            };
        });
    }
    if (Object.keys(rawStatEntries).length > 0) {
        sources.push({ zone: 'raw_stats', name: '未分区明细', color: '#95a5a6', entries: rawStatEntries });
    }

    if (typeof currentParty !== 'undefined' && currentParty[charIndex]) {
        var cp = currentParty[charIndex];
        var charaEntries = {};
        var rawCharaEntries = {};
        var baseAtkTotal = 0;
        var baseHpTotal = 0;
        var charaSummaryEntries = {};
        var charaIndependentEntries = {};
        var sourceLabels = {
            chara_ring: '戒指',
            chara_earring: '耳饰',
            chara_artifacts: '神器',
            chara_marriage: '婚戒',
            chara_awakening: '觉醒',
            chara_lb: 'LB'
        };
        var charaSummaryLabels = {
            base_atk: '总额外攻击力',
            base_hp: '总额外HP',
            ca_dmg_cap: '奥义上限',
            ca_dmg: '奥义伤害',
            stamina: '浑身',
            enmity: '背水',
            def_mod: '防御力',
            hp_mod: 'HP',
            da_rate: 'DA',
            ta_rate: 'TA',
            skill_dmg: '技能伤害',
            skill_dmg_cap: '技伤上限',
            na_dmg_cap: '普攻上限',
            dmg_cap: '伤害上限',
            debuff_success: '弱体成功率',
            debuff_resist: '弱体耐性',
            heal_cap: '回复性能',
            element_atk: '属性攻击',
            critical_hit: '暴击率',
            dodge_rate: '回避率',
            charge_gain: '奥义值上升量'
        };
        var independentCharaKeys = new Set([
            'chara_marriage_perpetuity_atk',
            'chara_marriage_hp',
            'chara_marriage_dmg_cap',
            'chara_marriage_debuff_resistance',
            'chara_awakening_element_reduce',
            'chara_artifacts_special_ca_dmg_cap',
            'chara_artifacts_crit_dmg_cap',
            'chara_artifacts_chain_supp'
        ]);
        function getCharaSourceLabel(key) {
            for (var prefix in sourceLabels) {
                if (key.indexOf(prefix) === 0) return sourceLabels[prefix];
            }
            return '角色强化';
        }
        function addCharaSummary(prop, label, value, format) {
            if (typeof value !== 'number' || value === 0) return;
            var key = prop || label;
            if (!charaSummaryEntries[key]) {
                charaSummaryEntries[key] = {
                    label: label,
                    value: 0,
                    format: format,
                    source: '汇总',
                    group: 'summary',
                    prop: prop,
                    zone: 'charabonus'
                };
            }
            charaSummaryEntries[key].value += value;
        }
        function addCharaIndependent(cfg, value, displayFormat) {
            var sourceLabel = getCharaSourceLabel(cfg.key);
            var entryKey = '[独立] ' + cfg.key;
            charaIndependentEntries[entryKey] = {
                label: '[' + sourceLabel + ']' + cfg.label,
                value: value,
                rawValue: value,
                format: displayFormat || cfg.format,
                source: sourceLabel,
                group: 'independent',
                prop: cfg.prop,
                zone: cfg.zone
            };
        }
        if (typeof STAT_CONFIG !== 'undefined') {
            var currentHp = parseInt(document.getElementById('current-hp-slider')?.value, 10);
            var hp01ForStrong = Number.isNaN(currentHp) ? 1 : Math.max(0, Math.min(1, currentHp / 100));
            STAT_CONFIG.forEach(function(cfg) {
                if (cfg && cfg.zone === 'charabonus' && cfg.prop) {
                    var val = normalizeCharaJsonBaseRate(cfg.key, cp[cfg.key]);
                    if (typeof val !== 'number' || val === 0) return;
                    var registerVal = val;
                    var displayFormat = cfg.format;
                    if (cfg.prop === 'base_atk') {
                        baseAtkTotal += val;
                        return;
                    }
                    if (cfg.prop === 'base_hp') {
                        baseHpTotal += val;
                        return;
                    }
                    if ((cfg.key === 'chara_ring_stamina' || cfg.key === 'chara_earring_stamina') && typeof getRingEarringStaminaStrongBonus === 'function') {
                        registerVal = getRingEarringStaminaStrongBonus(hp01ForStrong, val);
                        displayFormat = 'percent';
                    } else if (cfg.key === 'chara_lb_stamina' && typeof getLbStaminaStrongBonus === 'function') {
                        var lbAmounts = Array.isArray(cp['chara_lb_stamina_amounts']) ? cp['chara_lb_stamina_amounts'] : null;
                        if (lbAmounts && lbAmounts.length > 0) {
                            registerVal = lbAmounts.reduce(function(acc, amt) {
                                return acc + getLbStaminaStrongBonus(hp01ForStrong, amt);
                            }, 0);
                        } else {
                            registerVal = getLbStaminaStrongBonus(hp01ForStrong, val);
                        }
                        displayFormat = 'percent';
                    }
                    if (cfg.key === 'chara_earring_dmg_supp' && typeof getEarringDmgSuppFromLevel === 'function') {
                        registerVal = getEarringDmgSuppFromLevel(val);
                    }
                    registerEffect(cfg.prop, cfg.zone, cfg.key, registerVal);
                    if (independentCharaKeys.has(cfg.key)) {
                        addCharaIndependent(cfg, val, cfg.format);
                        return;
                    }
                    var summaryLabel = charaSummaryLabels[cfg.prop] || cfg.label;
                    var summaryValue = (cfg.prop === 'stamina' || cfg.prop === 'enmity') ? val : registerVal;
                    var summaryFormat = (cfg.prop === 'stamina' || cfg.prop === 'enmity') ? 'fixed' : displayFormat;
                    addCharaSummary(cfg.prop, summaryLabel, summaryValue, summaryFormat);
                    if (cfg.key === '角色基础da' || cfg.key === '角色基础ta') {
                        charaEntries[cfg.key] = {
                            label: cfg.label,
                            value: val,
                            rawValue: val,
                            format: cfg.format,
                            source: '角色强化',
                            prop: cfg.prop,
                            zone: cfg.zone
                        };
                    }
                }
                if (cfg && cfg.category === 'charabonus' && (!cfg.prop || !cfg.zone)) {
                    var rawVal = cp[cfg.key];
                    if (typeof rawVal !== 'number' || rawVal === 0) return;
                    rawCharaEntries[cfg.key] = { label: cfg.label, value: rawVal, format: cfg.format, source: '角色强化' };
                }
            });
        }
        if (baseAtkTotal) {
            addCharaSummary('base_atk', '总额外攻击力', baseAtkTotal, 'fixed');
        }
        if (baseHpTotal) {
            addCharaSummary('base_hp', '总额外HP', baseHpTotal, 'fixed');
        }
        Object.keys(charaSummaryEntries).forEach(function(k) { charaEntries['[汇总属性] ' + k] = charaSummaryEntries[k]; });
        Object.keys(charaIndependentEntries).forEach(function(k) { charaEntries[k] = charaIndependentEntries[k]; });
        if (Object.keys(charaEntries).length > 0) {
            sources.push({ zone: 'charabonus', name: '角色强化', color: '#e67e22', entries: charaEntries });
        }
        if (Object.keys(rawCharaEntries).length > 0) {
            sources.push({ zone: 'raw_charabonus', name: '角色强化未分区', color: '#bdc3c7', entries: rawCharaEntries });
        }
    }

    var charaSkillEntries = {};
    var seenCharaSkillEntryIds = new Set();
    function getCharaSkillEffectLabel(entry) {
        var prop = entry && entry.prop ? String(entry.prop) : '';
        var meta = typeof getBuffDisplayMeta === 'function'
            ? getBuffDisplayMeta(prop, entry && entry.zone, entry)
            : null;
        var label = meta && meta.label ? meta.label : (entry.label || prop);
        var parsed = typeof parseBuffProp === 'function' ? parseBuffProp(prop) : { buffType: prop };
        var zone = entry && entry.zone ? String(entry.zone) : '';
        if (zone && parsed.buffType === 'bonus_na') {
            return label + ' ' + zone.toLowerCase();
        }
        return label;
    }
    function addCharaSkillEntry(entry, fallbackId, sourceName) {
        if (!entry || !entry.prop || !entry.zone) return;
        var v = Number(entry.value) || 0;
        if (v === 0) return;
        var sourceId = entry.sourceId || fallbackId;
        var dedupeKey = [sourceId, entry.prop, entry.zone, v].join('|');
        if (seenCharaSkillEntryIds.has(dedupeKey)) return;
        seenCharaSkillEntryIds.add(dedupeKey);
        registerEffect(entry.prop, entry.zone, sourceId, v);
        var propName = String(entry.prop || '');
        var showInAllEffects = entry.show_in_all_effects !== false
            && propName.indexOf('bonus_na_') !== 0
            && propName !== 'double_strike'
            && propName !== 'triple_strike';
        if (!showInAllEffects) return;
        charaSkillEntries[sourceId] = {
            label: getCharaSkillEffectLabel(entry),
            value: v,
            format: (typeof getBuffDisplayMeta === 'function'
                ? getBuffDisplayMeta(entry.prop, entry.zone, entry).format
                : null) || entry.format || 'percent',
            prop: entry.prop,
            zone: entry.zone,
            source: sourceName || entry.source || '角色Buff'
        };
    }
    if (includeScenarioBuffs && typeof STAT_CONFIG !== 'undefined') {
        STAT_CONFIG.forEach(function(cfg) {
            if (cfg && cfg.category === 'charabuff' && cfg.prop && cfg.zone) {
                var v = stats[cfg.key];
                if (typeof v !== 'number' || v === 0) return;
                registerEffect(cfg.prop, cfg.zone, cfg.key, v);
                seenCharaSkillEntryIds.add([cfg.key, cfg.prop, cfg.zone, v].join('|'));
                charaSkillEntries[cfg.key] = { label: cfg.label, value: v, format: cfg.format, prop: cfg.prop, zone: cfg.zone };
            }
        });
    }
    if (includeScenarioBuffs && party[charIndex] && Array.isArray(party[charIndex].skillZoneEffectEntries)) {
        party[charIndex].skillZoneEffectEntries.forEach(function(entry, idx) {
            addCharaSkillEntry(entry, entry.sourceId || ('skill_zone_effect_' + idx), '角色技能Buff');
        });
    }
    if (includeScenarioBuffs && party[charIndex] && Array.isArray(party[charIndex].dynamicBuffEntries)) {
        party[charIndex].dynamicBuffEntries.forEach(function(entry, idx) {
            addCharaSkillEntry(entry, entry.sourceId || ('dynamic_buff_' + idx), '角色技能Buff');
        });
    }
    if (includeScenarioBuffs && party[charIndex] && Array.isArray(party[charIndex].zoneEffectEntries)) {
        party[charIndex].zoneEffectEntries.forEach(function(entry, idx) {
            if (!entry || !entry.prop || !entry.zone) return;
            if (String(entry.prop).indexOf('bonus_na_') === 0) return;
            addCharaSkillEntry(entry, entry.sourceId || ('zone_effect_' + idx), '角色Buff图鉴');
        });
    }
    additionalZoneEntries.forEach(function(entry, idx) {
        addCharaSkillEntry(entry, entry && entry.sourceId ? entry.sourceId : ('runtime_status_' + idx), '战斗状态');
    });
    if (Object.keys(charaSkillEntries).length > 0) {
        sources.push({ zone: 'chara_skill', name: '角色Buff', color: '#ff7675', entries: charaSkillEntries });
    }

    var testBuffEntries = {};
    if (!options.ignoreTestBuffSettings && typeof window !== 'undefined' && window.buffSettings) {
        var testBuffMap = {
            normal: { prop: 'normal_atk', label: '普刃', format: 'percent' },
            stamina: { prop: 'stamina', label: '浑身', format: 'percent' },
            enmity: { prop: 'enmity', label: '背水', format: 'percent' },
            strong: { prop: 'stamina', label: '强壮', format: 'percent' },
            adversity: { prop: 'enmity', label: '逆境', format: 'percent' },
            element: { prop: 'element_atk', label: '属攻', format: 'percent' },
            marriage: { prop: 'perpetuity_atk', label: '独立攻刃【久远】', format: 'percent' },
            indepCumulative: { prop: 'indep_cumulative_atk', label: '独立攻刃【累积】', format: 'percent' },
            indepUnjudged: { prop: 'indep_unjudged_atk', label: '独立攻刃【未判定】', format: 'percent' },
            indepSpecialEnmity: { prop: 'indep_special_enmity_atk', label: '独立攻刃【特殊背水】', format: 'percent' },
            indepSpecial: { prop: 'indep_special_atk', label: '独立攻刃【特殊】', format: 'percent' },
            dmgCap: { prop: 'dmg_cap', label: '伤害上限', format: 'percent' },
            dmgAmp: { prop: 'dmg_amp', label: '伤害增幅', format: 'percent' },
            caWeaponDmg: { prop: 'ca_dmg', label: '武器盘奥义伤害加成', format: 'percent', caDmgPart: 'weapon_grid' },
            caDmg: { prop: 'ca_dmg', label: '奥义伤害加成', format: 'percent', caDmgPart: 'other' },
            caCap: { prop: 'ca_dmg_cap', label: '奥义上限加成', format: 'percent' },
            dmgSupp: { prop: 'dmg_supp', label: '伤害上升', format: 'fixed' },
            caDmgSupp: { prop: 'ca_dmg_supp', label: '奥义伤害上升效果', format: 'fixed' },
            takenDmgAmp: { prop: 'taken_dmg_amp', label: '承受伤害增幅', format: 'percent' }
        };
        Object.keys(testBuffMap).forEach(function(key) {
            var cfg = testBuffMap[key];
            var v = Number(window.buffSettings[key]) || 0;
            if (v === 0) return;
            registerEffect(cfg.prop, 'testbuff', 'testbuff:' + key, v);
            testBuffEntries['testbuff:' + key] = {
                label: cfg.label,
                value: v,
                format: cfg.format,
                prop: cfg.prop,
                zone: 'testbuff',
                source: 'testbuff',
                caDmgPart: cfg.caDmgPart || null
            };
        });
    }
    if (Object.keys(testBuffEntries).length > 0) {
        sources.push({ zone: 'testbuff', name: 'testbuff', color: '#fdcb6e', entries: testBuffEntries });
    }

    if (typeof activeSpecialBuffs !== 'undefined' && activeSpecialBuffs.size > 0 && typeof specialBuffsData !== 'undefined') {
        var specialEntries = {};
        activeSpecialBuffs.forEach(function(id) {
            var buff = specialBuffsData.find(function(b) { return b.id === id; });
            if (!buff) return;
            var buffStats = getSpecialBuffEffectiveStats(buff);
            Object.keys(buffStats).forEach(function(k) {
                var v = buffStats[k];
                if (v === 0) return;
                var cfg = specialCfgByEffectKey[k] || null;
                var prop = cfg && cfg.prop ? cfg.prop : null;
                var zone = cfg && cfg.zone ? cfg.zone : null;
                if (prop && zone) {
                    registerEffect(prop, zone, buff.id + ':' + k, v);
                }
                specialEntries['[' + buff.name + '] ' + k] = {
                    label: cfg && cfg.label ? cfg.label : k,
                    value: v,
                    format: cfg && cfg.format ? cfg.format : null,
                    source: buff.name,
                    prop: prop,
                    zone: zone
                };
            });
        });
        if (Object.keys(specialEntries).length > 0) {
            sources.push({ zone: 'special', name: '特殊道具', color: '#f1c40f', entries: specialEntries });
        }
    }

    if (typeof BUFF_TYPE_ZONE_RULES !== 'undefined') {
        Object.keys(BUFF_TYPE_ZONE_RULES).forEach(function(bt) { allBuffTypes.add(bt); });
    }
    allBuffTypes.forEach(function(bt) {
        var val = registry ? registry.getTotal(bt) : (stats['_' + bt + '_total'] || 0);
        if (typeof val === 'number' && val !== 0) totals[bt] = val;
    });
    applyFormulaReadyTotals();

    if (typeof window !== 'undefined' && options.persist !== false) {
        if (!window.allEffectsBySlot) window.allEffectsBySlot = {};
        window.allEffectsBySlot[charIndex] = { totals: totals, sources: sources };
    }

    return { totals: totals, sources: sources };
}


/**
 * 渲染 All Effects 面板（纯展示，读出 buildAllEffectsForSlot 结果）
 * @param {number} charIndex
 */
function renderAllEffectsSummary(charIndex, target) {
    var container = null;
    if (typeof target === 'string') {
        container = document.getElementById(target);
    } else if (target && typeof target.innerHTML !== 'undefined') {
        container = target;
    } else {
        container = document.getElementById('all-stats-breakdown');
    }
    if (!container) return;

    var allEffects = buildAllEffectsForSlot(charIndex);
    var totals = allEffects.totals;
    var sources = allEffects.sources;

    var html = '';
    html += '<div class="breakdown-group" style="border: 1px solid #555; background: #222; border-radius: 4px; overflow: hidden; margin-bottom: 25px;">';
    html += '<div class="breakdown-title" style="background: #333; color: #fff; border-left: 4px solid #fff; margin-bottom: 0; padding: 5px 10px;">全加成效果汇总 (All Effects)</div>';
    html += '<div style="max-height: 400px; overflow-y: auto;">';

    // --- 摘要行 ---
    var summaryRowStyle = "border-bottom: 1px solid #444; background: #2f3542; display:flex; justify-content:space-between; padding:4px 8px;";
    var labelStyle = "color: #bbb; display:flex; align-items:center;";
    var tagStyle = "color: #ff7675; font-weight: bold; margin-right: 6px; font-size:0.9em; border:1px solid #ff7675; padding:0 4px; border-radius:3px;";
    var valueStyle = "color: #ff7675; font-weight:bold; font-size:1.1em;";

    var summaryKeys = [
        { bt: 'normal_atk', label: '普刃' },
        { bt: 'omega_atk', label: 'M攻刃' },
        { bt: 'ex_atk', label: 'EX攻刃' },
        { bt: 'odious_atk', label: 'OD攻刃' },
        { bt: 'stamina', label: '浑身' },
        { bt: 'stamina_omega', label: 'M浑身' },
        { bt: 'enmity', label: '背水' },
        { bt: 'enmity_omega', label: 'M背水' },
        { bt: 'element_atk', label: '属性攻击力' },
        { bt: 'perpetuity_atk', label: '独立攻刃【久远】' },
        { bt: 'indep_cumulative_atk', label: '独立攻刃【累积】' },
        { bt: 'indep_unjudged_atk', label: '独立攻刃【未判定】' },
        { bt: 'indep_special_enmity_atk', label: '独立攻刃【特殊背水】' },
        { bt: 'indep_special_atk', label: '独立攻刃【特殊】' },
        { bt: 'da_rate', label: 'DA' },
        { bt: 'ta_rate', label: 'TA' },
        { bt: 'ca_dmg_weapon_grid', label: '武器盘奥义伤害' },
        { bt: 'ca_dmg_other', label: '其他区奥义伤害' },
        { bt: 'dmg_cap', label: '全上限' },
        { bt: 'dmg_cap_relaxation', label: 'D上限缓和' },
        { bt: 'na_dmg_cap', label: '普攻上限' },
        { bt: 'skill_dmg_cap', label: '技伤上限' },
        { bt: 'ca_dmg_cap', label: '奥义上限' },
        { bt: 'dmg_amp', label: '全伤害增幅' },
        { bt: 'dmg_to_elemental_amp', label: '对克制属性伤害增幅' },
        { bt: 'dmg_to_non_elemental_amp', label: '对无属性伤害增幅' },
        { bt: 'critical_dmg_amp', label: '暴击时伤害增幅' },
        { bt: 'na_dmg_amp', label: '普攻伤害增幅' },
        { bt: 'skill_dmg_amp', label: '技伤伤害增幅' },
        { bt: 'ca_dmg_amp', label: '奥义伤害增幅' },
        { bt: 'dmg_supp', label: '全伤害上升' },
        { bt: 'na_dmg_supp', label: '平A伤害上升' },
        { bt: 'skill_dmg_supp', label: '技伤上升' },
        { bt: 'ca_dmg_supp', label: '奥义伤害上升' },
        { bt: 'hp_mod', label: 'HP加成' },
        { bt: 'def_mod', label: '防御力' },
        { bt: 'critical_hit', label: '暴击率' },
        { bt: 'critical_dmg_cap', label: '暴击时上限' },
        { bt: 'def_ignore', label: '无视防御' },
        { bt: 'dmg_reduce', label: '伤害减轻' },
        { bt: 'taken_dmg_amp', label: '承受伤害增幅' },
        { bt: 'element_reduce', label: '属性伤害减轻' },
        { bt: 'anti_element_reduce', label: '受克制伤害减轻' },
        { bt: 'dodge_rate', label: '回避率' },
        { bt: 'dodge_all', label: '全回避发生率' },
        { bt: 'hostility', label: '敌对心' },
        { bt: 'counter_rate', label: '反击发生率' },
        { bt: 'counter_dmg', label: '反击伤害' },
        { bt: 'counter_dmg_supp', label: '反击伤害上升' },
        { bt: 'heal_mod', label: '回复力' },
        { bt: 'heal_cap', label: '回复上限' },
        { bt: 'charge_gain', label: '奥义值上升量' },
        { bt: 'debuff_success', label: '弱体成功率' },
        { bt: 'debuff_resist', label: '弱体耐性' },
        { bt: 'skill_dmg', label: '技能伤害' },
        { bt: 'skill_hit_rate', label: '技能命中率' },
        { bt: 'cb_dmg', label: '奥义连锁伤害' },
        { bt: 'cb_dmg_cap', label: '奥义连锁上限' },
        { bt: 'cb_dmg_amp', label: '奥义连锁增幅' },
        { bt: 'cb_dmg_supp', label: '奥义连锁伤害上升' },
        { bt: 'fc_dmg_cap', label: '致命连锁上限' },
        { bt: 'fc_dmg_amp', label: '致命连锁增幅' },
        { bt: 'ca_special_dmg_cap', label: '奥义特殊上限' },
        { bt: 'hp_cut', label: 'HP减少' },
        { bt: 'hp_dmg', label: '开局HP减少' },
        { bt: 'turn_dmg', label: '每回合HP减少' },
        { bt: 'turn_dmg_reduce', label: '回合类伤害减轻' },
        { bt: 'optimus_boost', label: '神石加护' },
        { bt: 'omega_boost', label: '方阵加护' },
        { bt: 'na_ranshu', label: '平A乱击段数' },
        { bt: 'exp_gain', label: '经验加成' },
        { bt: 'rupie_gain', label: '卢布获取量加成' }
    ];

    var hasSummary = false;
    summaryKeys.forEach(function(sk) {
        if (typeof totals[sk.bt] !== 'number') return;
        if (sk.bt === 'na_ranshu' && Number(totals[sk.bt]) === 1) return;
        hasSummary = true;
        var v = totals[sk.bt];
        var valStr;
        if (sk.bt.indexOf('dmg_supp') >= 0 || sk.bt === 'counter_dmg_supp' || sk.bt === 'cb_dmg_supp') {
            valStr = v >= 0 ? '+' + Math.round(v) : Math.round(v).toString();
        } else if (sk.bt === 'na_ranshu') {
            valStr = Math.round(v).toString();
        } else {
            valStr = (v * 100).toFixed(2) + '%';
        }
        html += '<div style="' + summaryRowStyle + '"><span style="' + labelStyle + '"><span style="' + tagStyle + '">合计</span>' + sk.label + '</span><span style="' + valueStyle + '">' + valStr + '</span></div>';
    });
    if (!hasSummary) {
        html += '<div style="' + summaryRowStyle + '"><span style="' + labelStyle + '"><span style="' + tagStyle + '">合计</span>暂无统合数据</span></div>';
    }

    // --- 分区详情 ---
    var hasSourceData = false;
    sources.forEach(function(src) {
        if (!src.entries || Object.keys(src.entries).length === 0) return;
        hasSourceData = true;
        html += '<div style="border-top: 2px solid ' + src.color + '; padding: 4px 0; margin-top: 4px;">';
        html += '<div style="color: ' + src.color + '; font-weight: bold; font-size: 0.9em; padding: 2px 8px;">' + src.name + '</div>';
        var entryKeys = Object.keys(src.entries);
        if (src.zone === 'charabonus') {
            var summaryEntryKeys = entryKeys.filter(function(k) { return src.entries[k].group === 'summary'; });
            var independentEntryKeys = entryKeys.filter(function(k) { return src.entries[k].group === 'independent'; });
            var otherEntryKeys = entryKeys.filter(function(k) { return !src.entries[k].group; });
            entryKeys = [];
            if (summaryEntryKeys.length > 0) {
                entryKeys.push('__heading_summary__');
                entryKeys = entryKeys.concat(summaryEntryKeys);
            }
            if (independentEntryKeys.length > 0) {
                entryKeys.push('__heading_independent__');
                entryKeys = entryKeys.concat(independentEntryKeys);
            }
            entryKeys = entryKeys.concat(otherEntryKeys);
        }
        entryKeys.forEach(function(k) {
            if (k === '__heading_summary__') {
                html += '<div style="color:#ddd; font-weight:bold; padding:4px 8px 2px;">[汇总属性]</div>';
                return;
            }
            if (k === '__heading_independent__') {
                html += '<div style="color:#ddd; font-weight:bold; padding:6px 8px 2px;">[独立属性]</div>';
                return;
            }
            var e = src.entries[k];
            var valStr;
            if (e.format === 'ta_rate_bonus') {
                valStr = e.value >= 0 ? '+' + (e.value * 100).toFixed(0) + '%' : (e.value * 100).toFixed(0) + '%';
            } else if (e.format === 'percent') {
                valStr = (e.value * 100).toFixed(2) + '%';
            } else if (e.format === 'fixed') {
                valStr = e.value >= 0 ? '+' + Math.round(e.value) : Math.round(e.value).toString();
            } else {
                valStr = (typeof e.value === 'number' && Math.abs(e.value) < 10 && !Number.isInteger(e.value)) ? (e.value * 100).toFixed(2) + '%' : e.value.toString();
            }
            html += '<div class="breakdown-row" style="border-bottom: 1px solid #2a2a2a;"><span style="color: #bbb;">' + e.label + '</span><span class="breakdown-val" style="color: ' + src.color + ';">' + valStr + '</span></div>';
        });
        html += '</div>';
    });

    if (!hasSourceData) {
        html += '<div class="empty-data">暂无来源数据</div>';
    }

    html += '</div></div>';
    container.innerHTML = html;
}


// 兼容旧调用：keep old renderDetailedBreakdown as a wrapper
function renderDetailedBreakdown(gridStats) {
    // 旧接口：gridStats 实际上被忽略，使用当前激活槽位
    var activeSlot = 0;
    if (typeof document !== 'undefined') {
        var activeBtn = document.querySelector('.char-slot-btn.active');
        if (activeBtn) activeSlot = parseInt(activeBtn.getAttribute('data-slot')) || 0;
    }
    renderAllEffectsSummary(activeSlot);
}

if (typeof window !== 'undefined') {
    window.buildAllEffectsForSlot = buildAllEffectsForSlot;
    window.renderAllEffectsSummary = renderAllEffectsSummary;
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
        buildAllEffectsForSlot,
        renderAllEffectsSummary,
        renderDetailedBreakdown
    };
}
