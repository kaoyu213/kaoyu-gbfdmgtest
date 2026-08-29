// ==========================================
//  GBF 模拟器 - Buff 图鉴（charabuff.json）
// ==========================================

function escapeHtmlCharaBuff(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buffPropTitle(propId) {
    if (!propId) return '';
    if (typeof getBuffIconMeta === 'function') {
        return getBuffIconMeta(propId, '').title || '';
    }
    const m = (typeof globalBuffIconsMap !== 'undefined' && globalBuffIconsMap[propId])
        ? globalBuffIconsMap[propId]
        : null;
    return (m && m.title) ? m.title : '';
}

/** buff_icons.json：在 prop（buff_id）旁显示注册表小图标 */
function buffPropIconHtml(propId) {
    if (!propId) return '';
    const m = typeof getBuffIconMeta === 'function'
        ? getBuffIconMeta(propId, '')
        : (typeof globalBuffIconsMap !== 'undefined' && globalBuffIconsMap[propId]
            ? globalBuffIconsMap[propId]
            : null);
    if (!m || !m.icon || String(m.icon).trim() === '') {
        return '<span class="charabuff-effect-buff-icon charabuff-effect-buff-icon--empty" title="未在 buff_icons 配置"></span>';
    }
    const iconPath = String(m.icon).trim();
    const src =
        typeof buildCharaSkillIconSrc === 'function'
            ? buildCharaSkillIconSrc(iconPath)
            : `images/${escapeHtmlCharaBuff(iconPath)}`;
    const tip = m.title ? String(m.title) : String(propId);
    return `<img class="charabuff-effect-buff-icon" src="${src}" alt="" title="${escapeHtmlCharaBuff(tip)}">`;
}

function renderCharaBuffCatalog() {
    const container = document.getElementById('charabuff-catalog-list');
    if (!container) return;

    const list = (typeof allCharaBuffs !== 'undefined' && Array.isArray(allCharaBuffs)) ? allCharaBuffs : [];

    if (list.length === 0) {
        container.innerHTML = '<div style="padding:10px;text-align:center;color:#888">暂无数据（请维护 charabuff.json）</div>';
        return;
    }

    container.innerHTML = list.map((row, idx) => {
        const id = row && row.id != null ? String(row.id) : '';
        const name = row && row.name != null ? String(row.name) : id || '（未命名）';
        const source = row && row.source != null ? String(row.source).trim() : '';
        const cd = row && row.cd != null ? String(row.cd).trim() : '';
        const desc = row && row.description != null ? String(row.description) : '';
        const imgPath = row && row.image ? String(row.image).trim() : '';
        const imgHtml = imgPath
            ? `<img class="charabuff-catalog-img" src="images/${escapeHtmlCharaBuff(imgPath)}" alt="">`
            : '<div class="charabuff-catalog-img charabuff-catalog-img--placeholder">无图</div>';
        const target = getCharaBuffTarget(row);
        const contexts = getCharaBuffContexts(row);
        const isEnemyTarget = target === 'enemy_single' || target === 'enemy_all';
        const isActive = isEnemyTarget && getStaticEnemyBuffRows().some((entry) => (
            entry && entry.template && String(entry.template.id) === id
        ));

        let effectsBlock = '';
        if (row.effects && Array.isArray(row.effects) && row.effects.length > 0) {
            const rows = row.effects.map((e) => {
                const prop = e && e.prop != null ? String(e.prop) : '';
                const typ = e && e.type != null ? String(e.type) : '';
                const zone = e && e.zone != null ? String(e.zone) : '';
                const val = e && e.value != null ? String(e.value) : '';
                const title = buffPropTitle(prop);
                const idIcon = buffPropIconHtml(prop);
                const propLine = title
                    ? `<span class="charabuff-effect-prop" title="${escapeHtmlCharaBuff(prop)}">${escapeHtmlCharaBuff(title)}</span> <span class="charabuff-effect-id-wrap">${idIcon}<span class="charabuff-effect-id">(${escapeHtmlCharaBuff(prop)})</span></span>`
                    : `<span class="charabuff-effect-id-wrap">${idIcon}<span class="charabuff-effect-prop">${escapeHtmlCharaBuff(prop || '—')}</span></span>`;
                const qualifiers = [];
                if (typ) qualifiers.push(typ);
                if (zone) qualifiers.push(`分区 ${zone}`);
                const typePart = qualifiers.length ? ` · ${escapeHtmlCharaBuff(qualifiers.join(' · '))}` : '';
                const valPart = val ? `：${escapeHtmlCharaBuff(val)}` : '';
                return `<div class="charabuff-effect-line">${propLine}${typePart}${valPart}</div>`;
            }).join('');
            effectsBlock = `<div class="charabuff-catalog-effects"><div class="charabuff-catalog-subtitle">具体效果</div>${rows}</div>`;
        } else if (row.effect_detail != null && String(row.effect_detail).trim() !== '') {
            effectsBlock = `<div class="charabuff-catalog-effects"><div class="charabuff-catalog-subtitle">具体效果</div><div class="charabuff-effect-line">${escapeHtmlCharaBuff(row.effect_detail)}</div></div>`;
        }

        const metaParts = [];
        const lev = row && row.level != null ? String(row.level) : '1';
        const maxlev =
            row && row.maxlevel != null ? String(row.maxlevel) : lev;
        metaParts.push(`层数 ${escapeHtmlCharaBuff(lev)} / ${escapeHtmlCharaBuff(maxlev)}`);
        const targetLabels = {
            self: '自身', ally_party: '己方前排', ally_all: '己方全体',
            enemy_single: '敌方', enemy_all: '敌方全体', field: '场地'
        };
        metaParts.push(`对象：${escapeHtmlCharaBuff(targetLabels[target] || target)}`);
        metaParts.push(`场景：${escapeHtmlCharaBuff(contexts.map((context) => context === 'battle' ? '回合' : '静态').join('/'))}`);
        if (source) metaParts.push(`来源：${escapeHtmlCharaBuff(source)}`);
        if (cd) metaParts.push(`冷却/持续：${escapeHtmlCharaBuff(cd)}`);
        const metaHtml = metaParts.length
            ? `<div class="charabuff-catalog-meta">${metaParts.join(' · ')}</div>`
            : '';

        return `
        <div class="charabuff-catalog-item${isActive ? ' is-active' : ''}" role="button" tabindex="0" aria-pressed="${isActive}" data-buff-id="${escapeHtmlCharaBuff(id)}" data-row-index="${idx}">
            ${imgHtml}
            <div class="charabuff-catalog-body">
                <div class="charabuff-catalog-title">
                    <span class="charabuff-catalog-name">${escapeHtmlCharaBuff(name)}</span>
                    ${id ? `<span class="charabuff-catalog-id">${escapeHtmlCharaBuff(id)}</span>` : ''}
                </div>
                ${metaHtml}
                ${desc ? `<div class="charabuff-catalog-desc">${escapeHtmlCharaBuff(desc)}</div>` : ''}
                ${effectsBlock}
            </div>
        </div>
        `;
    }).join('');

    container.querySelectorAll('.charabuff-catalog-item').forEach((el) => {
        const idx = parseInt(el.getAttribute('data-row-index'), 10);
        if (isNaN(idx)) return;
        el.addEventListener('click', () => onBuffCodexRowClick(idx));
        el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                onBuffCodexRowClick(idx);
            }
        });
    });
}

/** 点击图鉴行：将条目加入当前角色槽 Buff 区（自上而下排列，可叠层/清除） */
function onBuffCodexRowClick(index) {
    const buffList =
        typeof allCharaBuffs !== 'undefined' && Array.isArray(allCharaBuffs) ? allCharaBuffs : [];
    if (index < 0 || index >= buffList.length) return;

    const raw = buffList[index];
    const target = getCharaBuffTarget(raw);
    const contexts = getCharaBuffContexts(raw);
    if (!contexts.includes('static')) {
        if (typeof showNotification === 'function') {
            showNotification('该条目仅用于回合模拟，请在回合模拟器的 Buff 图鉴中装入。', 'info');
        }
        return;
    }

    if (target === 'enemy_single' || target === 'enemy_all') {
        const enemyRows = getStaticEnemyBuffRows();
        const existingIndex = enemyRows.findIndex((entry) => (
            entry && entry.template && String(entry.template.id) === String(raw.id)
        ));
        if (existingIndex >= 0) {
            enemyRows.splice(existingIndex, 1);
        } else {
            enemyRows.push({
                uid: 'enemy_bc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
                template: JSON.parse(JSON.stringify(raw)),
                level: Math.max(1, parseInt(raw.level, 10) || 1)
            });
        }
        syncStaticEnemyDefenseDownInputs();
        renderCharaBuffCatalog();
        if (typeof recalculate === 'function') recalculate();
        if (typeof autoSaveEnabled !== 'undefined' && autoSaveEnabled && typeof saveToLocal === 'function') {
            setTimeout(() => saveToLocal(true), 100);
        }
        return;
    }

    const slot =
        typeof getActiveCharSlotIndex === 'function' ? getActiveCharSlotIndex() : 0;
    const bySlot = window.buffCodexPanelRowsBySlot;
    if (!bySlot || !bySlot[slot]) return;

    const template = JSON.parse(JSON.stringify(raw));
    const refLevel = Math.max(1, parseInt(template.level, 10) || 1);
    const maxFromTpl = parseInt(template.maxlevel, 10);
    const maxLv = Math.max(refLevel, !isNaN(maxFromTpl) && maxFromTpl > 0 ? maxFromTpl : refLevel);
    const initialLv = Math.min(refLevel, maxLv);

    const targetSlots = target === 'ally_party'
        ? [0, 1, 2, 3]
        : target === 'ally_all'
            ? [0, 1, 2, 3, 4, 5]
            : [slot];
    targetSlots.forEach((targetSlot) => {
        if (!Array.isArray(bySlot[targetSlot])) return;
        bySlot[targetSlot].push({
            uid: 'bc_' + Date.now() + '_' + targetSlot + '_' + Math.random().toString(36).slice(2, 9),
            template: JSON.parse(JSON.stringify(template)),
            level: initialLv,
            maxlevel: maxLv
        });
    });

    if (typeof recalculate === 'function') recalculate();
    else if (typeof renderPartyBuffPanel === 'function') renderPartyBuffPanel(slot);
    if (typeof autoSaveEnabled !== 'undefined' && autoSaveEnabled && typeof saveToLocal === 'function') {
        setTimeout(() => saveToLocal(true), 100);
    }
}

function getCharaBuffTarget(row) {
    if (window.CharabuffRegistry && typeof window.CharabuffRegistry.normalizeTarget === 'function') {
        return window.CharabuffRegistry.normalizeTarget(row && row.target);
    }
    return row && row.target ? String(row.target) : 'self';
}

function getCharaBuffContexts(row) {
    if (window.CharabuffRegistry && typeof window.CharabuffRegistry.normalizeContexts === 'function') {
        return window.CharabuffRegistry.normalizeContexts(row || {});
    }
    return ['static'];
}

function getStaticEnemyBuffRows() {
    if (!Array.isArray(window.staticEnemyBuffRows)) window.staticEnemyBuffRows = [];
    return window.staticEnemyBuffRows;
}

function getStaticEnemyDefenseDownBonus() {
    const rows = getStaticEnemyBuffRows();
    if (!window.CharabuffRegistry || typeof window.CharabuffRegistry.getStaticEnemyDefenseDown !== 'function') return 0;
    return Math.min(99, Math.max(0, window.CharabuffRegistry.getStaticEnemyDefenseDown(rows) * 100));
}

function syncStaticEnemyDefenseDownInputs() {
    const manual = Math.min(50, Math.max(0, Number(window.staticEnemyDefenseDownManual) || 0));
    const rows = getStaticEnemyBuffRows();
    const buffBonus = getStaticEnemyDefenseDownBonus();
    const breakdown = window.CharabuffRegistry
        && typeof window.CharabuffRegistry.getStaticEnemyDefenseDownBreakdown === 'function'
        ? window.CharabuffRegistry.getStaticEnemyDefenseDownBreakdown(rows, manual / 100)
        : { normal: Math.min(0.5, manual / 100), independent: 0, total: Math.min(0.5, manual / 100) };
    const total = Math.min(99, Math.max(0, breakdown.total * 100));
    const normal = Math.min(50, Math.max(0, breakdown.normal * 100));
    const independent = Math.max(0, breakdown.independent * 100);
    document.querySelectorAll('[id^="def-down-input"]').forEach((el) => {
        el.value = String(Number(total.toFixed(4)));
        el.dataset.manualDefenseDown = String(manual);
        el.dataset.charabuffDefenseDown = String(buffBonus);
        el.title = buffBonus > 0
            ? `普通减防 ${normal}%（上限50%）+ 独立减防 ${independent}% = ${total}%（最终上限99%）`
            : `普通减防 ${normal}%（上限50%）`;
    });
    return total;
}

window.getStaticEnemyDefenseDownBonus = getStaticEnemyDefenseDownBonus;
window.syncStaticEnemyDefenseDownInputs = syncStaticEnemyDefenseDownInputs;
