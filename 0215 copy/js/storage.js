// ==========================================
//  GBF 模拟器 - 存储管理模块
// ==========================================

// 保存配置到本地存储（silent 为 true 时不显示“已保存”提示，用于等级等自动保存）
function saveToLocal(silent) {
    try {
        const saveData = {
            version: CONFIG_VERSION,
            timestamp: new Date().toISOString(),
            lastModified: new Date().toLocaleString(),
            
            // 1. 武器盘数据
            grid: currentGrid.map((w, index) => {
                if (!w) return null;
                
                return {
                    uid: w._uid,
                    name: w.name,
                    selectedSlvl: w.userSelectedSlvl,
                    slotChoices: {...w.userSlotChoices},
                    plusMarks: w.plusMarks || 0,
                    position: index,
                    type: w.type,
                    element: w.element
                };
            }),
            
            // 2. 主角配置
            mc: {
                jobId: currentMC.jobId,
                rank: parseInt(document.getElementById('mc-rank-input')?.value) || 406,
                lbSlots: (typeof getMcLbSelections === 'function') ? getMcLbSelections() : []
            },
            
            // 3. 神石设置
            auras: {
                optimus: document.getElementById('aura-optimus')?.value || '0',
                magna: document.getElementById('aura-magna')?.value || '0',
                jinzhou: document.getElementById('aura-jinzhou')?.value || '0',
                elemental: document.getElementById('aura-elemental')?.value || '0'
            },
            
            // 4. 召唤石设置
            summon: {
                atk: document.getElementById('summon-atk')?.value || '4652',
                hp: document.getElementById('summon-hp')?.value || '1513',
                slots: currentSummons
            },
            
            // 5. 特殊加成
            specialBuffs: Array.from(activeSpecialBuffs),

            // 5.1 特殊道具自定义加成（如：友谊象征 dmg_amp 可输入）
            specialBuffCustomValues: (typeof specialBuffCustomValues !== 'undefined' && specialBuffCustomValues)
                ? specialBuffCustomValues
                : {},
            
            // 6. HP百分比设置
            hpPercent: document.getElementById('current-hp-slider')?.value || '100',
            
            // 7. 当前选项卡
            activeTab: document.querySelector('.tab-btn.active')?.innerText || '角色设定',
            
            // 8. 额外武器栏开关状态
            extraSlotsEnabled: extraSlotsEnabled,
            
            // 9. 队伍角色编成 (仅保存角色名称以便重建)
            party: typeof currentParty !== 'undefined' ? currentParty.map(c => c ? c['名称'] : null) : Array(6).fill(null)
        };
        
        // 压缩数据（去除undefined和null值）
        const compressedData = JSON.parse(JSON.stringify(saveData));
        
        // 存储到当前用户对应的 key
        const key = typeof getUserStorageKey === 'function' ? getUserStorageKey() : STORAGE_KEY;
        localStorage.setItem(key, JSON.stringify(compressedData, null, 2));
        
        if (!silent) showNotification('配置已保存到本地！', 'success');
        console.log('配置已保存:', compressedData);
        
        return true;
    } catch (error) {
        console.error('保存配置时出错:', error);
        showNotification('保存失败: ' + error.message, 'error');
        return false;
    }
}

// 从本地存储加载配置（silent 为 true 时不弹确认、不提示未找到，用于切换用户/首次打开时自动加载）
function loadFromLocal(silent) {
    try {
        const key = typeof getUserStorageKey === 'function' ? getUserStorageKey() : STORAGE_KEY;
        const saved = localStorage.getItem(key);
        if (!saved) {
            if (!silent) showNotification('未找到保存的配置', 'warning');
            return false;
        }
        
        let data;
        try {
            data = JSON.parse(saved);
        } catch (e) {
            if (!silent) showNotification('配置文件格式错误', 'error');
            return false;
        }
        
        if (!silent && !confirm(`发现保存的配置 (版本: ${data.version || '未知'})\n是否加载？`)) {
            return false;
        }
        
        // 1. 恢复武器盘
        currentGrid.fill(null); // 清空当前武器盘
        
        if (!data.grid || !Array.isArray(data.grid)) {
            data.grid = [];
        }
        
        data.grid.forEach(slotData => {
            if (slotData && slotData.uid !== null && slotData.uid !== undefined) {
                const weaponData = allWeapons.find(w => w._uid === slotData.uid);
                if (weaponData) {
                    const weaponCopy = JSON.parse(JSON.stringify(weaponData));
                    
                    // 应用用户设置
                    weaponCopy.userSelectedSlvl = slotData.selectedSlvl || weaponCopy.userSelectedSlvl;
                    weaponCopy.userSlotChoices = slotData.slotChoices || weaponCopy.userSlotChoices;
                    weaponCopy.plusMarks = slotData.plusMarks || 0;
                    
                    // 放置到正确位置
                    const position = slotData.position !== undefined ? slotData.position : currentGrid.indexOf(null);
                    if (position >= 0 && position < currentGrid.length) {
                        currentGrid[position] = weaponCopy;
                    } else {
                        // 如果位置无效，找到第一个空位
                        const emptyIndex = currentGrid.indexOf(null);
                        if (emptyIndex !== -1) {
                            currentGrid[emptyIndex] = weaponCopy;
                        }
                    }
                }
            }
        });
        
        // 2. 恢复主角配置
        if (data.mc) {
            const rankVal = data.mc.rank || 406;
            document.querySelectorAll('[id="mc-rank-input"]').forEach(el => { el.value = rankVal; });
            
            if (typeof ensureMcLbUI === 'function') ensureMcLbUI();
            if (Array.isArray(data.mc.lbSlots)) {
                data.mc.lbSlots.forEach((slot, i) => {
                    const typeEl = document.getElementById(`mc-lb-type-${i}`);
                    const lvlEl = document.getElementById(`mc-lb-lvl-${i}`);
                    if (typeEl) typeEl.value = slot.type || 'none';
                    if (lvlEl) lvlEl.value = String(slot.lvl || 0);
                });
            }
            
            // 恢复职业
            if (data.mc.jobId) {
                const jobExists = allClasses.some(c => c.id === data.mc.jobId);
                if (jobExists) {
                    updateMCJob(data.mc.jobId);
                }
            }
        }
        
        // 3. 恢复神石设置
        if (data.auras) {
            const auraOptimus = document.getElementById('aura-optimus');
            const auraMagna = document.getElementById('aura-magna');
            const auraJinzhou = document.getElementById('aura-jinzhou');
            const auraElemental = document.getElementById('aura-elemental');
            if (auraOptimus) auraOptimus.value = data.auras.optimus || '0';
            if (auraMagna) auraMagna.value = data.auras.magna || '0';
            if (auraJinzhou) auraJinzhou.value = data.auras.jinzhou || '0';
            if (auraElemental) auraElemental.value = data.auras.elemental || '0';
        }
        
        // 4. 恢复召唤石设置
        if (data.summon) {
            const summonAtk = document.getElementById('summon-atk');
            const summonHp = document.getElementById('summon-hp');
            if (summonAtk) summonAtk.value = data.summon.atk || '4652';
            if (summonHp) summonHp.value = data.summon.hp || '1513';
            
            // 恢复召唤石槽位
            if (data.summon.slots && Array.isArray(data.summon.slots)) {
                // 深拷贝以避免引用问题
                currentSummons = JSON.parse(JSON.stringify(data.summon.slots));
                // 确保长度为8
                if (currentSummons.length < 8) {
                    currentSummons = currentSummons.concat(new Array(8 - currentSummons.length).fill(null));
                } else if (currentSummons.length > 8) {
                    currentSummons = currentSummons.slice(0, 8);
                }
                
                // 更新UI
                try { renderMainSummonSlots(); } catch(e) { console.error('renderMainSummonSlots error:', e); }
                try { renderSummonSlots(); } catch(e) { console.error('renderSummonSlots error:', e); }
                try { updateAuraFromSummons(); } catch(e) { console.error('updateAuraFromSummons error:', e); }
            }
        }
        
        // 5. 恢复特殊加成（按用户独立：空数组表示该用户全部未勾选）
        if (Array.isArray(data.specialBuffs)) {
            activeSpecialBuffs.clear();
            if (specialBuffsData && Array.isArray(specialBuffsData)) {
                data.specialBuffs.forEach(id => {
                    if (specialBuffsData.some(b => b.id === id)) {
                        activeSpecialBuffs.add(id);
                    }
                });
            }
        }

        // 5.1 恢复特殊道具自定义加成（按用户独立存档）
        if (typeof specialBuffCustomValues === 'undefined') {
            window.specialBuffCustomValues = {};
        }
        if (data.specialBuffCustomValues && typeof data.specialBuffCustomValues === 'object') {
            // 深拷贝避免引用问题
            specialBuffCustomValues = JSON.parse(JSON.stringify(data.specialBuffCustomValues));
        } else {
            specialBuffCustomValues = {};
        }
        
        // 6. 恢复HP百分比
        if (data.hpPercent) {
            const hpSlider = document.getElementById('current-hp-slider');
            const hpDisplay = document.getElementById('hp-display');
            if (hpSlider) hpSlider.value = data.hpPercent;
            if (hpDisplay) hpDisplay.innerText = data.hpPercent + "%";
        }
        
        // 7. 恢复选项卡
        if (data.activeTab) {
            const tabButtons = document.querySelectorAll('.tab-btn');
            tabButtons.forEach(btn => {
                if (btn.innerText.trim() === data.activeTab.trim()) {
                    btn.click();
                }
            });
        }
        
        // 8. 恢复额外武器栏开关状态
        if (data.extraSlotsEnabled !== undefined) {
            extraSlotsEnabled = data.extraSlotsEnabled;
            const statusEl = document.getElementById('extra-slots-status');
            if (statusEl) {
                if (extraSlotsEnabled) {
                    statusEl.textContent = 'ON';
                    statusEl.style.color = '#2ecc71';
                } else {
                    statusEl.textContent = 'OFF';
                    statusEl.style.color = '#e74c3c';
                }
            }
        }
        
        // 9. 恢复队伍编成（槽位 1～5）：按存档中的角色名称在 chara 中匹配；戒指/LB 等仍按角色名+用户独立 key 在 loadCharacterBonusFromLocal 中加载
        if (typeof currentParty === 'undefined') {
            window.currentParty = Array(6).fill(null);
        }
        for (let i = 1; i <= 5; i++) {
            currentParty[i] = null;
        }
        const partyNames = (data.party && Array.isArray(data.party)) ? data.party : null;
        if (partyNames && typeof allCharacters !== 'undefined' && Array.isArray(allCharacters)) {
            for (let i = 1; i <= 5 && i < partyNames.length; i++) {
                const nm = partyNames[i];
                if (nm == null || nm === '') continue;
                const found = allCharacters.find(c => c && c['名称'] === nm);
                if (found) {
                    currentParty[i] = found;
                }
            }
        }
        for (let i = 1; i <= 5; i++) {
            try { if (typeof updateCharSlotUI === 'function') updateCharSlotUI(i); } catch(e) {}
        }
        
        // 重新渲染并计算
        try { renderGrid(); } catch(e) { console.error('renderGrid error:', e); }
        try { renderSpecialTab(); } catch(e) { console.error('renderSpecialTab error:', e); }
        try { recalculate(); } catch(e) { console.error('recalculate error:', e); }
        
        // 加载后始终选中主角槽，避免误显示为角色2等
        const slot0Btn = document.querySelector('.char-slot-btn[data-slot="0"]');
        if (slot0Btn && typeof slot0Btn.click === 'function') {
            slot0Btn.click();
        }
        
        if (!silent) {
            const lastModified = data.lastModified || data.timestamp;
            showNotification(`配置已加载 (最后修改: ${lastModified})`, 'success');
        }
        return true;
    } catch (error) {
        console.error('加载配置时出错:', error);
        if (!silent) showNotification('加载失败: ' + error.message, 'error');
        return false;
    }
}

// 导出配置为JSON文件（导出当前用户的配置）
function exportConfig() {
    try {
        const key = typeof getUserStorageKey === 'function' ? getUserStorageKey() : STORAGE_KEY;
        const saved = localStorage.getItem(key);
        if (!saved) {
            showNotification('没有可导出的配置，请先保存', 'warning');
            return;
        }
        
        const data = JSON.parse(saved);
        
        // 添加额外信息
        data.exportInfo = {
            exportedAt: new Date().toISOString(),
            app: 'GBF模拟器 v5.0',
            note: '请在GBF模拟器中使用"导入配置"功能加载此文件'
        };
        
        // 创建Blob并下载
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        // 生成文件名
        const timestamp = new Date().toISOString().slice(0,10).replace(/-/g, '');
        const fileName = `gbf_sim_config_${timestamp}_v${CONFIG_VERSION}.json`;
        
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification(`配置已导出为: ${fileName}`, 'success');
    } catch (error) {
        console.error('导出配置时出错:', error);
        showNotification('导出失败: ' + error.message, 'error');
    }
}

// 导入配置文件
function importConfig() {
    try {
        // 创建文件输入元素
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = function(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const importedData = JSON.parse(e.target.result);
                    
                    // 验证文件格式
                    if (!importedData.grid || !importedData.mc) {
                        throw new Error('无效的配置文件格式');
                    }
                    
                    // 询问用户是否导入
                    if (confirm(`发现配置文件 (版本: ${importedData.version || '未知'})\n是否导入并覆盖当前用户配置？`)) {
                        const key = typeof getUserStorageKey === 'function' ? getUserStorageKey() : STORAGE_KEY;
                        localStorage.setItem(key, JSON.stringify(importedData, null, 2));
                        loadFromLocal(true);
                        showNotification('配置已成功导入', 'success');
                    }
                } catch (error) {
                    console.error('导入配置时出错:', error);
                    showNotification('导入失败: ' + error.message, 'error');
                }
            };
            
            reader.readAsText(file);
        };
        
        input.click();
    } catch (error) {
        console.error('创建文件输入时出错:', error);
        showNotification('导入失败: ' + error.message, 'error');
    }
}

// 导出配置到剪贴板（包含面板数据和伤害计算结果）
function exportToClipboard() {
    try {
        // 获取面板数据
        const panelAtkEl = document.getElementById('char-panel-atk-0');
        const panelHpEl = document.getElementById('char-panel-hp-0');
        const gridAtkEl = document.getElementById('char-grid-atk-0');
        const gridHpEl = document.getElementById('char-grid-hp-0');
        
        // 获取伤害计算结果
        const baseDmgEl = document.getElementById('base-dmg');
        const naDmgEl = document.getElementById('na-dmg');
        const caDmgEl = document.getElementById('ca-dmg');
        
        // 获取伤害设置
        const weaknessToggle = document.getElementById('weakness-toggle');
        const defInput = document.getElementById('def-input');
        const randomBtnGroup = document.getElementById('random-btn-group');
        
        // 获取随机补正值
        let randomFactor = 1;
        if (randomBtnGroup) {
            const activeBtn = randomBtnGroup.querySelector('button.active');
            if (activeBtn) {
                randomFactor = parseFloat(activeBtn.getAttribute('data-value')) || 1;
            }
        }
        
        // 获取防御值与防down
        const defense = parseInt(defInput?.value) || 10;
        const defDownInput = document.getElementById('def-down-input');
        const defenseDown = Math.min(80, Math.max(0, parseInt(defDownInput?.value) || 0));
        
        // 获取角色stats
        const stats = {};
        if (typeof party !== 'undefined' && party[0]) {
            STAT_CONFIG.forEach(cfg => {
                stats[cfg.key] = party[0].stats[cfg.key] || 0;
            });
        }
        if (typeof overlayCharaEarringElementAtkFromParty === 'function') {
            overlayCharaEarringElementAtkFromParty(stats, 0);
        }
        if (typeof overlayCharaLbElementAtkFromParty === 'function') {
            overlayCharaLbElementAtkFromParty(stats, 0);
        }
        const weaponDefIgnore = Math.min(0.3, Math.max(0, Number(stats['weapon_def_ignore']) || 0));
        const effectiveDefense = defense * (1 - defenseDown / 100) * (1 - weaponDefIgnore);
        
        // 获取饰品加成
        const teshuStats = getTeshuStats();
        
        // 收集调试信息
        let debugInfo = {
            noWeakness: null,
            withWeakness: null,
            multipliers: {}
        };

        // 计算无弱点时伤害
        try {
            const resultNoWeakness = calculateDamage(
                parseInt(panelAtkEl?.innerText.replace(/,/g, '') || '0'),
                stats,
                parseInt(document.getElementById('current-hp-slider')?.value || 100),
                { isAdvantage: false, defense: defense, defenseDown: defenseDown, randomFactor: randomFactor }
            );
            
            // 获取基础伤害（不含防御）
            let eleDmgNoWeakness = 0;
            for (let i = 0; i < resultNoWeakness.logs.length; i++) {
                if (resultNoWeakness.logs[i].name === "属攻+克属") {
                    eleDmgNoWeakness = resultNoWeakness.logs[i].value;
                    break;
                }
            }
            const baseDmgNoWeakness = gameRound(eleDmgNoWeakness * randomFactor);
            
            // 获取伤害增幅
            const dmg_amp = aggregateZoneValue('dmg_amp', stats, teshuStats);
            const normal_dmg_amp = aggregateZoneValue('normal_dmg_amp', stats, teshuStats);
            // c5职业job_na_amp为0，非C5 使用当前用户的 defaultMastery（用户2 可为 0）
            const currentJob = allClasses.find(c => c.id === currentMC.jobId);
            const isClass5 = currentJob && currentJob.type === 'class_5';
            const job_na_amp = isClass5 ? 0 : (typeof getDefaultMastery === 'function' ? (getDefaultMastery()['mc_na_dmg_amp_passive_non_c5'] || 0) : 0.03);
            const total_amp = 1 + dmg_amp + job_na_amp + normal_dmg_amp;
            
            debugInfo.noWeakness = {
                logs: resultNoWeakness.logs,
                baseDmg: baseDmgNoWeakness,
                finalNA: finalRound(baseDmgNoWeakness * total_amp, effectiveDefense)
            };
            
            debugInfo.multipliers.noWeakness = {
                dmg_amp, normal_dmg_amp, job_na_amp, total_amp
            };

        } catch(e) {
            console.error('计算无弱点伤害失败:', e);
        }
        
        // 计算有弱点时伤害
        try {
            const resultWithWeakness = calculateDamage(
                parseInt(panelAtkEl?.innerText.replace(/,/g, '') || '0'),
                stats,
                parseInt(document.getElementById('current-hp-slider')?.value || 100),
                { isAdvantage: true, defense: defense, defenseDown: defenseDown, randomFactor: randomFactor }
            );
            
            // 获取基础伤害（不含防御）
            let eleDmgWithWeakness = 0;
            for (let i = 0; i < resultWithWeakness.logs.length; i++) {
                if (resultWithWeakness.logs[i].name === "属攻+克属") {
                    eleDmgWithWeakness = resultWithWeakness.logs[i].value;
                    break;
                }
            }
            const baseDmgWithWeakness = gameRound(eleDmgWithWeakness * randomFactor);
            
            // 获取伤害增幅
            const dmg_amp = aggregateZoneValue('dmg_amp', stats, teshuStats);
            const normal_dmg_amp = aggregateZoneValue('normal_dmg_amp', stats, teshuStats);
            const dmg_to_elemental_amp = aggregateZoneValue('dmg_to_elemental_amp', stats, teshuStats);
            // c5职业job_na_amp为0，非C5 使用当前用户的 defaultMastery（用户2 可为 0）
            const currentJob = allClasses.find(c => c.id === currentMC.jobId);
            const isClass5 = currentJob && currentJob.type === 'class_5';
            const job_na_amp = isClass5 ? 0 : (typeof getDefaultMastery === 'function' ? (getDefaultMastery()['mc_na_dmg_amp_passive_non_c5'] || 0) : 0.03);
            const total_amp = 1 + dmg_amp + job_na_amp + normal_dmg_amp + dmg_to_elemental_amp;
            
            debugInfo.withWeakness = {
                logs: resultWithWeakness.logs,
                baseDmg: baseDmgWithWeakness,
                finalNA: finalRound(baseDmgWithWeakness * total_amp, effectiveDefense)
            };

            debugInfo.multipliers.withWeakness = {
                dmg_amp, normal_dmg_amp, dmg_to_elemental_amp, job_na_amp, total_amp
            };

        } catch(e) {
            console.error('计算有弱点伤害失败:', e);
        }
        
        // 构建完整配置数据
        const saveData = {
            // 版本信息
            version: CONFIG_VERSION,
            timestamp: new Date().toISOString(),
            
            // 武器盘数据
            grid: currentGrid.map((w, index) => {
                if (!w) return null;
                return {
                    uid: w._uid,
                    name: w.name,
                    selectedSlvl: w.userSelectedSlvl,
                    slotChoices: {...w.userSlotChoices},
                    position: index,
                    type: w.type,
                    element: w.element
                };
            }),
            
            // 主角配置
            mc: {
                jobId: currentMC.jobId,
                rank: parseInt(document.getElementById('mc-rank-input')?.value) || 404,
                lbSlots: (typeof getMcLbSelections === 'function') ? getMcLbSelections() : []
            },
            
            // 神石设置
            auras: {
                optimus: document.getElementById('aura-optimus')?.value || '0',
                magna: document.getElementById('aura-magna')?.value || '0',
                jinzhou: document.getElementById('aura-jinzhou')?.value || '0',
                elemental: document.getElementById('aura-elemental')?.value || '0'
            },
            
            // 召唤石设置
            summon: {
                atk: document.getElementById('summon-atk')?.value || '4652',
                hp: document.getElementById('summon-hp')?.value || '1513',
                slots: currentSummons
            },
            
            // 特殊加成
            specialBuffs: Array.from(activeSpecialBuffs),
            
            // HP百分比
            hpPercent: document.getElementById('current-hp-slider')?.value || '100',
            
            // 面板数据
            panelData: {
                panelAtk: panelAtkEl ? panelAtkEl.innerText.replace(/,/g, '') : '0',
                panelHp: panelHpEl ? panelHpEl.innerText.replace(/,/g, '') : '0',
                gridAtk: gridAtkEl ? gridAtkEl.innerText.replace(/,/g, '') : '0',
                gridHp: gridHpEl ? gridHpEl.innerText.replace(/,/g, '') : '0'
            },
            
            // 当前伤害设置的结果
            damageResult: {
                baseDmg: baseDmgEl ? baseDmgEl.innerText.replace(/,/g, '') : '0',
                naDmg: naDmgEl ? naDmgEl.innerText.replace(/,/g, '') : '0',
                caDmg: caDmgEl ? caDmgEl.innerText.replace(/,/g, '') : '0'
            },
            
            // 伤害设置
            damageSettings: {
                weakness: weaknessToggle?.checked || false,
                defense: defense.toString(),
                defenseDown: defenseDown,
                randomFactor: randomFactor
            },
            
            // 调试信息 (替代原来的 damageComparison)
            debugInfo: debugInfo
        };
        
        const configJson = JSON.stringify(saveData, null, 2);
        
        // 复制到剪贴板
        navigator.clipboard.writeText(configJson).then(() => {
            showNotification('配置已复制到剪贴板！', 'success');
            console.log('配置已复制:', saveData);
        }).catch(err => {
            console.error('复制到剪贴板失败:', err);
            showNotification('复制失败: ' + err.message, 'error');
        });
    } catch (error) {
        console.error('导出到剪贴板时出错:', error);
        showNotification('导出失败: ' + error.message, 'error');
    }
}

// 重置配置
function resetConfig() {
    if (!confirm('确定要重置所有配置吗？这会清除所有武器盘和设置。')) {
        return;
    }
    
    try {
        // 清除武器盘
        currentGrid.fill(null);
        
        // 重置主角设置
        const mcRankInput = document.getElementById('mc-rank-input');
        if (mcRankInput) mcRankInput.value = '404';
        if (typeof ensureMcLbUI === 'function') ensureMcLbUI();
        for (let i = 0; i < 20; i++) {
            const typeEl = document.getElementById(`mc-lb-type-${i}`);
            const lvlEl = document.getElementById(`mc-lb-lvl-${i}`);
            if (typeEl) typeEl.value = 'none';
            if (lvlEl) lvlEl.value = '0';
        }
        
        // 重置神石设置
        const auraOptimus = document.getElementById('aura-optimus');
        const auraMagna = document.getElementById('aura-magna');
        const auraJinzhou = document.getElementById('aura-jinzhou');
        const auraElemental = document.getElementById('aura-elemental');
        if (auraOptimus) auraOptimus.value = '0';
        if (auraMagna) auraMagna.value = '0';
        if (auraJinzhou) auraJinzhou.value = '0';
        if (auraElemental) auraElemental.value = '0';
        
        // 重置召唤石设置
        const summonAtk = document.getElementById('summon-atk');
        const summonHp = document.getElementById('summon-hp');
        if (summonAtk) summonAtk.value = '4652';
        if (summonHp) summonHp.value = '1513';
        
        // 重置特殊加成
        activeSpecialBuffs.clear();
        
        // 重置HP滑块
        const hpSlider = document.getElementById('current-hp-slider');
        const hpDisplay = document.getElementById('hp-display');
        if (hpSlider) hpSlider.value = '100';
        if (hpDisplay) hpDisplay.innerText = '100%';
        
        // 重置职业
        if (allClasses.length > 0) {
            updateMCJob(allClasses[0].id);
        }
        
        // 清空当前用户的本地存储
        const key = typeof getUserStorageKey === 'function' ? getUserStorageKey() : STORAGE_KEY;
        localStorage.removeItem(key);
        
        // 重新渲染
        renderGrid();
        renderSpecialTab();
        recalculate();
        
        showNotification('配置已重置', 'success');
    } catch (error) {
        console.error('重置配置时出错:', error);
        showNotification('重置失败: ' + error.message, 'error');
    }
}

// 设置自动保存
function setupAutoSave() {
    // 监听重要变化事件
    const autoSaveElements = [
        'aura-optimus', 'aura-magna', 'aura-jinzhou', 'aura-elemental',
        'mc-rank-input',
        'summon-atk', 'summon-hp', 'current-hp-slider'
    ];
    
    autoSaveElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', function() {
                if (autoSaveEnabled) {
                    setTimeout(saveToLocal, 100); // 延迟保存，避免频繁操作
                }
            });
        }
    });

    document.querySelectorAll('.mc-lb-type-select, .mc-lb-level-select').forEach(element => {
        element.addEventListener('change', function() {
            if (autoSaveEnabled) {
                setTimeout(saveToLocal, 100);
            }
        });
    });
    
    // 监听武器盘变化（通过自定义事件）
    window.addEventListener('weaponGridChanged', function() {
        if (autoSaveEnabled) {
            setTimeout(saveToLocal, 100);
        }
    });
    
    // 监听特殊加成变化
    window.addEventListener('specialBuffsChanged', function() {
        if (autoSaveEnabled) {
            setTimeout(saveToLocal, 100);
        }
    });
}

// 显示通知消息
function showNotification(message, type = 'info') {
    try {
        // 移除现有的通知
        const existingNotification = document.getElementById('gbf-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // 创建通知元素
        const notification = document.createElement('div');
        notification.id = 'gbf-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
            max-width: 300px;
            word-wrap: break-word;
        `;
        
        // 根据类型设置样式
        switch(type) {
            case 'success':
                notification.style.background = 'linear-gradient(135deg, #2ecc71, #27ae60)';
                break;
            case 'error':
                notification.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
                break;
            case 'warning':
                notification.style.background = 'linear-gradient(135deg, #f39c12, #d35400)';
                break;
            default:
                notification.style.background = 'linear-gradient(135deg, #3498db, #2980b9)';
        }
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // 3秒后自动移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease-out';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, 3000);
        
        // 添加点击移除功能
        notification.onclick = function() {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        };
    } catch (e) {
        console.error('showNotification error:', e);
        // 如果通知失败，静默失败，不影响主流程
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        saveToLocal,
        loadFromLocal,
        exportConfig,
        importConfig,
        exportToClipboard,
        resetConfig,
        setupAutoSave,
        showNotification
    };
}
