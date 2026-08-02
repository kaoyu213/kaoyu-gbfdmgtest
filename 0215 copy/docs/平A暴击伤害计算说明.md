# 平A伤害计算中的暴击伤害 — 计算与显示说明

本文档描述当前项目中**平A（普通攻击）暴击伤害**是如何计算和显示的，便于其他 AI 提出修改意见。

---

## 一、涉及文件

| 文件 | 作用 |
|------|------|
| `js/na_dmg_calc.js` | 平A伤害主逻辑：暴击倍率计算、暴击路径伤害、UI 更新 |
| `js/damage_cap.js` | 伤害上限（衰减 + 增幅），暴击与非暴击共用 |
| `js/ca_dmg_calc.js` | 奥义用同一套暴击倍率逻辑（`getCritMultiplier`），此处不展开 |
| `index1.html` | 暴击按钮、`na-dmg-display-X`、`na-crit-X` 等 DOM |

---

## 二、暴击倍率（totalCritMult）的计算

**位置**：`na_dmg_calc.js` 约 598–604 行，在 `updateDamageDisplay()` 内。

**数据来源**：仅使用 `stats['weapon_critical_hit_rate']`（武器盘等汇总后的“暴击率”，可为小数，且可 >1，即“过量暴击”）。

**公式**：

```js
weaponCritRate = stats['weapon_critical_hit_rate'] || 0
critRate = min(weaponCritRate, 1.0)                    // 有效暴击率（显示用）
overflowCritRate = max(weaponCritRate - 1.0, 0)        // 过量暴击率
excessCritDamageUp = min(overflowCritRate * 0.5, 1.0)  // 过量部分→暴击伤害 up，上限 100%
critBonus = 0.5 + 0.5 * excessCritDamageUp              // 暴击伤害加成（基础 50% + 过量转化）
totalCritMult = 1 + critBonus                           // 暴击乘数，范围 [1.5, 2.0]
```

- 暴击率 ≤100% 时：`totalCritMult = 1.5`（即 50% 暴击伤害 up）。
- 暴击率 >100% 时：超出部分按 50% 比例转为“暴击伤害 up”，最多再 +50%，即 `totalCritMult` 最大 2.0。

**注意**：当前未使用 `weapon_critical_hit_amp`（暴击时伤害增幅）、`chara_artifacts_crit_dmg_cap`（神器暴击时上限）等 stat。

---

## 三、暴击伤害的数值计算流程

平A暴击**不重新跑整条 Step1–Step12**，而是在“防御前一步”的数值上乘暴击倍率再除防御，然后走与非暴击相同的**伤害上限（衰减 + 增幅）**和**伤害上升（supp）**。

### 3.1 防御前基数（无暴击）

- 来自 `calculateDamage()` 的 `logs` 中名为 **「随机补正」** 的那一步的 `value`。
- 无克属：`preDefNormalVal`
- 克属：`preDefAdvVal`

即：面板 → 各乘区 → 随机补正后的值，**尚未除以防御**。

### 3.2 暴击路径的“防御后 raw”

```js
rawCritPostDefNormal = round(preDefNormalVal * totalCritMult / effectiveDefense)
rawCritPostDefAdv    = round(preDefAdvVal    * totalCritMult / effectiveDefense)
```

`effectiveDefense` 与平A非暴击一致：`defense * (1 - defenseDown/100) * (1 - weapon_def_ignore)`。

### 3.3 伤害上限与最终暴击伤害

- 对 `rawCritPostDefNormal`、`rawCritPostDefAdv` 分别调用  
  `applyDamageCap(rawCritPostDef, stats, 'na', teshuStats, extraAmp, capOptions)`  
  与非暴击相同：同一套 `calculateTotalCap`、`funcDecay`、`calculateAmp`，**没有**为暴击单独使用神器暴击上限或暴击增幅。
- 最终暴击伤害：
  - `critFinalNormal = capCritResultNormal.finalDamage + total_supp`
  - `critFinalAdv = capCritResultAdv.finalDamage + total_supp`  
  其中 `total_supp = dmg_supp + na_dmg_supp`（伤害上升固定值）。

---

## 四、暴击在界面上的显示

### 4.1 主显示：平A预测伤害（`na-dmg-display-X`）

- **逻辑**：根据 `window.damageViewStates[charIndex].isCrit`（暴击拨片）和 `isAdvantage`（克属）四选一：
  - 克属 + 暴击 → `critFinalAdv`
  - 克属 + 非暴击 → `naDmgAdvantage`
  - 非克属 + 暴击 → `critFinalNormal`
  - 非克属 + 非暴击 → `naDmgNormal`
- 显示为 `innerHTML = finalNa.toLocaleString()`。
- 若当前为暴击显示，会为该元素加上 class `is-crit`，用于样式高亮。

### 4.2 暴击按钮（`.crit-btn`）

- 文案：暴击时显示 `暴击(暴击率%)`，非暴击时显示 `非暴击(暴击率%)`。
- 暴击率来自 `stats['weapon_critical_hit_rate']`，显示为百分比（如 18.0%）。

### 4.3 理论伤害（`na-theory-X`）

- 同样根据 `isCritToggle` 和克属，在非暴击理论值 / 暴击理论值之间切换。
- 暴击理论值：  
  `theoryCritNormal = floor(rawCritPostDefNormal * (1 + ampCoef) + 0.5) + total_supp`  
  克属同理用 `rawCritPostDefAdv` 和对应 `ampCoef`。

### 4.4 「暴击伤害」单独一行（`id="na-crit-X"`）

- 在 `index1.html` 中存在「暴击伤害:」标签和 `<span class="value" id="na-crit-0">` 等（如 na-crit-0～na-crit-5）。
- 在当前代码中**没有**找到对 `na-crit-X` 的 `innerHTML` / `textContent` 赋值，因此该行很可能一直显示为初始的「-」，并未单独展示暴击伤害数值。

---

## 五、与奥义暴击的一致性

- `ca_dmg_calc.js` 中的 `getCritMultiplier(stats)` 与上述暴击倍率逻辑一致（同样只用 `weapon_critical_hit_rate` 和过量 0.5 转化）。
- 奥义公式中暴击是「基础奥义伤害 × (1+暴击倍率)」，再叠伤害上升、增幅等，与平A在“暴击乘数”含义上一致，仅在公式所处阶段不同。

---

## 六、当前未参与平A暴击的部分（供修改参考）

1. **暴击时伤害增幅**  
   `weapon_critical_hit_amp`（以及 constants 中的“暴击时伤害增幅”）未在平A暴击路径中使用。

2. **神器暴击时上限**  
   `chara_artifacts_crit_dmg_cap` 未在 `applyDamageCap` 或平A暴击分支中参与总上限或单独上限计算。

3. **暴击伤害单独展示**  
   `na-crit-X` 未在 `updateDamageDisplay`（或其它可见逻辑）中被写入，若需单独展示“暴击伤害”数值，需要在此处或等价位置增加赋值。

4. **暴击率来源**  
   当前仅用 `weapon_critical_hit_rate`；若存在戒指/耳饰/神器/LB 等暴击率（如 `chara_ring_critical_hit_rate` 等），需确认是否已汇总进该 stat，或是否要在暴击率/暴击伤害公式中单独参与。

---

## 七、小结（给另一个 AI 的要点）

- **暴击倍率**：仅由 `weapon_critical_hit_rate` 决定；过量暴击按 50% 转为暴击伤害 up，倍率在 1.5～2.0。
- **暴击伤害数值**：防御前取「随机补正」值 × 暴击倍率 ÷ 防御 → 再经同一套上限（衰减+增幅）→ 再加 `total_supp`。
- **显示**：主数值和理论伤害都随暴击/非暴击拨片切换；`na-crit-X` 未赋值；暴击相关 stat 如 `weapon_critical_hit_amp`、`chara_artifacts_crit_dmg_cap` 未参与平A暴击计算。

如需修改“暴击伤害如何计算、如何展示”，可从上述未实现项和 `na_dmg_calc.js` 中 `updateDamageDisplay` 的暴击相关段落入手。
