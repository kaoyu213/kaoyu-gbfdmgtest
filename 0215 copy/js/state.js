// ==========================================
//  GBF 模拟器 - 全局状态模块
// ==========================================

// 武器数据
let allWeapons = [];

// 职业数据
let allClasses = [];

// 角色数据
let allCharacters = [];

// 当前武器盘 (10个槽位，额外3个槽位索引10-12)
let currentGrid = new Array(10).fill(null);

// 当前召唤石盘 (8个槽位: 主召, 友召, Sum1-4, Sub1-2)
let currentSummons = new Array(8).fill(null);

// 额外武器栏开关 (默认开启，显示13格)
let extraSlotsEnabled = false;

// 全局技能映射
let globalSkillMap = {};

// 召唤石数据
let allSummons = [];

// 特殊加成数据
let specialBuffsData = [];

// 激活的特殊加成
let activeSpecialBuffs = new Set();

// 特殊加成总效果对象
let currentSpecialTotalStats = {};

// 当前主角状态
let currentMC = {
    jobId: null,
    proficiency: [],
    bonuses: {},
    battleBonuses: ""
};

// 导出状态管理对象
const State = {
    // 获取武器数据
    getWeapons: () => allWeapons,
    setWeapons: (weapons) => { allWeapons = weapons; },
    
    // 获取职业数据
    getClasses: () => allClasses,
    setClasses: (classes) => { allClasses = classes; },
    
    // 获取角色数据
    getCharacters: () => allCharacters,
    setCharacters: (characters) => { allCharacters = characters; },
    
    // 获取当前武器盘
    getGrid: () => currentGrid,
    setGrid: (grid) => { currentGrid = grid; },
    
    // 获取技能映射
    getSkillMap: () => globalSkillMap,
    setSkillMap: (map) => { globalSkillMap = map; },
    
    // 获取特殊加成数据
    getSpecialBuffsData: () => specialBuffsData,
    setSpecialBuffsData: (data) => { specialBuffsData = data; },
    
    // 获取激活的特殊加成
    getActiveSpecialBuffs: () => activeSpecialBuffs,
    
    // 切换特殊加成
    toggleSpecialBuff: (id) => {
        if (activeSpecialBuffs.has(id)) {
            activeSpecialBuffs.delete(id);
        } else {
            activeSpecialBuffs.add(id);
        }
    },
    
    // 获取当前主角状态
    getCurrentMC: () => currentMC,
    setCurrentMC: (mc) => { currentMC = mc; },
    
    // 初始化空武器盘
    initGrid: () => {
        currentGrid = new Array(10).fill(null);
    },
    
    // 清空武器盘
    clearGrid: () => {
        currentGrid.fill(null);
    }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = State;
}
