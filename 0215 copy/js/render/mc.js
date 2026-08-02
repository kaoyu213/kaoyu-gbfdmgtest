// ==========================================
//  GBF 模拟器 - 渲染模块 - 主角/职业相关
// ==========================================

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
        let cleanKey = key.replace('class_', '').replace('mc_', '').replace('chara_', '').replace('_passive', '').replace('_base', '').replace('_tbd', '');
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
    const entries = Object.entries(getDefaultMastery());
    const midPoint = Math.ceil(entries.length / 2);

    entries.forEach(([key, val], index) => {
        let cleanKey = key.replace('class_', '').replace('mc_', '').replace('chara_', '').replace('_passive', '').replace('_base', '');
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

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        renderMCSelector,
        updateMCJob,
        renderBonusDisplay,
        renderGlobalMastery
    };
}
