// ==========================================
//  GBF 模拟器 - 全局状态模块
// ==========================================

// 武器数据
let allWeapons = [];

// 左侧「武器仓库」属性筛选：'全部' 或 火/水/土/风/光/暗
let inventoryElementFilter = '全部';

// 左侧「角色图鉴」属性筛选
let characterElementFilter = '全部';

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

// 队伍成员状态 (槽位0为主角，其余为空或已选角色数据)
let currentParty = [null, null, null, null, null, null];

// 全局技能映射
let globalSkillMap = {};

// 召唤石数据
let allSummons = [];

// 角色主动技能目录（来自 charaskills.json，id -> 条目）
let globalCharaSkillMap = {};

// Buff 展示配置（来自 buff_icons.json：buff_id -> { icon, title, abbrev }）
let globalBuffIconsMap = {};

// 技能 / 角色 Buff 图鉴条目（来自 charabuff.json，根为数组）
let allCharaBuffs = [];

// 各角色槽位从 Buff 图鉴手动加入的条目（与 charaskills 勾选叠加写入 party.stats）
window.buffCodexPanelRowsBySlot = [[], [], [], [], [], []];

// 特殊加成数据
let specialBuffsData = [];

// 激活的特殊加成
let activeSpecialBuffs = new Set();

// 特殊道具自定义加成（用于如“友谊象征”这类可输入效果）
// 结构：{ [buffId]: { [effectKey]: number } }，数值使用小数（如 3% -> 0.03）
// 约定：未设置/输入无效则不写入该键，计算时回退到 JSON 默认值
let specialBuffCustomValues = {};

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
