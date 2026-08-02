// ==========================================
//  GBF 模拟器 - 渲染模块 - 入口文件
// ==========================================

// 引入各个子模块（通过全局函数方式）
// 各模块的函数已经挂载到全局作用域

// 导出所有渲染函数供外部使用
// 注意：由于使用全局函数方式，无需额外导出
// 此文件主要用于文档和模块组织

// 已拆分的模块：
// - utils.js: 工具函数 (WEAPON_TYPE_ICONS, getElementColor, updateHpDisplay, toggleSection, switchTab)
// - mc.js: 主角/职业相关 (renderMCSelector, updateMCJob, renderBonusDisplay, renderGlobalMastery)
// - summon.js: 召唤石相关 (renderSummons, renderMainSummonSlots, renderSummonSlots, parseSummonEffects, etc.)
// - grid.js: 武器盘相关 (renderInventory, renderGrid, addToGrid, removeFromGrid, etc.)
// - character.js: 角色相关 (renderCharacters, renderCharPanelStats)
// - charabuff.js: Buff 图鉴 (renderCharaBuffCatalog；点击加入 buffCodexPanelRowsBySlot，数据 charabuff.json)
// - bonus.js: 加成显示相关 (renderSpecialTab, toggleSpecialBuff, renderResidentBonuses, renderDetailedBreakdown, etc.)

// 如果需要使用模块化方式，可以取消下面注释：
/*
import * as utils from './utils.js';
import * as mc from './mc.js';
import * as summon from './summon.js';
import * as grid from './grid.js';
import * as character from './character.js';
import * as bonus from './bonus.js';

export default {
    ...utils,
    ...mc,
    ...summon,
    ...grid,
    ...character,
    ...bonus
};
*/
