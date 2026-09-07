// 集中编辑当前用户的常驻设置。表单关闭前不修改实际状态。
function openMasterySettings() {
    let dialog = document.getElementById('mastery-settings-dialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'mastery-settings-dialog';
        dialog.className = 'mastery-settings-dialog';
        document.body.appendChild(dialog);
    }
    if (dialog.open) return;
    const owner = currentUserId;
    const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const percent = value => Number((value * 100).toFixed(6));
    const groups = [
        ['通用加成', key => !key.includes('non_c5') && !key.startsWith('main_weapon_')],
        ['非 C5 职业加成', key => key.includes('non_c5')],
        ['主手武器加成', key => key.startsWith('main_weapon_')]
    ];
    const mastery = getDefaultMastery();
    const fields = groups.map(([title, match]) => `<fieldset><legend>${title}</legend><div class="mastery-fields">${Object.entries(mastery).filter(([key]) => match(key)).map(([key, value]) => `<label>${escape(DISPLAY_NAME_MAP[key] || key)}<span><input aria-label="${escape(DISPLAY_NAME_MAP[key] || key)}" data-mastery="${key}" type="number" min="0" max="1000" step="any" required value="${percent(value)}"> %</span></label>`).join('')}</div></fieldset>`).join('');
    const specials = specialBuffsData.map(buff => {
        const description = Array.isArray(buff.description) ? buff.description.map(item => item.desc).join(' / ') : (buff.description || '');
        const symbol = buff.id === 'symbolum_amicitiae';
        const value = specialBuffCustomValues[buff.id]?.dmg_amp ?? getSpecialBuffDefaultEffectValue(buff, 'dmg_amp') ?? 0;
        return `<div class="mastery-special"><label><input type="checkbox" data-special="${escape(buff.id)}" ${activeSpecialBuffs.has(buff.id) ? 'checked' : ''}><strong>${escape(buff.name)}</strong></label><p>${escape(description)}</p>${symbol ? `<label class="mastery-symbol">伤害增幅 <span><input id="mastery-symbol-value" aria-label="友谊象征伤害增幅" type="number" min="0" max="1000" step="any" required value="${percent(value)}"> %</span></label><small>关闭时保留数值，不参与计算。</small>` : ''}</div>`;
    }).join('');
    dialog.innerHTML = `<form class="mastery-form"><header><div><h2>职业精通设置</h2><p>当前用户：${owner === 'user2' ? '用户2' : '用户1'}</p></div><button type="button" data-cancel aria-label="关闭">×</button></header><div class="mastery-body"><fieldset><legend>主角等级</legend><label class="mastery-rank">Rank <input id="mastery-rank-value" type="number" min="1" max="425" step="1" required value="${Number(document.getElementById('mc-rank-input')?.value) || 406}"><output id="mastery-rank-preview"></output></label></fieldset><div class="mastery-section-heading"><h3>全职业常驻加成</h3><button type="button" id="mastery-restore">恢复当前用户默认值</button></div>${fields}<h3>特殊加成</h3><div class="mastery-specials">${specials}</div></div><footer><span role="status" id="mastery-settings-status"></span><button type="button" data-cancel>取消</button><button type="submit" class="btn-save">应用并保存</button></footer></form>`;
    dialog.querySelectorAll('[data-cancel]').forEach(button => button.onclick = () => dialog.close());
    const rank = dialog.querySelector('#mastery-rank-value');
    const preview = () => {
        const output = dialog.querySelector('#mastery-rank-preview');
        if (!rank.checkValidity()) { output.textContent = '请输入 1～425 的整数'; return; }
        const stats = calculateRankStats(Number(rank.value));
        output.textContent = `基础 HP：${stats.hp} / 攻击力：${stats.atk}`;
    };
    rank.oninput = preview;
    preview();
    dialog.querySelector('#mastery-restore').onclick = () => {
        const defaults = getMasteryDefaults();
        dialog.querySelectorAll('[data-mastery]').forEach(input => { input.value = percent(defaults[input.dataset.mastery]); });
    };
    dialog.querySelector('form').onsubmit = event => {
        event.preventDefault();
        if (currentUserId !== owner) { dialog.close(); return; }
        const overrides = {};
        dialog.querySelectorAll('[data-mastery]').forEach(input => { overrides[input.dataset.mastery] = Number(input.value) / 100; });
        setMasteryOverrides(overrides);
        document.querySelectorAll('[id="mc-rank-input"]').forEach(input => { input.value = rank.value; });
        activeSpecialBuffs = new Set(Array.from(dialog.querySelectorAll('[data-special]:checked'), input => input.dataset.special));
        const symbol = dialog.querySelector('#mastery-symbol-value');
        if (symbol) specialBuffCustomValues.symbolum_amicitiae = { ...specialBuffCustomValues.symbolum_amicitiae, dmg_amp: Number(symbol.value) / 100 };
        renderGlobalMastery();
        renderSpecialTab();
        recalculate();
        if (saveToLocal(true)) {
            dialog.close();
            showNotification('职业精通设置已保存', 'success');
        } else {
            dialog.querySelector('#mastery-settings-status').textContent = '设置已应用，但保存失败，请重试。';
        }
    };
    dialog.showModal();
}
