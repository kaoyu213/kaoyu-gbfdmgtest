// ==========================================
//  GBF 模拟器 - 初始化模块
// ==========================================

// 初始化应用
async function init() {
    try {
        // 恢复上次选中的用户（用户1/用户2）
        if (typeof CURRENT_USER_STORAGE_KEY !== 'undefined') {
            const savedUser = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
            if (savedUser === 'user2') currentUserId = 'user2';
        }
        // === FETCH wonders.json（特殊加成 / wonders）===
        const [wRes, sRes, cRes, charaRes, specialRes, summonRes, charaSkillsRes, buffIconsRes, charaBuffRes] = await Promise.all([
            fetch('./weapons.json'),
            fetch('./skills.json'),
            fetch('./classes.json'),
            fetch('./chara.json'),
            fetch('./wonders.json'),
            fetch('./summons.json'),
            fetch('./charaskills.json'),
            fetch('./buff_icons.json'),
            fetch('./charabuff.json')
        ]);

        const wRaw = await wRes.json();
        const sRaw = await sRes.json();
        const cRaw = await cRes.json();
        const charaRaw = await charaRes.json();
        const specialRaw = await specialRes.json();
        const summonRaw = await summonRes.json();
        const charaSkillsRaw = await charaSkillsRes.json();
        let buffIconsRaw = {};
        if (buffIconsRes.ok) {
            try {
                buffIconsRaw = await buffIconsRes.json();
            } catch (e) {
                console.warn('buff_icons.json 解析失败', e);
            }
        } else {
            console.warn('buff_icons.json 未找到或无法加载，将仅用 constants 内兜底配置');
        }

        globalBuffIconsMap = (buffIconsRaw && buffIconsRaw.buffs && typeof buffIconsRaw.buffs === 'object')
            ? buffIconsRaw.buffs
            : {};

        let charaBuffRaw = [];
        if (charaBuffRes.ok) {
            try {
                charaBuffRaw = await charaBuffRes.json();
            } catch (e) {
                console.warn('charabuff.json 解析失败', e);
            }
        } else {
            console.warn('charabuff.json 未找到或无法加载');
        }
        allCharaBuffs = Array.isArray(charaBuffRaw) ? charaBuffRaw : [];

        globalCharaSkillMap = {};
        const charaSkillsList = (charaSkillsRaw && charaSkillsRaw.skills) ? charaSkillsRaw.skills : [];
        charaSkillsList.forEach(s => {
            if (!s || !s.id) return;
            globalCharaSkillMap[s.id] = s;
            // id 为 skill_{角色数字ID}_{1~4} 时，同步注册 {角色ID}_{位次}，与角色槽位 sid 一致
            const m = String(s.id).match(/^skill_(\d+)_(\d+)$/);
            if (m) globalCharaSkillMap[`${m[1]}_${m[2]}`] = s;
        });
        
        sRaw.forEach(s => globalSkillMap[s.id] = s);
        allClasses = cRaw;
        allCharacters = charaRaw;
        allSummons = summonRaw;
        
        // 加载特殊加成数据
        specialBuffsData = specialRaw;
        
        // === FIX: 默认开启所有特殊道具 ===
        specialBuffsData.forEach(buff => activeSpecialBuffs.add(buff.id));

        renderMCSelector();
        renderGlobalMastery();
        renderSpecialTab(); // 渲染特殊加成Tab

        // === MODIFIED: Initialize Weapons with STRICT Max SL Logic ===
        allWeapons = wRaw.map((w, index) => {
            let defaultSlots = {}; 
            const skills = w.skill_slots.map((slot, slotIndex) => {
                if (slot.is_slot) {
                    if (slot.options && slot.options.length > 0) defaultSlots[slotIndex] = slot.options[0];
                    return { isSlot: true, options: slot.options, unlock_level: slot.unlock_level, id: "SLOT_" + slotIndex };
                }
                if (globalSkillMap[slot.skill_id]) return { ...globalSkillMap[slot.skill_id], unlock_level: slot.unlock_level, isSlot: false };
                return null;
            }).filter(s => s);

            // === FIX START: PRIORITIZE JSON MAX_LEVEL ===
            let inferredMaxSlvl = 15;
            const statsMaxLevel = (w.stats && w.stats.max_level) ? w.stats.max_level : 150;

            if (statsMaxLevel >= 250) inferredMaxSlvl = 25; 
            else if (statsMaxLevel >= 200) inferredMaxSlvl = 20; 
            else inferredMaxSlvl = 15; 
            // === FIX END ===
            
            let initialSlvl = inferredMaxSlvl;

            return { 
                ...w, 
                skills, 
                _uid: index, 
                _maxSlvl: inferredMaxSlvl, 
                userSelectedSlvl: initialSlvl, 
                userSlotChoices: defaultSlots 
            };
        });

        renderInventory();
        renderCharacters();
        renderSummons();
        if (typeof renderCharaBuffCatalog === 'function') renderCharaBuffCatalog();
        renderGrid();
        
        if(allClasses.length > 0) updateMCJob(allClasses[0].id);
        else recalculate();

        // 按当前用户恢复选项卡高亮，并自动加载该用户已保存的配置（含等级）
        document.querySelectorAll('.user-tab').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-user') === currentUserId);
        });
        const userKey = typeof getUserStorageKey === 'function' ? getUserStorageKey() : STORAGE_KEY;
        if (localStorage.getItem(userKey) && typeof loadFromLocal === 'function') {
            loadFromLocal(true);
        }

        // 等级修改后自动保存到当前用户，并同步所有等级输入框
        document.querySelectorAll('[id="mc-rank-input"]').forEach(input => {
            input.addEventListener('change', function() {
                const v = this.value;
                document.querySelectorAll('[id="mc-rank-input"]').forEach(el => { if (el !== this) el.value = v; });
                if (typeof saveToLocal === 'function') saveToLocal(true);
            });
        });

        // 特殊加成勾选状态变更时自动保存到当前用户
        window.addEventListener('specialBuffsChanged', function() {
            if (typeof saveToLocal === 'function') saveToLocal(true);
        });

        // 添加键盘快捷键
        document.addEventListener('keydown', function(e) {
            // Ctrl+S 保存配置
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault(); // 阻止浏览器默认保存
                saveToLocal();
                return false;
            }
            
            // Ctrl+O 加载配置
            if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                loadFromLocal();
                return false;
            }
            
            // Ctrl+E 导出配置
            if (e.ctrlKey && e.key === 'e') {
                e.preventDefault();
                exportConfig();
                return false;
            }
        });

        // 注意：不再自动保存，只有点击保存按钮才会保存配置
        // setupAutoSave(); 已移除
        
    } catch (e) { 
        console.error("初始化失败:", e); 
        document.getElementById('character-list-container').innerHTML = "加载失败，请检查文件是否存在并确保通过服务器运行";
    }
}

// 切换用户（用户1 / 用户2）：先保存当前用户配置，再加载对应用户的配置（含等级）
function switchUser(userId) {
    if (typeof currentUserId === 'undefined') return;
    if (userId === currentUserId) return;
    if (typeof saveToLocal === 'function') saveToLocal(true);
    currentUserId = userId;
    if (typeof CURRENT_USER_STORAGE_KEY !== 'undefined') {
        localStorage.setItem(CURRENT_USER_STORAGE_KEY, currentUserId);
    }
    document.querySelectorAll('.user-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-user') === userId);
    });
    if (typeof loadFromLocal === 'function') loadFromLocal(true);
    if (typeof renderGlobalMastery === 'function') renderGlobalMastery();
    if (typeof recalculate === 'function') recalculate();
}

// 左侧手风琴面板切换函数
function toggleLeftPanel(panelName, headerElement) {
    // 获取所有accordion-header和accordion-content
    const headers = document.querySelectorAll('.accordion-header');
    const contents = document.querySelectorAll('.accordion-content');
    
    // 切换当前点击的panel
    const contentId = 'left-' + panelName;
    const content = document.getElementById(contentId);
    
    if (content) {
        if (content.style.display === 'none') {
            content.style.display = 'block';
            headerElement.classList.add('active');
        } else {
            content.style.display = 'none';
            headerElement.classList.remove('active');
        }
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        init
    };
}
