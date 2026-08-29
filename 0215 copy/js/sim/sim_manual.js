// ==========================================
//  GBF 模拟器 - 手动回合模拟 UI
//  仅负责手动时间轴编辑；战斗结算规则后续接入。
// ==========================================
(function (global) {
    'use strict';

    const AUTO_BOARD_ID = 'burst-sim-board';
    const MANUAL_BOARD_ID = 'manual-burst-sim-board';
    const MANUAL_ID_PREFIX = 'manual-';
    const FRONTLINE_SLOTS = [0, 1, 2, 3];
    const RAGE_ICON = 'chara skill/SK_14_3.webp';
    const NORMAL_ATK_BUFF_ICON = 'buff icon/normal_atk.png';
    const MANUAL_TARGET_LABELS = Object.freeze({
        self: '自身',
        ally_party: '己方前排全体',
        ally_all: '己方全体',
        ally_slots: '指定角色',
        enemy: '敌方',
        enemy_single: '敌方',
        enemy_all: '敌方全体'
    });
    const MANUAL_DURATION_LABELS = Object.freeze({
        turns: '持续回合',
        action: '持续行动',
        hit: '持续命中次数',
        permanent: '永续/手动移除'
    });

    const state = {
        turns: [],
        nextBlockId: 1,
        selectedPayload: null,
        damageSummary: {
            totalDamage: 0,
            byCharacter: {}
        },
        damageSummaryExpanded: false,
        customEditorType: 'buff',
        customEditingSkillId: '',
        customOwnerSlot: 0,
        initialized: false
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function buildImageSrc(path) {
        if (!path) return '';
        const normalized = String(path).trim().replace(/\\/g, '/');
        if (!normalized) return '';
        if (/^(?:https?:|data:)/i.test(normalized)) return normalized;
        return 'images/' + normalized.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    }

    function formatDamage(value) {
        return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('zh-CN');
    }

    function normalizeDamageSummary(summary) {
        const source = summary && typeof summary === 'object' ? summary : {};
        const rawByCharacter = source.byCharacter || source.by_character || {};
        const byCharacter = {};
        FRONTLINE_SLOTS.forEach((slot) => {
            const entry = Array.isArray(rawByCharacter) ? rawByCharacter[slot] : rawByCharacter[slot];
            byCharacter[slot] = Math.max(0, Number(
                entry && typeof entry === 'object'
                    ? (entry.total != null ? entry.total : entry.damage)
                    : entry
            ) || 0);
        });
        const calculatedTotal = FRONTLINE_SLOTS.reduce((sum, slot) => sum + byCharacter[slot], 0);
        const explicitTotal = source.totalDamage != null ? source.totalDamage : source.total;
        return {
            totalDamage: explicitTotal == null ? calculatedTotal : Math.max(0, Number(explicitTotal) || 0),
            byCharacter
        };
    }

    function renderDamageSummary(board) {
        const container = board && board.querySelector('[data-manual-damage-summary]');
        if (!container) return;
        const summary = normalizeDamageSummary(state.damageSummary);
        const total = summary.totalDamage;
        const rows = FRONTLINE_SLOTS.map((slot) => {
            const damage = summary.byCharacter[slot] || 0;
            const share = total > 0 ? `${(damage / total * 100).toFixed(1)}%` : '—';
            return `
                <div class="manual-damage-character-row">
                    ${renderActorAvatar(slot, true)}
                    <span class="manual-damage-character-name">${escapeHtml(getActorName(slot))}</span>
                    <span class="manual-damage-character-share">${escapeHtml(share)}</span>
                    <strong class="manual-damage-character-value">${formatDamage(damage)}</strong>
                </div>
            `;
        }).join('');
        container.innerHTML = `
            <div class="manual-damage-summary-head">
                <span class="manual-damage-summary-label">总伤害</span>
                <strong class="manual-damage-summary-total" data-manual-total-damage>${formatDamage(total)}</strong>
                <button type="button" class="manual-damage-summary-toggle" data-manual-damage-toggle
                    aria-expanded="${state.damageSummaryExpanded}" aria-controls="manual-damage-character-details">
                    <span>${state.damageSummaryExpanded ? '收起详情' : '角色详情'}</span>
                    <span class="manual-damage-summary-arrow" aria-hidden="true">${state.damageSummaryExpanded ? '▲' : '▼'}</span>
                </button>
            </div>
            <div class="manual-damage-character-details" id="manual-damage-character-details"
                data-manual-damage-details${state.damageSummaryExpanded ? '' : ' hidden'}>
                ${rows}
            </div>
        `;
        const toggle = container.querySelector('[data-manual-damage-toggle]');
        if (toggle) {
            toggle.addEventListener('click', () => {
                state.damageSummaryExpanded = !state.damageSummaryExpanded;
                renderDamageSummary(board);
            });
        }
    }

    function setDamageSummary(summary) {
        state.damageSummary = normalizeDamageSummary(summary);
        const board = document.getElementById(MANUAL_BOARD_ID);
        if (board) renderDamageSummary(board);
        return state.damageSummary;
    }

    function clearDamageSummary() {
        return setDamageSummary({ totalDamage: 0, byCharacter: {} });
    }

    function getActorName(slot) {
        if (slot === 0) return '主角';
        const actor = typeof currentParty !== 'undefined' && Array.isArray(currentParty)
            ? currentParty[slot]
            : null;
        return actor && actor['名称'] ? String(actor['名称']) : `${slot + 1}号位`;
    }

    function getActorAvatar(slot) {
        if (slot === 0) return '';
        const actor = typeof currentParty !== 'undefined' && Array.isArray(currentParty)
            ? currentParty[slot]
            : null;
        if (!actor) return '';
        return String(actor['横向图片'] || actor['图片'] || actor['竖状图片'] || '');
    }

    function createFixedAction(turnNumber, slot, buffs) {
        return {
            id: `manual-fixed-${turnNumber}-${slot}`,
            type: 'actor_action',
            fixed: true,
            actorSlot: slot,
            actionMode: 'ta',
            buffs: Array.isArray(buffs) ? buffs : []
        };
    }

    function createDynamicBlock(type, overrides) {
        const defaults = {
            extra_action: {
                actorSlot: 0,
                actionMode: 'ta',
                buffs: [],
                name: '追加行动'
            },
            buff: {
                actorSlot: 0,
                name: '待设置Buff技能',
                target: '选择目标',
                skillIcon: ''
            },
            damage: {
                actorSlot: 0,
                name: '待设置技伤',
                target: '敌方',
                skillIcon: ''
            },
            debuff: {
                name: '待设置Debuff',
                target: '敌方'
            }
        };
        const base = defaults[type] || defaults.buff;
        return Object.assign({
            id: `manual-block-${state.nextBlockId++}`,
            type,
            fixed: false
        }, base, overrides || {});
    }

    function getSkillById(skillId) {
        if (!skillId) return null;
        const custom = global.ManualCustomSkills && typeof global.ManualCustomSkills.get === 'function'
            ? global.ManualCustomSkills.get(skillId)
            : null;
        const registered = global.SkillRegistry && typeof global.SkillRegistry.get === 'function'
            ? global.SkillRegistry.get(skillId)
            : null;
        const legacyMap = typeof globalCharaSkillMap !== 'undefined' && globalCharaSkillMap
            ? globalCharaSkillMap
            : {};
        return custom || registered || legacyMap[skillId] || null;
    }

    function getSkillBlockType(skill) {
        const steps = skill && Array.isArray(skill.steps) ? skill.steps : [];
        if (steps.some((step) => step && step.do === 'damage')) return 'damage';
        if (steps.some((step) => step && step.target === 'enemy')) return 'debuff';
        return 'buff';
    }

    function getSkillTargetLabel(skill) {
        const targets = Array.from(new Set((skill && Array.isArray(skill.steps) ? skill.steps : [])
            .map((step) => step && MANUAL_TARGET_LABELS[step.target])
            .filter(Boolean)));
        return targets.length === 1 ? targets[0] : (targets.length > 1 ? '复合目标' : '待设置目标');
    }

    function createSkillBlock(skillId, ownerSlot) {
        const skill = getSkillById(skillId);
        if (!skill) return null;
        const slot = Number(ownerSlot);
        return createDynamicBlock(getSkillBlockType(skill), {
            actorSlot: Number.isInteger(slot) && slot >= 0 ? slot : 0,
            skillId: String(skill.id || skillId),
            name: skill.name || String(skillId),
            target: getSkillTargetLabel(skill),
            skillIcon: skill.icon || '',
            steps: Array.isArray(skill.steps) ? skill.steps : []
        });
    }

    function createTurn(turnNumber, withDemo) {
        const buffEntry = { icon: NORMAL_ATK_BUFF_ICON, name: '攻刃【普刃】+30%' };
        const fixedActions = FRONTLINE_SLOTS.map((slot) => createFixedAction(
            turnNumber,
            slot,
            withDemo ? [buffEntry] : []
        ));
        if (!withDemo) return { number: turnNumber, blocks: fixedActions };

        const rage = createDynamicBlock('buff', {
            actorSlot: 0,
            name: '狂怒3',
            target: '己方全体',
            skillIcon: RAGE_ICON
        });
        const defenseDown = createDynamicBlock('debuff', {
            name: '防御DOWN 50%',
            target: '敌方'
        });
        const extraAction = createDynamicBlock('extra_action', {
            actorSlot: 0,
            name: '二动追加行动',
            buffs: [buffEntry]
        });
        const extraDamage = createDynamicBlock('damage', {
            actorSlot: 1,
            name: '被动追加伤害',
            target: '敌方'
        });

        const blocks = [
            rage,
            defenseDown,
            fixedActions[0],
            extraAction,
            fixedActions[1],
            extraDamage,
            fixedActions[2],
            fixedActions[3]
        ];
        return { number: turnNumber, blocks };
    }

    function ensureInitialState() {
        if (state.initialized) return;
        state.turns = [createTurn(1, true)];
        state.initialized = true;
    }

    function captureOwnedSkillSources(root) {
        return Array.from(root.querySelectorAll('[data-toggle-actor-skill]')).map((element) => ({
            element,
            skillId: element.getAttribute('data-toggle-actor-skill') || '',
            ownerSlot: Number(element.getAttribute('data-owner-slot'))
        })).filter((source) => source.skillId);
    }

    function restoreOwnedSkillSources(sources) {
        sources.forEach((source) => {
            const skill = getSkillById(source.skillId);
            const ownerSlot = Number.isInteger(source.ownerSlot) ? source.ownerSlot : 0;
            source.element.setAttribute('data-manual-skill-id', source.skillId);
            source.element.setAttribute('data-manual-owner-slot', String(ownerSlot));
            source.element.removeAttribute('draggable');
            source.element.setAttribute('aria-label', `${skill && skill.name ? skill.name : source.skillId}，可插入手动回合轴`);
            source.element.title = `${skill && (skill.desc || skill.description) ? skill.desc || skill.description : '角色技能'}；拖到时间轴，或点击后选择“＋”位置`;
            source.element.removeAttribute('disabled');
            source.element.removeAttribute('aria-disabled');
            source.element.classList.remove('queued', 'cooling-down', 'timeline-conflict');
            source.element.setAttribute('aria-pressed', 'false');
        });
    }

    function isolateCopiedDom(root) {
        const idMap = new Map();
        root.querySelectorAll('[id]').forEach((element) => {
            const oldId = element.id;
            const newId = `${MANUAL_ID_PREFIX}${oldId}`;
            idMap.set(oldId, newId);
            element.id = newId;
        });

        root.querySelectorAll('*').forEach((element) => {
            Array.from(element.attributes).forEach((attribute) => {
                if (attribute.name.indexOf('data-') === 0 || attribute.name.indexOf('on') === 0) {
                    element.removeAttribute(attribute.name);
                }
            });
            ['for', 'aria-controls', 'aria-labelledby'].forEach((attributeName) => {
                const oldValue = element.getAttribute(attributeName);
                if (oldValue && idMap.has(oldValue)) {
                    element.setAttribute(attributeName, idMap.get(oldValue));
                }
            });
            if (element.hasAttribute('name')) {
                element.setAttribute('name', `${MANUAL_ID_PREFIX}${element.getAttribute('name')}`);
            }
        });
    }

    function renderActorAvatar(slot, compact) {
        const name = getActorName(slot);
        const path = getActorAvatar(slot);
        const className = compact ? 'manual-timeline-mini-avatar' : 'manual-timeline-avatar';
        const content = path
            ? `<img src="${escapeHtml(buildImageSrc(path))}" alt="${escapeHtml(name)}头像">`
            : `<span>${escapeHtml(slot === 0 ? 'MC' : String(slot + 1))}</span>`;
        return `<span class="${className}" aria-label="${escapeHtml(name)}">${content}</span>`;
    }

    function renderBuffStrip(block) {
        const buffs = Array.isArray(block.buffs) ? block.buffs : [];
        if (!buffs.length) {
            return '<span class="manual-timeline-buff-strip"><span class="manual-timeline-buff-empty">Buff槽</span></span>';
        }
        const icons = buffs.map((buff) => {
            const src = buildImageSrc(buff.icon);
            return `<span class="manual-timeline-buff-icon" aria-label="${escapeHtml(buff.name || 'Buff')}">${src
                ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(buff.name || 'Buff')}">`
                : escapeHtml((buff.name || 'Buff').slice(0, 1))}</span>`;
        }).join('');
        return `<span class="manual-timeline-buff-strip">${icons}</span>`;
    }

    function renderSkillIcon(block) {
        const src = buildImageSrc(block.skillIcon);
        const fallback = block.type === 'damage' ? '伤' : '技';
        return `<span class="manual-timeline-skill-icon">${src
            ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(block.name || '技能')}图标">`
            : `<span>${fallback}</span>`}</span>`;
    }

    function getActionMode(block) {
        const mode = String(block && block.actionMode || '').toLowerCase();
        if (['sa', 'da', 'ta', 'ca'].includes(mode)) return mode;
        if (String(block && block.actionType || '').includes('奥义')) return 'ca';
        const legacyChain = String(block && block.chain || '').toLowerCase();
        return ['sa', 'da', 'ta'].includes(legacyChain) ? legacyChain : 'ta';
    }

    function getActionModeLabel(mode) {
        return ({ sa: 'SA', da: 'DA', ta: 'TA', ca: '奥义' })[mode] || 'TA';
    }

    function renderActionModeSelect(block, label) {
        const currentMode = getActionMode(block);
        const options = [
            ['sa', 'SA'],
            ['da', 'DA'],
            ['ta', 'TA'],
            ['ca', '奥义']
        ].map(([value, text]) => (
            `<option value="${value}"${value === currentMode ? ' selected' : ''}>${text}</option>`
        )).join('');
        return `<select class="manual-timeline-action-select" data-manual-action-mode
            aria-label="${escapeHtml(label)}类型">${options}</select>`;
    }

    function renderBlock(block) {
        if (block.type === 'actor_action' || block.type === 'extra_action') {
            const fixedClass = block.fixed ? ' is-fixed' : ' is-extra';
            const label = block.fixed ? '基础行动' : '追加行动';
            return `
                <div class="manual-timeline-block manual-timeline-action${fixedClass}"
                    data-manual-block-id="${escapeHtml(block.id)}"
                    role="group" aria-label="${escapeHtml(getActorName(block.actorSlot))}${label}">
                    ${renderActorAvatar(block.actorSlot, false)}
                    ${renderBuffStrip(block)}
                    <span class="manual-timeline-action-name">
                        <strong>${label}</strong>
                        ${renderActionModeSelect(block, `${getActorName(block.actorSlot)}${label}`)}
                    </span>
                </div>
            `;
        }

        if (block.type === 'buff' || block.type === 'damage') {
            return `
                <button type="button" class="manual-timeline-block manual-timeline-compact is-${escapeHtml(block.type)} is-source"
                    data-manual-block-id="${escapeHtml(block.id)}">
                    ${renderActorAvatar(block.actorSlot == null ? 0 : block.actorSlot, true)}
                    ${renderSkillIcon(block)}
                    <span class="manual-timeline-block-name">${escapeHtml(block.name)}</span>
                    <span class="manual-timeline-block-target">${escapeHtml(block.target)}</span>
                </button>
            `;
        }

        return `
            <button type="button" class="manual-timeline-block manual-timeline-compact is-debuff"
                data-manual-block-id="${escapeHtml(block.id)}">
                <span class="manual-timeline-block-kind">Debuff</span>
                <span class="manual-timeline-block-name">${escapeHtml(block.name)}</span>
                <span class="manual-timeline-block-target">${escapeHtml(block.target)}</span>
            </button>
        `;
    }

    function renderDropzone(turnNumber, index) {
        return `<button type="button" class="manual-timeline-dropzone" data-manual-drop-turn="${turnNumber}" data-manual-drop-index="${index}" aria-label="插入到第${turnNumber}回合位置${index}"></button>`;
    }

    function renderTimeline(board) {
        const track = board.querySelector('[data-manual-timeline-track]');
        if (!track) return;
        track.innerHTML = state.turns.map((turn) => {
            let flow = renderDropzone(turn.number, 0);
            turn.blocks.forEach((block, index) => {
                flow += renderBlock(block);
                flow += renderDropzone(turn.number, index + 1);
            });
            return `
                <section class="manual-timeline-turn" data-manual-turn="${turn.number}">
                    <div class="manual-timeline-turn-title"><span>第${turn.number}回合</span></div>
                    <div class="manual-timeline-flow">
                        <div class="manual-timeline-flow-content">${flow}</div>
                    </div>
                </section>
            `;
        }).join('');
        wireTimeline(board);
    }

    function isSamePayload(left, right) {
        if (!left || !right || left.source !== right.source) return false;
        if (left.source === 'palette') return left.type === right.type;
        if (left.source === 'skill') {
            return left.skillId === right.skillId && Number(left.ownerSlot) === Number(right.ownerSlot);
        }
        return left.blockId === right.blockId;
    }

    function syncSkillSourceSelection(board) {
        board.querySelectorAll('[data-manual-skill-id]').forEach((button) => {
            const payload = {
                source: 'skill',
                skillId: button.getAttribute('data-manual-skill-id'),
                ownerSlot: Number(button.getAttribute('data-manual-owner-slot'))
            };
            const selected = isSamePayload(state.selectedPayload, payload);
            button.classList.toggle('is-manual-selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
    }

    function selectInsertPayload(board, payload, label) {
        state.selectedPayload = isSamePayload(state.selectedPayload, payload) ? null : payload;
        syncPaletteSelection(board);
        syncSkillSourceSelection(board);
        setDetail(board, state.selectedPayload
            ? `已选择“${label}”，点击任意“＋”即可插入，也可以直接拖动。`
            : '已取消选择；基础行动槽固定不可移动。');
    }

    function getManualCustomApi() {
        return global.ManualCustomSkills || null;
    }

    function getSubtypeLabel(subtype) {
        return typeof getBuffElementLabel === 'function' ? getBuffElementLabel(subtype) : subtype;
    }

    function renderOption(value, label, selected) {
        return `<option value="${escapeHtml(value)}"${String(value) === String(selected) ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    }

    function getDefaultBuffType(catalog) {
        return catalog.some((entry) => entry.buffType === 'normal_atk') ? 'normal_atk' : (catalog[0] && catalog[0].buffType || '');
    }

    function getDefaultZone(entry, requested) {
        const ids = entry && Array.isArray(entry.zones) ? entry.zones.map((zone) => zone.id) : [];
        if (requested && ids.includes(requested)) return requested;
        if (ids.includes('chara_skill')) return 'chara_skill';
        if (ids.includes('charabonus')) return 'charabonus';
        return ids[0] || '';
    }

    function getZoneRuleText(zone) {
        if (!zone) return '';
        const rules = { sum: '同区相加', max: '同区取高', override: '后来覆盖' };
        const cap = zone.cap == null ? '' : `，分区上限 ${Number(zone.cap) * 100}%`;
        return `${rules[zone.rule] || zone.rule}${cap}`;
    }

    function renderTargetSlotChecks(selectedSlots) {
        const selected = new Set((Array.isArray(selectedSlots) ? selectedSlots : []).map(Number));
        return [0, 1, 2, 3, 4, 5].map((slot) => `
            <label><input type="checkbox" value="${slot}"${selected.has(slot) ? ' checked' : ''}>${escapeHtml(getActorName(slot))}</label>
        `).join('');
    }

    function renderBuffEffectRow(effect, index) {
        const api = getManualCustomApi();
        const catalog = api ? api.getBuffCatalog() : [];
        const seed = effect || {};
        const requestedType = String(seed.buffType || '');
        const buffType = catalog.some((entry) => entry.buffType === requestedType)
            ? requestedType
            : getDefaultBuffType(catalog);
        const entry = catalog.find((item) => item.buffType === buffType) || { zones: [], subtypes: [] };
        const subtype = entry.subtypes.includes(seed.subtype) ? seed.subtype : (entry.subtypes[0] || '');
        const zone = getDefaultZone(entry, seed.zone);
        const prop = subtype ? `${buffType}_${subtype}` : buffType;
        const format = api ? api.resolveBuffFormat(buffType, prop, zone) : 'percent';
        const unit = api ? api.getValueUnit(buffType, format) : '%';
        const zoneMeta = entry.zones.find((item) => item.id === zone) || null;
        const target = MANUAL_TARGET_LABELS[seed.target] ? seed.target : 'self';
        const durationType = MANUAL_DURATION_LABELS[seed.durationType] ? seed.durationType : 'turns';
        const value = seed.value == null ? (format === 'fixed' ? 1 : 10) : seed.value;
        const durationValue = seed.durationValue == null ? 1 : seed.durationValue;
        return `
            <fieldset class="manual-custom-effect" data-manual-custom-effect>
                <legend>效果 <span data-manual-effect-number>${index + 1}</span></legend>
                <button type="button" class="manual-custom-effect-remove" data-manual-remove-effect aria-label="删除该效果">删除</button>
                <div class="manual-custom-form-grid">
                    <label>效果对象
                        <select data-manual-effect-target>
                            ${Object.entries(MANUAL_TARGET_LABELS).filter(([key]) => ['self', 'ally_party', 'ally_all', 'ally_slots', 'enemy'].includes(key))
                                .map(([key, label]) => renderOption(key, label, target)).join('')}
                        </select>
                    </label>
                    <label>加成类别
                        <select data-manual-effect-type>
                            ${catalog.map((item) => renderOption(item.buffType, `${item.label} (${item.buffType})`, buffType)).join('')}
                        </select>
                    </label>
                    <label data-manual-effect-subtype-field${entry.subtypes.length ? '' : ' hidden'}>子类型
                        <select data-manual-effect-subtype>
                            ${entry.subtypes.map((item) => renderOption(item, `${getSubtypeLabel(item)} (${item})`, subtype)).join('')}
                        </select>
                    </label>
                    <label>加成分区
                        <select data-manual-effect-zone>
                            ${entry.zones.map((item) => renderOption(item.id, `${item.label} (${item.id})`, zone)).join('')}
                        </select>
                        <small data-manual-zone-rule>${escapeHtml(getZoneRuleText(zoneMeta))}</small>
                    </label>
                    <label>加成数值
                        <span class="manual-custom-value-input"><input type="number" step="any" value="${escapeHtml(value)}" data-manual-effect-value required><span data-manual-effect-unit>${escapeHtml(unit)}</span></span>
                    </label>
                    <label>持续时间
                        <select data-manual-effect-duration-type>
                            ${Object.entries(MANUAL_DURATION_LABELS).map(([key, label]) => renderOption(key, label, durationType)).join('')}
                        </select>
                    </label>
                    <label data-manual-effect-duration-value-field${durationType === 'permanent' ? ' hidden' : ''}>持续数值
                        <input type="number" min="1" step="1" value="${escapeHtml(durationValue)}" data-manual-effect-duration-value>
                    </label>
                </div>
                <div class="manual-custom-target-slots" data-manual-effect-target-slots${target === 'ally_slots' ? '' : ' hidden'}>
                    <span>指定位置</span>${renderTargetSlotChecks(seed.targetSlots)}
                </div>
            </fieldset>
        `;
    }

    function updateBuffEffectRowMeta(row, resetDependent) {
        const api = getManualCustomApi();
        if (!row || !api) return;
        const typeSelect = row.querySelector('[data-manual-effect-type]');
        const subtypeSelect = row.querySelector('[data-manual-effect-subtype]');
        const subtypeField = row.querySelector('[data-manual-effect-subtype-field]');
        const zoneSelect = row.querySelector('[data-manual-effect-zone]');
        const entry = api.getBuffType(typeSelect && typeSelect.value);
        if (!entry) return;

        const previousSubtype = resetDependent ? '' : subtypeSelect.value;
        const subtype = entry.subtypes.includes(previousSubtype) ? previousSubtype : (entry.subtypes[0] || '');
        subtypeSelect.innerHTML = entry.subtypes.map((item) => renderOption(item, `${getSubtypeLabel(item)} (${item})`, subtype)).join('');
        subtypeField.hidden = entry.subtypes.length === 0;

        const previousZone = resetDependent ? '' : zoneSelect.value;
        const zone = getDefaultZone(entry, previousZone);
        zoneSelect.innerHTML = entry.zones.map((item) => renderOption(item.id, `${item.label} (${item.id})`, zone)).join('');
        const prop = subtype ? `${entry.buffType}_${subtype}` : entry.buffType;
        const format = api.resolveBuffFormat(entry.buffType, prop, zone);
        const unit = row.querySelector('[data-manual-effect-unit]');
        if (unit) unit.textContent = api.getValueUnit(entry.buffType, format);
        const zoneHint = row.querySelector('[data-manual-zone-rule]');
        if (zoneHint) zoneHint.textContent = getZoneRuleText(entry.zones.find((item) => item.id === zone));
    }

    function wireBuffEffectRow(row) {
        const typeSelect = row.querySelector('[data-manual-effect-type]');
        const subtypeSelect = row.querySelector('[data-manual-effect-subtype]');
        const zoneSelect = row.querySelector('[data-manual-effect-zone]');
        const targetSelect = row.querySelector('[data-manual-effect-target]');
        const durationSelect = row.querySelector('[data-manual-effect-duration-type]');
        if (typeSelect) typeSelect.addEventListener('change', () => updateBuffEffectRowMeta(row, true));
        if (subtypeSelect) subtypeSelect.addEventListener('change', () => updateBuffEffectRowMeta(row, false));
        if (zoneSelect) zoneSelect.addEventListener('change', () => updateBuffEffectRowMeta(row, false));
        if (targetSelect) targetSelect.addEventListener('change', () => {
            const slots = row.querySelector('[data-manual-effect-target-slots]');
            if (slots) slots.hidden = targetSelect.value !== 'ally_slots';
        });
        if (durationSelect) durationSelect.addEventListener('change', () => {
            const field = row.querySelector('[data-manual-effect-duration-value-field]');
            if (field) field.hidden = durationSelect.value === 'permanent';
        });
        const remove = row.querySelector('[data-manual-remove-effect]');
        if (remove) remove.addEventListener('click', () => {
            const list = row.parentElement;
            if (!list || list.querySelectorAll('[data-manual-custom-effect]').length <= 1) return;
            row.remove();
            list.querySelectorAll('[data-manual-effect-number]').forEach((label, index) => { label.textContent = index + 1; });
        });
    }

    function getThresholdTables() {
        return global.ThresholdRegistry && typeof global.ThresholdRegistry.getAll === 'function'
            ? global.ThresholdRegistry.getAll('skill')
            : [];
    }

    function renderThresholdOptions(selected) {
        const tables = getThresholdTables();
        if (!tables.length) return '<option value="">正在加载技能衰减表……</option>';
        return `<option value="">请选择</option>${tables.map((table) => (
            renderOption(table.tableId, `${table.label || table.tableId} [${table.tableId}]`, selected)
        )).join('')}`;
    }

    function getEditingDefinition(type) {
        const api = getManualCustomApi();
        const skill = api && state.customEditingSkillId ? api.get(state.customEditingSkillId) : null;
        if (!skill || !skill.manual_definition || skill.manual_definition.type !== type) return null;
        return Object.assign({ id: skill.id }, skill.manual_definition);
    }

    function showCustomEditorError(form, message) {
        const output = form && form.querySelector('[data-manual-custom-error]');
        if (!output) return;
        output.textContent = message || '';
        output.hidden = !message;
    }

    function collectCustomDefinition(form) {
        const type = form.getAttribute('data-manual-custom-form');
        const base = {
            id: state.customEditingSkillId || undefined,
            type,
            name: form.querySelector('[data-manual-custom-name]').value,
            desc: form.querySelector('[data-manual-custom-desc]').value
        };
        if (type === 'damage') {
            base.multiplier = form.querySelector('[data-manual-damage-mult]').value;
            base.hits = form.querySelector('[data-manual-damage-hits]').value;
            base.decayMode = form.querySelector('[data-manual-decay-mode]').value;
            base.thresholdTable = form.querySelector('[data-manual-threshold-table]').value;
            base.cap = form.querySelector('[data-manual-fuzzy-cap]').value;
            return base;
        }
        base.effects = Array.from(form.querySelectorAll('[data-manual-custom-effect]')).map((row) => ({
            target: row.querySelector('[data-manual-effect-target]').value,
            targetSlots: Array.from(row.querySelectorAll('[data-manual-effect-target-slots] input:checked')).map((input) => Number(input.value)),
            buffType: row.querySelector('[data-manual-effect-type]').value,
            subtype: row.querySelector('[data-manual-effect-subtype]').value,
            zone: row.querySelector('[data-manual-effect-zone]').value,
            value: row.querySelector('[data-manual-effect-value]').value,
            durationType: row.querySelector('[data-manual-effect-duration-type]').value,
            durationValue: row.querySelector('[data-manual-effect-duration-value]').value
        }));
        return base;
    }

    function renderCustomEditor(board) {
        const container = board.querySelector('[data-manual-custom-editor]');
        const api = getManualCustomApi();
        if (!container || !api) return;
        const type = state.customEditorType === 'damage' ? 'damage' : 'buff';
        const editing = getEditingDefinition(type);
        const common = editing || { name: '', desc: '' };
        board.querySelectorAll('[data-manual-editor-type]').forEach((button) => {
            button.classList.toggle('is-active', button.getAttribute('data-manual-editor-type') === type);
        });

        const commonFields = `
            <div class="manual-custom-form-grid manual-custom-form-grid--common">
                <label>技能名<input type="text" maxlength="80" value="${escapeHtml(common.name || '')}" data-manual-custom-name required></label>
                <label class="manual-custom-wide">效果描述 <small>选填</small><textarea rows="2" data-manual-custom-desc>${escapeHtml(common.desc || '')}</textarea></label>
            </div>
        `;

        if (type === 'damage') {
            const decayMode = common.decayMode === 'exact' ? 'exact' : 'fuzzy';
            container.innerHTML = `
                <form class="manual-custom-form" data-manual-custom-form="damage">
                    ${commonFields}
                    <div class="manual-custom-form-grid">
                        <label>单hit倍率<input type="number" min="0.01" step="0.01" value="${escapeHtml(common.multiplier == null ? 1 : common.multiplier)}" data-manual-damage-mult required></label>
                        <label>hit数<input type="number" min="1" max="999" step="1" value="${escapeHtml(common.hits == null ? 1 : common.hits)}" data-manual-damage-hits required></label>
                        <label>衰减计算
                            <select data-manual-decay-mode>
                                ${renderOption('fuzzy', '模糊衰减上限', decayMode)}
                                ${renderOption('exact', '精确衰减表', decayMode)}
                            </select>
                        </label>
                        <label data-manual-fuzzy-cap-field${decayMode === 'fuzzy' ? '' : ' hidden'}>单hit模糊上限<input type="number" min="1" step="1" value="${escapeHtml(common.cap == null ? 100000 : common.cap)}" data-manual-fuzzy-cap></label>
                        <label data-manual-threshold-field${decayMode === 'exact' ? '' : ' hidden'}>精确衰减表<select data-manual-threshold-table>${renderThresholdOptions(common.thresholdTable || '')}</select></label>
                    </div>
                    <div class="manual-custom-error" data-manual-custom-error hidden></div>
                    <div class="manual-custom-form-actions">
                        <button type="submit" class="manual-custom-save">${editing ? '保存修改' : '保存伤害技能'}</button>
                        ${editing ? '<button type="button" data-manual-cancel-edit>取消编辑</button>' : ''}
                    </div>
                </form>
            `;
        } else {
            const effects = editing && Array.isArray(editing.effects) && editing.effects.length ? editing.effects : [{}];
            container.innerHTML = `
                <form class="manual-custom-form" data-manual-custom-form="buff">
                    ${commonFields}
                    <div class="manual-custom-effect-list" data-manual-effect-list>
                        ${effects.map((effect, index) => renderBuffEffectRow(effect, index)).join('')}
                    </div>
                    <button type="button" class="manual-custom-add-effect" data-manual-add-effect>＋ 新增效果</button>
                    <div class="manual-custom-error" data-manual-custom-error hidden></div>
                    <div class="manual-custom-form-actions">
                        <button type="submit" class="manual-custom-save">${editing ? '保存修改' : '保存强化技能'}</button>
                        ${editing ? '<button type="button" data-manual-cancel-edit>取消编辑</button>' : ''}
                    </div>
                </form>
            `;
            container.querySelectorAll('[data-manual-custom-effect]').forEach(wireBuffEffectRow);
            const add = container.querySelector('[data-manual-add-effect]');
            if (add) add.addEventListener('click', () => {
                const list = container.querySelector('[data-manual-effect-list]');
                const index = list.querySelectorAll('[data-manual-custom-effect]').length;
                list.insertAdjacentHTML('beforeend', renderBuffEffectRow({}, index));
                wireBuffEffectRow(list.lastElementChild);
            });
        }

        const form = container.querySelector('[data-manual-custom-form]');
        const decay = form.querySelector('[data-manual-decay-mode]');
        if (decay) decay.addEventListener('change', () => {
            form.querySelector('[data-manual-fuzzy-cap-field]').hidden = decay.value !== 'fuzzy';
            form.querySelector('[data-manual-threshold-field]').hidden = decay.value !== 'exact';
        });
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            try {
                const skill = api.save(collectCustomDefinition(form));
                state.customEditingSkillId = '';
                setDetail(board, `已保存自定义技能“${skill.name}”，可从本地技能库插入时间轴。`);
                renderCustomEditor(board);
                renderCustomLibrary(board);
                const builder = board.querySelector('[data-manual-custom-builder]');
                if (builder) builder.open = false;
            } catch (error) {
                showCustomEditorError(form, error && error.message ? error.message : String(error));
            }
        });
        const cancel = form.querySelector('[data-manual-cancel-edit]');
        if (cancel) cancel.addEventListener('click', () => {
            state.customEditingSkillId = '';
            renderCustomEditor(board);
        });
    }

    function getCustomSkillSummary(skill) {
        const definition = skill && skill.manual_definition || {};
        if (definition.type === 'damage') {
            const decay = definition.decayMode === 'exact'
                ? `精确表 ${definition.thresholdTable || '—'}`
                : `单hit上限 ${formatDamage(definition.cap)}`;
            return `${definition.multiplier}倍 × ${definition.hits}hit · ${decay}`;
        }
        return (Array.isArray(skill.steps) ? skill.steps : []).map((step) => (
            `${step.name || step.prop} · ${MANUAL_TARGET_LABELS[step.target] || step.target}`
        )).join('；');
    }

    function renderCustomLibrary(board) {
        const container = board.querySelector('[data-manual-custom-library]');
        const api = getManualCustomApi();
        if (!container || !api) return;
        const skills = api.list();
        const actorOptions = [0, 1, 2, 3].map((slot) => renderOption(slot, getActorName(slot), state.customOwnerSlot)).join('');
        const cards = skills.length ? skills.map((skill) => {
            const type = skill.custom_type === 'damage' ? 'damage' : 'buff';
            const icon = buildImageSrc(skill.icon);
            return `
                <article class="manual-custom-skill-card is-${type}">
                    <button type="button" class="manual-custom-skill-source" data-manual-skill-id="${escapeHtml(skill.id)}" data-manual-owner-slot="${state.customOwnerSlot}">
                        ${renderActorAvatar(state.customOwnerSlot, true)}
                        <span class="manual-custom-skill-icon">${icon ? `<img src="${escapeHtml(icon)}" alt="">` : (type === 'damage' ? '伤' : '强')}</span>
                        <span class="manual-custom-skill-copy"><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(getCustomSkillSummary(skill))}</small></span>
                    </button>
                    <div class="manual-custom-card-actions">
                        <button type="button" data-manual-edit-custom="${escapeHtml(skill.id)}">编辑</button>
                        <button type="button" data-manual-copy-custom="${escapeHtml(skill.id)}">复制</button>
                        <button type="button" data-manual-delete-custom="${escapeHtml(skill.id)}">删除</button>
                    </div>
                </article>
            `;
        }).join('') : '<div class="manual-custom-library-empty">还没有本地自定义技能。在上方创建后会出现在这里。</div>';
        container.innerHTML = `
            <div class="manual-custom-library-head">
                <div><strong>本地技能库</strong><small>点击后选择“＋”，或直接拖入时间轴</small></div>
                <label>本次使用者<select data-manual-custom-owner>${actorOptions}</select></label>
            </div>
            <div class="manual-custom-library-list">${cards}</div>
        `;
        const owner = container.querySelector('[data-manual-custom-owner]');
        if (owner) owner.addEventListener('change', () => {
            state.customOwnerSlot = Number(owner.value) || 0;
            if (state.selectedPayload && state.selectedPayload.source === 'skill' && getManualCustomApi().get(state.selectedPayload.skillId)) {
                state.selectedPayload.ownerSlot = state.customOwnerSlot;
            }
            renderCustomLibrary(board);
            syncSkillSourceSelection(board);
        });
        container.querySelectorAll('[data-manual-edit-custom]').forEach((button) => {
            button.addEventListener('click', () => {
                const skill = api.get(button.getAttribute('data-manual-edit-custom'));
                if (!skill) return;
                state.customEditingSkillId = skill.id;
                state.customEditorType = skill.custom_type === 'damage' ? 'damage' : 'buff';
                const builder = board.querySelector('[data-manual-custom-builder]');
                if (builder) builder.open = true;
                renderCustomEditor(board);
                board.querySelector('[data-manual-custom-editor]').scrollIntoView({ block: 'nearest' });
            });
        });
        container.querySelectorAll('[data-manual-copy-custom]').forEach((button) => {
            button.addEventListener('click', () => {
                const copy = api.duplicate(button.getAttribute('data-manual-copy-custom'));
                if (copy) {
                    setDetail(board, `已复制“${copy.name}”。`);
                    renderCustomLibrary(board);
                }
            });
        });
        container.querySelectorAll('[data-manual-delete-custom]').forEach((button) => {
            button.addEventListener('click', () => {
                const skill = api.get(button.getAttribute('data-manual-delete-custom'));
                if (!skill || !global.confirm(`删除本地技能“${skill.name}”？`)) return;
                api.remove(skill.id);
                if (state.customEditingSkillId === skill.id) {
                    state.customEditingSkillId = '';
                    renderCustomEditor(board);
                }
                if (state.selectedPayload && state.selectedPayload.skillId === skill.id) state.selectedPayload = null;
                setDetail(board, `已删除本地技能“${skill.name}”。`);
                renderCustomLibrary(board);
            });
        });
        wireSkillSources(board, container);
        syncSkillSourceSelection(board);
    }

    function syncPaletteSelection(board) {
        const selectedType = state.selectedPayload && state.selectedPayload.source === 'palette'
            ? state.selectedPayload.type
            : '';
        board.querySelectorAll('[data-manual-template]').forEach((button) => {
            button.classList.toggle('is-selected', button.getAttribute('data-manual-template') === selectedType);
        });
    }

    function renderPalette(board) {
        const dock = board.querySelector('.burst-skill-dock');
        if (!dock) return;
        dock.innerHTML = `
            <details class="manual-custom-builder" data-manual-custom-builder>
                <summary class="manual-custom-builder-summary">
                    <span><strong>新建自定义技能</strong><small>强化技能 / 伤害技能</small></span>
                    <span class="manual-custom-builder-state" aria-hidden="true"></span>
                </summary>
                <div class="manual-custom-builder-head">
                    <div><strong>选择技能类型</strong><span>保存时自动转换为标准 charaskill.steps</span></div>
                    <div class="manual-custom-type-tabs">
                        <button type="button" data-manual-editor-type="buff">新建强化技能</button>
                        <button type="button" data-manual-editor-type="damage">新建伤害技能</button>
                    </div>
                </div>
                <div data-manual-custom-editor></div>
            </details>
            <section class="manual-custom-library" data-manual-custom-library></section>
            <details class="manual-quick-blocks">
                <summary>快速占位方块</summary>
                <div class="manual-timeline-palette-head"><span>用于暂时编排，不含标准技能数据</span></div>
                <div class="manual-timeline-palette">
                    <button type="button" class="manual-timeline-template is-extra" data-manual-template="extra_action">追加行动</button>
                    <button type="button" class="manual-timeline-template is-buff" data-manual-template="buff">Buff占位</button>
                    <button type="button" class="manual-timeline-template is-damage" data-manual-template="damage">技伤占位</button>
                    <button type="button" class="manual-timeline-template is-debuff" data-manual-template="debuff">Debuff占位</button>
                </div>
            </details>
        `;
        dock.querySelectorAll('[data-manual-editor-type]').forEach((button) => {
            button.addEventListener('click', () => {
                state.customEditorType = button.getAttribute('data-manual-editor-type');
                state.customEditingSkillId = '';
                renderCustomEditor(board);
            });
        });
        dock.querySelectorAll('[data-manual-template]').forEach((button) => {
            const type = button.getAttribute('data-manual-template');
            button.addEventListener('click', () => selectInsertPayload(board, { source: 'palette', type }, button.textContent.trim()));
            wirePointerDrag(board, button, () => ({ source: 'palette', type }));
        });
        renderCustomEditor(board);
        renderCustomLibrary(board);
        syncPaletteSelection(board);
        if (global.ThresholdRegistry && typeof global.ThresholdRegistry.loadThresholdData === 'function') {
            global.ThresholdRegistry.loadThresholdData().then(() => {
                if (board.isConnected && state.customEditorType === 'damage') renderCustomEditor(board);
            });
        }
    }

    function wireSkillSources(board, root) {
        const scope = root || board;
        scope.querySelectorAll('[data-manual-skill-id]').forEach((button) => {
            const payloadFactory = () => ({
                source: 'skill',
                skillId: button.getAttribute('data-manual-skill-id'),
                ownerSlot: Number(button.getAttribute('data-manual-owner-slot'))
            });
            const skill = getSkillById(button.getAttribute('data-manual-skill-id'));
            const label = skill && skill.name ? skill.name : button.getAttribute('data-manual-skill-id');
            button.addEventListener('click', () => {
                if (button.dataset.manualSuppressClick === 'true') return;
                selectInsertPayload(board, payloadFactory(), label);
            });
            wirePointerDrag(board, button, payloadFactory);
        });
        syncSkillSourceSelection(board);
    }

    function setDetail(board, text) {
        const detail = board.querySelector('[data-manual-detail]');
        if (detail) detail.textContent = text;
    }

    function findBlock(blockId) {
        for (const turn of state.turns) {
            const index = turn.blocks.findIndex((block) => block.id === blockId);
            if (index >= 0) return { turn, index, block: turn.blocks[index] };
        }
        return null;
    }

    function clearDragHighlights(board) {
        board.querySelectorAll('.manual-timeline-dropzone.is-active, .manual-timeline-delete-zone.is-active')
            .forEach((target) => target.classList.remove('is-active'));
    }

    function setBoardDragState(board, payload, active) {
        board.classList.toggle('is-manual-dragging', !!active);
        board.classList.toggle('is-manual-moving-block', !!active && payload && payload.source === 'timeline');
        if (!active) clearDragHighlights(board);
    }

    function getPointerDropTarget(board, x, y, payload) {
        const candidate = document.elementFromPoint(x, y);
        if (!candidate || !candidate.closest) return null;
        const deleteZone = candidate.closest('[data-manual-delete-zone]');
        if (deleteZone && board.contains(deleteZone) && payload && payload.source === 'timeline') {
            return { type: 'delete', element: deleteZone };
        }
        const dropzone = candidate.closest('[data-manual-drop-turn]');
        if (dropzone && board.contains(dropzone)) return { type: 'insert', element: dropzone };

        const turn = candidate.closest('[data-manual-turn]');
        if (!turn || !board.contains(turn)) return null;
        const nearest = Array.from(turn.querySelectorAll('[data-manual-drop-turn]')).reduce((best, zone) => {
            const rect = zone.getBoundingClientRect();
            const distance = Math.abs(y - (rect.top + rect.height / 2));
            return !best || distance < best.distance ? { zone, distance } : best;
        }, null);
        return nearest ? { type: 'insert', element: nearest.zone } : null;
    }

    function getScrollContainer(board) {
        let element = board.parentElement;
        while (element && element !== document.body) {
            const style = getComputedStyle(element);
            if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) {
                return element;
            }
            element = element.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    }

    function autoScrollDuringDrag(board, clientY) {
        if (!Number.isFinite(clientY) || clientY <= 0) return;
        const scroller = getScrollContainer(board);
        if (!scroller) return;
        const isDocumentScroller = scroller === document.scrollingElement || scroller === document.documentElement;
        const rect = isDocumentScroller
            ? { top: 0, bottom: window.innerHeight, height: window.innerHeight }
            : scroller.getBoundingClientRect();
        const edge = Math.min(48, Math.max(36, rect.height * 0.08));
        let delta = 0;
        if (clientY < rect.top + edge) {
            delta = -Math.ceil((rect.top + edge - clientY) / 4);
        } else if (clientY > rect.bottom - edge) {
            delta = Math.ceil((clientY - (rect.bottom - edge)) / 4);
        }
        if (delta) scroller.scrollTop += Math.max(-24, Math.min(24, delta));
    }

    function wirePointerDrag(board, element, payloadFactory) {
        let pointerState = null;
        let scrollFrame = 0;

        function refreshPointerTarget() {
            if (!pointerState || !pointerState.dragging) return null;
            clearDragHighlights(board);
            const target = getPointerDropTarget(
                board,
                pointerState.clientX,
                pointerState.clientY,
                pointerState.payload
            );
            if (target) target.element.classList.add('is-active');
            return target;
        }

        function runAutoScroll() {
            if (!pointerState || !pointerState.dragging) {
                scrollFrame = 0;
                return;
            }
            autoScrollDuringDrag(board, pointerState.clientY);
            refreshPointerTarget();
            scrollFrame = requestAnimationFrame(runAutoScroll);
        }

        function cleanupPointer() {
            if (scrollFrame) cancelAnimationFrame(scrollFrame);
            scrollFrame = 0;
            document.removeEventListener('pointerup', finishPointer, true);
            document.removeEventListener('pointercancel', cancelPointer, true);
            clearDragHighlights(board);
            element.classList.remove('is-dragging');
            setBoardDragState(board, null, false);
            pointerState = null;
        }

        function finishPointer(event) {
            if (!pointerState || pointerState.pointerId !== event.pointerId) return;
            const wasDragging = pointerState.dragging;
            const payload = pointerState.payload;
            const target = wasDragging
                ? getPointerDropTarget(board, event.clientX, event.clientY, payload)
                : null;
            if (typeof element.releasePointerCapture === 'function') {
                try { element.releasePointerCapture(event.pointerId); } catch (error) { /* 已释放时忽略 */ }
            }
            if (wasDragging) {
                event.preventDefault();
                element.dataset.manualSuppressClick = 'true';
            }
            cleanupPointer();
            if (target && target.type === 'delete') {
                deletePayload(board, payload);
            } else if (target) {
                const zone = target.element;
                insertPayload(
                    board,
                    Number(zone.getAttribute('data-manual-drop-turn')),
                    Number(zone.getAttribute('data-manual-drop-index')),
                    payload
                );
            }
            setTimeout(() => { delete element.dataset.manualSuppressClick; }, 0);
        }

        function cancelPointer(event) {
            if (!pointerState || pointerState.pointerId !== event.pointerId) return;
            cleanupPointer();
        }

        element.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            if (event.target && event.target.closest && event.target.closest('[data-manual-action-mode]')) return;
            event.preventDefault();
            pointerState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                clientX: event.clientX,
                clientY: event.clientY,
                dragging: false,
                payload: payloadFactory()
            };
            document.addEventListener('pointerup', finishPointer, true);
            document.addEventListener('pointercancel', cancelPointer, true);
            if (typeof element.setPointerCapture === 'function') {
                try { element.setPointerCapture(event.pointerId); } catch (error) { /* 浏览器不支持时忽略 */ }
            }
        });

        element.addEventListener('pointermove', (event) => {
            if (!pointerState || pointerState.pointerId !== event.pointerId) return;
            pointerState.clientX = event.clientX;
            pointerState.clientY = event.clientY;
            const distance = Math.hypot(event.clientX - pointerState.startX, event.clientY - pointerState.startY);
            if (!pointerState.dragging && distance >= 6) {
                pointerState.dragging = true;
                element.classList.add('is-dragging');
                setBoardDragState(board, pointerState.payload, true);
                if (!scrollFrame) scrollFrame = requestAnimationFrame(runAutoScroll);
            }
            if (!pointerState.dragging) return;
            event.preventDefault();
            autoScrollDuringDrag(board, event.clientY);
            refreshPointerTarget();
        });

    }

    function deletePayload(board, payload) {
        if (!payload || payload.source !== 'timeline') return;
        const found = findBlock(payload.blockId);
        if (!found || found.block.fixed) {
            setDetail(board, '每回合的4个基础行动槽不能删除。');
            return;
        }
        const name = found.block.name || '角色行动';
        found.turn.blocks.splice(found.index, 1);
        setDetail(board, `已删除“${name}”。`);
        renderTimeline(board);
    }

    function insertPayload(board, turnNumber, targetIndex, payload) {
        const targetTurn = state.turns.find((turn) => turn.number === turnNumber);
        if (!targetTurn || !payload) return;

        let block;
        let insertionIndex = Math.max(0, Math.min(targetTurn.blocks.length, Number(targetIndex) || 0));
        if (payload.source === 'timeline') {
            const found = findBlock(payload.blockId);
            if (!found || found.block.fixed) {
                setDetail(board, '每回合的4个基础行动槽固定不可移动。');
                return;
            }
            block = found.block;
            found.turn.blocks.splice(found.index, 1);
            if (found.turn === targetTurn && found.index < insertionIndex) insertionIndex -= 1;
        } else if (payload.source === 'skill') {
            block = createSkillBlock(payload.skillId, payload.ownerSlot);
            if (!block) {
                setDetail(board, `无法读取技能“${payload.skillId || '未知技能'}”。`);
                return;
            }
        } else if (payload.source === 'palette') {
            block = createDynamicBlock(payload.type);
        } else {
            return;
        }
        targetTurn.blocks.splice(insertionIndex, 0, block);
        setDetail(board, `${payload.source === 'timeline' ? '已移动' : '已插入'}“${block.name || '角色行动'}”。`);
        renderTimeline(board);
    }

    function wireTimeline(board) {
        board.querySelectorAll('[data-manual-block-id]').forEach((element) => {
            const found = findBlock(element.getAttribute('data-manual-block-id'));
            if (!found) return;
            const actionSelect = element.querySelector('[data-manual-action-mode]');
            if (actionSelect) {
                actionSelect.addEventListener('pointerdown', (event) => event.stopPropagation());
                actionSelect.addEventListener('click', (event) => event.stopPropagation());
                actionSelect.addEventListener('change', () => {
                    found.block.actionMode = actionSelect.value;
                    setDetail(
                        board,
                        `${getActorName(found.block.actorSlot)}的${found.block.fixed ? '基础行动' : '追加行动'}已设为${getActionModeLabel(actionSelect.value)}。`
                    );
                });
            }
            element.addEventListener('click', (event) => {
                if (event.target && event.target.closest && event.target.closest('[data-manual-action-mode]')) return;
                if (element.dataset.manualSuppressClick === 'true') return;
                const block = found.block;
                if (block.fixed) {
                    setDetail(board, `${getActorName(block.actorSlot)}的基础行动槽固定不可移动；可在下拉框选择SA、DA、TA或奥义。`);
                } else {
                    setDetail(board, `${block.name || '行为方块'}可以拖到任意“＋”位置。`);
                }
            });
            if (found.block.fixed) return;
            wirePointerDrag(board, element, () => ({ source: 'timeline', blockId: found.block.id }));
        });

        board.querySelectorAll('[data-manual-drop-turn]').forEach((zone) => {
            zone.addEventListener('click', () => {
                if (!state.selectedPayload) {
                    setDetail(board, '请先选择角色技能或下方的可插入方块。');
                    return;
                }
                insertPayload(
                    board,
                    Number(zone.getAttribute('data-manual-drop-turn')),
                    Number(zone.getAttribute('data-manual-drop-index')),
                    state.selectedPayload
                );
            });
        });
    }

    function addTurn(board) {
        const number = state.turns.length + 1;
        state.turns.push(createTurn(number, false));
        renderTimeline(board);
        setDetail(board, `已新增第${number}回合，并生成主角至4号位的固定基础行动槽。`);
    }

    function prepareBoard(board) {
        board.classList.add('manual-burst-board');
        const title = board.querySelector('.burst-axis-title');
        if (title) title.textContent = '回合模拟器（手动）';
        const subtitle = board.querySelector('.burst-axis-subtitle');
        if (subtitle) subtitle.textContent = '创建或读取标准技能，指定本次使用者后插入时间轴；Buff和伤害保留完整 steps 结算数据。';

        const topActions = board.querySelector('.burst-axis-actions');
        if (topActions) {
            topActions.innerHTML = '<button type="button" class="burst-action-btn" data-manual-add-turn>新增下一回合</button>';
        }
        const navigator = board.querySelector('.burst-turn-navigator');
        if (navigator) navigator.remove();

        const logColumn = board.querySelector('.burst-battle-log-column');
        if (logColumn) {
            logColumn.innerHTML = `
                <div class="burst-section-title">手动回合轴</div>
                <div class="manual-timeline-editor">
                    <div class="manual-timeline-track" data-manual-timeline-track></div>
                    <div class="manual-timeline-delete-zone" data-manual-delete-zone aria-label="拖到此处删除">
                        <span aria-hidden="true">×</span>
                        <strong>拖到此处删除</strong>
                    </div>
                </div>
                <div class="manual-timeline-detail" data-manual-detail>当前展示狂怒3、二动、技伤与Debuff示例；可直接拖动查看顺序效果。</div>
                <div class="manual-damage-summary" data-manual-damage-summary></div>
            `;
        }

        const notice = document.createElement('div');
        notice.className = 'manual-sim-notice';
        notice.textContent = '基础黑色行动槽固定为主角→2号位→3号位→4号位；特殊追加行动黑块和彩色方块可以移动。';
        const topbar = board.querySelector('.burst-axis-topbar');
        if (topbar) topbar.insertAdjacentElement('afterend', notice);

        const addTurnButton = board.querySelector('[data-manual-add-turn]');
        if (addTurnButton) addTurnButton.addEventListener('click', () => addTurn(board));

        renderPalette(board);
        renderTimeline(board);
        const ownedSourceRoot = board.querySelector('.burst-party-column');
        if (ownedSourceRoot) wireSkillSources(board, ownedSourceRoot);
        renderDamageSummary(board);
    }

    function createBoard() {
        const container = document.getElementById('manual-burst-workspace-container');
        const autoBoard = document.getElementById(AUTO_BOARD_ID);
        if (!container) return false;
        if (!autoBoard) {
            container.innerHTML = '<div class="manual-sim-loading">正在准备手动回合模拟界面……</div>';
            return false;
        }

        ensureInitialState();
        const board = autoBoard.cloneNode(true);
        const ownedSkillSources = captureOwnedSkillSources(board);
        board.id = MANUAL_BOARD_ID;
        isolateCopiedDom(board);
        restoreOwnedSkillSources(ownedSkillSources);
        prepareBoard(board);
        container.replaceChildren(board);
        return true;
    }

    const api = {
        init: createBoard,
        refresh: createBoard,
        setDamageSummary,
        clearDamageSummary
    };

    global.ManualBurstSimulator = api;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createBoard);
    } else {
        createBoard();
    }
})(window);
