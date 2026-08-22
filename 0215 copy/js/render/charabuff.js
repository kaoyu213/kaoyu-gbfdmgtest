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

        let effectsBlock = '';
        if (row.effects && Array.isArray(row.effects) && row.effects.length > 0) {
            const rows = row.effects.map((e) => {
                const prop = e && e.prop != null ? String(e.prop) : '';
                const typ = e && e.type != null ? String(e.type) : '';
                const val = e && e.value != null ? String(e.value) : '';
                const title = buffPropTitle(prop);
                const idIcon = buffPropIconHtml(prop);
                const propLine = title
                    ? `<span class="charabuff-effect-prop" title="${escapeHtmlCharaBuff(prop)}">${escapeHtmlCharaBuff(title)}</span> <span class="charabuff-effect-id-wrap">${idIcon}<span class="charabuff-effect-id">(${escapeHtmlCharaBuff(prop)})</span></span>`
                    : `<span class="charabuff-effect-id-wrap">${idIcon}<span class="charabuff-effect-prop">${escapeHtmlCharaBuff(prop || '—')}</span></span>`;
                const typePart = typ ? ` · ${escapeHtmlCharaBuff(typ)}` : '';
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
        if (source) metaParts.push(`来源：${escapeHtmlCharaBuff(source)}`);
        if (cd) metaParts.push(`冷却/持续：${escapeHtmlCharaBuff(cd)}`);
        const metaHtml = metaParts.length
            ? `<div class="charabuff-catalog-meta">${metaParts.join(' · ')}</div>`
            : '';

        return `
        <div class="charabuff-catalog-item" role="button" tabindex="0" data-buff-id="${escapeHtmlCharaBuff(id)}" data-row-index="${idx}">
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

    const slot =
        typeof getActiveCharSlotIndex === 'function' ? getActiveCharSlotIndex() : 0;
    const bySlot = window.buffCodexPanelRowsBySlot;
    if (!bySlot || !bySlot[slot]) return;

    const raw = buffList[index];
    const template = JSON.parse(JSON.stringify(raw));
    const refLevel = Math.max(1, parseInt(template.level, 10) || 1);
    const maxFromTpl = parseInt(template.maxlevel, 10);
    const maxLv = Math.max(refLevel, !isNaN(maxFromTpl) && maxFromTpl > 0 ? maxFromTpl : refLevel);
    const initialLv = Math.min(refLevel, maxLv);

    bySlot[slot].push({
        uid: 'bc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
        template,
        level: initialLv,
        maxlevel: maxLv
    });

    if (typeof recalculate === 'function') recalculate();
    else if (typeof renderPartyBuffPanel === 'function') renderPartyBuffPanel(slot);
    if (typeof autoSaveEnabled !== 'undefined' && autoSaveEnabled && typeof saveToLocal === 'function') {
        setTimeout(() => saveToLocal(true), 100);
    }
}
