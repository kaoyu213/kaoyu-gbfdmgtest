// ==========================================
//  GBF 模拟器 - 渲染模块
// ==========================================

// 武器类型图标映射
const WEAPON_TYPE_ICONS = {
    'sabre': '武器类型剑.webp',
    'dagger': '武器类型短剑.webp', 
    'spear': '武器类型枪.webp',
    'axe': '武器类型斧.webp',
    'staff': '武器类型杖.webp',
    'gun': '武器类型铳.webp',
    'fist': '武器类型格斗.webp',
    'melee': '武器类型格斗.webp',
    'bow': '武器类型弓.webp',
    'harp': '武器类型乐器.webp',
    'katana': '武器类型刀.webp'
};

// 获取属性颜色
function getElementColor(element) {
    return ELEMENT_COLORS[element] || "#888";
}

// 更新HP显示
function updateHpDisplay(val) {
    const hpDisplay = document.getElementById('hp-display');
    if (hpDisplay) hpDisplay.innerText = val + "%";
    try { recalculate(); } catch(e) { console.error('recalculate error:', e); }
}

// 切换折叠区块
function toggleSection(header) {
    header.classList.toggle('open');
    const content = header.nextElementSibling;
    if (content.style.display === "none") {
        content.style.display = "block";
    } else {
        content.style.display = "none";
    }
}

// 切换选项卡
function switchTab(tabName, btnElement) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
    btnElement.classList.add('active');
    
    // 如果切换到召唤石设定面板，渲染召唤石选择器
    if (tabName === 'summon-panel') {
        renderSummonSlots();
    }
}

// 渲染职业选择器
function renderMCSelector() {
    const selector = document.getElementById('mc-job-select');
    selector.innerHTML = '';
    allClasses.forEach(job => {
        const opt = document.createElement('option');
        opt.value = job.id;
        opt.text = job.name;
        selector.appendChild(opt);
    });
}

// 更新主角职业
function updateMCJob(forceId) {
    const selector = document.getElementById('mc-job-select');
    if (!selector) return;
    
    const jobId = forceId || selector.value;
    if(forceId) selector.value = forceId;

    const jobData = allClasses.find(c => c.id === jobId);
    if (!jobData) return;

    currentMC.jobId = jobData.id;
    currentMC.proficiency = jobData.proficiency || [];
    currentMC.bonuses = jobData.bonuses || {}; 
    currentMC.battleBonuses = jobData.battle_bonuses || "";

    const jobNameDisplay = document.getElementById('mc-job-name-display');
    const avatarDisplay = document.getElementById('mc-avatar-display');
    const profDisplay = document.getElementById('mc-prof-display');
    
    if (jobNameDisplay) jobNameDisplay.innerText = jobData.name.split('（')[0];
    if (avatarDisplay) avatarDisplay.innerText = jobData.id.substring(0,2).toUpperCase();
    
    const tagsContainer = document.getElementById('mc-prof-tags-display');
    if (tagsContainer) {
        tagsContainer.innerHTML = `<div class="tag-icon">人</div>`;
        jobData.proficiency.forEach(p => {
            const profMap = { 'sabre': '剑', 'sword': '剑', 'axe': '斧', 'spear': '枪', 'staff': '杖', 'gun': '铳', 'melee': '拳', 'fist': '拳', 'bow': '弓', 'harp': '琴', 'katana': '刀', 'dagger': '短' };
            tagsContainer.innerHTML += `<div class="tag-icon">${profMap[p] || p}</div>`;
        });
    }

    if (profDisplay) {
        const iconHtml = jobData.proficiency.map(p => {
            const iconFile = WEAPON_TYPE_ICONS[p] || 'weapon_type_default.webp';
            return `<img src="images/${iconFile}" style="width:64px;height:64px;margin:2px 4px;vertical-align:middle;object-fit:contain;display:inline-block;" alt="${p}">`;
        }).join('');
        profDisplay.innerHTML = iconHtml;
    }
    renderBonusDisplay(currentMC.bonuses, 'mc-bonuses-display');

    const battleBox = document.getElementById('mc-battle-bonuses-display');
    if (battleBox) {
        if (currentMC.battleBonuses) {
            battleBox.innerHTML = `<div class="battle-bonus-text">${currentMC.battleBonuses}</div>`;
        } else {
            battleBox.innerHTML = '<div class="empty-data">暂无描述</div>';
        }
    }

    // 检测主手武器
    const mainHand = currentGrid[0];
    if (mainHand) {
        let wType = WEAPON_TYPE_MAP[mainHand.type] || mainHand.type;
        if (wType) wType = wType.toLowerCase();

        const normalizedProficiency = currentMC.proficiency.map(p => {
            let mapped = WEAPON_TYPE_MAP[p] || p;
            return mapped ? mapped.toLowerCase() : p;
        });

        if (!normalizedProficiency.includes(wType)) {
            currentGrid[0] = null;
        }
    }
    
    renderGrid();
    try { recalculate(); } catch(e) { console.error('recalculate error:', e); }
}

// 渲染加成显示
function renderBonusDisplay(bonusObj, targetId) {
    const container = document.getElementById(targetId);
    container.innerHTML = '';
    
    if (!bonusObj || Object.keys(bonusObj).length === 0) {
        container.innerHTML = '<div class="empty-data">暂无数据</div>';
        return;
    }

    for (const [key, val] of Object.entries(bonusObj)) {
        let cleanKey = key.replace('class_', '').replace('chara_', '').replace('_passive', '').replace('_base', '').replace('_tbd', '');
        let displayKey = DISPLAY_NAME_MAP[key] || cleanKey;
        
        let displayVal = val;
        if (Math.abs(val) <= 1 && val !== 0 && !Number.isInteger(val)) {
            displayVal = (val * 100).toFixed(1) + "%";
        } else {
            displayVal = "+" + val;
        }

        const row = document.createElement('div');
        row.className = 'bonus-row';
        row.innerHTML = `<span class="bonus-key">${displayKey}</span><span class="bonus-val">${displayVal}</span>`;
        container.appendChild(row);
    }
}

// 渲染全局加成
function renderGlobalMastery() {
    const container = document.getElementById('mc-mastery-display');
    container.innerHTML = '';

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '10px';

    const leftCol = document.createElement('div');
    const rightCol = document.createElement('div');
    rightCol.style.borderLeft = '1px dashed #444';
    rightCol.style.paddingLeft = '10px';

    let count = 0;
    const entries = Object.entries(DEFAULT_MASTERY);
    const midPoint = Math.ceil(entries.length / 2);

    entries.forEach(([key, val], index) => {
        let cleanKey = key.replace('class_', '').replace('chara_', '').replace('_passive', '').replace('_base', '');
        let displayKey = DISPLAY_NAME_MAP[key] || cleanKey;
        let displayVal = (val * 100).toFixed(1) + "%";

        const row = document.createElement('div');
        row.className = 'bonus-row';
        row.innerHTML = `<span class="bonus-key">${displayKey}</span><span class="bonus-val">${displayVal}</span>`;

        if (index < midPoint) leftCol.appendChild(row);
        else rightCol.appendChild(row);
    });

    grid.appendChild(leftCol);
    grid.appendChild(rightCol);
    container.appendChild(grid);
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
        
        html += `
            <div class="inventory-item" onclick="toggleSpecialBuff('${buff.id}')" style="cursor:pointer; background:${isChecked ? '#3a3a3a' : '#222'}; border:${isChecked ? '1px solid #f39c12' : '1px solid #444'}; display:flex; align-items:center; padding:8px;">
                <input type="checkbox" ${isChecked} style="pointer-events:none; margin-right:10px; width:16px; height:16px;">
                ${imgDisplay}
                <div style="flex:1;">
                    <div style="font-weight:bold; font-size:0.95em; color:${isChecked ? '#f39c12' : '#e0e0e0'}">${buff.name}</div>
                    <div style="font-size:0.8em; color:#888; margin-top:2px; line-height:1.3;">${buff.description || "无描述"}</div>
                </div>
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

// 渲染武器仓库
function renderInventory() {
    document.getElementById('inventory-list').innerHTML = allWeapons.map(w => `
        <div class="inventory-item" onclick="addToGrid(${w._uid})">
            ${w.image ? `<img src="images/${w.image}" class="inv-thumb">` : `<div class="inv-thumb" style="display:flex;align-items:center;justify-content:center;font-size:0.8em;color:#888;">无图</div>`}
            <div style="flex-grow:1">
                <div style="font-weight:bold; font-size:0.9em">${w.name}</div>
                <div style="font-size:0.7em; color:#888;">${w.skills.length}个技能 (Max SL.${w._maxSlvl || 15})</div>
            </div>
        </div>
    `).join('');
}

// 渲染角色列表
function renderCharacters() {
    const container = document.getElementById('character-list-container');
    if (!container) return;

    if (allCharacters.length === 0) {
        container.innerHTML = '<div style="padding:10px;text-align:center;color:#888">暂无角色数据</div>';
        return;
    }

    container.innerHTML = allCharacters.map(c => {
        const color = getElementColor(c['属性']) || '#888';
        return `
        <div class="char-item">
            <div class="char-avatar-small" style="background:${color}; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#fff; font-size:0.8em;">
                ${c['名称'][0]}
            </div>
            <div style="flex-grow:1">
                <div style="font-weight:bold; font-size:0.9em; display:flex; justify-content:space-between;">
                    <span>${c['名称']}</span>
                    <span style="font-size:0.8em; color:${color}">${c['属性']}</span>
                </div>
                <div style="font-size:0.75em; color:#aaa; margin-top:2px;">
                    ${c['种族']} | 得意: ${c['得意武器1']} / ${c['得意武器2']}
                </div>
                <div style="font-size:0.7em; color:#666; margin-top:2px;">
                    HP: ${c['角色基础HP']} / ATK: ${c['角色基础atk']}
                </div>
            </div>
        </div>
        `;
    }).join('');
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
            
            // 获取位置标签
            const labels = ['主召', '友召', 'Sum 1', 'Sum 2', 'Sum 3', 'Sum 4', 'Sub 1', 'Sub 2'];
            
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

// 更新召唤石加成到输入框
function updateAuraFromSummons() {
    let totalOptimus = 0;
    let totalElementAtk = 0;
    let totalDamageCap = 0;
    
    // 计算所有召唤石的神石、属攻和伤害上限加成
    for (let i = 0; i < 8; i++) {
        const summon = currentSummons[i];
        if (summon) {
            const bonuses = parseSummonEffects(summon, i);
            totalOptimus += bonuses.optimus;
            totalElementAtk += bonuses.elementAtk;
            totalDamageCap += bonuses.damageCap || 0;
        }
    }
    
    // 更新输入框
    const auraOptimusInput = document.getElementById('aura-optimus');
    const auraElementalInput = document.getElementById('aura-elemental');
    
    if (auraOptimusInput) {
        auraOptimusInput.value = totalOptimus;
    }
    if (auraElementalInput) {
        auraElementalInput.value = totalElementAtk;
    }
    
    // 存储伤害上限加成到全局变量，供calc.js使用
    window.summonDamageCapBonus = totalDamageCap / 100; // 转换为小数形式
    console.log('[Summon Cap Debug] totalDamageCap:', totalDamageCap, '-> window.summonDamageCapBonus:', window.summonDamageCapBonus);
    
    // 触发重新计算
    try { recalculate(); } catch(e) { console.error('recalculate error:', e); }
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
}

// 渲染武器盘网格
function renderGrid() {
    const mainContainer = document.getElementById('main-hand-container');
    const subArea = document.getElementById('sub-slots-area');
    const extraArea = document.getElementById('extra-weapon-slots');
    mainContainer.innerHTML = ''; 
    subArea.innerHTML = '';
    extraArea.innerHTML = '';
    
    // 渲染主武器槽和子武器槽 (0-9)
    for (let i = 0; i < 10; i++) {
        const weapon = currentGrid[i];
        const isMain = (i === 0);
        const slotDiv = document.createElement('div');
        slotDiv.className = `grid-slot ${isMain ? 'main' : 'sub'} ${weapon ? 'filled' : ''}`;
        
        if (weapon) {
            // 添加加蛋徽章
            const plusMarks = weapon.plusMarks || 0;
            const plusMarkHtml = `
                <div class="plus-mark-badge ${plusMarks > 0 ? '' : 'empty'}" 
                     onclick="event.stopPropagation(); togglePlusMarks(${i})"
                     oncontextmenu="event.preventDefault(); event.stopPropagation(); customPlusMarks(${i}); return false;"
                     title="左键: 切换+99/卸下 | 右键: 自定义数量">
                    ${plusMarks > 0 ? '+' + plusMarks : '+'}
                </div>
            `;

            // 添加武器类型图标
            const typeIconHtml = weapon.type ? `
                <div class="weapon-type-icon">
                    <img src="images/${WEAPON_TYPE_ICONS[weapon.type] || 'weapon_type_default.webp'}" alt="${weapon.type}">
                </div>
            ` : '';
            
            const imgHtml = weapon.image ? `<img src="images/${weapon.image}" class="weapon-img" alt="${weapon.name}">` : `<div style="color:#666; font-weight:bold;">${weapon.name}</div>`;
            let skillsHtml = '';
            for (let j = 0; j < 3; j++) {
                const skill = weapon.skills[j];
                if(skill) {
                    if(skill.isSlot) {
                        const currentChoice = weapon.userSlotChoices[j];
                        const optionsHtml = skill.options.map(optId => {
                            const optSkill = globalSkillMap[optId];
                            const optName = optSkill ? optSkill.name : optId;
                            return `<option value="${optId}" ${currentChoice === optId ? 'selected' : ''}>${optName}</option>`;
                        }).join('');
                        skillsHtml += `<select class="slot-select" onclick="event.stopPropagation()" onchange="updateWeaponSlot(${i}, ${j}, this.value)">${optionsHtml}</select>`;
                    } else {
                        const finalColor = getElementColor(skill.element || "weapon");
                        skillsHtml += `<div class="skill-tag" style="border-left-color: ${finalColor}"><span class="skill-name">${skill.name}</span></div>`;
                    }
                } else { skillsHtml += `<div class="skill-tag empty"></div>`; }
            }

            let slvlOptions = '';
            const possibleLevels = [10, 15, 20, 25];
            const wMax = weapon._maxSlvl || 15;
            possibleLevels.forEach(lv => {
                if (lv <= wMax) {
                    slvlOptions += `<option value="${lv}" ${weapon.userSelectedSlvl == lv ? 'selected' : ''}>Skill Lv.${lv}</option>`;
                }
            });

            slotDiv.innerHTML = `
                ${plusMarkHtml}
                ${typeIconHtml}
                <div class="weapon-image-container" onclick="removeFromGrid(${i})">
                    <div class="remove-overlay">卸下</div>
                    ${imgHtml}
                </div>
                <div class="weapon-info-footer">
                    <div class="skill-list">${skillsHtml}</div>
                    <select class="slvl-select" onchange="updateWeaponSlvl(${i}, this.value)">
                        ${slvlOptions}
                    </select>
                </div>`;
        } else {
            slotDiv.innerHTML = `<div class="empty-text">${isMain ? 'MAIN' : '+'}</div>`;
            slotDiv.onclick = () => alert("请在右侧武器仓库选择武器");
        }
        
        if (isMain) mainContainer.appendChild(slotDiv);
        else subArea.appendChild(slotDiv);
    }
    
    // 渲染额外武器槽 (10-12) - 始终显示，但根据开关状态显示不同内容
    for (let i = 10; i < 13; i++) {
        const weapon = currentGrid[i];
        const slotDiv = document.createElement('div');
        slotDiv.className = `grid-slot sub ${weapon ? 'filled' : ''}`;
        slotDiv.id = `extra-slot-${i}`;
        
        if (!extraSlotsEnabled) {
            // 关闭状态显示"关闭"字眼
            slotDiv.innerHTML = `<div class="empty-text" style="font-size:1em; color:#555;">关闭</div>`;
            slotDiv.style.cursor = 'not-allowed';
            slotDiv.style.opacity = '0.5';
        } else if (weapon) {
            // 添加加蛋徽章
            const plusMarks = weapon.plusMarks || 0;
            const plusMarkHtml = `
                <div class="plus-mark-badge ${plusMarks > 0 ? '' : 'empty'}" 
                     onclick="event.stopPropagation(); togglePlusMarks(${i})"
                     oncontextmenu="event.preventDefault(); event.stopPropagation(); customPlusMarks(${i}); return false;"
                     title="左键: 切换+99/卸下 | 右键: 自定义数量">
                    ${plusMarks > 0 ? '+' + plusMarks : '+'}
                </div>
            `;

            // 添加武器类型图标
            const typeIconHtml = weapon.type ? `
                <div class="weapon-type-icon">
                    <img src="images/${WEAPON_TYPE_ICONS[weapon.type] || 'weapon_type_default.webp'}" alt="${weapon.type}">
                </div>
            ` : '';
            
            const imgHtml = weapon.image ? `<img src="images/${weapon.image}" class="weapon-img" alt="${weapon.name}">` : `<div style="color:#666; font-weight:bold;">${weapon.name}</div>`;
            let skillsHtml = '';
            for (let j = 0; j < 3; j++) {
                const skill = weapon.skills[j];
                if(skill) {
                    if(skill.isSlot) {
                        const currentChoice = weapon.userSlotChoices[j];
                        const optionsHtml = skill.options.map(optId => {
                            const optSkill = globalSkillMap[optId];
                            const optName = optSkill ? optSkill.name : optId;
                            return `<option value="${optId}" ${currentChoice === optId ? 'selected' : ''}>${optName}</option>`;
                        }).join('');
                        skillsHtml += `<select class="slot-select" onclick="event.stopPropagation()" onchange="updateWeaponSlot(${i}, ${j}, this.value)">${optionsHtml}</select>`;
                    } else {
                        const finalColor = getElementColor(skill.element || "weapon");
                        skillsHtml += `<div class="skill-tag" style="border-left-color: ${finalColor}"><span class="skill-name">${skill.name}</span></div>`;
                    }
                } else { skillsHtml += `<div class="skill-tag empty"></div>`; }
            }

            let slvlOptions = '';
            const possibleLevels = [10, 15, 20, 25];
            const wMax = weapon._maxSlvl || 15;
            possibleLevels.forEach(lv => {
                if (lv <= wMax) {
                    slvlOptions += `<option value="${lv}" ${weapon.userSelectedSlvl == lv ? 'selected' : ''}>Skill Lv.${lv}</option>`;
                }
            });

            slotDiv.innerHTML = `
                ${plusMarkHtml}
                <div class="weapon-image-container" onclick="removeFromGrid(${i})">
                    <div class="remove-overlay">卸下</div>
                    ${typeIconHtml}
                    ${imgHtml}
                </div>
                <div class="weapon-info-footer">
                    <div class="skill-list">${skillsHtml}</div>
                    <select class="slvl-select" onchange="updateWeaponSlvl(${i}, this.value)">
                        ${slvlOptions}
                    </select>
                </div>`;
        } else {
            slotDiv.innerHTML = `<div class="empty-text">+</div>`;
            slotDiv.onclick = () => alert("请在右侧武器仓库选择武器");
            slotDiv.style.opacity = '1';
        }
        
        extraArea.appendChild(slotDiv);
    }
}

// 添加武器到武器盘
function addToGrid(uid) {
    const weaponData = allWeapons.find(w => w._uid === uid);
    if (!weaponData) return;

    const newWeapon = JSON.parse(JSON.stringify(weaponData));
    
    // 初始化加蛋
    if (newWeapon.plusMarks === undefined) newWeapon.plusMarks = 0;

    let wType = WEAPON_TYPE_MAP[newWeapon.type] || newWeapon.type;
    if (wType) wType = wType.toLowerCase();

    // 检查武器是否允许放入额外栏
    const allowExtra = weaponData.stats?.allow_extra || false;

    let targetIndex = -1;

    // 确保 currentGrid 有足够的长度（额外槽位需要13个元素）
    if (extraSlotsEnabled && currentGrid.length < 13) {
        currentGrid = currentGrid.concat(new Array(13 - currentGrid.length).fill(null));
    }

    // 职业得意武器类型列表
    const normalizedProficiency = currentMC.proficiency.map(p => {
        let mapped = WEAPON_TYPE_MAP[p] || p;
        return mapped ? mapped.toLowerCase() : p;
    });

    // 判断是否为得意武器
    const isProficient = normalizedProficiency.includes(wType);

    // === 新逻辑 ===
    // 规则1: allow_extra: true 的武器可以放入主手（如果得意的），主手不需要时放入额外栏
    // 规则2: 只有 allow_extra: true 的武器可以放入额外栏（槽位 10-12）
    
    if (currentGrid[0] === null && isProficient) {
        // 主手为空且是得意武器 → 放入主手
        targetIndex = 0;
    } else if (allowExtra && extraSlotsEnabled) {
        // 武器允许额外栏 且 额外栏已开启
        // 优先检查额外栏是否有空位（槽位 10-12）
        for (let i = 10; i < 13; i++) {
            if (currentGrid[i] === null) {
                targetIndex = i;
                break;
            }
        }
        // 额外栏已满，检查常规槽位
        if (targetIndex === -1) {
            for (let i = 1; i < 10; i++) {
                if (currentGrid[i] === null) {
                    targetIndex = i;
                    break;
                }
            }
        }
    } else {
        // 普通武器：按常规逻辑放入
        // 先检查主手是否为空且是得意武器
        if (currentGrid[0] === null && isProficient) {
            targetIndex = 0;
        } else {
            // 检查常规槽位 1-9
            for (let i = 1; i < 10; i++) {
                if (currentGrid[i] === null) {
                    targetIndex = i;
                    break;
                }
            }
        }
    }

    if (targetIndex === -1) {
        return alert("武器盘已满，或主手为空但该武器不符合当前职业得意！");
    }

    // 最终检查：如果目标是额外栏，确认武器允许放入
    if (targetIndex >= 10 && targetIndex <= 12 && !allowExtra) {
        return alert("该武器不能放入额外武器栏！");
    }

    currentGrid[targetIndex] = newWeapon;
    renderGrid();
    recalculate();
    window.dispatchEvent(new CustomEvent('weaponGridChanged'));
}

// 从武器盘移除武器
function removeFromGrid(index) { 
    currentGrid[index] = null; 
    renderGrid(); 
    recalculate();
    window.dispatchEvent(new CustomEvent('weaponGridChanged'));
}

// 更新武器技能等级
function updateWeaponSlvl(index, val) { 
    if(currentGrid[index]) { 
        currentGrid[index].userSelectedSlvl = parseInt(val); 
        renderGrid(); 
        recalculate(); 
    } 
}

// 更新武器槽位选择
function updateWeaponSlot(gridIndex, slotIndex, skillId) { 
    if(currentGrid[gridIndex]) { 
        currentGrid[gridIndex].userSlotChoices[slotIndex] = skillId; 
        recalculate(); 
    } 
}

// 切换加蛋 (+99 / 0)
function togglePlusMarks(index) {
    const weapon = currentGrid[index];
    if (!weapon) return;

    // 如果当前不是99，则设为99；如果是99，则设为0
    if ((weapon.plusMarks || 0) < 99) {
        weapon.plusMarks = 99;
    } else {
        weapon.plusMarks = 0;
    }
    
    renderGrid();
    recalculate();
}

// 自定义加蛋数量
function customPlusMarks(index) {
    const weapon = currentGrid[index];
    if (!weapon) return;

    const input = prompt("请输入加蛋数量 (0-99):", weapon.plusMarks || 0);
    if (input === null) return; // 取消

    let val = parseInt(input);
    if (isNaN(val)) return;

    if (val < 0) val = 0;
    if (val > 99) val = 99;

    weapon.plusMarks = val;
    renderGrid();
    recalculate();
}

// 一键切换所有武器加蛋 (+99 / +0)
function addAllPlusMarks() {
    let hasWeapon = false;
    let allMax = true;

    // 第一次遍历：检查状态
    for (let i = 0; i < currentGrid.length; i++) {
        const weapon = currentGrid[i];
        if (weapon) {
            hasWeapon = true;
            if ((weapon.plusMarks || 0) < 99) {
                allMax = false;
                break; // 只要有一个不是99，就判定为需要上99
            }
        }
    }

    if (!hasWeapon) {
        alert("当前没有装备任何武器！");
        return;
    }

    // 第二次遍历：执行操作
    // 如果所有武器都是99，则全部清零；否则全部设为99
    const targetVal = allMax ? 0 : 99;
    
    currentGrid.forEach(weapon => {
        if (weapon) {
            weapon.plusMarks = targetVal;
        }
    });
    
    renderGrid();
    recalculate();
}

// 渲染详细分解
function renderDetailedBreakdown(gridStats) {
    const container = document.getElementById('all-stats-breakdown');
    if(!container) return;
    
    // 合计计算
    let sumDA = gridStats['da'] || 0;
    let sumTA = gridStats['ta'] || 0;
    
    sumDA += (currentMC.bonuses['chara_da_base'] || 0) + (DEFAULT_MASTERY['chara_da_passive'] || 0);
    sumTA += (currentMC.bonuses['chara_ta_base'] || 0) + (DEFAULT_MASTERY['chara_ta_passive'] || 0);

    let inputEleVal = parseFloat(document.getElementById('aura-elemental').value) || 0;
    let sumEle = (inputEleVal / 100) + (gridStats['element_atk_progression'] || 0) + (gridStats['element_atk_awaken'] || 0); 

    let sumDmgAmp = gridStats['dmg_amp_normal'] || 0;

    activeSpecialBuffs.forEach(id => {
        const buff = specialBuffsData.find(b => b.id === id);
        if(buff && buff.stats) {
            if(buff.stats['da']) sumDA += buff.stats['da'];
            if(buff.stats['ta']) sumTA += buff.stats['ta'];
            if(buff.stats['element_atk']) sumEle += buff.stats['element_atk'];
            if(buff.stats['dmg_amp']) sumDmgAmp += buff.stats['dmg_amp'];
        }
    });

    const lbData = {};
    lbData['LB攻击'] = parseInt(document.getElementById('mc-lb-atk').value) || 0;
    lbData['LB生命'] = parseInt(document.getElementById('mc-lb-hp').value) || 0;
    const p1 = parseFloat(document.getElementById('prof1-extra').value) || 0;
    const p2 = parseFloat(document.getElementById('prof2-extra').value) || 0;
    lbData['得意1系数'] = p1/100;
    lbData['得意2系数'] = p2/100;

    const allSources = [
        { name: '武器盘', color: '#4db6ac', data: gridStats },
        { name: '职业', color: '#3498db', data: currentMC.bonuses },
        { name: '常驻', color: '#9b59b6', data: DEFAULT_MASTERY },
        { name: 'LB', color: '#e67e22', data: lbData }
    ];

    activeSpecialBuffs.forEach(id => {
        const buff = specialBuffsData.find(b => b.id === id);
        if(buff && buff.stats) {
            allSources.push({ name: buff.name, color: '#f1c40f', data: buff.stats });
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

    html += renderSection('1. 武器盘数据 (Weapon Grid)', gridStats, '#4db6ac');
    html += renderSection('2. 当前职业加成 (Current Job)', currentMC.bonuses, '#3498db');
    html += renderSection('3. 全职业常驻 (Mastery)', DEFAULT_MASTERY, '#9b59b6');
    html += renderSection('4. LB 加成 (Limit Bonus)', lbData, '#e67e22');

    if (activeSpecialBuffs.size > 0) {
        let specialHtml = `<div class="breakdown-group"><div class="breakdown-title" style="border-left-color:#f1c40f; color:#f1c40f; background:transparent;">5. 特殊道具详情 (Special Items)</div>`;
        let hasSpecialData = false;
        
        activeSpecialBuffs.forEach(id => {
            const buff = specialBuffsData.find(b => b.id === id);
            if(buff && buff.stats) {
                if(Object.keys(buff.stats).length > 0) {
                    specialHtml += `<div class="bd-source-name" style="margin-top:8px;">${buff.name}</div>`;
                    for(const [k, v] of Object.entries(buff.stats)) {
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

// 渲染角色面板统计数据
function renderCharPanelStats(data) {
    // 更新主角面板 (char-panel-0)
    const gridHpEl0 = document.getElementById('char-grid-hp-0');
    const gridAtkEl0 = document.getElementById('char-grid-atk-0');
    const panelHpEl0 = document.getElementById('char-panel-hp-0');
    const panelAtkEl0 = document.getElementById('char-panel-atk-0');
    
    if (gridHpEl0) gridHpEl0.textContent = Math.round(data.gridHp).toLocaleString();
    if (gridAtkEl0) gridAtkEl0.textContent = Math.round(data.gridAtk).toLocaleString();
    if (panelHpEl0) panelHpEl0.textContent = Math.round(data.panelHp).toLocaleString();
    if (panelAtkEl0) panelAtkEl0.textContent = Math.round(data.panelAtk).toLocaleString();
    
    // 其他角色面板暂时显示 "-" (预留)
    for (let i = 1; i <= 5; i++) {
        const gridHpEl = document.getElementById('char-grid-hp-' + i);
        const gridAtkEl = document.getElementById('char-grid-atk-' + i);
        const panelHpEl = document.getElementById('char-panel-hp-' + i);
        const panelAtkEl = document.getElementById('char-panel-atk-' + i);
        
        if (gridHpEl) gridHpEl.textContent = '-';
        if (gridAtkEl) gridAtkEl.textContent = '-';
        if (panelHpEl) panelHpEl.textContent = '-';
        if (panelAtkEl) panelAtkEl.textContent = '-';
    }
}

// ==========================================
// 召唤石选择器功能
// ==========================================

// 召唤石位置标签
const SUMMON_SLOT_LABELS = ['主召', '友召', 'Sum 1', 'Sum 2', 'Sum 3', 'Sum 4', 'Sub 1', 'Sub 2'];

// 渲染召唤石选择器 (8行布局，仅显示)
function renderSummonSlots() {
    const container = document.getElementById('summon-settings-container');
    if (!container) return;
    
    // 获取当前召唤石ATK/HP值
    const summonAtk = document.getElementById('summon-atk')?.value || '4652';
    const summonHp = document.getElementById('summon-hp')?.value || '1513';
    
    let html = '<div class="summon-slot-selector">';
    
    // 添加召唤石合计ATK和HP输入框
    html += `
        <div class="summon-stats-input-panel" style="display:flex; gap:15px; margin-bottom:15px; padding:10px; background:#2a2a2a; border-radius:4px;">
            <div class="summon-stat-group" style="flex:1;">
                <label style="color:#aaa; font-size:0.85em; display:block; margin-bottom:4px;">召唤石合计ATK</label>
                <input type="number" id="summon-atk-panel" value="${summonAtk}" step="100" style="width:100%; padding:6px; background:#333; border:1px solid #555; color:#fff; border-radius:4px;" onchange="syncSummonStats()">
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
            // 位置映射: 0=主召, 1=友召, 2-7=副召
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
                        // 主召位置
                        const mainEffects = summon.effects.main || {};
                        return mainEffects[selectedLevel]?.description || getEffectForLevel(mainEffects, selectedLevel);
                    } else if (i === 1) {
                        // 友召位置
                        const friendEffects = summon.effects.friend || {};
                        return friendEffects[selectedLevel]?.description || getEffectForLevel(friendEffects, selectedLevel);
                    } else {
                        // Sum位置 (2-5) 和 Sub位置 (6,7) - 显示副召效果
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

// 切换召唤石等级
function changeSummonLevel(slotIndex, level) {
    if (currentSummons[slotIndex]) {
        currentSummons[slotIndex].selectedLevel = parseInt(level);
        renderSummonSlots();
        // 更新神石/属攻输入框
        updateAuraFromSummons();
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

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getElementColor,
        updateHpDisplay,
        toggleSection,
        switchTab,
        renderMCSelector,
        updateMCJob,
        renderBonusDisplay,
        renderGlobalMastery,
        renderSpecialTab,
        toggleSpecialBuff,
        renderInventory,
        renderCharacters,
        renderGrid,
        addToGrid,
        removeFromGrid,
        updateWeaponSlvl,
        updateWeaponSlot,
        renderDetailedBreakdown,
        renderSummonSlots,
        togglePlusMarks,
        customPlusMarks,
        addAllPlusMarks
    };
}
