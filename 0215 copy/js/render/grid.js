// ==========================================
//  GBF 模拟器 - 渲染模块 - 武器盘相关
// ==========================================

const INVENTORY_ELEMENT_FILTER_OPTIONS = ['全部', '火', '水', '土', '风', '光', '暗'];

function weaponMatchesInventoryFilter(w) {
    const f = typeof inventoryElementFilter !== 'undefined' ? inventoryElementFilter : '全部';
    if (!f || f === '全部') return true;
    const el = w && w.element != null ? String(w.element).trim() : '';
    return el === f;
}

function renderWeaponElementFilterBar() {
    const bar = document.getElementById('weapon-element-filter-bar');
    if (!bar) return;
    const cur = typeof inventoryElementFilter !== 'undefined' ? inventoryElementFilter : '全部';
    bar.innerHTML = INVENTORY_ELEMENT_FILTER_OPTIONS.map((o) => {
        const active = o === cur ? ' left-filter-pill--active' : '';
        const accent = o === '全部' ? '#888888' : getElementColor(o) || '#666666';
        const safe = o.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<button type="button" class="left-filter-pill${active}" style="--pill-accent:${accent}" onclick="setInventoryElementFilter('${safe}')">${o}</button>`;
    }).join('');
}

window.setInventoryElementFilter = function (elementKey) {
    if (typeof inventoryElementFilter === 'undefined') return;
    inventoryElementFilter = elementKey;
    renderInventory();
};

// 渲染武器仓库
function renderInventory() {
    renderWeaponElementFilterBar();
    const listEl = document.getElementById('inventory-list');
    if (!listEl) return;

    const filtered = allWeapons.filter(weaponMatchesInventoryFilter);
    if (filtered.length === 0) {
        listEl.innerHTML =
            '<div style="padding:12px;text-align:center;color:#888;font-size:0.85em;">该属性下暂无武器</div>';
        return;
    }

    listEl.innerHTML = filtered
        .map(
            (w) => `
        <div class="inventory-item" onclick="addToGrid(${w._uid})">
            ${w.image ? `<img src="images/${w.image}" class="inv-thumb">` : `<div class="inv-thumb" style="display:flex;align-items:center;justify-content:center;font-size:0.8em;color:#888;">无图</div>`}
            <div style="flex-grow:1">
                <div style="font-weight:bold; font-size:0.9em">${w.name}</div>
                <div style="font-size:0.7em; color:#888;">${w.element || '—'} · ${w.skills.length}个技能 (Max SL.${w._maxSlvl || 15})</div>
            </div>
        </div>
    `
        )
        .join('');
}

function buildWeaponSkillsHtml(weapon, gridIndex) {
    const skills = Array.isArray(weapon.skills) ? weapon.skills : [];
    const displayCount = Math.max(3, skills.length);
    let skillsHtml = '';

    for (let j = 0; j < displayCount; j++) {
        const skill = skills[j];
        if (skill) {
            if (skill.isSlot) {
                const currentChoice = weapon.userSlotChoices[j];
                const optionsHtml = skill.options.map(optId => {
                    const optSkill = globalSkillMap[optId];
                    const optName = optSkill ? optSkill.name : optId;
                    return `<option value="${optId}" ${currentChoice === optId ? 'selected' : ''}>${optName}</option>`;
                }).join('');
                skillsHtml += `<select class="slot-select" onclick="event.stopPropagation()" onchange="updateWeaponSlot(${gridIndex}, ${j}, this.value)">${optionsHtml}</select>`;
            } else {
                const finalColor = getElementColor(skill.element || "weapon");
                skillsHtml += `<div class="skill-tag" style="border-left-color: ${finalColor}"><span class="skill-name">${skill.name}</span></div>`;
            }
        } else {
            skillsHtml += `<div class="skill-tag empty"></div>`;
        }
    }

    return skillsHtml;
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
            const skillsHtml = buildWeaponSkillsHtml(weapon, i);

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
            const skillsHtml = buildWeaponSkillsHtml(weapon, i);

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

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        renderInventory,
        renderGrid,
        addToGrid,
        removeFromGrid,
        updateWeaponSlvl,
        updateWeaponSlot,
        togglePlusMarks,
        customPlusMarks,
        addAllPlusMarks
    };
}
