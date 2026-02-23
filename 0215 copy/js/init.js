// ==========================================
//  GBF 模拟器 - 初始化模块
// ==========================================

// 初始化应用
async function init() {
    try {
        // === FETCH 增加 teshujiacheng.json ===
        const [wRes, sRes, cRes, charaRes, specialRes, summonRes] = await Promise.all([
            fetch('./weapons.json'), 
            fetch('./skills.json'),
            fetch('./classes.json'),
            fetch('./chara.json'),
            fetch('./teshujiacheng.json'),
            fetch('./summons.json') 
        ]);

        const wRaw = await wRes.json();
        const sRaw = await sRes.json();
        const cRaw = await cRes.json();
        const charaRaw = await charaRes.json();
        const specialRaw = await specialRes.json();
        const summonRaw = await summonRes.json();
        
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
        renderGrid();
        
        if(allClasses.length > 0) updateMCJob(allClasses[0].id);
        else recalculate();

        // 检查是否有保存的配置
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            console.log('发现保存的配置:', data.version || '未知版本');
            
            // 可选：自动加载（注释掉下面这行，如果你不希望自动加载）
            // setTimeout(() => loadFromLocal(), 500);
        }
        
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
