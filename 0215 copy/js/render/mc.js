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

function escapeMcSkillHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function buildMcSkillIconSrc(iconPath) {
    if (!iconPath || typeof iconPath !== 'string') return '';
    const normalized = iconPath.trim().replace(/\\/g, '/');
    const encoded = normalized.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return encoded ? `images/${encoded}` : '';
}

function resolveMcSkillRefs(refs) {
    if (window.SkillRegistry && typeof window.SkillRegistry.resolveRefs === 'function') {
        return window.SkillRegistry.resolveRefs(refs);
    }
    const map = typeof globalCharaSkillMap !== 'undefined' && globalCharaSkillMap ? globalCharaSkillMap : {};
    return (Array.isArray(refs) ? refs : []).map((id) => map[id]).filter(Boolean);
}

function collectMcActiveSkills(jobData) {
    const ids = [];
    if (currentMC && Array.isArray(currentMC.skillIds)) ids.push(...currentMC.skillIds);
    if (jobData && jobData.skill_refs && Array.isArray(jobData.skill_refs.active)) {
        ids.push(...jobData.skill_refs.active);
    }
    const seen = new Set();
    return resolveMcSkillRefs(ids).filter((skill) => {
        if (!skill || String(skill.kind || 'active').toLowerCase() === 'passive') return false;
        const id = String(skill.id || '');
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function renderMcActiveSkillSection(jobData) {
    const activeSkills = collectMcActiveSkills(jobData);
    const slotCount = Math.max(4, activeSkills.length);
    const slotsHtml = Array.from({ length: slotCount }, (_, index) => {
        const skill = activeSkills[index];
        const iconSrc = buildMcSkillIconSrc(skill && (skill.icon || skill['图标']));
        const title = skill ? [skill.name, skill.description || skill.desc].filter(Boolean).join('：') : '无主角技能数据';
        const iconInner = skill && iconSrc
            ? `<img class="char-skill-slot-icon" src="${iconSrc}" alt="" title="${escapeMcSkillHtml(title)}">`
            : `<div class="char-skill-slot-empty" title="${escapeMcSkillHtml(title)}">—</div>`;
        return `
            <div class="char-skill-slot"${skill ? ` data-char-skill-id="${escapeMcSkillHtml(skill.id)}"` : ''}>
                <div class="char-skill-slot-icon-wrap">${iconInner}</div>
                <label class="char-skill-toggle-label">
                    <input type="checkbox" class="char-skill-enabled-cb" data-slot="0"${skill ? ` data-skill-id="${escapeMcSkillHtml(skill.id)}"` : ''} ${skill ? '' : 'disabled'} onchange="onCharSkillBuffToggle()">
                    <span class="char-skill-toggle-text">开启</span>
                </label>
            </div>`;
    }).join('');

    document.querySelectorAll('[id="char-slot-0-basic"]').forEach((panel) => {
        let section = panel.querySelector('.mc-active-skill-row-wrap');
        if (!section) {
            section = document.createElement('div');
            section.className = 'theme-custom mc-active-skill-row-wrap';
            panel.appendChild(section);
        }
        section.innerHTML = `
            <div class="section-title">主角技能</div>
            <div class="char-skill-slots-grid">${slotsHtml}</div>`;
    });
}

function collectMcPassiveSkills(jobData) {
    if (!jobData) return [];
    const result = [];
    const seen = new Set();
    const append = (skill, forcePassive) => {
        if (!skill || typeof skill !== 'object') return;
        const isPassive = String(skill.kind || '').toLowerCase() === 'passive'
            || !!(skill.trigger && skill.trigger.event === 'battle_start');
        if (!forcePassive && !isPassive) return;
        const identity = skill.id != null ? String(skill.id) : `${skill.name || ''}|${result.length}`;
        if (seen.has(identity)) return;
        seen.add(identity);
        result.push(skill);
    };

    const passiveRefs = jobData.skill_refs && Array.isArray(jobData.skill_refs.passive)
        ? jobData.skill_refs.passive
        : [];
    resolveMcSkillRefs(passiveRefs).forEach((skill) => append(skill, true));
    (Array.isArray(jobData.battle_skills) ? jobData.battle_skills : []).forEach((skill) => append(skill, false));
    (Array.isArray(jobData.passive_skills) ? jobData.passive_skills : []).forEach((skill) => append(skill, true));
    (Array.isArray(jobData['被动技能库']) ? jobData['被动技能库'] : []).forEach((skill) => append(skill, true));
    return result;
}

function renderMcPassiveSkillSection(jobData) {
    const passiveSkills = collectMcPassiveSkills(jobData);
    const slotCount = Math.max(4, passiveSkills.length);
    const slotsHtml = Array.from({ length: slotCount }, (_, index) => {
        const skill = passiveSkills[index];
        const iconPath = skill && (skill.icon || skill['图标']);
        const iconSrc = buildMcSkillIconSrc(iconPath);
        const title = skill
            ? [skill.name, skill.description || skill.desc].filter(Boolean).join('：')
            : '无职业被动技能数据';
        const iconInner = skill && iconSrc
            ? `<img class="char-skill-slot-icon" src="${iconSrc}" alt="" title="${escapeMcSkillHtml(title)}">`
            : `<div class="char-skill-slot-empty" title="${escapeMcSkillHtml(title)}">—</div>`;
        const triggerLabel = skill && skill.trigger && skill.trigger.event === 'battle_start' ? '开局' : '被动';
        return `
            <div class="char-skill-slot char-passive-skill-slot"${skill && skill.id ? ` data-mc-passive-skill-id="${escapeMcSkillHtml(skill.id)}"` : ''}>
                <div class="char-skill-slot-icon-wrap char-passive-slot-icon-wrap">
                    ${iconInner}
                    ${skill ? '<span class="char-passive-slot-badge">P</span>' : ''}
                </div>
                <span class="char-passive-status-label">${skill ? triggerLabel : '—'}</span>
            </div>`;
    }).join('');

    document.querySelectorAll('[id="char-slot-0-basic"]').forEach((panel) => {
        let section = panel.querySelector('.mc-passive-skill-row-wrap');
        if (!section) {
            section = document.createElement('div');
            section.className = 'theme-custom mc-passive-skill-row-wrap';
            panel.appendChild(section);
        }
        section.innerHTML = `
            <div class="section-title">职业被动技能</div>
            <div class="char-skill-slots-grid char-passive-slots-grid">${slotsHtml}</div>`;
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

    const previousJobId = currentMC && currentMC.jobId ? currentMC.jobId : null;
    const isRestoringMcConfig = typeof window !== 'undefined' && window.isRestoringMcConfig === true;
    if (!isRestoringMcConfig && previousJobId && previousJobId !== jobData.id && typeof rememberCurrentMcLbSelectionsForJob === 'function') {
        rememberCurrentMcLbSelectionsForJob(previousJobId);
    }

    currentMC.jobId = jobData.id;
    currentMC.proficiency = jobData.proficiency || [];
    currentMC.bonuses = jobData.bonuses || {}; 
    currentMC.battleBonuses = jobData.battle_bonuses || "";
    currentMC.battleSkills = collectMcPassiveSkills(jobData);

    if (typeof loadMcLbSelectionsForJob === 'function') {
        loadMcLbSelectionsForJob(currentMC.jobId);
    }

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
    renderMcActiveSkillSection(jobData);
    renderMcPassiveSkillSection(jobData);

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
    if (!isRestoringMcConfig && previousJobId && previousJobId !== currentMC.jobId && typeof autoSaveEnabled !== 'undefined' && autoSaveEnabled && typeof saveToLocal === 'function') {
        saveToLocal(true);
    }
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
