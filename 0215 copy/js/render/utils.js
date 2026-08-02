// ==========================================
//  GBF 模拟器 - 渲染模块 - 工具函数
// ==========================================

// 武器类型图标映射
const WEAPON_TYPE_ICONS = {
    'sabre': 'specialty type/武器类型剑.webp',
    'dagger': 'specialty type/武器类型短剑.webp', 
    'spear': 'specialty type/武器类型枪.webp',
    'axe': 'specialty type/武器类型斧.webp',
    'staff': 'specialty type/武器类型杖.webp',
    'gun': 'specialty type/武器类型铳.webp',
    'fist': 'specialty type/武器类型格斗.webp',
    'melee': 'specialty type/武器类型格斗.webp',
    'bow': 'specialty type/武器类型弓.webp',
    'harp': 'specialty type/武器类型乐器.webp',
    'katana': 'specialty type/武器类型刀.webp'
};

// 获取属性颜色
function getElementColor(element) {
    return ELEMENT_COLORS[element] || "#888";
}

// 更新HP显示
function updateHpDisplay(val) {
    const hpDisplay = document.getElementById('hp-display');
    if (hpDisplay) {
        // 当值为1时，表示极限背水(即1点HP)，显示为 "1" 而不是 "1%"
        hpDisplay.innerText = parseInt(val) === 1 ? '1' : val + '%';
    }
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

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        WEAPON_TYPE_ICONS,
        getElementColor,
        updateHpDisplay,
        toggleSection,
        switchTab
    };
}
