// ==========================================
//  GBF 模拟器 - 渲染模块 - 角色相关
// ==========================================

const CHARACTER_ELEMENT_FILTER_OPTIONS = ['全部', '火', '水', '土', '风', '光', '暗'];

function characterMatchesElementFilter(c) {
    const f = typeof characterElementFilter !== 'undefined' ? characterElementFilter : '全部';
    if (!f || f === '全部') return true;
    const el = c && c['属性'] != null ? String(c['属性']).trim() : '';
    return el === f;
}

function renderCharacterElementFilterBar() {
    const bar = document.getElementById('character-element-filter-bar');
    if (!bar) return;
    const cur = typeof characterElementFilter !== 'undefined' ? characterElementFilter : '全部';
    bar.innerHTML = CHARACTER_ELEMENT_FILTER_OPTIONS.map((o) => {
        const active = o === cur ? ' left-filter-pill--active' : '';
        const accent = o === '全部' ? '#888888' : getElementColor(o) || '#666666';
        const safe = o.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<button type="button" class="left-filter-pill${active}" style="--pill-accent:${accent}" onclick="setCharacterElementFilter('${safe}')">${o}</button>`;
    }).join('');
}

window.setCharacterElementFilter = function (elementKey) {
    if (typeof characterElementFilter === 'undefined') return;
    characterElementFilter = elementKey;
    renderCharacters();
};

// 渲染角色列表
function renderCharacters() {
    const container = document.getElementById('character-list-container');
    if (!container) return;

    renderCharacterElementFilterBar();

    if (allCharacters.length === 0) {
        container.innerHTML = '<div style="padding:10px;text-align:center;color:#888">暂无角色数据</div>';
        return;
    }

    const rows = [];
    allCharacters.forEach((c, index) => {
        if (!characterMatchesElementFilter(c)) return;
        const color = getElementColor(c['属性']) || '#888';
        rows.push(`
        <div class="char-item" onclick="addCharacterToParty(${index})" style="cursor: pointer;" title="点击加入队伍">
            <div class="char-avatar-small" style="background:${color}; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#fff; font-size:0.8em;">
                ${c['名称'][0]}
            </div>
            <div style="flex-grow:1">
                <div style="font-weight:bold; font-size:0.9em; display:flex; justify-content:space-between;">
                    <span>${c['名称']}</span>
                    <span style="font-size:0.8em; color:${color}">${c['属性']}</span>
                </div>
                <div style="font-size:0.75em; color:#aaa; margin-top:2px;">
                    ${c['种族']} | 得意: ${c['得意武器1']} / ${c['得意武器2']}
                </div>
                <div style="font-size:0.7em; color:#666; margin-top:2px;">
                    HP: ${c['角色基础HP']} / ATK: ${c['角色基础atk']}
                </div>
            </div>
        </div>
        `);
    });

    if (rows.length === 0) {
        container.innerHTML =
            '<div style="padding:12px;text-align:center;color:#888;font-size:0.85em;">该属性下暂无角色</div>';
        return;
    }

    container.innerHTML = rows.join('');
}

// 将角色加入到队伍空位中
window.addCharacterToParty = function(charIndex) {
    const charData = allCharacters[charIndex];
    if (!charData) return;
    
    // 找到第一个空位 (索引 1 到 5)
    let targetSlot = -1;
    for (let i = 1; i < 6; i++) {
        if (!currentParty[i]) {
            targetSlot = i;
            break;
        }
    }
    
    if (targetSlot === -1) {
        alert("队伍已满！(后续将支持移除角色)");
        return;
    }
    
    // 加入队伍
    currentParty[targetSlot] = charData;
    
    // 更新对应槽位的UI显示
    updateCharSlotUI(targetSlot);
    
    // 重新计算全队面板和伤害
    if (typeof recalculate === 'function') {
        recalculate();
    }
    if (typeof saveToLocal === 'function') {
        saveToLocal(true);
    }
};

/** 从指定槽位移除非主角角色（槽位 1～5） */
window.clearCharacterFromSlot = function(slotIndex) {
    const si = parseInt(slotIndex, 10);
    if (isNaN(si) || si < 1 || si > 5) return;
    if (!currentParty[si]) return;
    currentParty[si] = null;
    if (typeof updateCharSlotUI === 'function') {
        updateCharSlotUI(si);
    }
    if (typeof recalculate === 'function') {
        recalculate();
    }
    if (typeof saveToLocal === 'function') {
        saveToLocal(true);
    }
};

function getCharabuffStatFormatByKey(statKey) {
    if (!statKey || typeof STAT_CONFIG === 'undefined') return null;
    const c = STAT_CONFIG.find((x) => x && x.category === 'charabuff' && x.key === statKey);
    return c && c.format ? c.format : 'fixed';
}

/** apply_buff：悬停用「效果量」文案（与 STAT_CONFIG 中该 statKey 的 format 一致） */
function formatApplyBuffMagnitudeSummary(params) {
    if (!params || typeof params !== 'object') return '';
    const bid = params.buff_id;
    const rawProp = params.prop;
    const raw = params.value;
    const numVal = typeof raw === 'number' && !isNaN(raw) ? raw : parseFloat(raw);
    if (isNaN(numVal)) {
        if (params.description != null && String(params.description).trim() !== '') {
            return `说明：${String(params.description).trim()}`;
        }
        return '';
    }
    if (!bid && rawProp && params.zone) {
        const zone = String(params.zone).trim();
        const valText = Math.abs(numVal) < 10 ? `${(numVal * 100).toFixed(2)}%` : String(Math.round(numVal));
        return `效果量：${valText}${zone ? ` · ${zone}` : ''}`;
    }
    if (!bid) return '';
    const statKey =
        typeof resolveCharabuffStatKey === 'function' ? resolveCharabuffStatKey(bid, params.type) : null;
    if (!statKey) {
        return `效果量：${numVal}（未登记 STAT_CONFIG，不累加）`;
    }
    const fmt = getCharabuffStatFormatByKey(statKey);
    if (fmt === 'ta_rate_bonus') {
        return `效果量：${String(Math.round(numVal))}（TA 加算）`;
    }
    if (fmt === 'percent') {
        let s = `效果量：${(numVal * 100).toFixed(2)}%`;
        const typ = params.type != null ? String(params.type).toUpperCase() : '';
        if (typ && bid === 'charabuff_bonus_na_dmg') s += ` · ${typ}`;
        return s;
    }
    return `效果量：${String(Math.round(numVal))}`;
}

/** 从 apply_buff effect 解析左侧 Buff 栏展示项（注册表 + effect.party_buff_ui） */
function getApplyBuffPartyDisplay(effect) {
    if (!effect || effect.action_type !== 'apply_buff') return null;
    const params = effect.parameters && typeof effect.parameters === 'object' ? effect.parameters : {};
    if (params.show_in_party_buff === false) return null;
    const bid = params.buff_id;
    const rawProp = params.prop != null ? String(params.prop).trim() : '';
    const fromJson = (typeof globalBuffIconsMap !== 'undefined' && bid && globalBuffIconsMap[bid])
        ? globalBuffIconsMap[bid]
        : null;
    const fromConstants = (typeof CHARA_APPLY_BUFF_PARTY_UI !== 'undefined' && bid)
        ? CHARA_APPLY_BUFF_PARTY_UI[bid]
        : null;
    const base = fromJson || fromConstants;
    let ui = base;
    if (effect.party_buff_ui && typeof effect.party_buff_ui === 'object') {
        ui = Object.assign({}, base || {}, effect.party_buff_ui);
    }
    if (!ui && rawProp) {
        const desc = params.description != null && String(params.description).trim() !== ''
            ? String(params.description).trim()
            : rawProp;
        ui = { icon: '', title: desc, abbrev: desc.slice(0, 2) || '?' };
    }
    if (!ui) return null;
    const icon = ui.icon != null && String(ui.icon).trim() !== '' ? String(ui.icon).trim() : '';
    const paramDesc =
        params.description != null && String(params.description).trim() !== ''
            ? String(params.description).trim()
            : '';
    const regTitle = ui.title != null ? String(ui.title) : '';
    let title = paramDesc || regTitle;
    if (Array.isArray(params.sub_effects) && params.sub_effects.length > 0) {
        const subs = params.sub_effects
            .map((s) => (s && s.description != null ? String(s.description).trim() : ''))
            .filter(Boolean);
        if (subs.length) {
            title = title ? `${title}：${subs.join('；')}` : subs.join('；');
        }
    }
    const abbrev = ui.abbrev != null && String(ui.abbrev).trim() !== '' ? String(ui.abbrev).trim() : '';
    if (!icon && !title && !abbrev) return null;
    const magLine = formatApplyBuffMagnitudeSummary(params);
    const tipBase = (title || regTitle || abbrev || bid || rawProp || '').trim();
    const tooltip = magLine ? (tipBase ? `${tipBase}\n${magLine}` : magLine) : tipBase;
    return {
        icon,
        title: title || abbrev,
        abbrev: abbrev || (title ? title.slice(0, 2) : '?'),
        tooltip: tooltip || undefined
    };
}

/** 向 #party-buff-icon-list 追加一个 Buff 图标槽（图或文字占位） */
function appendPartyBuffIconSlot(listEl, disp) {
    if (!listEl || !disp) return;
    const wrap = document.createElement('div');
    wrap.className = 'party-buff-icon-slot';
    wrap.title =
        disp.tooltip != null && String(disp.tooltip).trim() !== ''
            ? String(disp.tooltip)
            : disp.title || disp.abbrev || '';
    if (disp.icon) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = buildCharaSkillIconSrc(disp.icon);
        img.title = wrap.title;
        const abbrevFallback = disp.abbrev || (disp.title ? disp.title.slice(0, 2) : '?');
        img.onerror = function () {
            img.remove();
            wrap.classList.add('party-buff-icon-slot--text');
            wrap.textContent = abbrevFallback;
        };
        wrap.appendChild(img);
    } else {
        wrap.classList.add('party-buff-icon-slot--text');
        wrap.textContent = disp.abbrev || (disp.title ? disp.title.slice(0, 2) : '?');
    }
    listEl.appendChild(wrap);
}

/** 技能悬停/标题：description、中文描述、name、类型 */
function getCharaSkillDisplayTitle(skill) {
    if (!skill || typeof skill !== 'object') return '';
    const d = skill.desc != null && skill.desc !== ''
        ? skill.desc
        : (skill.description != null && skill.description !== '' ? skill.description : skill['中文描述']);
    if (d != null && d !== '') return String(d);
    if (skill.name != null && skill.name !== '') return String(skill.name);
    if (skill['类型'] != null && skill['类型'] !== '') return String(skill['类型']);
    return '';
}

/** 读取技能图标相对路径（新字段 icon，兼容旧字段「图标」） */
function getCharaSkillIconPath(skill) {
    if (!skill || typeof skill !== 'object') return '';
    const p = skill.icon != null && skill.icon !== '' ? skill.icon : skill['图标'];
    return typeof p === 'string' ? p : '';
}

/** 将「图标」相对路径转为可请求的 images URL（处理空格、反斜杠） */
function buildCharaSkillIconSrc(iconPath) {
    if (!iconPath || typeof iconPath !== 'string') return '';
    const normalized = iconPath.trim().replace(/\\/g, '/');
    const encoded = normalized.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return 'images/' + encoded;
}

function escapeHtmlCharaBrief(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** 非主角：奥义倍率 + 奥义效果（位于 4 个技能图标上方） */
function buildCharaCaSummaryHtml(charData) {
    if (!charData) return '';
    const multRaw = charData['奥义倍率'];
    const multStr = (multRaw !== undefined && multRaw !== null && multRaw !== '' && !isNaN(Number(multRaw)))
        ? String(Number(multRaw))
        : '—';
    const effects = charData['奥义效果'];
    let effectsHtml = '';
    if (!effects || !Array.isArray(effects) || effects.length === 0) {
        effectsHtml = '<span class="char-ca-effects-empty">暂无</span>';
    } else {
        effectsHtml = effects.map((e) => {
            if (typeof e === 'string') return escapeHtmlCharaBrief(e);
            if (e && typeof e === 'object') {
                if (e.desc != null) return escapeHtmlCharaBrief(e.desc);
                if (e['描述'] != null) return escapeHtmlCharaBrief(e['描述']);
                return escapeHtmlCharaBrief(JSON.stringify(e));
            }
            return escapeHtmlCharaBrief(String(e));
        }).join('<br>');
    }
    return `
                <div class="theme-custom char-ca-row-wrap" style="margin-top: 12px;">
                    <div class="section-title">奥义</div>
                    <div class="char-ca-summary">
                        <div class="char-ca-mult-row">
                            <span class="char-ca-label">奥义倍率</span>
                            <span class="char-ca-mult-value">${multStr}</span>
                        </div>
                        <div class="char-ca-effects-block">
                            <span class="char-ca-label">奥义效果</span>
                            <div class="char-ca-effects-text">${effectsHtml}</div>
                        </div>
                    </div>
                </div>`;
}

/**
 * 非主角：基础属性与加成汇总之间，4 个角色技能槽（图标 + 开启开关）
 * 技能 id 约定：{角色ID}_{1~4}，与 charaskills.json 对应
 */
function buildCharaSkillSlotsHtml(slotIndex, charData) {
    if (slotIndex === 0 || !charData) return '';
    const cid = charData['ID'];
    if (cid === undefined || cid === null) return '';
    const map = (typeof globalCharaSkillMap !== 'undefined' && globalCharaSkillMap) ? globalCharaSkillMap : {};
    const slotsHtml = [1, 2, 3, 4].map((pos) => {
        const sid = `${cid}_${pos}`;
        const skill = map[sid];
        let iconInner;
        const iconRel = getCharaSkillIconPath(skill);
        if (skill && iconRel) {
            const rawTitle = getCharaSkillDisplayTitle(skill);
            const escTitle = String(rawTitle).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
            const iconSrc = buildCharaSkillIconSrc(iconRel);
            iconInner = `<img class="char-skill-slot-icon" src="${iconSrc}" alt="" title="${escTitle}">`;
        } else {
            iconInner = '<div class="char-skill-slot-empty" title="无技能数据">—</div>';
        }
        const canToggle = !!skill;
        return `
            <div class="char-skill-slot" data-char-skill-id="${sid}">
                <div class="char-skill-slot-icon-wrap">${iconInner}</div>
                <label class="char-skill-toggle-label">
                    <input type="checkbox" class="char-skill-enabled-cb" data-slot="${slotIndex}" data-pos="${pos}" ${canToggle ? '' : 'disabled'} onchange="onCharSkillBuffToggle()">
                    <span class="char-skill-toggle-text">开启</span>
                </label>
            </div>`;
    }).join('');
    return (
        buildCharaCaSummaryHtml(charData) +
                `<div class="theme-custom char-skill-row-wrap" style="margin-top: 12px;">
                    <div class="section-title">角色技能</div>
                    <div class="char-skill-slots-grid">${slotsHtml}</div>
                </div>
                `
    );
}

function getActiveCharSlotIndex() {
    const activeBtn = document.querySelector('.char-slot-btn.active');
    if (!activeBtn) return 0;
    const n = parseInt(activeBtn.getAttribute('data-slot'), 10);
    return isNaN(n) ? 0 : n;
}

function parseFlexScalar(raw) {
    if (raw == null || raw === '') return NaN;
    if (typeof raw === 'number' && !isNaN(raw)) return raw;
    const s = String(raw).trim();
    if (s.endsWith('%')) {
        const n = parseFloat(s);
        return isNaN(n) ? NaN : n / 100;
    }
    return parseFloat(s);
}

/**
 * charabuff.json 单条 effect 在当前层数下的数值。
 * - 有 upvalue：value + (当前层 - 模板 level) * upvalue，且不超过 maxvalue（若填写）。
 * - 无 upvalue：按层数比例 value * (当前层 / 模板 level)。
 */
function effectMagnitudeAtPanelLevel(effect, template, panelLevel) {
    if (!effect || !template) return NaN;
    const refLevel = Math.max(1, parseInt(template.level, 10) || 1);
    const maxFromTpl = parseInt(template.maxlevel, 10);
    const maxLv = Math.max(refLevel, !isNaN(maxFromTpl) && maxFromTpl > 0 ? maxFromTpl : refLevel);
    const L = Math.min(Math.max(1, panelLevel), maxLv);
    const base = parseFlexScalar(effect.value);
    if (isNaN(base)) return NaN;
    const upRaw = effect.upvalue;
    if (upRaw != null && String(upRaw).trim() !== '') {
        const delta = parseFlexScalar(upRaw);
        if (!isNaN(delta)) {
            let v = base + (L - refLevel) * delta;
            if (effect.maxvalue != null && String(effect.maxvalue).trim() !== '') {
                const cap = parseFlexScalar(effect.maxvalue);
                if (!isNaN(cap)) v = Math.min(v, cap);
            }
            return v;
        }
    }
    return base * (L / refLevel);
}

/** 图鉴行内子 Buff 图标悬停：当前层数下的具体效果量（与 effectMagnitudeAtPanelLevel、STAT_CONFIG 一致） */
function formatPartyBuffEffectMagnitudeLine(effect, template, panelLevel) {
    if (!effect || !template) return '';
    const numVal = effectMagnitudeAtPanelLevel(effect, template, panelLevel);
    if (isNaN(numVal)) return '';
    const prop = effect.prop != null ? String(effect.prop).trim() : '';
    const typ = effect.type != null ? String(effect.type).toUpperCase() : '';
    const zone = effect.zone != null ? String(effect.zone).trim() : '';
    const statKey =
        typeof resolveCharabuffStatKey === 'function' ? resolveCharabuffStatKey(prop, effect.type) : null;
    const map =
        typeof globalBuffIconsMap !== 'undefined' && globalBuffIconsMap[prop]
            ? globalBuffIconsMap[prop]
            : null;
    let label = map && map.title ? String(map.title) : prop;
    if (statKey && typeof STAT_CONFIG !== 'undefined') {
        const c = STAT_CONFIG.find((x) => x && x.category === 'charabuff' && x.key === statKey);
        if (c && c.label) label = c.label;
    }
    const fmt = statKey ? getCharabuffStatFormatByKey(statKey) : null;
    let mag = '';
    if (!statKey && zone) {
        const valText = Math.abs(numVal) < 10 ? `${(numVal * 100).toFixed(2)}%` : String(Math.round(numVal));
        mag = `${valText} · ${zone}`;
    } else if (!statKey) {
        mag = `${String(numVal)}（未登记 STAT_CONFIG）`;
    } else if (fmt === 'ta_rate_bonus') {
        mag = `${String(Math.round(numVal))}（TA 加算）`;
    } else if (fmt === 'percent') {
        mag = `${(numVal * 100).toFixed(2)}%`;
        if (typ) mag += ` · ${typ}`;
    } else {
        mag = String(Math.round(numVal));
    }
    return `${label}\n效果量：${mag}`;
}

/** 单条 charabuff 模板在指定层数下对 party.stats 的贡献（prop+type→STAT_CONFIG.key，未登记不入） */
function buildStatsFromCharabuffTemplate(template, panelLevel) {
    const stats = {};
    if (!template || !Array.isArray(template.effects)) return stats;
    template.effects.forEach((e) => {
        if (!e) return;
        const numVal = effectMagnitudeAtPanelLevel(e, template, panelLevel);
        if (isNaN(numVal)) return;
        const prop = e.prop != null ? String(e.prop).trim() : '';
        if (prop && e.zone) return;
        if (!prop || typeof resolveCharabuffStatKey !== 'function') return;
        const statKey = resolveCharabuffStatKey(prop, e.type);
        if (!statKey) return;
        stats[statKey] = (stats[statKey] || 0) + numVal;
    });
    return stats;
}

function buildZoneEffectEntriesFromCharabuffTemplate(template, panelLevel, rowUid) {
    const entries = [];
    if (!template || !Array.isArray(template.effects)) return entries;
    template.effects.forEach((e, idx) => {
        if (!e || !e.prop || !e.zone) return;
        const numVal = effectMagnitudeAtPanelLevel(e, template, panelLevel);
        if (isNaN(numVal) || numVal === 0) return;
        const prop = String(e.prop).trim();
        const zone = String(e.zone).trim();
        if (!prop || !zone) return;
        entries.push({
            prop,
            zone,
            value: numVal,
            sourceId: (rowUid || template.id || 'charabuff') + ':' + idx,
            label: e.label || e.description || template.name || prop,
            format: e.format || 'percent',
            source: 'charabuff'
        });
    });
    return entries;
}

function buildDynamicEntriesFromCharabuffTemplate(template, panelLevel, rowUid) {
    return buildZoneEffectEntriesFromCharabuffTemplate(template, panelLevel, rowUid)
        .filter((entry) => String(entry.prop || '').indexOf('bonus_na_') === 0);
}

function aggregateCodexStatsForSlot(rows) {
    const sum = {};
    if (!rows || !rows.length) return sum;
    rows.forEach((r) => {
        const part = buildStatsFromCharabuffTemplate(r.template, r.level);
        Object.keys(part).forEach((k) => {
            sum[k] = (sum[k] || 0) + part[k];
        });
    });
    return sum;
}

function aggregateCodexDynamicEntriesForSlot(rows) {
    const entries = [];
    if (!rows || !rows.length) return entries;
    rows.forEach((r) => {
        buildDynamicEntriesFromCharabuffTemplate(r.template, r.level, r.uid).forEach((entry) => {
            entries.push(entry);
        });
    });
    return entries;
}

function aggregateCodexZoneEffectEntriesForSlot(rows) {
    const entries = [];
    if (!rows || !rows.length) return entries;
    rows.forEach((r) => {
        buildZoneEffectEntriesFromCharabuffTemplate(r.template, r.level, r.uid).forEach((entry) => {
            entries.push(entry);
        });
    });
    return entries;
}

function calculateCodexZoneEffectTotals(entries) {
    const totals = {};
    if (!Array.isArray(entries) || entries.length === 0) return totals;

    if (typeof BuffRegistry === 'function') {
        const registry = new BuffRegistry();
        entries.forEach((entry, idx) => {
            if (!entry || !entry.prop || !entry.zone) return;
            const value = Number(entry.value) || 0;
            if (value === 0) return;
            registry.addByProp(
                String(entry.prop).trim(),
                String(entry.zone).trim(),
                entry.sourceId || ('charabuff_zone_' + idx),
                value
            );
        });
        registry.getRegisteredTypes().forEach((buffType) => {
            totals[buffType] = registry.getTotal(buffType);
        });
        return totals;
    }

    entries.forEach((entry) => {
        if (!entry || !entry.prop) return;
        const parsed = typeof parseBuffProp === 'function'
            ? parseBuffProp(String(entry.prop).trim())
            : { buffType: String(entry.prop).trim() };
        const buffType = parsed && parsed.buffType ? parsed.buffType : String(entry.prop).trim();
        const value = Number(entry.value) || 0;
        if (value === 0) return;
        totals[buffType] = (totals[buffType] || 0) + value;
    });
    return totals;
}

/** 在 applyCharaSkillBuffStatsToParty 末尾调用：把各槽图鉴行累加到 party[].stats */
function applyBuffCodexRowsToPartyStats() {
    if (typeof party === 'undefined' || !Array.isArray(party)) return;
    const bySlot = window.buffCodexPanelRowsBySlot;
    if (!bySlot || bySlot.length < 6) {
        for (let s = 0; s < 6; s++) {
            if (!party[s] || !party[s].stats) continue;
            party[s].zoneEffectEntries = [];
            party[s].stats._charabuffZoneEffectTotals = {};
        }
        return;
    }
    for (let s = 0; s < 6; s++) {
        if (!party[s] || !party[s].stats) continue;
        const add = aggregateCodexStatsForSlot(bySlot[s]);
        Object.keys(add).forEach((k) => {
            party[s].stats[k] = (party[s].stats[k] || 0) + add[k];
        });
        const dynamicEntries = aggregateCodexDynamicEntriesForSlot(bySlot[s]);
        if (dynamicEntries.length > 0) {
            if (!Array.isArray(party[s].dynamicBuffEntries)) party[s].dynamicBuffEntries = [];
            dynamicEntries.forEach((entry) => party[s].dynamicBuffEntries.push(entry));
        }
        party[s].zoneEffectEntries = aggregateCodexZoneEffectEntriesForSlot(bySlot[s]);
        const formulaZoneEntries = (Array.isArray(party[s].skillZoneEffectEntries) ? party[s].skillZoneEffectEntries : [])
            .concat(party[s].zoneEffectEntries);
        party[s].stats._charabuffZoneEffectTotals = calculateCodexZoneEffectTotals(formulaZoneEntries);
    }
}

window.applyBuffCodexRowsToPartyStats = applyBuffCodexRowsToPartyStats;

function findBuffCodexRowByUid(uid) {
    const bySlot = window.buffCodexPanelRowsBySlot;
    if (!bySlot || !uid) return null;
    for (let s = 0; s < bySlot.length; s++) {
        const arr = bySlot[s];
        const idx = arr.findIndex((r) => r && r.uid === uid);
        if (idx >= 0) return { slot: s, index: idx, row: arr[idx] };
    }
    return null;
}

window.onBuffCodexPanelStack = function (uid) {
    const f = findBuffCodexRowByUid(uid);
    if (!f || f.row.level >= f.row.maxlevel) return;
    f.row.level += 1;
    if (typeof recalculate === 'function') recalculate();
    else if (typeof renderPartyBuffPanel === 'function') {
        renderPartyBuffPanel(getActiveCharSlotIndex());
    }
    if (typeof autoSaveEnabled !== 'undefined' && autoSaveEnabled && typeof saveToLocal === 'function') {
        setTimeout(() => saveToLocal(true), 100);
    }
};

window.onBuffCodexPanelRemove = function (uid) {
    const f = findBuffCodexRowByUid(uid);
    if (!f) return;
    window.buffCodexPanelRowsBySlot[f.slot].splice(f.index, 1);
    if (typeof recalculate === 'function') recalculate();
    else if (typeof renderPartyBuffPanel === 'function') {
        renderPartyBuffPanel(getActiveCharSlotIndex());
    }
    if (typeof autoSaveEnabled !== 'undefined' && autoSaveEnabled && typeof saveToLocal === 'function') {
        setTimeout(() => saveToLocal(true), 100);
    }
};

/** 武器盘上方：图鉴加入的 Buff 行（自上而下），右侧叠层/清除 */
function renderPartyBuffCodexRows(container, slotIndex) {
    if (!container) return;
    container.innerHTML = '';
    const bySlot = window.buffCodexPanelRowsBySlot;
    const rows = bySlot && bySlot[slotIndex] ? bySlot[slotIndex] : [];
    rows.forEach((r) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'party-buff-codex-row';
        rowEl.dataset.uid = r.uid;

        const main = document.createElement('div');
        main.className = 'party-buff-codex-row-main';

        const iconWrap = document.createElement('div');
        iconWrap.className = 'party-buff-codex-icon';
        const t = r.template;
        const iconPath = t && t.image ? String(t.image).trim() : '';
        if (iconPath) {
            const img = document.createElement('img');
            img.src = buildCharaSkillIconSrc(iconPath);
            img.alt = '';
            iconWrap.appendChild(img);
        } else {
            iconWrap.classList.add('party-buff-codex-icon--text');
            const abbr = t && t.name ? String(t.name).slice(0, 2) : '?';
            iconWrap.textContent = abbr;
        }

        const meta = document.createElement('div');
        meta.className = 'party-buff-codex-meta';
        const titleEl = document.createElement('span');
        titleEl.className = 'party-buff-codex-title';
        titleEl.textContent =
            t && t.name ? String(t.name) : t && t.id ? String(t.id) : 'Buff';
        const lvEl = document.createElement('span');
        lvEl.className = 'party-buff-codex-level';
        lvEl.textContent = `Lv ${r.level} / ${r.maxlevel}`;
        meta.appendChild(titleEl);
        meta.appendChild(lvEl);

        const mid = document.createElement('div');
        mid.className = 'party-buff-codex-mid';
        mid.appendChild(meta);

        const subIcons = document.createElement('div');
        subIcons.className = 'party-buff-codex-buff-icons';
        const effs = Array.isArray(t.effects) ? t.effects : [];
        effs.forEach((eff) => {
            if (!eff || eff.prop == null || String(eff.prop).trim() === '') return;
            const prop = String(eff.prop).trim();
            const tip = formatPartyBuffEffectMagnitudeLine(eff, t, r.level);
            const bmap =
                typeof globalBuffIconsMap !== 'undefined' && globalBuffIconsMap[prop]
                    ? globalBuffIconsMap[prop]
                    : null;
            const slot = document.createElement('div');
            slot.className = 'party-buff-codex-sub-slot';
            slot.title = tip;
            if (bmap && bmap.icon && String(bmap.icon).trim() !== '') {
                const im = document.createElement('img');
                im.src = buildCharaSkillIconSrc(String(bmap.icon).trim());
                im.alt = '';
                im.title = tip;
                slot.appendChild(im);
            } else {
                slot.classList.add('party-buff-codex-sub-slot--text');
                const ab = bmap && bmap.abbrev && String(bmap.abbrev).trim() ? String(bmap.abbrev).trim() : prop.slice(0, 2);
                slot.textContent = ab;
            }
            subIcons.appendChild(slot);
        });
        if (subIcons.children.length) mid.appendChild(subIcons);

        main.appendChild(iconWrap);
        main.appendChild(mid);

        const actions = document.createElement('div');
        actions.className = 'party-buff-codex-actions';
        const btnStack = document.createElement('button');
        btnStack.type = 'button';
        btnStack.className = 'party-buff-btn party-buff-btn-stack';
        btnStack.textContent = '叠层';
        btnStack.disabled = r.level >= r.maxlevel;
        btnStack.onclick = () => window.onBuffCodexPanelStack(r.uid);
        const btnClear = document.createElement('button');
        btnClear.type = 'button';
        btnClear.className = 'party-buff-btn party-buff-btn-clear';
        btnClear.textContent = '清除';
        btnClear.onclick = () => window.onBuffCodexPanelRemove(r.uid);
        actions.appendChild(btnStack);
        actions.appendChild(btnClear);

        rowEl.appendChild(main);
        rowEl.appendChild(actions);
        container.appendChild(rowEl);
    });
}

/** 按 STAT_CONFIG category=charabuff 渲染多行数值 */
function formatCharabuffStatLinesHtml(stats) {
    const cfgs =
        typeof STAT_CONFIG !== 'undefined' ? STAT_CONFIG.filter((c) => c && c.category === 'charabuff') : [];
    let html = '';
    let any = false;
    cfgs.forEach((cfg) => {
        let val = stats[cfg.key] || 0;
        let isCapped = false;
        if (cfg.cap != null && cfg.cap !== undefined && typeof cfg.cap === 'number' && val > cfg.cap) {
            val = cfg.cap;
            isCapped = true;
        }
        if (cfg.format === 'ta_rate_bonus') {
            if (val <= 0) return;
            any = true;
            const disp = '+' + (val * 100).toFixed(0) + '%';
            html += `<div class="stat-line"><span>ta</span> <span class="val-highlight">${disp}</span></div>`;
            return;
        }
        if (Math.abs(val) <= 0.0001) return;
        any = true;
        let displayVal = '';
        if (cfg.format === 'percent') {
            displayVal = (val * 100).toFixed(2) + '%';
        } else {
            displayVal = String(Math.round(val));
        }
        if (isCapped) displayVal += ' (MAX)';
        html += `<div class="stat-line"><span>${cfg.label}</span> <span class="${isCapped ? 'capped-val' : 'val-highlight'}">${displayVal}</span></div>`;
    });
    if (!any) {
        html =
            '<div class="stat-line"><span style="color:#666">暂无技能 Buff</span><span style="color:#666">—</span></div>';
    }
    return { html, any };
}

function formatZoneEntryValue(entry) {
    const value = Number(entry && entry.value);
    if (!Number.isFinite(value)) return '';
    const meta = typeof getBuffDisplayMeta === 'function'
        ? getBuffDisplayMeta(entry && entry.prop, entry && entry.zone, entry)
        : null;
    const format = meta && meta.format
        ? String(meta.format)
        : (entry && entry.format ? String(entry.format) : (Math.abs(value) <= 10 ? 'percent' : 'fixed'));
    if (format === 'ta_rate_bonus') return '+' + (value * 100).toFixed(0) + '%';
    if (format === 'fixed') return String(Math.round(value));
    return (value >= 0 ? '+' : '') + (value * 100).toFixed(2) + '%';
}

function escapePartyBuffStatText(value) {
    if (typeof escapeHtmlCharaBrief === 'function') return escapeHtmlCharaBrief(value);
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatZoneEntryLabel(entry) {
    if (!entry) return '';
    const prop = entry.prop ? String(entry.prop) : '';
    const meta = typeof getBuffDisplayMeta === 'function'
        ? getBuffDisplayMeta(prop, entry.zone, entry)
        : null;
    const label = meta && meta.label
        ? meta.label
        : (entry.label != null && String(entry.label).trim() !== '' ? String(entry.label).trim() : prop);
    const zone = entry.zone != null && String(entry.zone).trim() !== ''
        ? String(entry.zone).trim()
        : '';
    const parsed = typeof parseBuffProp === 'function' ? parseBuffProp(prop) : { buffType: prop };
    const showZone = zone
        && parsed.buffType === 'bonus_na';
    return showZone ? `${label} ${zone.toLowerCase()}` : label;
}

function collectCheckedSkillStatuses(slotIndex) {
    const statusesOut = [];
    if (slotIndex === 0 || !window.StatusResolver || typeof window.StatusResolver.getStatusesFromSkillActions !== 'function') {
        return statusesOut;
    }
    const cp = typeof currentParty !== 'undefined' ? currentParty : [];
    const charData = cp[slotIndex];
    if (!charData || charData['ID'] == null) return statusesOut;
    const map = typeof globalCharaSkillMap !== 'undefined' && globalCharaSkillMap ? globalCharaSkillMap : {};
    const cid = charData['ID'];
    for (let pos = 1; pos <= 4; pos++) {
        const cb = document.querySelector(`.char-skill-enabled-cb[data-slot="${slotIndex}"][data-pos="${pos}"]`);
        if (!cb || !cb.checked) continue;
        const sid = `${cid}_${pos}`;
        const skill = map[sid];
        if (!skill || !Array.isArray(skill.steps)) continue;
        window.StatusResolver.getStatusesFromSkillActions(skill, {
            skillId: sid,
            skillName: skill.name || sid,
            ownerSlot: slotIndex
        }).forEach((status) => statusesOut.push(status));
    }
    return statusesOut;
}

function formatUniqueStatusEffect(effect) {
    if (!effect) return '';
    if (effect.formula && effect.formula.prop && effect.formula.zone) {
        const entry = {
            prop: effect.formula.prop,
            zone: effect.formula.zone,
            value: effect.formula.value,
            format: effect.formula.format || effect.format,
            label: effect.label || effect.formula.label
        };
        return `${escapePartyBuffStatText(formatZoneEntryLabel(entry))} <span>${escapePartyBuffStatText(formatZoneEntryValue(entry))}</span>`;
    }
    if (effect.effect_type === 'extra_attack') {
        return '<a href="https://gbf.huijiwiki.com/wiki/%E5%86%8D%E6%94%BB%E5%87%BB" target="_blank" rel="noopener noreferrer">再攻击</a>';
    }
    if (effect.effect_type === 'turn_hp_loss') {
        const pct = ((Number(effect.percent_max_hp) || 0) * 100).toFixed(0);
        return `<a href="https://gbf.huijiwiki.com/wiki/%E6%AF%8F%E5%9B%9E%E5%90%88%E4%BC%A4%E5%AE%B3" target="_blank" rel="noopener noreferrer">每回合损失${pct}%HP</a>`;
    }
    if (effect.effect_type === 'bonus_damage') {
        const value = Number(effect.value) || 0;
        const zone = effect.zone ? ` ${String(effect.zone).toLowerCase()}` : '';
        return `${escapePartyBuffStatText('追击' + zone)} <span>${escapePartyBuffStatText((value * 100).toFixed(2) + '%')}</span>`;
    }
    return escapePartyBuffStatText(effect.effect_type || '');
}

function formatUniqueStatusBoxesHtml(statuses) {
    const uniqueStatuses = (Array.isArray(statuses) ? statuses : []).filter((status) => status && status.kind === 'unique');
    let html = '';
    uniqueStatuses.forEach((status) => {
        const effects = Array.isArray(status.effects) ? status.effects : [];
        const hasStatusOnlyEffect = effects.some((effect) => effect && !effect.formula);
        if (!hasStatusOnlyEffect) return;
        const rows = effects
            .map((effect) => formatUniqueStatusEffect(effect))
            .filter(Boolean)
            .map((line) => `<li>${line}</li>`)
            .join('');
        if (!rows) return;
        html += `
            <div class="party-buff-unique-box">
                <div class="party-buff-unique-title">${escapePartyBuffStatText(status.name || status.status_id || '独有 Buff')}</div>
                <ul class="party-buff-unique-effects">${rows}</ul>
            </div>
        `;
    });
    return { html, any: html !== '' };
}

function formatStatusZoneEntryLinesHtml(member) {
    if (!member) return { html: '', any: false };
    const entries = []
        .concat(Array.isArray(member.skillZoneEffectEntries) ? member.skillZoneEffectEntries : [])
        .concat(Array.isArray(member.zoneEffectEntries) ? member.zoneEffectEntries : []);
    const seen = new Set();
    let html = '';
    entries.forEach((entry, idx) => {
        if (!entry || !entry.prop || !entry.zone) return;
        const key = [
            entry.sourceId || idx,
            entry.prop,
            entry.zone,
            entry.value
        ].join('|');
        if (seen.has(key)) return;
        seen.add(key);
        const label = formatZoneEntryLabel(entry);
        const valueText = formatZoneEntryValue(entry);
        if (!label || !valueText) return;
        html += `<div class="stat-line party-buff-stat-line"><span>${escapePartyBuffStatText(String(label))}</span> <span class="val-highlight">${escapePartyBuffStatText(valueText)}</span></div>`;
    });
    return {
        html: html ? `<div class="party-buff-stat-section-title">角色 Buff</div>${html}` : '',
        any: html !== ''
    };
}

function collectCheckedSkillStatusZoneEntries(slotIndex) {
    const entries = [];
    if (!window.StatusResolver) return entries;
    collectCheckedSkillStatuses(slotIndex).forEach((status) => {
        if (window.StatusResolver.collectZoneEntriesFromStatuses) {
            window.StatusResolver.collectZoneEntriesFromStatuses([status]).forEach((entry) => entries.push(entry));
        }
    });
    return entries;
}

function formatZoneEntryLinesHtml(entries) {
    return formatStatusZoneEntryLinesHtml({
        skillZoneEffectEntries: Array.isArray(entries) ? entries : [],
        zoneEffectEntries: []
    });
}

/** 右侧「角色 Buff」下方：STAT_CONFIG category=charabuff 数值（与常驻加成 stat-line 风格一致） */
function renderPartyBuffCharabuffStats(slotIndex) {
    const out = document.getElementById('party-buff-charabuff-stats');
    if (!out) return;

    const gp = typeof window.getCalcParty === 'function' ? window.getCalcParty() : null;
    const fallbackEntries = collectCheckedSkillStatusZoneEntries(slotIndex);
    const checkedStatuses = collectCheckedSkillStatuses(slotIndex);
    const uniqueBoxes = formatUniqueStatusBoxesHtml(checkedStatuses);
    if (!gp || !gp[slotIndex] || !gp[slotIndex].stats) {
        const fallback = formatZoneEntryLinesHtml(fallbackEntries);
        const combinedHtml = (fallback.any ? fallback.html : '') + (uniqueBoxes.any ? uniqueBoxes.html : '');
        out.innerHTML = combinedHtml
            ? combinedHtml
            : '<div class="stat-line"><span style="color:#666">暂无技能 Buff</span><span style="color:#666">—</span></div>';
        return;
    }
    const member = gp[slotIndex];
    const legacy = formatCharabuffStatLinesHtml(member.stats);
    const dynamic = formatStatusZoneEntryLinesHtml(member);
    const fallback = dynamic.any ? { html: '', any: false } : formatZoneEntryLinesHtml(fallbackEntries);
    if (!legacy.any && !dynamic.any && !uniqueBoxes.any) {
        out.innerHTML = fallback.any
            ? fallback.html
            : '<div class="stat-line"><span style="color:#666">暂无技能 Buff</span><span style="color:#666">—</span></div>';
        return;
    }
    out.innerHTML = (legacy.any ? legacy.html : '') + (dynamic.any ? dynamic.html : '') + (fallback.any ? fallback.html : '') + (uniqueBoxes.any ? uniqueBoxes.html : '');
}

/** 右侧「角色 Buff」：仅展示 slotIndex 对应角色（与当前面板切换同步） */
function renderPartyBuffPanel(slotIndex) {
    if (typeof window.applyCharaSkillBuffStatsToParty === 'function') {
        window.applyCharaSkillBuffStatsToParty();
    }

    const labelEl = document.getElementById('party-buff-active-label');
    const codexRowsEl = document.getElementById('party-buff-codex-rows');
    const skillIconsEl = document.getElementById('party-buff-skill-icons');
    const legacyListEl = document.getElementById('party-buff-icon-list');

    const cp = typeof currentParty !== 'undefined' ? currentParty : [];
    let name = '主角';
    if (slotIndex === 0) {
        name = '主角';
    } else if (cp[slotIndex] && cp[slotIndex]['名称']) {
        name = cp[slotIndex]['名称'];
    } else {
        name = `角色${slotIndex + 1}`;
    }
    if (labelEl) labelEl.textContent = name;

    const skillTarget = skillIconsEl || legacyListEl;
    if (!skillTarget) return;

    if (codexRowsEl) {
        renderPartyBuffCodexRows(codexRowsEl, slotIndex);
    }
    skillTarget.innerHTML = '';

    if (slotIndex !== 0) {
        const charData = cp[slotIndex];
        if (charData && charData['ID'] != null) {
            const cid = charData['ID'];
            const map =
                typeof globalCharaSkillMap !== 'undefined' && globalCharaSkillMap ? globalCharaSkillMap : {};

            for (let pos = 1; pos <= 4; pos++) {
                const cb = document.querySelector(
                    `.char-skill-enabled-cb[data-slot="${slotIndex}"][data-pos="${pos}"]`
                );
                if (!cb || !cb.checked) continue;
                const sid = `${cid}_${pos}`;
                const skill = map[sid];
                if (!skill) continue;

                const iconRel = getCharaSkillIconPath(skill);
                const showSkillIcon = skill.show_icon !== false
                    && skill.show_skill_icon_in_buff_bar !== false
                    && skill.party_buff_show_skill_icon !== false;
                if (showSkillIcon && iconRel) {
                    const wrap = document.createElement('div');
                    wrap.className = 'party-buff-icon-slot';
                    const rawTitle = getCharaSkillDisplayTitle(skill);
                    wrap.title = rawTitle;
                    const img = document.createElement('img');
                    img.src = buildCharaSkillIconSrc(iconRel);
                    img.alt = '';
                    wrap.appendChild(img);
                    skillTarget.appendChild(wrap);
                }

                if (Array.isArray(skill.steps) && window.StatusResolver && typeof window.StatusResolver.getStatusesFromSkillActions === 'function') {
                    const statuses = window.StatusResolver.getStatusesFromSkillActions(skill, {
                        skillId: sid,
                        skillName: skill.name || sid,
                        ownerSlot: slotIndex
                    });
                    statuses.forEach((status) => {
                        const disp = window.StatusResolver.statusToPartyBuffDisplay
                            ? window.StatusResolver.statusToPartyBuffDisplay(status)
                            : null;
                        if (disp) appendPartyBuffIconSlot(skillTarget, disp);
                    });
                }
            }
        }
    }

    renderPartyBuffCharabuffStats(slotIndex);
}

function onCharSkillBuffToggle() {
    if (typeof recalculate === 'function') {
        recalculate();
    } else if (typeof renderPartyBuffPanel === 'function') {
        renderPartyBuffPanel(getActiveCharSlotIndex());
    }
}

// 更新角色槽位的UI显示
function updateCharSlotUI(slotIndex) {
    const charData = currentParty[slotIndex];
    
    // 1. 更新顶部选项卡的标签和图标
    const slotBtn = document.querySelector(`.char-slot-btn[data-slot="${slotIndex}"]`);
    if (slotBtn) {
        const iconSpan = slotBtn.querySelector('.char-slot-icon');
        const labelSpan = slotBtn.querySelector('.char-slot-label');
        
        if (charData) {
            const color = getElementColor(charData['属性']) || '#888';
            iconSpan.textContent = charData['名称'][0];
            iconSpan.style.background = color;
            iconSpan.style.color = '#fff';
            iconSpan.style.border = 'none';
            
            labelSpan.textContent = charData['名称'];
        } else {
            iconSpan.textContent = '+';
            iconSpan.style.background = 'transparent';
            iconSpan.style.color = '#888';
            iconSpan.style.border = '1px dashed #666';
            
            labelSpan.textContent = '角色' + (slotIndex + 1);
        }
    }
    
    // 2. 更新基础设定的内容
    const basicContentEl = document.getElementById(`char-slot-${slotIndex}-basic`);
    if (basicContentEl) {
        if (charData) {
            const color = getElementColor(charData['属性']) || '#888';
            const clearBtnHtml = slotIndex > 0
                ? `<button type="button" class="btn-clear-char-slot" title="从该槽位移除角色" onclick="clearCharacterFromSlot(${slotIndex}); event.stopPropagation();">清除角色</button>`
                : '';
            basicContentEl.innerHTML = `
                <div style="border-bottom:1px solid #444; padding-bottom:10px; margin-bottom:10px; display:flex; align-items:flex-start; gap:12px;">
                    <div style="width:60px; height:60px; border-radius:50%; background:${color}; display:flex; align-items:center; justify-content:center; font-size:1.5em; font-weight:bold; color:white; flex-shrink:0;">
                        ${charData['名称'][0]}
                    </div>
                    <div style="flex:1; min-width:0;">
                        <h3 style="margin:0 0 5px 0; color:#fff;">${charData['名称']} <span style="font-size:0.6em; color:${color}; border:1px solid ${color}; padding:1px 4px; border-radius:3px; vertical-align:middle;">${charData['属性']}</span></h3>
                        <div style="font-size:0.85em; color:#aaa;">种族: ${charData['种族']}</div>
                        <div style="font-size:0.85em; color:#aaa;">得意: ${charData['得意武器1']} / ${charData['得意武器2']}</div>
                    </div>
                    ${clearBtnHtml}
                </div>
                
                <div class="theme-custom" style="margin-top: 15px;">
                    <div class="section-title">基础属性</div>
                    <div class="custom-input-area" style="display:flex; gap:15px; text-align:center;">
                        <div style="flex:1; background:#2a2a2a; padding:10px; border-radius:5px;">
                            <div style="font-size:0.8em; color:#888;">基础 HP</div>
                            <div style="font-size:1.2em; color:#e74c3c; font-weight:bold; margin-top:5px;">${charData['角色基础HP']}</div>
                        </div>
                        <div style="flex:1; background:#2a2a2a; padding:10px; border-radius:5px;">
                            <div style="font-size:0.8em; color:#888;">基础 ATK</div>
                            <div style="font-size:1.2em; color:#3498db; font-weight:bold; margin-top:5px;">${charData['角色基础atk']}</div>
                        </div>
                    </div>
                </div>
                ${slotIndex > 0 ? buildCharaSkillSlotsHtml(slotIndex, charData) : ''}
                
                <!-- Bonus Summary Area -->
                <div id="char-bonus-summary-${slotIndex}" class="theme-custom" style="margin-top: 15px; display: none;">
                    <div class="section-title">加成汇总</div>
                    <div class="bonus-list" style="display:flex; flex-wrap:wrap; gap:8px; font-size:0.8em; color:#bbb;"></div>
                </div>

                <!-- Ring Configuration -->
                <div class="theme-custom" style="margin-top: 15px;">
                    <div class="section-title toggle-header" onclick="toggleSection(this)">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span>戒指 (Ring)</span>
                            <img src="images/icon/icon_augment2_l.png" id="marriage-ring-${slotIndex}" class="marriage-ring-icon" title="婚戒 (未激活)" onclick="toggleMarriageRing(${slotIndex}); event.stopPropagation();">
                        </div>
                    </div>
                    <div class="toggle-content" style="display: none;">
                        <div class="ring-config-section">
                            <div class="ring-form-group">
                                <label>攻击力 (0-3000)</label>
                                <input type="number" class="mc-form-control" id="ring-atk-${slotIndex}" min="0" max="3000" step="100" value="0" onchange="validateRingInput(this); saveCharacterBonusToLocal(${slotIndex})">
                            </div>
                            <div class="ring-form-group">
                                <label>HP (0-1500)</label>
                                <input type="number" class="mc-form-control" id="ring-hp-${slotIndex}" min="0" max="1500" step="100" value="0" onchange="validateRingInput(this); saveCharacterBonusToLocal(${slotIndex})">
                            </div>
                            <div class="ring-form-group">
                                <label>追加属性 B</label>
                                <div style="display: flex; gap: 10px;">
                                    <select class="mc-form-control" id="ring-b-type-${slotIndex}" style="flex: 2;" onchange="onRingTypeChange(${slotIndex}, 'b'); saveCharacterBonusToLocal(${slotIndex})">
                                        <option value="none">-- 请选择 --</option>
                                        <option value="crit_rate">暴击率 (18-30%)</option>
                                        <option value="skill_dmg_cap">技能伤害上限 (10-15%)</option>
                                        <option value="ca_dmg">奥义伤害 (18-30%)</option>
                                        <option value="ca_dmg_cap">奥义伤害上限 (10-15%)</option>
                                        <option value="enmity">背水 (5-10)</option>
                                        <option value="stamina">浑身 (5-10)</option>
                                        <option value="debuff_success">弱体成功率 (10-15%)</option>
                                    </select>
                                    <input type="number" class="mc-form-control" id="ring-b-value-${slotIndex}" style="flex: 1;" placeholder="数值" onchange="validateRingInput(this); saveCharacterBonusToLocal(${slotIndex})">
                                </div>
                            </div>
                            <div class="ring-form-group">
                                <label>追加属性 C</label>
                                <div style="display: flex; gap: 10px;">
                                    <select class="mc-form-control" id="ring-c-type-${slotIndex}" style="flex: 2;" onchange="onRingTypeChange(${slotIndex}, 'c'); saveCharacterBonusToLocal(${slotIndex})">
                                        <option value="none">-- 请选择 --</option>
                                        <option value="da_rate">DA概率 (10-15%)</option>
                                        <option value="ta_rate">TA概率 (5-10%)</option>
                                        <option value="def">防御 (10-20%)</option>
                                        <option value="dodge_rate">回避 (5-10%)</option>
                                        <option value="debuff_resist">弱体耐性 (10-15%)</option>
                                        <option value="healing_boost">回复性能 (15-30%)</option>
                                    </select>
                                    <input type="number" class="mc-form-control" id="ring-c-value-${slotIndex}" style="flex: 1;" placeholder="数值" onchange="validateRingInput(this); saveCharacterBonusToLocal(${slotIndex})">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Earring Configuration -->
                <div class="theme-custom" style="margin-top: 10px;">
                    <div class="section-title toggle-header" onclick="toggleSection(this)">耳饰 (Earring)</div>
                    <div class="toggle-content" style="display: none;">
                        <div class="ring-config-section">
                            <div class="ring-form-group">
                                <label>追加属性</label>
                                <div style="display: flex; gap: 10px;">
                                    <select class="mc-form-control" id="earring-type-${slotIndex}" style="flex: 2;" onchange="onEarringTypeChange(${slotIndex}); saveCharacterBonusToLocal(${slotIndex})">
                                        <option value="none">-- 请选择 --</option>
                                        <option value="da_rate">DA概率 (10-17%)</option>
                                        <option value="ta_rate">TA概率 (5-12%)</option>
                                        <option value="element_atk">属性攻击 (15-22%)</option>
                                        <option value="element_resist">属性减轻 (5-12%)</option>
                                        <option value="stamina">浑身 (5-12)</option>
                                        <option value="enmity">背水 (5-12)</option>
                                        <option value="supp_dmg">伤害上升 (5-12)</option>
                                        <option value="crit_rate">暴击率 (18-35%)</option>
                                        <option value="counter_dodge">反击(回避) (5-12%)</option>
                                        <option value="counter_dmg">反击(受伤) (10-17%)</option>
                                    </select>
                                    <input type="number" class="mc-form-control" id="earring-value-${slotIndex}" style="flex: 1;" placeholder="数值" onchange="validateRingInput(this); saveCharacterBonusToLocal(${slotIndex})">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Artifacts Configuration -->
                <div class="theme-custom" style="margin-top: 10px;">
                    <div class="section-title toggle-header" onclick="toggleSection(this)">神器 (Artifacts)</div>
                    <div class="toggle-content" style="display: none;">
                        <div class="ring-config-section">
                            <!-- Skill 1 -->
                            <div class="ring-form-group">
                                <label>技能 1 (Group I)</label>
                                <div style="display: flex; gap: 5px; align-items:center;">
                                    <select class="mc-form-control" id="artifacts-1-type-${slotIndex}" style="flex: 2;" onchange="updateArtifactsStats(${slotIndex}, 1); saveCharacterBonusToLocal(${slotIndex})">
                                        <option value="none">-- 请选择 --</option>
                                        <option value="atk">攻击力</option>
                                        <option value="def">防御力</option>
                                        <option value="da">DA概率</option>
                                        <option value="ta">TA概率</option>
                                        <option value="hp">HP</option>
                                        <option value="ca_dmg">奥义伤害</option>
                                        <option value="skill_dmg">技能伤害</option>
                                        <option value="self_ele_atk">自属性攻击力</option>
                                        <option value="adv_ele_resist">有利属性减轻</option>
                                        <option value="crit_rate">暴击率</option>
                                        <option value="dodge">回避率</option>
                                        <option value="heal_cap">回复性能</option>
                                        <option value="debuff_succ">弱体成功率</option>
                                        <option value="debuff_res">弱体耐性</option>
                                    </select>
                                    <input type="number" class="mc-form-control" id="artifacts-1-base-${slotIndex}" style="flex: 1; text-align:center;" placeholder="基础值" onchange="validateRingInput(this); updateArtifactsStats(${slotIndex}, 1); saveCharacterBonusToLocal(${slotIndex})">
                                    <input type="number" class="mc-form-control" id="artifacts-1-lvl-${slotIndex}" value="1" min="1" max="5" style="width: 50px; text-align:center;" onchange="validateArtifactsLevel(${slotIndex}, 1); updateArtifactsStats(${slotIndex}, 1); saveCharacterBonusToLocal(${slotIndex})">
                                    <span id="artifacts-1-val-${slotIndex}" style="font-size:0.8em; color:#aaa; width:60px; text-align:right;">-</span>
                                </div>
                            </div>
                            <!-- Skill 2 -->
                            <div class="ring-form-group">
                                <label>技能 2 (Group I)</label>
                                <div style="display: flex; gap: 5px; align-items:center;">
                                    <select class="mc-form-control" id="artifacts-2-type-${slotIndex}" style="flex: 2;" onchange="updateArtifactsStats(${slotIndex}, 2); saveCharacterBonusToLocal(${slotIndex})">
                                        <option value="none">-- 请选择 --</option>
                                        <option value="atk">攻击力</option>
                                        <option value="def">防御力</option>
                                        <option value="da">DA概率</option>
                                        <option value="ta">TA概率</option>
                                        <option value="hp">HP</option>
                                        <option value="ca_dmg">奥义伤害</option>
                                        <option value="skill_dmg">技能伤害</option>
                                        <option value="self_ele_atk">自属性攻击力</option>
                                        <option value="adv_ele_resist">有利属性减轻</option>
                                        <option value="crit_rate">暴击率</option>
                                        <option value="dodge">回避率</option>
                                        <option value="heal_cap">回复性能</option>
                                        <option value="debuff_succ">弱体成功率</option>
                                        <option value="debuff_res">弱体耐性</option>
                                    </select>
                                    <input type="number" class="mc-form-control" id="artifacts-2-base-${slotIndex}" style="flex: 1; text-align:center;" placeholder="基础值" onchange="validateRingInput(this); updateArtifactsStats(${slotIndex}, 2); saveCharacterBonusToLocal(${slotIndex})">
                                    <input type="number" class="mc-form-control" id="artifacts-2-lvl-${slotIndex}" value="1" min="1" max="5" style="width: 50px; text-align:center;" onchange="validateArtifactsLevel(${slotIndex}, 2); updateArtifactsStats(${slotIndex}, 2); saveCharacterBonusToLocal(${slotIndex})">
                                    <span id="artifacts-2-val-${slotIndex}" style="font-size:0.8em; color:#aaa; width:60px; text-align:right;">-</span>
                                </div>
                            </div>
                            <!-- Skill 3 -->
                            <div class="ring-form-group">
                                <label>技能 3 (Group II)</label>
                                <div style="display: flex; gap: 5px; align-items:center;">
                                    <select class="mc-form-control" id="artifacts-3-type-${slotIndex}" style="flex: 2;" onchange="updateArtifactsStats(${slotIndex}, 3); saveCharacterBonusToLocal(${slotIndex})">
                                        <option value="none">-- 请选择 --</option>
                                        <option value="na_cap">平A上限</option>
                                        <option value="skill_cap">技伤上限</option>
                                        <option value="ca_cap">奥义上限</option>
                                        <option value="ca_spec_cap">奥义特殊上限</option>
                                        <option value="crit_cap">暴击时上限</option>
                                        <option value="na_cap_mix_1">上限混合1</option>
                                        <option value="skill_cap_mix_1">上限混合2</option>
                                        <option value="ca_cap_mix_1">上限混合3</option>
                                        <option value="na_supp">平A增伤</option>
                                        <option value="skill_supp">技伤增伤</option>
                                        <option value="ca_supp">奥义增伤</option>
                                        <option value="chain_supp">CB增伤</option>
                                        <option value="ta_hp_50">HP>50% TA UP</option>
                                        <option value="amp_hp_100">HP=100% 伤害增幅</option>
                                        <option value="hp_def_down">HP上升/防御-70%</option>
                                        <option value="block_hp_50">HP<50% 格挡</option>
                                        <option value="refresh">再生</option>
                                        <option value="turn_dmg_red">回合伤害减轻</option>
                                        <option value="debuff_clear">概率净化</option>
                                        <option value="dispel_guard">概率驱散防御</option>
                                    </select>
                                    <input type="number" class="mc-form-control" id="artifacts-3-base-${slotIndex}" style="flex: 1; text-align:center;" placeholder="基础值" onchange="validateRingInput(this); updateArtifactsStats(${slotIndex}, 3); saveCharacterBonusToLocal(${slotIndex})">
                                    <input type="number" class="mc-form-control" id="artifacts-3-lvl-${slotIndex}" value="1" min="1" max="5" style="width: 50px; text-align:center;" onchange="validateArtifactsLevel(${slotIndex}, 3); updateArtifactsStats(${slotIndex}, 3); saveCharacterBonusToLocal(${slotIndex})">
                                    <span id="artifacts-3-val-${slotIndex}" style="font-size:0.8em; color:#aaa; width:60px; text-align:right;">-</span>
                                </div>
                            </div>
                            <!-- Skill 4 -->
                            <div class="ring-form-group">
                                <label>技能 4 (Group III)</label>
                                <div style="display: flex; gap: 5px; align-items:center;">
                                    <select class="mc-form-control" id="artifacts-4-type-${slotIndex}" style="flex: 2;" onchange="updateArtifactsStats(${slotIndex}, 4); saveCharacterBonusToLocal(${slotIndex})">
                                        <option value="none">-- 请选择 --</option>
                                        <option value="start_dmg_cut">开局减伤</option>
                                        <option value="start_buff">开局随机Buff</option>
                                        <option value="start_prep">开局耗HP准备上限UP</option>
                                        <option value="death_buff">战斗不能:全队Buff</option>
                                        <option value="enter_amp">登场时增幅</option>
                                        <option value="turn_heal">回合结束回血</option>
                                        <option value="hit_multi">乱击(x次伤害)</option>
                                        <option value="target_echo">追击(x次受击)</option>
                                        <option value="s1_cd_cut">1技CD缩短</option>
                                        <option value="link_cd_cut">Link技CD缩短</option>
                                        <option value="debuff_dmg_up">受击增幅(弱体技)</option>
                                        <option value="heal_echo">追击(回复技)</option>
                                        <option value="skill_cap_stack">上限UP(技能x次)</option>
                                        <option value="long_cd_amp">增幅(长CD技)</option>
                                        <option value="turn_dispel">回合结束驱散</option>
                                        <option value="turn_skip">回合结束经过回合+5</option>
                                        <option value="ca_gauge_supp">予伤(奥义消耗)</option>
                                        <option value="no_atk_buff">未攻击强化</option>
                                        <option value="hp_loss_dmg">无属性伤(HP消耗)</option>
                                        <option value="start_barrier">开局屏障</option>
                                        <option value="start_multi">概率乱击</option>
                                        <option value="skill_dmg_supp">技伤予伤UP</option>
                                        <option value="sa_buff">SA发动强化</option>
                                        <option value="potion_fc">FC槽UP(药水)</option>
                                        <option value="debuff_block">格挡(敌弱体<3)</option>
                                        <option value="exp_up">经验值UP</option>
                                        <option value="drop_up">掉落率UP</option>
                                        <option value="earring_drop">耳饰掉落</option>
                                        <option value="sub_debuff">后排随机弱体</option>
                                    </select>
                                    <input type="number" class="mc-form-control" id="artifacts-4-base-${slotIndex}" style="flex: 1; text-align:center;" placeholder="基础值" onchange="validateRingInput(this); updateArtifactsStats(${slotIndex}, 4); saveCharacterBonusToLocal(${slotIndex})">
                                    <input type="number" class="mc-form-control" id="artifacts-4-lvl-${slotIndex}" value="1" min="1" max="5" style="width: 50px; text-align:center;" onchange="validateArtifactsLevel(${slotIndex}, 4); updateArtifactsStats(${slotIndex}, 4); saveCharacterBonusToLocal(${slotIndex})">
                                    <span id="artifacts-4-val-${slotIndex}" style="font-size:0.8em; color:#aaa; width:60px; text-align:right;">-</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Awakening Configuration -->
                <div class="theme-custom" style="margin-top: 10px;">
                    <div class="section-title toggle-header" onclick="toggleSection(this)">觉醒 (Awakening)</div>
                    <div class="toggle-content" style="display: none;">
                        <div class="ring-config-section">
                            <div class="ring-form-group">
                                <label>觉醒设定</label>
                                <div style="display: flex; gap: 10px;">
                                    <select class="mc-form-control" id="awakening-type-${slotIndex}" style="flex: 2;" onchange="saveCharacterBonusToLocal(${slotIndex})">
                                        <option value="none">-- 请选择类型 --</option>
                                        <option value="balanced">平衡</option>
                                        <option value="attack">攻击</option>
                                        <option value="defense">防御</option>
                                        <option value="multiattack">连续攻击</option>
                                    </select>
                                    <select class="mc-form-control" id="awakening-lvl-${slotIndex}" style="flex: 1;" onchange="saveCharacterBonusToLocal(${slotIndex})">
                                        <option value="1">Lv 1</option>
                                        <option value="2">Lv 2</option>
                                        <option value="3">Lv 3</option>
                                        <option value="4">Lv 4</option>
                                        <option value="5">Lv 5</option>
                                        <option value="6">Lv 6</option>
                                        <option value="7">Lv 7</option>
                                        <option value="8">Lv 8</option>
                                        <option value="9">Lv 9</option>
                                        <option value="10">Lv 10</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- LB Configuration -->
                <div class="theme-custom" style="margin-top: 10px;">
                    <div class="section-title toggle-header" onclick="toggleSection(this)">能力强化 (Limit Bonus)</div>
                    <div class="toggle-content" style="display: none;">
                        <div class="lb-grid-container" style="display: flex; flex-direction: column; gap: 8px;">
                            ${Array.from({length: 10}, (_, i) => i).map(i => `
                                <div class="lb-slot" style="background: #2a2a2a; padding: 5px; border-radius: 4px; display: flex; align-items: center; gap: 8px;">
                                    <div style="font-size: 0.8em; color: #888; width: 25px; text-align: center;">${i+1}</div>
                                    <div style="flex: 1;">
                                        <select class="mc-form-control" id="lb-${i}-type-${slotIndex}" style="width: 100%; font-size: 0.8em;" onchange="updateLbStats(${slotIndex}, ${i}); saveCharacterBonusToLocal(${slotIndex})">
                                            <option value="none">-</option>
                                            <option value="atk">攻击力</option>
                                            <option value="def">防御力</option>
                                            <option value="hp">HP</option>
                                            <option value="crit">暴击</option>
                                            <option value="element_atk">属攻</option>
                                            <option value="stamina">浑身</option>
                                            <option value="enmity">背水</option>
                                            <option value="ta">TA</option>
                                            <option value="da">DA</option>
                                            <option value="ca_dmg">奥义伤害</option>
                                            <option value="ca_cap">奥义上限</option>
                                            <option value="skill_dmg">技能伤害</option>
                                            <option value="skill_cap">技能上限</option>
                                            <option value="charge_gain">奥义上升</option>
                                            <option value="debuff_resist">弱体耐性</option>
                                            <option value="heal_cap">回复性能</option>
                                            <option value="element_reduce">属性减轻</option>
                                        </select>
                                    </div>
                                    <div style="width: 50px;">
                                        <select class="mc-form-control" id="lb-${i}-lvl-${slotIndex}" style="width: 100%; font-size: 0.8em;" onchange="updateLbStats(${slotIndex}, ${i}); saveCharacterBonusToLocal(${slotIndex})">
                                            <option value="0">-</option>
                                            <option value="1">1</option>
                                            <option value="2">2</option>
                                            <option value="3">3</option>
                                        </select>
                                    </div>
                                    <div id="lb-${i}-val-${slotIndex}" style="width: 60px; text-align: right; font-size: 0.75em; color: #aaa;">-</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
            
            // 选人后尝试加载已有的本地配置
            setTimeout(() => loadCharacterBonusFromLocal(slotIndex), 50);
            
        } else {
            basicContentEl.innerHTML = `
                <div class="empty-char-slot">
                    <div class="empty-char-icon">+</div>
                    <div class="empty-char-text">点击选择角色</div>
                </div>
            `;
        }
    }

    const as = getActiveCharSlotIndex();
    if (typeof renderPartyBuffPanel === 'function') {
        renderPartyBuffPanel(as);
    }
}

// 渲染角色面板统计数据
function renderCharPanelStats(teamData) {
    if (!Array.isArray(teamData)) {
        teamData = [teamData];
    }

    const setPanelText = (ids, text) => {
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        });
    };
    
    for (let i = 0; i <= 5; i++) {
        const actualHpEl = document.getElementById('char-actual-hp-' + i);
        const currentHpEl = document.getElementById('char-current-hp-' + i);
        
        if (teamData[i]) {
            setPanelText(['char-grid-hp-' + i, 'char-detail-grid-hp-' + i], Math.round(teamData[i].gridHp).toLocaleString());
            setPanelText(['char-grid-atk-' + i, 'char-detail-grid-atk-' + i], Math.round(teamData[i].gridAtk).toLocaleString());
            setPanelText(['char-panel-hp-' + i, 'char-detail-panel-hp-' + i], Math.round(teamData[i].panelHp).toLocaleString());
            setPanelText(['char-panel-atk-' + i, 'char-detail-panel-atk-' + i], Math.round(teamData[i].panelAtk).toLocaleString());

            // 如果存在对应的显示区域，则计算并显示「实际生命值」和「当前生命值」
            if (actualHpEl && currentHpEl && typeof party !== 'undefined' && party[i] && party[i].stats) {
                try {
                    const panelHpNum = Math.round(teamData[i].panelHp || 0);
                    const teshuStats = (typeof getTeshuStats === 'function') ? getTeshuStats() : {};
                    let actualHpVal = panelHpNum;

                    if (typeof getActualHp === 'function') {
                        const res = getActualHp(panelHpNum, party[i].stats, teshuStats);
                        if (res && typeof res.actualHp === 'number' && !isNaN(res.actualHp)) {
                            actualHpVal = res.actualHp;
                        }
                    }

                    const hpSlider = document.getElementById('current-hp-slider');
                    const hpRaw = hpSlider ? (parseInt(hpSlider.value) || 100) : 100;

                    let currentHpVal;
                    if (hpRaw === 1) {
                        // 最左端特殊档：固定显示 1HP
                        currentHpVal = 1;
                    } else {
                        const hpPercent = Math.max(0, Math.min(100, hpRaw));
                        currentHpVal = new Decimal(actualHpVal)
                            .times(hpPercent)
                            .div(100)
                            .ceil()
                            .toNumber();
                    }

                    actualHpEl.textContent = Math.max(1, actualHpVal).toLocaleString();
                    currentHpEl.textContent = Math.max(1, currentHpVal).toLocaleString();
                } catch (e) {
                    actualHpEl.textContent = '-';
                    currentHpEl.textContent = '-';
                }
            } else {
                if (i === 0 && actualHpEl && currentHpEl) {
                    actualHpEl.textContent = '-';
                    currentHpEl.textContent = '-';
                }
            }
        } else {
            setPanelText(['char-grid-hp-' + i, 'char-detail-grid-hp-' + i], '-');
            setPanelText(['char-grid-atk-' + i, 'char-detail-grid-atk-' + i], '-');
            setPanelText(['char-panel-hp-' + i, 'char-detail-panel-hp-' + i], '-');
            setPanelText(['char-panel-atk-' + i, 'char-detail-panel-atk-' + i], '-');
            if (i === 0 && actualHpEl && currentHpEl) {
                actualHpEl.textContent = '-';
                currentHpEl.textContent = '-';
            }
        }
    }
}

// ==========================================
// 加成项逻辑
// ==========================================

const RING_STATS_DATA = {
    // A组：攻击/上限/弱体相关
    'crit_rate':      { min: 10, max: 30, step: 1 }, // 10~30%
    'skill_dmg_cap':  { min: 6,  max: 15, step: 1 }, // 6~15%
    'ca_dmg':         { min: 10, max: 30, step: 1 }, // 10~30%
    'ca_dmg_cap':     { min: 6,  max: 15, step: 1 }, // 6~15%
    'debuff_success': { min: 6,  max: 15, step: 1 }, // 6~15%
    // 浑身/背水为等级 1~10
    'enmity':         { min: 1,  max: 10, step: 1 }, // 背水+1~+10
    'stamina':        { min: 1,  max: 10, step: 1 }, // 浑身+1~+10
    // B组：防御/回复/连击等
    'def':            { min: 6,  max: 20, step: 1 }, // 6~20%
    'healing_boost':  { min: 3,  max: 30, step: 1 }, // 3~30%
    'debuff_resist':  { min: 6,  max: 15, step: 1 }, // 6~15%
    'dodge_rate':     { min: 1,  max: 10, step: 1 }, // 1~10%
    'da_rate':        { min: 6,  max: 15, step: 1 }, // 6~15%
    'ta_rate':        { min: 1,  max: 10, step: 1 }  // 1~10%
};

const EARRING_STATS_DATA = {
    'da_rate': { min: 10, max: 17, step: 1 },
    'ta_rate': { min: 5, max: 12, step: 1 },
    'element_atk': { min: 15, max: 22, step: 1 },
    'element_resist': { min: 5, max: 12, step: 1 },
    'stamina': { min: 5, max: 12, step: 1 },
    'enmity': { min: 5, max: 12, step: 1 },
    'supp_dmg': { min: 5, max: 12, step: 1 },
    'crit_rate': { min: 18, max: 35, step: 1 },
    'counter_dodge': { min: 5, max: 12, step: 1 },
    'counter_dmg': { min: 10, max: 17, step: 1 }
};

const ARTIFACTS_SKILLS_I = {
    'atk': { min: 1320, max: 1800, growth: 300, unit: '', desc: '攻击力 +x' },
    'def': { min: 8.8, max: 12, growth: 2, unit: '%', desc: '防御力 +x%' },
    'da': { min: 6.6, max: 9, growth: 1.5, unit: '%', desc: 'DA +x%' },
    'ta': { min: 4.4, max: 6, growth: 1, unit: '%', desc: 'TA +x%' },
    'hp': { min: 660, max: 900, growth: 150, unit: '', desc: 'HP +x' },
    'ca_dmg': { min: 13.2, max: 18, growth: 3, unit: '%', desc: '奥义伤害 +x%' },
    'skill_dmg': { min: 13.2, max: 18, growth: 3, unit: '%', desc: '技能伤害 +x%' },
    'self_ele_atk': { min: 8.8, max: 12, growth: 2, unit: '%', desc: '自属性攻击 +x%' },
    'adv_ele_resist': { min: 4.4, max: 6, growth: 1, unit: '%', desc: '有利属性减轻 +x%' },
    'crit_rate': { min: 13.2, max: 18, growth: 3, unit: '%', desc: '暴击率 +x%' },
    'dodge': { min: 4.4, max: 6, growth: 1, unit: '%', desc: '回避率 +x%' },
    'heal_cap': { min: 13.2, max: 18, growth: 3, unit: '%', desc: '回复性能 +x%' },
    'debuff_succ': { min: 6.6, max: 9, growth: 1.5, unit: '%', desc: '弱体成功率 +x%' },
    'debuff_res': { min: 6.6, max: 9, growth: 1.5, unit: '%', desc: '弱体耐性 +x%' }
};

const ARTIFACTS_SKILLS_II = {
    'na_cap': { min: 2.2, max: 3, growth: 0.5, unit: '%', desc: '平A上限 +x%' },
    'skill_cap': { min: 8.8, max: 12, growth: 2, unit: '%', desc: '技伤上限 +x%' },
    'ca_cap': { min: 6.6, max: 9, growth: 1.5, unit: '%', desc: '奥义上限 +x%' },
    'ca_spec_cap': { min: 4.4, max: 6, growth: 1, unit: '%', desc: '奥义特殊上限 +x%' },
    'crit_cap': { min: 2.2, max: 3, growth: 0.5, unit: '%', desc: '暴击时上限 +x%' },
    'na_cap_mix_1': { min: 4.4, max: 6, growth: 1, unit: '%', desc: '平A上限+x%/技伤上限-80%/奥义上限-60%' },
    'skill_cap_mix_1': { min: 17.6, max: 24, growth: 4, unit: '%', desc: '技伤上限+x%/平A上限-20%/奥义上限-60%' },
    'ca_cap_mix_1': { min: 13.2, max: 18, growth: 3, unit: '%', desc: '奥义上限+x%/平A上限-20%/技伤上限-80%' },
    'na_supp': { min: 8800, max: 12000, growth: 2000, unit: '', desc: '平A予伤 +x' },
    'skill_supp': { min: 11000, max: 15000, growth: 2500, unit: '', desc: '技伤予伤 +x' },
    'ca_supp': { min: 110000, max: 150000, growth: 25000, unit: '', desc: '奥义予伤 +x' },
    'chain_supp': { min: 6.6, max: 9, growth: 1.5, unit: '%', desc: 'CB予伤 +x%' },
    'ta_hp_50': { min: 6.6, max: 9, growth: 1.5, unit: '%', desc: 'HP>50% TA +x%' },
    'amp_hp_100': { min: 2.2, max: 3, growth: 0.5, unit: '%', desc: 'HP=100% 增幅 +x%' },
    'hp_def_down': { min: 8.8, max: 12, growth: 2, unit: '%', desc: 'HP+x%/防御-70%' },
    'block_hp_50': { min: 8.8, max: 12, growth: 2, unit: '%', desc: 'HP<50% 格挡(x%减免)' },
    'refresh': { min: 440, max: 600, growth: 100, unit: '', desc: '再生 +x' },
    'turn_dmg_red': { min: 8.8, max: 12, growth: 2, unit: '%', desc: '回合伤害减轻 +x%' },
    'debuff_clear': { min: 20, max: 20, growth: 20, unit: '%', desc: 'x%几率净化' },
    'dispel_guard': { min: 20, max: 20, growth: 20, unit: '%', desc: 'x%几率驱散防御' }
};

const ARTIFACTS_SKILLS_III = {
    'start_dmg_cut': { min: 1000, max: 1000, growth: 1000, unit: '', desc: '开局受击减少x' },
    'start_buff': { min: 1, max: 1, growth: 1, unit: '种', desc: '开局强化x种' },
    'start_prep': { min: 10, max: 10, growth: 10, unit: '%', desc: '3T后上限+x%' },
    'death_buff': { min: 1, max: 1, growth: 1, unit: '种', desc: '退场强化x种' },
    'enter_amp': { min: 3, max: 3, growth: 3, unit: '%', desc: '登场增幅+x%' },
    'turn_heal': { min: 2000, max: 2000, growth: 2000, unit: '', desc: '回血x' },
    'hit_multi': { min: 200, max: 200, growth: -25, unit: '次', desc: '乱击(x次伤)' },
    'target_echo': { min: 7, max: 7, growth: -1, unit: '次', desc: '追击(x次目标)' },
    's1_cd_cut': { min: 30, max: 30, growth: -6, unit: '%', desc: '耗x%HP缩CD' },
    'link_cd_cut': { min: 8, max: 8, growth: -1, unit: '次', desc: 'Link缩CD(x次)' },
    'debuff_dmg_up': { min: 4, max: 4, growth: 4, unit: '%', desc: '受击增幅+x%' },
    'heal_echo': { min: 4, max: 4, growth: 4, unit: '%', desc: '下位追击x%' },
    'skill_cap_stack': { min: 5, max: 5, growth: -1, unit: '次', desc: '上限UP(x次技能)' },
    'long_cd_amp': { min: 2, max: 2, growth: 2, unit: '%', desc: '增幅+x%' },
    'turn_dispel': { min: 1, max: 1, growth: 1, unit: '%', desc: 'x%驱散' },
    'turn_skip': { min: 0.2, max: 0.2, growth: 0.2, unit: '%', desc: 'x%回合+5' },
    'ca_gauge_supp': { min: 5000, max: 5000, growth: 5000, unit: '', desc: '予伤x' },
    'no_atk_buff': { min: 1, max: 1, growth: 1, unit: '种', desc: '强化x种' },
    'hp_loss_dmg': { min: 10, max: 10, growth: 10, unit: '倍', desc: '无属性x倍' },
    'start_barrier': { min: 1000, max: 1000, growth: 500, unit: '', desc: '屏障x' },
    'start_multi': { min: 1, max: 1, growth: 1, unit: '%', desc: 'x%乱击' },
    'skill_dmg_supp': { min: 4000, max: 4000, growth: -500, unit: '万', desc: '予伤UP(x万)' },
    'sa_buff': { min: 1, max: 1, growth: 1, unit: '种', desc: '强化x种' },
    'potion_fc': { min: 3, max: 3, growth: 3, unit: '%', desc: 'FC槽+x%' },
    'debuff_block': { min: 5, max: 5, growth: 5, unit: '%', desc: '格挡x%' },
    'exp_up': { min: 1, max: 1, growth: 1, unit: '%', desc: '经验+x%' },
    'drop_up': { min: 0.5, max: 0.5, growth: 0.5, unit: '%', desc: '掉率+x%' },
    'earring_drop': { min: 0, max: 0, growth: 0, unit: '', desc: '耳饰掉落' },
    'sub_debuff': { min: 7, max: 7, growth: -1, unit: 'T', desc: '每x回合弱体' }
};

const LB_STATS_DATA = {
    'atk': { values: [500, 800, 1000], unit: '' },
    'def': { values: [5, 8, 10], unit: '%' },
    'hp': { values: [250, 500, 750], unit: '' },
    'crit': { values: [12, 20, 25], unit: '%' },
    'element_atk': { values: [5, 8, 10], unit: '%' },
    'stamina': { values: [1, 2, 3], unit: '' }, // 系数
    'enmity': { values: [1, 2, 3], unit: '' }, // 系数
    'ta': { values: [2, 4, 5], unit: '%' },
    'da': { values: [3, 5, 6], unit: '%' },
    'ca_dmg': { values: [10, 15, 20], unit: '%' },
    'ca_cap': { values: [5, 8, 10], unit: '%' },
    'skill_dmg': { values: [10, 15, 20], unit: '%' },
    'skill_cap': { values: [5, 8, 10], unit: '%' },
    'charge_gain': { values: [5, 8, 10], unit: '%' },
    'debuff_resist': { values: [5, 8, 10], unit: '%' },
    'heal_cap': { values: [10, 15, 20], unit: '%' },
    'element_reduce': { values: [2, 4, 5], unit: '%' }
};

const AWAKENING_STATS_DATA = {
    'balanced': [
        {}, // Lv1
        { baseatk: 1000 }, // Lv2
        { baseatk: 1000, basehp: 500 }, // Lv3
        { baseatk: 1000, basehp: 500, ca_dmg: 5 }, // Lv4
        { baseatk: 1000, basehp: 500, ca_dmg: 5, da: 2, ta: 2 }, // Lv5
        { baseatk: 3000, basehp: 500, ca_dmg: 5, da: 2, ta: 2 }, // Lv6
        { baseatk: 3000, basehp: 1500, ca_dmg: 5, da: 2, ta: 2 }, // Lv7
        { baseatk: 3000, basehp: 1500, ca_dmg: 20, da: 2, ta: 2 }, // Lv8
        { baseatk: 3000, basehp: 1500, ca_dmg: 20, da: 4, ta: 4 }, // Lv9
        { baseatk: 4000, basehp: 2000, ca_dmg: 20, da: 4, ta: 4 } // Lv10
    ],
    'attack': [
        {}, // Lv1
        { baseatk: 1000 },
        { baseatk: 2000 },
        { baseatk: 2000, basehp: 500 },
        { baseatk: 2000, basehp: 500, ca_dmg: 5 },
        { baseatk: 4000, basehp: 500, ca_dmg: 5 },
        { baseatk: 6000, basehp: 500, ca_dmg: 5 },
        { baseatk: 6000, basehp: 500, ca_dmg: 20 },
        { baseatk: 8000, basehp: 500, ca_dmg: 20 },
        { baseatk: 8000, basehp: 500, ca_dmg: 20, ca_dmg_cap: 15 }
    ],
    'defense': [
        {}, // Lv1
        { baseatk: 1000 },
        { baseatk: 1000, basehp: 500 },
        { baseatk: 1000, basehp: 1000 },
        { baseatk: 1000, basehp: 1000, def: 5 },
        { baseatk: 1000, basehp: 2000, def: 5 },
        { baseatk: 1000, basehp: 3000, def: 5 },
        { baseatk: 1000, basehp: 3000, def: 20 },
        { baseatk: 1000, basehp: 4000, def: 20 },
        { baseatk: 1000, basehp: 4000, def: 20, element_reduce: 5 }
    ],
    'multiattack': [
        {}, // Lv1
        { baseatk: 1000 },
        { baseatk: 1000, da: 4 },
        { baseatk: 1000, da: 4, basehp: 500 },
        { baseatk: 1000, da: 4, basehp: 500, ta: 2 },
        { baseatk: 3000, da: 4, basehp: 500, ta: 2 },
        { baseatk: 3000, da: 10, basehp: 500, ta: 2 },
        { baseatk: 3000, da: 10, basehp: 500, ta: 5 },
        { baseatk: 3000, da: 10, basehp: 500, ta: 5, na_dmg_amp: 5 },
        { baseatk: 3000, da: 10, basehp: 500, ta: 5, na_dmg_amp: 5, na_dmg_cap: 5 }
    ]
};

// ---------------------------------------------------------
// 键名映射配置
// ---------------------------------------------------------

const BONUS_KEY_MAP = {
    // 戒指映射
    'ring': {
        'crit_rate': 'chara_ring_critical_hit_rate',
        'skill_dmg_cap': 'chara_ring_skill_dmg_cap',
        'ca_dmg': 'chara_ring_ca_dmg',
        'ca_dmg_cap': 'chara_ring_ca_dmg_cap',
        'enmity': 'chara_ring_enmity',
        'stamina': 'chara_ring_stamina',
        'debuff_success': 'chara_ring_debuff_success_rate',
        'da_rate': 'chara_ring_da',
        'ta_rate': 'chara_ring_ta',
        'def': 'chara_ring_def',
        'dodge_rate': 'chara_ring_dodge_rate',
        'debuff_resist': 'chara_ring_debuff_resistance',
        'healing_boost': 'chara_ring_heal_cap'
    },
    // 耳饰映射
    'earring': {
        'da_rate': 'chara_earring_da',
        'ta_rate': 'chara_earring_ta',
        'element_atk': 'chara_earring_element_atk',
        'element_resist': 'chara_earring_anti_element_reduce',
        'stamina': 'chara_earring_stamina',
        'enmity': 'chara_earring_enmity',
        'supp_dmg': 'chara_earring_dmg_supp',
        'crit_rate': 'chara_earring_critical_hit_rate',
        'counter_dodge': 'chara_earring_counter_dodge',
        'counter_dmg': 'chara_earring_counter_dmg'
    },
    // 神器映射
    'artifacts': {
        'atk': 'chara_artifacts_baseatk',
        'def': 'chara_artifacts_def',
        'da': 'chara_artifacts_da',
        'ta': 'chara_artifacts_ta',
        'hp': 'chara_artifacts_basehp',
        'ca_dmg': 'chara_artifacts_ca_dmg',
        'skill_dmg': 'chara_artifacts_skill_dmg',
        'self_ele_atk': 'chara_artifacts_element_atk',
        'adv_ele_resist': 'chara_artifacts_anti_element_reduce',
        'crit_rate': 'chara_artifacts_critical_hit_rate',
        'dodge': 'chara_artifacts_dodge_rate',
        'heal_cap': 'chara_artifacts_heal_cap',
        'debuff_succ': 'chara_artifacts_debuff_success_rate',
        'debuff_res': 'chara_artifacts_debuff_resistance',
        'na_cap': 'chara_artifacts_na_dmg_cap',
        'skill_cap': 'chara_artifacts_skill_dmg_cap',
        'ca_cap': 'chara_artifacts_ca_dmg_cap',
        'ca_spec_cap': 'chara_artifacts_special_ca_dmg_cap',
        'crit_cap': 'chara_artifacts_crit_dmg_cap',
        'na_supp': 'chara_artifacts_na_dmg_supp',
        'skill_supp': 'chara_artifacts_skill_dmg_supp',
        'ca_supp': 'chara_artifacts_ca_dmg_supp',
        'chain_supp': 'chara_artifacts_chain_supp'
        // 其他神器特殊技能暂无直接数值映射或需特殊处理
    },
    // 觉醒映射
    'awakening': {
        'baseatk': 'chara_awakening_baseatk',
        'basehp': 'chara_awakening_basehp',
        'ca_dmg': 'chara_awakening_ca_dmg',
        'da': 'chara_awakening_da',
        'ta': 'chara_awakening_ta',
        'def': 'chara_awakening_def',
        'ca_dmg_cap': 'chara_awakening_ca_dmg_cap',
        'element_reduce': 'chara_awakening_element_reduce',
        'na_dmg_amp': 'chara_awakening_na_dmg_amp',
        'na_dmg_cap': 'chara_awakening_na_dmg_cap'
    },
    // LB映射
    'lb': {
        'atk': 'chara_lb_baseatk',
        'def': 'chara_lb_def',
        'hp': 'chara_lb_basehp',
        'crit': 'chara_lb_critical_hit_rate',
        'element_atk': 'chara_lb_element_atk',
        'stamina': 'chara_lb_stamina',
        'enmity': 'chara_lb_enmity',
        'ta': 'chara_lb_ta',
        'da': 'chara_lb_da',
        'ca_dmg': 'chara_lb_ca_dmg',
        'ca_cap': 'chara_lb_ca_dmg_cap',
        'skill_dmg': 'chara_lb_skill_dmg',
        'skill_cap': 'chara_lb_skill_dmg_cap',
        'charge_gain': 'chara_lb_charge_gain',
        'debuff_resist': 'chara_lb_debuff_resistance',
        'heal_cap': 'chara_lb_heal_cap',
        'element_reduce': 'chara_lb_anti_element_reduce'
    }
};

window.onEarringTypeChange = function(slotIndex) {
    const selectEl = document.getElementById(`earring-type-${slotIndex}`);
    const inputEl = document.getElementById(`earring-value-${slotIndex}`);
    if (!selectEl || !inputEl) return;
    const type = selectEl.value;
    const config = EARRING_STATS_DATA[type];
    if (config) {
        inputEl.min = config.min;
        inputEl.max = config.max;
        inputEl.step = config.step;
        inputEl.value = config.min; 
        inputEl.disabled = false;
    } else {
        inputEl.value = '';
        inputEl.disabled = true;
    }
};

window.onRingTypeChange = function(slotIndex, groupType) {
    const selectEl = document.getElementById(`ring-${groupType}-type-${slotIndex}`);
    const inputEl = document.getElementById(`ring-${groupType}-value-${slotIndex}`);
    if (!selectEl || !inputEl) return;
    const type = selectEl.value;
    const config = RING_STATS_DATA[type];
    if (config) {
        inputEl.min = config.min;
        inputEl.max = config.max;
        inputEl.step = config.step;
        inputEl.value = config.min;
        inputEl.disabled = false;
    } else {
        inputEl.value = '';
        inputEl.disabled = true;
    }
};

window.validateRingInput = function(inputEl) {
    const min = parseFloat(inputEl.min);
    const max = parseFloat(inputEl.max);
    const val = parseFloat(inputEl.value);
    if (isNaN(val)) return;
    if (!isNaN(min) && val < min) inputEl.value = min;
    else if (!isNaN(max) && val > max) inputEl.value = max;
};

window.updateArtifactsStats = function(slotIndex, skillSlot) {
    const type = document.getElementById(`artifacts-${skillSlot}-type-${slotIndex}`).value;
    const baseInput = document.getElementById(`artifacts-${skillSlot}-base-${slotIndex}`);
    const lvlInput = document.getElementById(`artifacts-${skillSlot}-lvl-${slotIndex}`);
    const valDisplay = document.getElementById(`artifacts-${skillSlot}-val-${slotIndex}`);
    
    if (type === 'none') {
        baseInput.disabled = true;
        baseInput.value = '';
        lvlInput.disabled = true;
        lvlInput.value = 1;
        valDisplay.textContent = '-';
        return;
    }
    
    let config = null;
    if (skillSlot <= 2) config = ARTIFACTS_SKILLS_I[type];
    else if (skillSlot === 3) config = ARTIFACTS_SKILLS_II[type];
    else if (skillSlot === 4) config = ARTIFACTS_SKILLS_III[type];
    
    if (config) {
        const step = new Decimal(config.max).minus(config.min).dividedBy(4);
        baseInput.min = config.min;
        baseInput.max = config.max;
        baseInput.step = step.toNumber() > 0 ? step.toNumber() : 1;
        baseInput.disabled = false;
        
        const currentBase = parseFloat(baseInput.value);
        if (isNaN(currentBase) || currentBase < config.min || currentBase > config.max) {
            baseInput.value = config.max;
        }
        
        lvlInput.disabled = false;
        const lvl = parseInt(lvlInput.value) || 1;
        const userBase = parseFloat(baseInput.value) || config.min;
        
        let finalVal = new Decimal(userBase).plus(new Decimal(lvl - 1).times(config.growth)).toNumber();
        if (config.unit === '%' || config.min % 1 !== 0) {
            finalVal = new Decimal(finalVal).toDP(1, Decimal.ROUND_HALF_UP).toNumber();
        }
        
        valDisplay.textContent = finalVal + config.unit;
        valDisplay.title = config.desc.replace('x', finalVal);
    }
};

window.validateArtifactsLevel = function(slotIndex, skillSlot) {
    const input = document.getElementById(`artifacts-${skillSlot}-lvl-${slotIndex}`);
    let lvl = parseInt(input.value) || 1;
    if (lvl < 1) lvl = 1;
    if (lvl > 5) lvl = 5;
    input.value = lvl;
    updateArtifactsStats(slotIndex, skillSlot);
    saveCharacterBonusToLocal(slotIndex);
};

window.updateLbStats = function(slotIndex, lbIndex) {
    const typeSelect = document.getElementById(`lb-${lbIndex}-type-${slotIndex}`);
    const lvlSelect = document.getElementById(`lb-${lbIndex}-lvl-${slotIndex}`);
    const valDisplay = document.getElementById(`lb-${lbIndex}-val-${slotIndex}`);
    
    if (!typeSelect || !lvlSelect || !valDisplay) return;
    
    const type = typeSelect.value;
    const lvl = parseInt(lvlSelect.value) || 0;
    
    if (type === 'none' || lvl === 0) {
        valDisplay.textContent = '-';
        if (type === 'none') {
            lvlSelect.value = 0;
            lvlSelect.disabled = true;
        } else {
            lvlSelect.disabled = false;
        }
        return;
    }
    
    lvlSelect.disabled = false;
    const config = LB_STATS_DATA[type];
    
    if (config && config.values[lvl-1] !== undefined) {
        valDisplay.textContent = config.values[lvl-1] + config.unit;
    } else {
        valDisplay.textContent = '-';
    }
};

// ---------------------------------------------------------
// 数据持久化与集成
// ---------------------------------------------------------

// 保存单个角色的所有加成
window.toggleMarriageRing = function(slotIndex) {
    const icon = document.getElementById(`marriage-ring-${slotIndex}`);
    if (!icon) return;
    
    const isActive = icon.classList.toggle('active');
    icon.title = isActive ? "婚戒 (已激活)" : "婚戒 (未激活)";
    
    saveCharacterBonusToLocal(slotIndex);
};

window.saveCharacterBonusToLocal = function(slotIndex) {
    const charData = currentParty[slotIndex];
    if (!charData) return;
    
    const bonuses = {
        hasMarriageRing: document.getElementById(`marriage-ring-${slotIndex}`)?.classList.contains('active') || false,
        ring: {
            atk: parseInt(document.getElementById(`ring-atk-${slotIndex}`)?.value) || 0,
            hp: parseInt(document.getElementById(`ring-hp-${slotIndex}`)?.value) || 0,
            b_type: document.getElementById(`ring-b-type-${slotIndex}`)?.value,
            b_val: parseFloat(document.getElementById(`ring-b-value-${slotIndex}`)?.value) || 0,
            c_type: document.getElementById(`ring-c-type-${slotIndex}`)?.value,
            c_val: parseFloat(document.getElementById(`ring-c-value-${slotIndex}`)?.value) || 0,
        },
        earring: {
            type: document.getElementById(`earring-type-${slotIndex}`)?.value,
            val: parseFloat(document.getElementById(`earring-value-${slotIndex}`)?.value) || 0,
        },
        artifacts: [1,2,3,4].map(i => ({
            type: document.getElementById(`artifacts-${i}-type-${slotIndex}`)?.value,
            base: parseFloat(document.getElementById(`artifacts-${i}-base-${slotIndex}`)?.value) || 0,
            lvl: parseInt(document.getElementById(`artifacts-${i}-lvl-${slotIndex}`)?.value) || 1
        })),
        awakening: {
            type: document.getElementById(`awakening-type-${slotIndex}`)?.value || 'none',
            lvl: parseInt(document.getElementById(`awakening-lvl-${slotIndex}`)?.value) || 1
        },
        lb: Array.from({length: 10}, (_, i) => ({
            type: document.getElementById(`lb-${i}-type-${slotIndex}`)?.value,
            lvl: parseInt(document.getElementById(`lb-${i}-lvl-${slotIndex}`)?.value) || 0
        }))
    };
    
    const key = typeof getCharBonusStorageKey === 'function' ? getCharBonusStorageKey(charData.名称) : ('gbf_char_bonus_' + charData.名称);
    localStorage.setItem(key, JSON.stringify(bonuses));
    console.log(`已保存角色 ${charData.名称} 的加成配置`);
    
    // 实时更新到角色对象并渲染汇总
    updateCharacterBonuses(slotIndex);
    
    if (typeof recalculate === 'function') recalculate();
};

// 更新角色对象的加成属性并显示汇总
window.updateCharacterBonuses = function(slotIndex) {
    const charData = currentParty[slotIndex];
    if (!charData) return;

    // 1. 清除旧的加成数据 (保留非加成类属性)
    // 遍历所有可能的加成键名进行重置
    Object.values(BONUS_KEY_MAP).forEach(group => {
        Object.values(group).forEach(key => {
            delete charData[key];
        });
    });
    // 清除额外的派生字段（不在 BONUS_KEY_MAP 中）
    delete charData['chara_lb_stamina_amounts'];
    delete charData['chara_lb_crit_amounts'];
    // 还要清除固定的几个
    delete charData['chara_ring_baseatk'];
    delete charData['chara_ring_basehp'];
    delete charData['chara_marriage_perpetuity_atk'];
    delete charData['chara_marriage_dmg_cap'];
    delete charData['chara_marriage_hp'];
    delete charData['chara_marriage_debuff_resistance'];

    // 2. 读取并设置新值
    
    // --- 戒指 ---
    const ringAtkInput = document.getElementById(`ring-atk-${slotIndex}`);
    const ringHpInput = document.getElementById(`ring-hp-${slotIndex}`);
    const ringAtk = parseInt(ringAtkInput?.value) || 0;
    let ringHp = 0;
    if (ringAtk > 0) {
        // 戒指提供的HP固定为攻击力的一半
        ringHp = Math.floor(ringAtk / 2);
        if (ringHpInput) {
            ringHpInput.value = ringHp;
        }
        charData['chara_ring_baseatk'] = ringAtk;
        charData['chara_ring_basehp'] = ringHp;
    }

    ['b', 'c'].forEach(suffix => {
        const type = document.getElementById(`ring-${suffix}-type-${slotIndex}`)?.value;
        const val = parseFloat(document.getElementById(`ring-${suffix}-value-${slotIndex}`)?.value) || 0;
        if (type && type !== 'none' && val > 0) {
            const key = BONUS_KEY_MAP.ring[type];
            if (key) {
                // 部分数值可能需要转换，如百分比是否需要 /100 ? 
                // 根据 constants.js 定义，format: "percent" 通常意味着存储小数 (0.1) 或者直接数值 (10)
                // 查看 constants.js，SKILL_CURVES 中的 coeff 也是几十，通常模拟器内部统一单位
                // 假设输入 10 代表 10%，如果不一致后续再调。这里直接存用户输入值，计算时处理，或者统一存小数。
                // 观察 constants.js 中的默认值，如 mc_atk_passive: 0.22，说明百分比是小数。
                // 而输入框说明是 (10-15%)，用户输入 10。
                // 所以需要转换！
                
                let finalVal = val;
                if (STAT_CONFIG.find(c => c.key === key)?.format === 'percent') {
                    finalVal = new Decimal(val).dividedBy(100).toNumber();
                }
                charData[key] = new Decimal(charData[key] || 0).plus(finalVal).toNumber();
            }
        }
    });

    // --- 耳饰 ---
    const earringType = document.getElementById(`earring-type-${slotIndex}`)?.value;
    const earringVal = parseFloat(document.getElementById(`earring-value-${slotIndex}`)?.value) || 0;
    if (earringType && earringType !== 'none' && earringVal > 0) {
        const key = BONUS_KEY_MAP.earring[earringType];
        if (key) {
            let finalVal = earringVal;
            if (STAT_CONFIG.find(c => c.key === key)?.format === 'percent') {
                finalVal = new Decimal(earringVal).dividedBy(100).toNumber();
            }
            charData[key] = new Decimal(charData[key] || 0).plus(finalVal).toNumber();
        }
    }

    // --- 神器 ---
    for (let i = 1; i <= 4; i++) {
        const type = document.getElementById(`artifacts-${i}-type-${slotIndex}`)?.value;
        // 注意：神器取值直接取计算后的显示值可能比较麻烦，直接重新计算一遍比较稳妥
        // 或者直接读取那个 span 的值？不行，span 带单位。
        // 还是用 updateArtifactsStats 的逻辑重新算一遍比较好，或者直接把 updateArtifactsStats 的结果存到一个 data 属性上？
        // 为了简单，这里复用一下计算逻辑。
        
        const base = parseFloat(document.getElementById(`artifacts-${i}-base-${slotIndex}`)?.value) || 0;
        const lvl = parseInt(document.getElementById(`artifacts-${i}-lvl-${slotIndex}`)?.value) || 1;
        
        if (type && type !== 'none') {
            let config = null;
            if (i <= 2) config = ARTIFACTS_SKILLS_I[type];
            else if (i === 3) config = ARTIFACTS_SKILLS_II[type];
            else if (i === 4) config = ARTIFACTS_SKILLS_III[type];
            
            if (config) {
                let val = new Decimal(base).plus(new Decimal(lvl - 1).times(config.growth)).toNumber();
                if (config.unit === '%' || config.min % 1 !== 0) {
                    val = new Decimal(val).toDP(1, Decimal.ROUND_HALF_UP).toNumber();
                }
                
                const key = BONUS_KEY_MAP.artifacts[type];
                if (key) {
                    let finalVal = val;
                    if (STAT_CONFIG.find(c => c.key === key)?.format === 'percent') {
                        finalVal = new Decimal(val).dividedBy(100).toNumber();
                    }
                    charData[key] = new Decimal(charData[key] || 0).plus(finalVal).toNumber();
                }
            }
        }
    }

    // --- 觉醒 ---
    const awakeningType = document.getElementById(`awakening-type-${slotIndex}`)?.value;
    const awakeningLvl = parseInt(document.getElementById(`awakening-lvl-${slotIndex}`)?.value) || 1;
    if (typeof AWAKENING_STATS_DATA !== 'undefined') {
        if (awakeningType && awakeningType !== 'none' && AWAKENING_STATS_DATA[awakeningType]) {
            const stats = AWAKENING_STATS_DATA[awakeningType][awakeningLvl - 1]; // 0-indexed
            if (stats) {
                for (const [statKey, statVal] of Object.entries(stats)) {
                    // 防御性判断：确认 BONUS_KEY_MAP 中是否有 awakening
                    if (BONUS_KEY_MAP.awakening) {
                        const charaKey = BONUS_KEY_MAP.awakening[statKey];
                        if (charaKey) {
                            let finalVal = statVal;
                            if (STAT_CONFIG.find(c => c.key === charaKey)?.format === 'percent') {
                                finalVal = new Decimal(statVal).dividedBy(100).toNumber();
                            }
                            charData[charaKey] = new Decimal(charData[charaKey] || 0).plus(finalVal).toNumber();
                        }
                    }
                }
            }
        }
    }

    // --- 婚戒 ---
    const hasMarriageRing = document.getElementById(`marriage-ring-${slotIndex}`)?.classList.contains('active');
    if (hasMarriageRing) {
        charData['chara_marriage_perpetuity_atk'] = 0.10; // 独立攻刃 +10%
        charData['chara_marriage_dmg_cap'] = 0.05;        // 上限 +5%
        charData['chara_marriage_hp'] = 0.10;             // HP +10% (通常没有这个？ 只有久远戒指是 攻击+10 上限+5 LB+10。婚戒通常指久远戒指)
        // 实际上久远戒指给的是：独立攻刃+10%，上限+5%，LB点数+10。
        // 还有一个是 "觉醒戒指"，那个是耳饰。
        // 代码里既然写了 "婚戒 (Marriage)" 对应 "Perpetuity Ring" (久远之指轮)
        // 暂时按 独立10% 上限5% 算。
        // 常量里还有 chara_marriage_hp 和 chara_marriage_debuff_resistance，如果用户想加可以再扩充，目前按默认效果给。
    }

    // --- LB ---
    for (let i = 0; i < 10; i++) {
        const type = document.getElementById(`lb-${i}-type-${slotIndex}`)?.value;
        const lvl = parseInt(document.getElementById(`lb-${i}-lvl-${slotIndex}`)?.value) || 0;
        
        if (type && type !== 'none' && lvl > 0) {
            const config = LB_STATS_DATA[type];
            if (config && config.values[lvl-1] !== undefined) {
                const val = config.values[lvl-1];
                const key = BONUS_KEY_MAP.lb[type];
                if (key) {
                    let finalVal = val;
                    if (STAT_CONFIG.find(c => c.key === key)?.format === 'percent') {
                        finalVal = new Decimal(val).dividedBy(100).toNumber();
                    }

                    // 特殊处理：浑身LB（stamina）需要保留每个格子的独立量（避免多个LB合并成数值后无法正确套曲线）
                    // - chara_lb_stamina 仍保留数值累加（用于展示/兼容）
                    // - 新增 chara_lb_stamina_amounts: [1,2,3,...] 用于按格子逐个套用强壮曲线
                    if (type === 'stamina') {
                        if (!Array.isArray(charData['chara_lb_stamina_amounts'])) {
                            charData['chara_lb_stamina_amounts'] = [];
                        }
                        charData['chara_lb_stamina_amounts'].push(finalVal);
                    }

                    // 暴击LB：★1/2/3 = 12%/20%/25% 发动与额外伤害；多格各自独立参与期望暴击
                    if (type === 'crit') {
                        if (!Array.isArray(charData['chara_lb_crit_amounts'])) {
                            charData['chara_lb_crit_amounts'] = [];
                        }
                        charData['chara_lb_crit_amounts'].push(finalVal);
                    }

                    charData[key] = new Decimal(charData[key] || 0).plus(finalVal).toNumber();
                }
            }
        }
    }
    
    // 3. 渲染汇总区域
    renderCharacterBonuses(slotIndex);
};

// 渲染角色加成汇总
window.renderCharacterBonuses = function(slotIndex) {
    const charData = currentParty[slotIndex];
    if (!charData) return;
    
    // 找到汇总容器
    const summaryContainer = document.getElementById(`char-bonus-summary-${slotIndex}`);
    if (!summaryContainer) return;
    
    const listEl = summaryContainer.querySelector('.bonus-list');
    if (!listEl) return;
    
    // 收集所有有值的加成属性
    const summaryData = {
        baseatk: 0,
        basehp: 0,
        da: 0,
        ta: 0,
        skill_dmg_cap: 0,
        ca_dmg_cap: 0,
        na_dmg_cap: 0,
        ca_dmg: 0,
        skill_dmg: 0,
        stamina: 0,
        enmity: 0,
        def: 0,
        debuff_resist: 0,
        heal_cap: 0,
        element_atk: 0
    };

    const summaryMap = {
        'chara_ring_baseatk': 'baseatk', 'chara_artifacts_baseatk': 'baseatk', 'chara_lb_baseatk': 'baseatk', 'chara_awakening_baseatk': 'baseatk',
        'chara_ring_basehp': 'basehp', 'chara_artifacts_basehp': 'basehp', 'chara_lb_basehp': 'basehp', 'chara_awakening_basehp': 'basehp',
        'chara_ring_da': 'da', 'chara_earring_da': 'da', 'chara_artifacts_da': 'da', 'chara_lb_da': 'da', 'chara_awakening_da': 'da', '角色基础da': 'da',
        'chara_ring_ta': 'ta', 'chara_earring_ta': 'ta', 'chara_artifacts_ta': 'ta', 'chara_lb_ta': 'ta', 'chara_awakening_ta': 'ta', '角色基础ta': 'ta',
        'chara_ring_skill_dmg_cap': 'skill_dmg_cap', 'chara_artifacts_skill_dmg_cap': 'skill_dmg_cap', 'chara_lb_skill_dmg_cap': 'skill_dmg_cap',
        'chara_ring_ca_dmg_cap': 'ca_dmg_cap', 'chara_artifacts_ca_dmg_cap': 'ca_dmg_cap', 'chara_lb_ca_dmg_cap': 'ca_dmg_cap', 'chara_awakening_ca_dmg_cap': 'ca_dmg_cap',
        'chara_artifacts_na_dmg_cap': 'na_dmg_cap', 'chara_awakening_na_dmg_cap': 'na_dmg_cap',
        'chara_ring_ca_dmg': 'ca_dmg', 'chara_artifacts_ca_dmg': 'ca_dmg', 'chara_lb_ca_dmg': 'ca_dmg', 'chara_awakening_ca_dmg': 'ca_dmg',
        'chara_artifacts_skill_dmg': 'skill_dmg', 'chara_lb_skill_dmg': 'skill_dmg',
        'chara_ring_stamina': 'stamina', 'chara_earring_stamina': 'stamina', 'chara_lb_stamina': 'stamina',
        'chara_ring_enmity': 'enmity', 'chara_earring_enmity': 'enmity', 'chara_lb_enmity': 'enmity',
        'chara_ring_def': 'def', 'chara_artifacts_def': 'def', 'chara_lb_def': 'def', 'chara_awakening_def': 'def',
        'chara_ring_debuff_resistance': 'debuff_resist', 'chara_artifacts_debuff_resistance': 'debuff_resist', 'chara_lb_debuff_resistance': 'debuff_resist', 'chara_marriage_debuff_resistance': 'debuff_resist',
        'chara_ring_heal_cap': 'heal_cap', 'chara_artifacts_heal_cap': 'heal_cap', 'chara_lb_heal_cap': 'heal_cap',
        'chara_earring_element_atk': 'element_atk', 'chara_artifacts_element_atk': 'element_atk', 'chara_lb_element_atk': 'element_atk'
    };

    const summaryLabels = {
        baseatk: { label: '总额外攻击力', format: 'fixed' },
        basehp: { label: '总额外HP', format: 'fixed' },
        da: { label: 'DA概率', format: 'percent' },
        ta: { label: 'TA概率', format: 'percent' },
        skill_dmg_cap: { label: '技能上限', format: 'percent' },
        ca_dmg_cap: { label: '奥义上限', format: 'percent' },
        na_dmg_cap: { label: '平A上限', format: 'percent' },
        ca_dmg: { label: '奥义伤害', format: 'percent' },
        skill_dmg: { label: '技能伤害', format: 'percent' },
        stamina: { label: '浑身', format: 'fixed' },
        enmity: { label: '背水', format: 'fixed' },
        def: { label: '防御力', format: 'percent' },
        debuff_resist: { label: '弱体耐性', format: 'percent' },
        heal_cap: { label: '回复性能', format: 'percent' },
        element_atk: { label: '属性攻击', format: 'percent' }
    };

    const independentBonuses = [];
    const baseRateDetails = [];

    function getDisplayCharaBonusValue(config, rawValue) {
        let normalizedValue = rawValue;
        if (config.key === '角色基础da' || config.key === '角色基础ta') {
            normalizedValue = new Decimal(rawValue).dividedBy(100).toNumber();
        }
        let displayVal = normalizedValue;
        let unit = '';
        if (config.format === 'percent') {
            displayVal = new Decimal(normalizedValue).times(100).toDP(1, Decimal.ROUND_HALF_UP).toNumber();
            unit = '%';
        } else {
            displayVal = Math.round(normalizedValue);
        }
        return { normalizedValue, displayVal, unit };
    }

    // 遍历所有有值的加成属性
    STAT_CONFIG.filter(c => c.category === 'charabonus').forEach(config => {
        const val = charData[config.key];
        if (val && val !== 0) {
            const display = getDisplayCharaBonusValue(config, val);
            const summaryKey = summaryMap[config.key];
            if (summaryKey) {
                // 如果在汇总映射中，则累加
                summaryData[summaryKey] += display.normalizedValue;
                if (config.key === '角色基础da' || config.key === '角色基础ta') {
                    baseRateDetails.push(`<span style="background:#222; padding:3px 8px; border-radius:4px; border:1px solid #444; margin-right:5px; margin-bottom:5px; display:inline-block; font-size: 0.9em;">
                        <span style="color:#aaa; margin-right:3px; font-size:0.85em;">[基础]</span>${config.label}: <span style="color:#fe9; font-weight:bold;">${display.displayVal}${display.unit}</span>
                    </span>`);
                }
            } else {
                // 不归类（例如：暴击、特殊减轻、各种予伤等独立词条）
                let displayVal = display.displayVal;
                let unit = display.unit;

                // 提取来源标记
                let sourcePrefix = "";
                let sourceColor = "#aaa";
                if (config.key.includes("ring_")) { sourcePrefix = "[戒指]"; sourceColor = "#f39c12"; }
                else if (config.key.includes("earring_")) { sourcePrefix = "[耳饰]"; sourceColor = "#3498db"; }
                else if (config.key.includes("artifacts_")) { sourcePrefix = "[神器]"; sourceColor = "#9b59b6"; }
                else if (config.key.includes("lb_")) { sourcePrefix = "[LB]"; sourceColor = "#2ecc71"; }
                else if (config.key.includes("marriage_")) { sourcePrefix = "[婚戒]"; sourceColor = "#e74c3c"; }
                else if (config.key.includes("awakening_")) { sourcePrefix = "[觉醒]"; sourceColor = "#e67e22"; }

                independentBonuses.push(`<span style="background:#222; padding:3px 8px; border-radius:4px; border:1px solid #444; margin-right:5px; margin-bottom:5px; display:inline-block; font-size: 0.9em;">
                    <span style="color:${sourceColor}; margin-right:3px; font-size:0.85em;">${sourcePrefix}</span>${config.label}: <span style="color:#fe9; font-weight:bold;">${displayVal}${unit}</span>
                </span>`);
            }
        }
    });

    const summaryHtmls = [];
    Object.keys(summaryData).forEach(key => {
        if (summaryData[key] > 0) {
            let displayVal = summaryData[key];
            let unit = '';
            if (summaryLabels[key].format === 'percent') {
                displayVal = new Decimal(displayVal).times(100).toDP(1, Decimal.ROUND_HALF_UP).toNumber();
                unit = '%';
            } else {
                displayVal = Math.round(displayVal);
            }
            summaryHtmls.push(`<span style="background:#2c3e50; padding:3px 8px; border-radius:4px; border:1px solid #34495e; margin-right:5px; margin-bottom:5px; display:inline-block; font-size: 0.9em;">
                ${summaryLabels[key].label}: <span style="color:#2ecc71; font-weight:bold;">+${displayVal}${unit}</span>
            </span>`);
        }
    });

    let finalHtml = '';
    if (summaryHtmls.length > 0) {
        finalHtml += `<div style="margin-bottom: 8px;">
            <div style="font-size:0.8em; color:#888; margin-bottom: 4px; border-bottom:1px dashed #444; padding-bottom:2px;">[汇总属性]</div>
            ${summaryHtmls.join('')}
        </div>`;
    }
    if (baseRateDetails.length > 0) {
        finalHtml += `<div style="margin-bottom: 8px;">
            <div style="font-size:0.8em; color:#888; margin-bottom: 4px; border-bottom:1px dashed #444; padding-bottom:2px;">[基础属性]</div>
            ${baseRateDetails.join('')}
        </div>`;
    }
    if (independentBonuses.length > 0) {
        finalHtml += `<div>
            <div style="font-size:0.8em; color:#888; margin-bottom: 4px; border-bottom:1px dashed #444; padding-bottom:2px;">[独立属性]</div>
            ${independentBonuses.join('')}
        </div>`;
    }

    if (finalHtml !== '') {
        listEl.innerHTML = finalHtml;
        summaryContainer.style.display = 'block';
    } else {
        listEl.innerHTML = '';
        summaryContainer.style.display = 'none';
    }
};

// 加载单个角色的加成到UI
window.loadCharacterBonusFromLocal = function(slotIndex) {
    const charData = currentParty[slotIndex];
    if (!charData) return;
    
    const key = typeof getCharBonusStorageKey === 'function' ? getCharBonusStorageKey(charData.名称) : ('gbf_char_bonus_' + charData.名称);
    const saved = localStorage.getItem(key);
    if (!saved) return;
    
    try {
        const b = JSON.parse(saved);
        
        // Marriage Ring
        const mRingIcon = document.getElementById(`marriage-ring-${slotIndex}`);
        if (mRingIcon) {
            if (b.hasMarriageRing) {
                mRingIcon.classList.add('active');
                mRingIcon.title = "婚戒 (已激活)";
            } else {
                mRingIcon.classList.remove('active');
                mRingIcon.title = "婚戒 (未激活)";
            }
        }

        // Ring
        if (b.ring) {
            document.getElementById(`ring-atk-${slotIndex}`).value = b.ring.atk;
            document.getElementById(`ring-hp-${slotIndex}`).value = b.ring.hp;
            document.getElementById(`ring-b-type-${slotIndex}`).value = b.ring.b_type;
            document.getElementById(`ring-b-value-${slotIndex}`).value = b.ring.b_val;
            document.getElementById(`ring-c-type-${slotIndex}`).value = b.ring.c_type;
            document.getElementById(`ring-c-value-${slotIndex}`).value = b.ring.c_val;
        }
        
        // Earring
        if (b.earring) {
            document.getElementById(`earring-type-${slotIndex}`).value = b.earring.type;
            document.getElementById(`earring-value-${slotIndex}`).value = b.earring.val;
        }
        
        // Artifacts
        if (b.artifacts) {
            b.artifacts.forEach((r, i) => {
                const idx = i + 1;
                document.getElementById(`artifacts-${idx}-type-${slotIndex}`).value = r.type;
                updateArtifactsStats(slotIndex, idx); // 先更新状态以便设置min/max
                document.getElementById(`artifacts-${idx}-base-${slotIndex}`).value = r.base;
                document.getElementById(`artifacts-${idx}-lvl-${slotIndex}`).value = r.lvl;
                updateArtifactsStats(slotIndex, idx); // 再次更新以计算最终值
            });
        }

        // Awakening
        if (b.awakening) {
            const awkTypeEl = document.getElementById(`awakening-type-${slotIndex}`);
            const awkLvlEl = document.getElementById(`awakening-lvl-${slotIndex}`);
            if (awkTypeEl && awkLvlEl) {
                awkTypeEl.value = b.awakening.type || 'none';
                awkLvlEl.value = b.awakening.lvl || 1;
            }
        }

        // LB
        if (b.lb) {
            b.lb.forEach((l, i) => {
                const typeEl = document.getElementById(`lb-${i}-type-${slotIndex}`);
                const lvlEl = document.getElementById(`lb-${i}-lvl-${slotIndex}`);
                if (typeEl && lvlEl) {
                    typeEl.value = l.type;
                    lvlEl.value = l.lvl;
                    updateLbStats(slotIndex, i);
                }
            });
        }
        
        // 加载完成后更新汇总
        updateCharacterBonuses(slotIndex);
        // 同步触发一次整体重算，使角色本地加成立刻反映到面板白值与伤害区域
        if (typeof recalculate === 'function') {
            recalculate();
        }
        
    } catch(e) { console.error("加载配置失败", e); }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        renderCharacters,
        renderCharPanelStats
    };
}
