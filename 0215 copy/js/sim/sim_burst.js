// ==========================================
//  GBF 模拟器 - 单回合爆发 / 回合轴 UI 雏形
// ==========================================
(function () {
    'use strict';

    const state = {
        activeTurn: 1,
        turnCount: 1,
        actionsByTurn: { 1: [] },
        enemyActionsByTurn: { 1: [] },
        activeSkillTab: 'owned',
        settingsMode: 'basic',
        selectedActorSlot: 1,
        calculation: {
            enemyElement: '',
            defense: 10,
            randomMode: 'theory',
            critMode: 'non_crit',
            worldCapMode: '660'
        },
        actorSettings: {},
        lastResult: null
    };

    const FRONTLINE_SLOTS = [0, 1, 2, 3];
    const SUB_SLOTS = [4, 5];
    const ELEMENT_ALIASES = {
        fire: '火', water: '水', earth: '土', wind: '风', light: '光', dark: '暗',
        '火': '火', '水': '水', '土': '土', '风': '风', '光': '光', '暗': '暗'
    };
    const ADVANTAGE_TARGET = { '火': '风', '风': '土', '土': '水', '水': '火', '光': '暗', '暗': '光' };

    const GENERIC_SKILLS = [
        {
            id: 'generic_buff_placeholder',
            name: '自定义 Buff',
            typeLabel: '泛用',
            description: '预留：后续用于快速创建己方 Buff / 敌方 Debuff / 场地效果。',
            steps: []
        },
        {
            id: 'generic_damage_placeholder',
            name: '自定义伤害',
            typeLabel: '泛用',
            description: '预留：后续用于快速创建倍率、hit、上限可配置的伤害技能。',
            steps: []
        }
    ];

    const ENEMY_SKILLS = [
        {
            id: 'enemy_normal_attack_placeholder',
            name: '敌方普通攻击',
            typeLabel: '敌方',
            description: '预留：后续按敌方攻击力、目标选择、减伤、防御等规则结算。',
            steps: []
        },
        {
            id: 'enemy_special_placeholder',
            name: '敌方特殊技',
            typeLabel: '敌方',
            description: '预留：后续用于定义敌方特殊技、特殊行动、弱体或场地效果。',
            steps: []
        }
    ];

    const TEST_SKILL_TEMPLATES = [
        {
            id: 'test_damage_2hit',
            name: '测试伤害 2hit',
            description: '造成 2 次 3 倍技能伤害，单段上限 310000。',
            steps: [
                {
                    do: 'damage',
                    target: 'enemy_single',
                    damage_type: 'skill',
                    mult: 3,
                    hits: 2,
                    cap: 310000
                }
            ]
        },
        {
            id: 'test_damage_6hit',
            name: '测试伤害 6hit',
            description: '造成 6 次 1.5 倍技能伤害，单段上限 120000。',
            steps: [
                {
                    do: 'damage',
                    target: 'enemy_single',
                    damage_type: 'skill',
                    mult: 1.5,
                    hits: 6,
                    cap: 120000
                }
            ]
        },
        {
            id: 'test_self_buff',
            name: '测试 Buff',
            description: '给自己添加测试 Buff。当前版本只记录日志，后续接入战斗状态。',
            steps: [
                {
                    do: 'buff',
                    target: 'self',
                    id: 'test_buff',
                    name: '测试 Buff',
                    turns: 1,
                    prop: 'normal_atk',
                    zone: 'chara_skill',
                    value: 0.3
                }
            ]
        }
    ];

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatNumber(value) {
        const n = Math.round(Number(value) || 0);
        return n.toLocaleString('en-US');
    }

    function parseDisplayNumber(id) {
        const el = document.getElementById(id);
        if (!el) return 0;
        const text = String(el.textContent || el.innerText || '').replace(/,/g, '').trim();
        const n = parseFloat(text);
        return Number.isFinite(n) ? n : 0;
    }

    function getPartyName(slot) {
        if (slot === 0) return '主角';
        const c = typeof currentParty !== 'undefined' && currentParty ? currentParty[slot] : null;
        return c && c['名称'] ? String(c['名称']) : `角色${slot + 1}`;
    }

    function getPartyElement(slot) {
        if (slot === 0) {
            return typeof party !== 'undefined' && party[0] ? party[0].element || '—' : '—';
        }
        const c = typeof currentParty !== 'undefined' && currentParty ? currentParty[slot] : null;
        return c && c['属性'] ? String(c['属性']) : '—';
    }

    function normalizeElement(value) {
        return ELEMENT_ALIASES[String(value || '').trim().toLowerCase()] || '';
    }

    function isActorAdvantaged(slot, advantageMode) {
        if (advantageMode === 'advantage') return true;
        if (advantageMode === 'neutral') return false;
        const actorElement = normalizeElement(getPartyElement(slot));
        const enemyElement = normalizeElement(state.calculation.enemyElement);
        return !!actorElement && !!enemyElement && ADVANTAGE_TARGET[actorElement] === enemyElement;
    }

    function getSimulationRandomFactor(mode) {
        if (mode === 'min') return 0.95;
        if (mode === 'max') return 1.05;
        return 1;
    }

    function getCharacterAvatar(slot) {
        if (slot === 0) return '';
        const c = typeof currentParty !== 'undefined' && currentParty ? currentParty[slot] : null;
        return c && c['图片'] ? String(c['图片']) : '';
    }

    function buildImageSrc(path) {
        if (!path) return '';
        const normalized = String(path).trim().replace(/\\/g, '/');
        if (!normalized) return '';
        if (/^https?:\/\//i.test(normalized)) return normalized;
        return 'images/' + normalized.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    }

    function getSkillIconSrc(skill) {
        const iconPath = skill && (skill.icon || skill['图标']);
        if (!iconPath) return '';
        if (typeof buildCharaSkillIconSrc === 'function') return buildCharaSkillIconSrc(iconPath);
        return buildImageSrc(iconPath);
    }

    function getSkillTitle(skill) {
        if (!skill) return '';
        return skill.description || skill.desc || skill['中文描述'] || skill.name || skill.id || '';
    }

    function getSkillById(skillId) {
        const map = typeof globalCharaSkillMap !== 'undefined' && globalCharaSkillMap ? globalCharaSkillMap : {};
        return map[skillId] || GENERIC_SKILLS.find(s => s.id === skillId) || null;
    }

    function getOwnedSkills() {
        const items = [];
        FRONTLINE_SLOTS.concat(SUB_SLOTS).forEach((slot) => {
            if (slot === 0) return;
            const charData = typeof currentParty !== 'undefined' && currentParty ? currentParty[slot] : null;
            if (!charData || charData['ID'] == null) return;
            const map = typeof globalCharaSkillMap !== 'undefined' && globalCharaSkillMap ? globalCharaSkillMap : {};
            [1, 2, 3, 4].forEach((pos) => {
                const sid = `${charData['ID']}_${pos}`;
                const skill = map[sid];
                if (skill) items.push({ ownerSlot: slot, source: 'owned', skillId: sid, skill });
            });
        });
        return items;
    }

    function renderOwnedSkillSlots(slot) {
        if (slot === 0) return renderEmptySkillSlots(4);
        const charData = typeof currentParty !== 'undefined' && currentParty ? currentParty[slot] : null;
        if (!charData || charData['ID'] == null) return renderEmptySkillSlots(4);

        const map = typeof globalCharaSkillMap !== 'undefined' && globalCharaSkillMap ? globalCharaSkillMap : {};
        const turnActions = ensureTurn(state.activeTurn);
        return [1, 2, 3, 4].map((pos) => {
            const skillId = `${charData['ID']}_${pos}`;
            const skill = map[skillId];
            if (!skill) return '<div class="burst-skill-slot empty"></div>';

            const actionIndex = turnActions.findIndex(action => action.ownerSlot === slot && action.skillId === skillId);
            const queued = actionIndex >= 0;
            return `
                <button type="button" class="burst-skill-slot owned${queued ? ' queued' : ''}"
                    data-toggle-actor-skill="${escapeHtml(skillId)}" data-owner-slot="${slot}"
                    aria-pressed="${queued}" title="${escapeHtml(getSkillTitle(skill))}${queued ? '；点击取消使用' : '；点击放入当前回合'}">
                    ${renderPlacedSkillIcon(skill)}
                    ${queued ? `<span class="burst-skill-order">${actionIndex + 1}</span>` : ''}
                </button>
            `;
        }).join('');
    }

    function getSummonSkills() {
        const summons = typeof currentSummons !== 'undefined' && Array.isArray(currentSummons) ? currentSummons : [];
        return summons.map((summon, idx) => {
            if (!summon) return null;
            return {
                ownerSlot: null,
                source: 'summon',
                skillId: `summon_${idx}`,
                skill: {
                    id: `summon_${idx}`,
                    name: summon.name || summon['名称'] || `召唤石${idx + 1}`,
                    typeLabel: idx === 0 ? '主召' : idx === 1 ? '友召' : '召唤',
                    description: summon.description || summon.effect || '召唤石效果后续按技能 steps 定义。',
                    image: summon.image || summon['图片'],
                    steps: []
                }
            };
        }).filter(Boolean);
    }

    function getLibraryItems() {
        if (state.activeSkillTab === 'owned') {
            return getOwnedSkills().filter(item => item.ownerSlot === state.selectedActorSlot);
        }
        if (state.activeSkillTab === 'generic') {
            return GENERIC_SKILLS.map(skill => ({ ownerSlot: null, source: 'generic', skillId: skill.id, skill }));
        }
        if (state.activeSkillTab === 'summon') return getSummonSkills();
        if (state.activeSkillTab === 'enemy') {
            return ENEMY_SKILLS.map(skill => ({ ownerSlot: null, source: 'enemy', skillId: skill.id, skill }));
        }
        if (state.activeSkillTab === 'test') {
            return getTestSkills().filter(item => item.ownerSlot === state.selectedActorSlot);
        }
        return [];
    }

    function getTestSkills() {
        const items = [];
        FRONTLINE_SLOTS.forEach((slot) => {
            TEST_SKILL_TEMPLATES.forEach((template) => {
                const skill = JSON.parse(JSON.stringify(template));
                skill.id = `slot_${slot}_${template.id}`;
                skill.name = `${getPartyName(slot)} ${template.name}`;
                items.push({
                    ownerSlot: slot,
                    source: 'test',
                    skillId: skill.id,
                    skill
                });
            });
        });
        return items;
    }

    function ensureTurn(turn) {
        if (!state.actionsByTurn[turn]) state.actionsByTurn[turn] = [];
        return state.actionsByTurn[turn];
    }

    function ensureActorSettings(slot) {
        const defaults = {
            charge: 100,
            hpPercent: 100,
            useCa: true,
            chain: 'ta',
            calcOverride: false,
            randomMode: 'theory',
            critMode: 'non_crit',
            advantageMode: 'auto',
            worldCapMode: '660'
        };
        const settings = state.actorSettings[slot] || {};
        Object.keys(defaults).forEach((key) => {
            if (settings[key] == null) settings[key] = defaults[key];
        });
        state.actorSettings[slot] = settings;
        return settings;
    }

    function syncActorSettingsFromDom() {
        FRONTLINE_SLOTS.forEach((slot) => {
            const settings = ensureActorSettings(slot);
            const chargeInput = document.getElementById(`burst-charge-${slot}`);
            const caInput = document.getElementById(`burst-ca-${slot}`);
            const chainSelect = document.getElementById(`burst-chain-${slot}`);
            const calcOverride = document.getElementById(`burst-calc-override-${slot}`);
            const calcRandom = document.getElementById(`burst-calc-random-${slot}`);
            const calcCrit = document.getElementById(`burst-calc-crit-${slot}`);
            const calcAdvantage = document.getElementById(`burst-calc-advantage-${slot}`);
            const calcWorldCap = document.getElementById(`burst-calc-world-cap-${slot}`);

            if (chargeInput) {
                const charge = Number(chargeInput.value);
                if (Number.isFinite(charge)) settings.charge = Math.max(0, Math.min(200, charge));
            }
            if (caInput) settings.useCa = caInput.checked;
            if (chainSelect) settings.chain = chainSelect.value;
            if (calcOverride) settings.calcOverride = calcOverride.checked;
            if (calcRandom) settings.randomMode = calcRandom.value;
            if (calcCrit) settings.critMode = calcCrit.value;
            if (calcAdvantage) settings.advantageMode = calcAdvantage.value;
            if (calcWorldCap) settings.worldCapMode = calcWorldCap.value;
        });
    }

    function syncSimulationSettingsFromDom() {
        const enemyElement = document.getElementById('burst-enemy-element');
        const defense = document.getElementById('burst-defense');
        const minimumDamage = document.getElementById('burst-min-damage');
        const critMode = document.getElementById('burst-crit-mode');
        const worldCapMode = document.getElementById('burst-world-cap');

        if (enemyElement) state.calculation.enemyElement = enemyElement.value;
        if (defense) {
            const value = Number(defense.value);
            if (Number.isFinite(value)) state.calculation.defense = Math.max(0.1, value);
        }
        if (minimumDamage) state.calculation.randomMode = minimumDamage.checked ? 'min' : 'theory';
        if (critMode) state.calculation.critMode = critMode.value;
        if (worldCapMode) state.calculation.worldCapMode = worldCapMode.value;
    }

    function getActorCalculationContext(slot) {
        const settings = ensureActorSettings(slot);
        const useOverride = state.settingsMode === 'advanced' && settings.calcOverride;
        const randomMode = useOverride ? settings.randomMode : state.calculation.randomMode;
        const critMode = useOverride ? settings.critMode : state.calculation.critMode;
        const advantageMode = useOverride ? settings.advantageMode : 'auto';
        const worldCapMode = useOverride ? settings.worldCapMode : state.calculation.worldCapMode;
        const isAdvantage = isActorAdvantaged(slot, advantageMode);
        const effectTotals = typeof buildAllEffectsForSlot === 'function'
            ? buildAllEffectsForSlot(slot, {
                isAdvantage,
                ignoreTestBuffSettings: true,
                persist: false
            }).totals
            : null;

        return {
            defense: state.calculation.defense,
            randomMode,
            randomFactor: getSimulationRandomFactor(randomMode),
            critMode,
            isAdvantage,
            worldCapMode,
            effectTotals
        };
    }

    function setSettingsMode(mode) {
        if (mode !== 'basic' && mode !== 'advanced') return;
        syncActorSettingsFromDom();
        state.settingsMode = mode;
        updateSettingsModeControl();
        renderPartyColumn();
    }

    function updateSettingsModeControl() {
        document.querySelectorAll('[data-burst-settings-mode]').forEach((btn) => {
            const active = btn.getAttribute('data-burst-settings-mode') === state.settingsMode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
    }

    function createBoard() {
        const container = document.getElementById('burst-workspace-container') || document.getElementById('right-data-container');
        if (!container || document.getElementById('burst-sim-board')) return;

        const board = document.createElement('div');
        board.id = 'burst-sim-board';
        board.className = 'burst-axis-board';
        board.innerHTML = `
            <div class="burst-axis-topbar">
                <div>
                    <h3 class="burst-axis-title">单回合爆发模拟器</h3>
                    <div class="burst-axis-subtitle">当前先实现 1T；结构按未来 10T 回合轴预留。</div>
                </div>
                <div class="burst-axis-actions">
                    <label class="burst-top-field">敌方属性
                        <select id="burst-enemy-element" data-burst-calc-setting>
                            <option value="">未指定</option>
                            <option value="火">火</option>
                            <option value="水">水</option>
                            <option value="土">土</option>
                            <option value="风">风</option>
                            <option value="光">光</option>
                            <option value="暗">暗</option>
                        </select>
                    </label>
                    <label class="burst-top-field">防御值
                        <input type="number" id="burst-defense" value="10" min="0.1" step="0.1" data-burst-calc-setting>
                    </label>
                    <label class="burst-top-field">暴击
                        <select id="burst-crit-mode" data-burst-calc-setting>
                            <option value="non_crit">非暴击</option>
                            <option value="expected">期望值</option>
                            <option value="lower_bound">预期值</option>
                            <option value="upper_bound">上限值</option>
                        </select>
                    </label>
                    <label class="burst-top-field">世界上限
                        <select id="burst-world-cap" data-burst-calc-setting>
                            <option value="660">660万</option>
                            <option value="1310">1310万</option>
                            <option value="none">不限制</option>
                        </select>
                    </label>
                    <label class="burst-min-damage-toggle" title="开启后，普通攻击、奥义与技能伤害均使用 0.95 随机补正">
                        <input type="checkbox" id="burst-min-damage" data-burst-calc-setting>
                        <span>最小伤害</span>
                    </label>
                    <button type="button" class="burst-action-btn" data-burst-refresh>刷新角色/技能</button>
                    <button type="button" class="burst-action-btn" data-burst-clear>清空 1T</button>
                    <button type="button" class="burst-attack-btn" data-burst-attack>攻击 / 结算本回合</button>
                </div>
            </div>

            <div class="burst-battle-stage">
                <section class="burst-turn-board">
                    <div class="burst-battle-log-column">
                        <div class="burst-section-title">对战信息</div>
                        <div id="burst-damage-summary" class="burst-damage-summary"></div>
                    </div>
                    <aside class="burst-side-control">
                        <div class="burst-section-header">
                            <div class="burst-section-title">角色设定</div>
                            <div class="burst-settings-mode" role="group" aria-label="角色设置显示模式">
                                <button type="button" class="burst-settings-mode-btn active" data-burst-settings-mode="basic" aria-pressed="true">基础</button>
                                <button type="button" class="burst-settings-mode-btn" data-burst-settings-mode="advanced" aria-pressed="false">进阶</button>
                            </div>
                        </div>
                        <div class="burst-party-column" id="burst-party-column"></div>
                    </aside>
                </section>
            </div>

            <div class="burst-skill-dock">
                <div class="burst-skill-tabs">
                    <button type="button" class="burst-skill-tab" data-skill-tab="custom">新建技能</button>
                    <button type="button" class="burst-skill-tab active" data-skill-tab="owned">持有技能</button>
                    <button type="button" class="burst-skill-tab" data-skill-tab="generic">泛用技能</button>
                    <button type="button" class="burst-skill-tab" data-skill-tab="summon">召唤石</button>
                    <button type="button" class="burst-skill-tab" data-skill-tab="test">测试技能</button>
                </div>
                <div id="burst-skill-context" class="burst-skill-context"></div>
                <div id="burst-skill-box" class="burst-skill-box"></div>
            </div>
        `;

        container.appendChild(board);
        board.querySelector('[data-burst-refresh]').addEventListener('click', refresh);
        board.querySelector('[data-burst-clear]').addEventListener('click', clearActiveTurn);
        board.querySelector('[data-burst-attack]').addEventListener('click', runSimulation);
        board.querySelectorAll('[data-burst-calc-setting]').forEach((control) => {
            const eventName = control.type === 'number' ? 'input' : 'change';
            control.addEventListener(eventName, () => {
                syncSimulationSettingsFromDom();
                if (state.lastResult || ensureTurn(state.activeTurn).length > 0) runSimulation();
            });
        });
        board.querySelectorAll('[data-burst-settings-mode]').forEach((btn) => {
            btn.addEventListener('click', () => setSettingsMode(btn.getAttribute('data-burst-settings-mode')));
        });
        board.querySelectorAll('[data-skill-tab]').forEach((btn) => {
            btn.addEventListener('click', () => switchSkillTab(btn.getAttribute('data-skill-tab')));
        });

        refresh();
    }

    function refresh() {
        syncSimulationSettingsFromDom();
        updateSettingsModeControl();
        renderPartyColumn();
        renderSkillBox();
        renderDamageSummary(state.lastResult);
    }

    function renderTurnColumn() {
        const container = document.getElementById('burst-turn-column');
        if (!container) return;
        let html = '';
        for (let turn = 1; turn <= state.turnCount; turn++) {
            const active = turn === state.activeTurn ? ' active' : '';
            html += `<button type="button" class="burst-turn-cell${active}" data-turn="${turn}">${turn}T</button>`;
        }
        container.innerHTML = html;
        container.querySelectorAll('[data-turn]').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.activeTurn = parseInt(btn.getAttribute('data-turn'), 10) || 1;
                refresh();
            });
        });
    }

    function renderPartyColumn() {
        const container = document.getElementById('burst-party-column');
        if (!container) return;
        syncActorSettingsFromDom();
        const advanced = state.settingsMode === 'advanced';
        const mainHtml = `<div class="burst-frontline-list">${FRONTLINE_SLOTS.map(slot => renderActorRow(slot, false)).join('')}</div>`;
        const detailHtml = advanced ? renderActorCalculationPanel() : '';
        const subHtml = advanced ? `
            <div class="burst-sub-row">
                ${SUB_SLOTS.map(slot => renderActorRow(slot, true)).join('')}
            </div>
        ` : '';
        container.innerHTML = mainHtml + detailHtml + subHtml;
        container.querySelectorAll('[data-select-actor]').forEach((btn) => {
            btn.addEventListener('click', () => selectActor(Number(btn.getAttribute('data-select-actor'))));
        });
        container.querySelectorAll('[data-toggle-actor-skill]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const ownerSlot = Number(btn.getAttribute('data-owner-slot'));
                if (FRONTLINE_SLOTS.includes(ownerSlot)) state.selectedActorSlot = ownerSlot;
                addSkillToActiveTurn(btn.getAttribute('data-toggle-actor-skill'), 'owned', ownerSlot);
            });
        });
        container.querySelectorAll('[data-remove-action]').forEach((btn) => {
            btn.addEventListener('click', () => removeAction(btn.getAttribute('data-remove-action')));
        });
        container.querySelectorAll('[data-actor-setting]').forEach((control) => {
            const eventName = control.tagName === 'INPUT' && control.type === 'number' ? 'input' : 'change';
            control.addEventListener(eventName, () => {
                syncActorSettingsFromDom();
                if (control.matches('.burst-charge-input')) {
                    const slot = Number(control.getAttribute('data-actor-slot'));
                    const fill = container.querySelector(`[data-charge-fill="${slot}"]`);
                    if (fill) fill.style.width = `${Math.min(100, ensureActorSettings(slot).charge)}%`;
                }
                if (control.hasAttribute('data-calc-override')) renderPartyColumn();
                if (control.hasAttribute('data-actor-calc-setting') && (state.lastResult || ensureTurn(state.activeTurn).length > 0)) {
                    runSimulation();
                }
            });
        });
    }

    function renderActorCalculationPanel() {
        const slot = state.selectedActorSlot;
        const settings = ensureActorSettings(slot);
        const disabled = settings.calcOverride ? '' : ' disabled';
        return `
            <div class="burst-actor-detail">
                <div class="burst-actor-detail-head">
                    <strong>${escapeHtml(getPartyName(slot))}</strong>
                    <label class="burst-calc-override">
                        <input id="burst-calc-override-${slot}" type="checkbox" data-actor-setting data-actor-calc-setting data-calc-override ${settings.calcOverride ? 'checked' : ''}>
                        独立设置
                    </label>
                </div>
                <div class="burst-actor-detail-fields${settings.calcOverride ? '' : ' is-disabled'}">
                    <label>随机补正
                        <select id="burst-calc-random-${slot}" data-actor-setting data-actor-calc-setting${disabled}>
                            <option value="theory" ${settings.randomMode === 'theory' ? 'selected' : ''}>理论值</option>
                            <option value="min" ${settings.randomMode === 'min' ? 'selected' : ''}>最小值 0.95</option>
                            <option value="max" ${settings.randomMode === 'max' ? 'selected' : ''}>最大值 1.05</option>
                        </select>
                    </label>
                    <label>暴击
                        <select id="burst-calc-crit-${slot}" data-actor-setting data-actor-calc-setting${disabled}>
                            <option value="non_crit" ${settings.critMode === 'non_crit' ? 'selected' : ''}>非暴击</option>
                            <option value="expected" ${settings.critMode === 'expected' ? 'selected' : ''}>期望值</option>
                            <option value="lower_bound" ${settings.critMode === 'lower_bound' ? 'selected' : ''}>预期值</option>
                            <option value="upper_bound" ${settings.critMode === 'upper_bound' ? 'selected' : ''}>上限值</option>
                        </select>
                    </label>
                    <label>克属
                        <select id="burst-calc-advantage-${slot}" data-actor-setting data-actor-calc-setting${disabled}>
                            <option value="auto" ${settings.advantageMode === 'auto' ? 'selected' : ''}>按敌方属性</option>
                            <option value="advantage" ${settings.advantageMode === 'advantage' ? 'selected' : ''}>强制克属</option>
                            <option value="neutral" ${settings.advantageMode === 'neutral' ? 'selected' : ''}>强制非克属</option>
                        </select>
                    </label>
                    <label>世界上限
                        <select id="burst-calc-world-cap-${slot}" data-actor-setting data-actor-calc-setting${disabled}>
                            <option value="660" ${settings.worldCapMode === '660' ? 'selected' : ''}>660万</option>
                            <option value="1310" ${settings.worldCapMode === '1310' ? 'selected' : ''}>1310万</option>
                            <option value="none" ${settings.worldCapMode === 'none' ? 'selected' : ''}>不限制</option>
                        </select>
                    </label>
                </div>
            </div>
        `;
    }

    function selectActor(slot) {
        if (!FRONTLINE_SLOTS.includes(slot)) return;
        syncActorSettingsFromDom();
        state.selectedActorSlot = slot;
        renderPartyColumn();
        renderSkillBox();
    }

    function renderActorRow(slot, isSub) {
        const avatar = getCharacterAvatar(slot);
        const avatarHtml = avatar
            ? `<img src="${escapeHtml(buildImageSrc(avatar))}" alt="">`
            : `<span>${slot === 0 ? 'MC' : slot + 1}</span>`;
        const actorSettings = ensureActorSettings(slot);
        const chargeValue = actorSettings.charge;
        const chargeWidth = Math.min(100, chargeValue);
        const advanced = state.settingsMode === 'advanced';
        const actionHtml = renderOwnedSkillSlots(slot);
        if (isSub) {
            return `
                <div class="burst-actor-row burst-actor-row-sub">
                    <div class="burst-actor-head">
                        <div class="burst-actor-avatar">${avatarHtml}</div>
                        <div class="burst-actor-meta">
                            <div class="burst-actor-name">${escapeHtml(getPartyName(slot))}</div>
                            <div class="burst-actor-element">后备</div>
                        </div>
                    </div>
                </div>
            `;
        }

        const selected = slot === state.selectedActorSlot;

        return `
            <div class="burst-actor-row burst-actor-row-compact${advanced ? ' with-charge' : ''}${selected ? ' selected' : ''}">
                <button type="button" class="burst-actor-select" data-select-actor="${slot}" aria-pressed="${selected}">
                    <div class="burst-actor-avatar">${avatarHtml}</div>
                    <div class="burst-actor-meta">
                        <div class="burst-actor-name">${escapeHtml(getPartyName(slot))}</div>
                        <div class="burst-actor-element">${escapeHtml(getPartyElement(slot))}</div>
                    </div>
                </button>
                <div class="burst-actor-combat-controls">
                    <select id="burst-chain-${slot}" data-actor-setting aria-label="${escapeHtml(getPartyName(slot))}连击设置">
                        <option value="ta" ${actorSettings.chain === 'ta' ? 'selected' : ''}>TA</option>
                        <option value="da" ${actorSettings.chain === 'da' ? 'selected' : ''}>DA</option>
                        <option value="sa" ${actorSettings.chain === 'sa' ? 'selected' : ''}>SA</option>
                        <option value="rate" ${actorSettings.chain === 'rate' ? 'selected' : ''}>按概率</option>
                    </select>
                    <label class="burst-actor-ca-toggle"><input id="burst-ca-${slot}" data-actor-setting type="checkbox" ${actorSettings.useCa ? 'checked' : ''}> 奥义</label>
                </div>
                ${advanced ? `
                    <div class="burst-charge-ui">
                        <span class="burst-charge-label">奥义槽</span>
                        <div class="burst-charge-track">
                            <div class="burst-charge-fill" data-charge-fill="${slot}" style="width:${chargeWidth}%"></div>
                        </div>
                        <input id="burst-charge-${slot}" class="burst-charge-input" data-actor-setting data-actor-slot="${slot}" type="number" min="0" max="200" step="1" value="${chargeValue}">
                        <span class="burst-charge-percent">%</span>
                    </div>
                ` : ''}
                <div class="burst-actor-actions">${actionHtml}</div>
            </div>
        `;
    }

    function renderPlacedSkillIcon(skill) {
        const icon = getSkillIconSrc(skill) || buildImageSrc(skill && skill.image);
        if (icon) return `<img src="${escapeHtml(icon)}" alt="">`;
        const label = skill && skill.name ? String(skill.name).slice(0, 2) : '?';
        return `<span>${escapeHtml(label)}</span>`;
    }

    function renderEmptySkillSlots(count) {
        let html = '';
        for (let i = 0; i < count; i++) {
            html += '<div class="burst-skill-slot empty"></div>';
        }
        return html;
    }

    function renderEnemyActionRow() {
        const actions = state.enemyActionsByTurn[state.activeTurn] || [];
        const actionHtml = actions.length
            ? actions.map(action => {
                const skill = action.skill || ENEMY_SKILLS.find(s => s.id === action.skillId) || {};
                return `
                    <button type="button" class="burst-placed-skill burst-placed-skill-enemy" data-remove-enemy-action="${escapeHtml(action.id)}" title="点击移除">
                        ${escapeHtml(skill.name || action.skillId)}
                    </button>
                `;
            }).join('')
            : '<span class="burst-empty-actions">未设置敌方行动</span>';

        return `
            <div class="burst-enemy-action-row">
                <div class="burst-enemy-action-head">
                    <div class="burst-enemy-action-icon">敌</div>
                    <div>
                        <div class="burst-actor-name">敌方行动</div>
                        <div class="burst-actor-element">${state.activeTurn}T 结算后执行</div>
                    </div>
                </div>
                <div class="burst-enemy-action-body">${actionHtml}</div>
            </div>
        `;
    }

    function renderSkillBox() {
        const container = document.getElementById('burst-skill-box');
        if (!container) return;
        const context = document.getElementById('burst-skill-context');
        const followsActor = state.activeSkillTab === 'owned' || state.activeSkillTab === 'test';
        if (context) {
            context.hidden = !followsActor;
            context.textContent = followsActor ? `当前角色：${getPartyName(state.selectedActorSlot)}` : '';
        }
        document.querySelectorAll('.burst-skill-tab').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-skill-tab') === state.activeSkillTab);
        });

        if (state.activeSkillTab === 'custom') {
            container.innerHTML = `
                <div class="burst-custom-placeholder">
                    新建技能编辑器预留：这里后续会定义名称、目标、伤害段数、倍率、上限、Buff、Debuff、CD、持续回合等。
                </div>
            `;
            return;
        }

        const items = getLibraryItems();
        if (!items.length) {
            const emptyText = followsActor
                ? `${getPartyName(state.selectedActorSlot)}当前没有可放置的技能。`
                : '当前没有可放置的技能。';
            container.innerHTML = `<div class="burst-custom-placeholder">${escapeHtml(emptyText)}</div>`;
            return;
        }

        container.innerHTML = items.map((item) => renderSkillCard(item)).join('');
        container.querySelectorAll('[data-add-skill]').forEach((card) => {
            card.addEventListener('click', () => {
                addSkillToActiveTurn(card.getAttribute('data-add-skill'), card.getAttribute('data-source'), parseNullableInt(card.getAttribute('data-owner-slot')));
            });
        });
    }

    function renderSkillCard(item) {
        const skill = item.skill;
        const icon = getSkillIconSrc(skill) || buildImageSrc(skill.image);
        const iconHtml = icon ? `<img src="${escapeHtml(icon)}" alt="">` : `<span>${escapeHtml((skill.name || '?').slice(0, 2))}</span>`;
        const owner = item.ownerSlot == null ? (skill.typeLabel || item.source) : getPartyName(item.ownerSlot);
        const actionIndex = item.source === 'owned'
            ? ensureTurn(state.activeTurn).findIndex(action => action.ownerSlot === item.ownerSlot && action.skillId === item.skillId)
            : -1;
        const queued = actionIndex >= 0;
        return `
            <button type="button" class="burst-skill-card${queued ? ' queued' : ''}" data-add-skill="${escapeHtml(item.skillId)}" data-source="${escapeHtml(item.source)}" data-owner-slot="${item.ownerSlot == null ? '' : item.ownerSlot}" aria-pressed="${queued}" title="${escapeHtml(getSkillTitle(skill))}">
                <div class="burst-skill-icon">${iconHtml}</div>
                <div class="burst-skill-meta">
                    <div class="burst-skill-name">${escapeHtml(skill.name || item.skillId)}</div>
                    <div class="burst-skill-owner">${escapeHtml(owner)}</div>
                </div>
                ${queued ? `<span class="burst-library-order">顺序 ${actionIndex + 1}</span>` : ''}
            </button>
        `;
    }

    function parseNullableInt(value) {
        if (value == null || value === '') return null;
        const n = parseInt(value, 10);
        return Number.isFinite(n) ? n : null;
    }

    function switchSkillTab(tabName) {
        state.activeSkillTab = tabName;
        renderSkillBox();
    }

    function addSkillToActiveTurn(skillId, source, ownerSlot) {
        let skill = getSkillById(skillId);
        if (!skill && source === 'test') {
            const templateId = String(skillId).replace(/^slot_\d+_/, '');
            const template = TEST_SKILL_TEMPLATES.find(item => item.id === templateId);
            if (template) {
                skill = JSON.parse(JSON.stringify(template));
                skill.id = skillId;
                skill.name = `${getPartyName(ownerSlot)} ${template.name}`;
            }
        }
        if (source === 'enemy') {
            if (state.settingsMode !== 'advanced') {
                state.settingsMode = 'advanced';
                updateSettingsModeControl();
            }
            if (!state.enemyActionsByTurn[state.activeTurn]) state.enemyActionsByTurn[state.activeTurn] = [];
            state.enemyActionsByTurn[state.activeTurn].push({
                id: `enemy_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                turn: state.activeTurn,
                type: 'enemy',
                source,
                ownerSlot: null,
                skillId,
                skill: skill ? JSON.parse(JSON.stringify(skill)) : null
            });
            renderPartyColumn();
            renderDamageSummary(state.lastResult);
            return;
        }
        const turnActions = ensureTurn(state.activeTurn);
        if (source === 'owned') {
            const existingIndex = turnActions.findIndex(action => action.ownerSlot === ownerSlot && action.skillId === skillId);
            if (existingIndex >= 0) {
                turnActions.splice(existingIndex, 1);
                runSimulation();
                renderPartyColumn();
                renderSkillBox();
                return;
            }
        }
        turnActions.push({
            id: `act_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            turn: state.activeTurn,
            type: source === 'summon' ? 'summon' : 'skill',
            source,
            ownerSlot,
            skillId,
            skill: skill ? JSON.parse(JSON.stringify(skill)) : null
        });
        runSimulation();
        renderPartyColumn();
        renderSkillBox();
    }

    function removeAction(actionId) {
        const list = ensureTurn(state.activeTurn);
        const idx = list.findIndex(action => action.id === actionId);
        if (idx >= 0) list.splice(idx, 1);
        runSimulation();
        renderPartyColumn();
        renderSkillBox();
    }

    function removeEnemyAction(actionId) {
        const list = state.enemyActionsByTurn[state.activeTurn] || [];
        const idx = list.findIndex(action => action.id === actionId);
        if (idx >= 0) list.splice(idx, 1);
        renderPartyColumn();
    }

    function clearActiveTurn() {
        state.actionsByTurn[state.activeTurn] = [];
        state.enemyActionsByTurn[state.activeTurn] = [];
        state.lastResult = null;
        renderPartyColumn();
        renderSkillBox();
        renderDamageSummary(null);
    }

    function getActorStats(slot) {
        const out = {};
        if (typeof STAT_CONFIG !== 'undefined') {
            STAT_CONFIG.forEach((cfg) => {
                out[cfg.key] = typeof party !== 'undefined' && party[slot] && party[slot].stats ? (party[slot].stats[cfg.key] || 0) : 0;
            });
        }
        if (typeof party !== 'undefined' && party[slot] && party[slot].stats && party[slot].stats._charabuffZoneEffectTotals) {
            out._charabuffZoneEffectTotals = Object.assign({}, party[slot].stats._charabuffZoneEffectTotals);
        }
        if (typeof overlayCharaEarringElementAtkFromParty === 'function') overlayCharaEarringElementAtkFromParty(out, slot);
        if (typeof overlayCharaLbElementAtkFromParty === 'function') overlayCharaLbElementAtkFromParty(out, slot);
        if (typeof overlayCharaCapsFromParty === 'function') overlayCharaCapsFromParty(out, slot);
        return out;
    }

    function getActorFormulaBonuses(slot, hpPercent) {
        const strongCaps = [];
        let lbStaminaBonus = 0;
        let charStrongBonus = 0;
        const charData = typeof currentParty !== 'undefined' && currentParty ? currentParty[slot] : null;
        const hp01 = Math.max(0, Math.min(1, (Number(hpPercent) || 0) / 100));

        if (charData) {
            const ringStamina = Number(charData.chara_ring_stamina) || 0;
            const earringStamina = Number(charData.chara_earring_stamina) || 0;
            [ringStamina, earringStamina].forEach((amount) => {
                if (amount <= 0) return;
                if (typeof getRingEarringStaminaStrongBonus === 'function') {
                    charStrongBonus += getRingEarringStaminaStrongBonus(hp01, amount);
                } else {
                    strongCaps.push((2 + amount) / 100);
                }
            });

            if (typeof getLbStaminaStrongBonus === 'function') {
                const amounts = Array.isArray(charData.chara_lb_stamina_amounts)
                    ? charData.chara_lb_stamina_amounts
                    : [];
                if (amounts.length > 0) {
                    lbStaminaBonus = amounts.reduce((sum, amount) => sum + getLbStaminaStrongBonus(hp01, amount), 0);
                } else {
                    const level = Number(charData.chara_lb_stamina) || 0;
                    if (level > 0) lbStaminaBonus = getLbStaminaStrongBonus(hp01, level);
                }
            }
        }

        let adversityStrongBonus = 0;
        if (typeof buildCharabonusSummary === 'function') {
            const summary = buildCharabonusSummary(slot, hpPercent);
            if (summary && typeof summary.adversity === 'number') adversityStrongBonus = summary.adversity;
        }

        return {
            backups: [0, 0, 0, 0, 0],
            strongCaps,
            lbStaminaBonus,
            charStrongBonus,
            adversityCharSkill: 0,
            adversityWeapon: 0,
            adversityStrongBonus
        };
    }

    function getEffectTotal(context, key, fallback) {
        const totals = context && context.effectTotals;
        return totals && typeof totals[key] === 'number' ? totals[key] : fallback;
    }

    function getActorPanelAttack(slot) {
        return parseDisplayNumber(`char-panel-atk-${slot}`);
    }

    function isClass5MainCharacter(slot) {
        if (slot !== 0 || typeof allClasses === 'undefined' || typeof currentMC === 'undefined') return false;
        const job = allClasses.find(item => item.id === currentMC.jobId);
        return !!(job && job.type === 'class_5');
    }

    function calculateNormalAttackDamage(slot) {
        if (typeof calculateDamage !== 'function' || typeof sumNaFinalWithRanshu !== 'function') return 0;
        const panelAtk = getActorPanelAttack(slot);
        if (panelAtk <= 0) return 0;

        const stats = getActorStats(slot);
        const settings = ensureActorSettings(slot);
        const hpPercent = settings.hpPercent;
        const context = getActorCalculationContext(slot);
        const bonuses = getActorFormulaBonuses(slot, hpPercent);
        const raw = calculateDamage(panelAtk, stats, hpPercent, Object.assign({
            isAdvantage: context.isAdvantage,
            defense: context.defense,
            defenseDown: 0,
            randomFactor: context.randomFactor,
            charIndex: slot,
            ignoreBaseValueAdjustment: true,
            ignoreTestBuffSettings: true
        }, bonuses));

        const critSources = typeof window.getIndependentCritSources === 'function'
            ? window.getIndependentCritSources(slot, stats)
            : [];
        const critMultiplier = typeof window.getCritMultiplierByMode === 'function'
            ? window.getCritMultiplierByMode(context.critMode, critSources)
            : 1;
        const critAmpRate = typeof window.getCritAmpRateByMode === 'function'
            ? window.getCritAmpRateByMode(context.critMode, critSources)
            : 0;
        const rawCritPostDef = new Decimal(raw.damage || 0).times(critMultiplier).toNumber();
        const teshuStats = typeof getTeshuStats === 'function' ? getTeshuStats() : {};
        const suppZones = typeof getDmgSuppZonesForNa === 'function'
            ? getDmgSuppZonesForNa(stats, teshuStats, slot)
            : { total: (typeof aggregateZoneValue === 'function'
                ? aggregateZoneValue('dmg_supp', stats, teshuStats) + aggregateZoneValue('na_dmg_supp', stats, teshuStats)
                : 0) };
        const totalSupp = getEffectTotal(context, 'na_dmg_supp', Number(suppZones.total) || 0);
        const critOnlyAmp = (Number(stats.weapon_critical_hit_amp) || 0) * critAmpRate;
        const capOptions = {
            isClass5: isClass5MainCharacter(slot),
            worldCapMode: context.worldCapMode,
            charIndex: slot,
            ignoreTestBuffSettings: true,
            effectTotals: context.effectTotals
        };
        const ranshuHits = Math.max(1, Math.floor(Number(stats.weapon_na_ranshu) || 1));
        const body = sumNaFinalWithRanshu(rawCritPostDef, stats, teshuStats, critOnlyAmp, capOptions, totalSupp, ranshuHits);

        let chasePerSegment = 0;
        if (window.BonusDmgCalc && typeof window.BonusDmgCalc.calcNaBonusDamage === 'function') {
            const bonus = window.BonusDmgCalc.calcNaBonusDamage({
                panelAtk,
                stats,
                hpPercent,
                charIndex: slot,
                teshuStats,
                isAdv: context.isAdvantage,
                rawCritPostDefUsed: rawCritPostDef,
                extraAmpUsed: critOnlyAmp,
                defense: context.defense,
                defenseDown: 0,
                randomFactor: context.randomFactor,
                fallbackElement: getPartyElement(slot),
                ranshuForUi: ranshuHits,
                totalSupp,
                calcOptions: bonuses,
                totalCritMult: critMultiplier,
                extraAmpAdvantage: critOnlyAmp,
                extraAmpNormal: critOnlyAmp,
                capOptions
            });
            chasePerSegment = (Number(bonus.chasePerHit) || 0) + (Number(bonus.chaseDesPerHit) || 0);
        }

        return (Number(body.sum) || 0) + chasePerSegment * ranshuHits;
    }

    function calculateCaAttackDamage(slot, overrides) {
        if (!window.CaDmgCalc || typeof window.CaDmgCalc.calculateCaDamage !== 'function') return 0;
        const panelAtk = getActorPanelAttack(slot);
        if (panelAtk <= 0) return 0;
        overrides = overrides || {};
        const stats = getActorStats(slot);
        const settings = ensureActorSettings(slot);
        const context = getActorCalculationContext(slot);
        const bonuses = getActorFormulaBonuses(slot, settings.hpPercent);
        const result = window.CaDmgCalc.calculateCaDamage(panelAtk, stats, settings.hpPercent, Object.assign({
            defense: context.defense,
            defenseDown: 0,
            charIndex: slot,
            isAdvantage: context.isAdvantage,
            applyCap: true,
            critMode: context.critMode,
            ignoreTestBuffSettings: true,
            effectTotals: context.effectTotals,
            naOptions: {
                randomFactor: context.randomFactor,
                ignoreBaseValueAdjustment: true,
                ignoreTestBuffSettings: true
            },
            capOptions: {
                worldCapMode: context.worldCapMode,
                charIndex: slot,
                ignoreTestBuffSettings: true,
                effectTotals: context.effectTotals
            }
        }, bonuses, overrides));
        return Number(result && result.value) || 0;
    }

    function calculateNormalRoundDamage(slot) {
        const settings = ensureActorSettings(slot);
        const mode = settings.chain;
        const attacks = mode === 'ta' ? 3 : mode === 'da' ? 2 : 1;
        return calculateNormalAttackDamage(slot) * attacks;
    }

    function addDamage(result, slot, key, value) {
        if (slot == null || !FRONTLINE_SLOTS.includes(slot)) return;
        if (!result.byCharacter[slot]) {
            result.byCharacter[slot] = {
                slot,
                name: getPartyName(slot),
                skillDamage: 0,
                caDamage: 0,
                normalDamage: 0,
                summonDamage: 0,
                total: 0
            };
        }
        const n = Math.max(0, Number(value) || 0);
        result.byCharacter[slot][key] += n;
        result.byCharacter[slot].total += n;
        result.totalDamage += n;
    }

    function getResolvedSkillActions(skill, action) {
        if (!skill || !Array.isArray(skill.steps)) return [];
        if (!window.StatusResolver || typeof window.StatusResolver.getSkillActions !== 'function') return [];
        return window.StatusResolver.getSkillActions(skill, {
            skillId: action && action.skillId ? action.skillId : skill.id,
            skillName: skill.name || skill.id,
            ownerSlot: action ? action.ownerSlot : null
        });
    }

    function calculateResolvedDamageAction(resolvedAction, slot) {
        const params = resolvedAction && resolvedAction.damage ? resolvedAction.damage : {};
        if (params.damage_type === 'ca') {
            return calculateCaAttackDamage(slot, {
                caMultiplier: params.multiplier == null ? null : Number(params.multiplier),
                caFixed: params.fixed == null ? null : Number(params.fixed)
            });
        }
        if (params.damage_type === 'normal_attack') {
            return calculateNormalRoundDamage(slot);
        }
        const hits = Math.max(1, Math.floor(Number(params.hits) || 1));
        const multiplier = Number(params.multiplier) || 0;
        if (slot == null || multiplier <= 0 || !window.SkillDmgCalc || typeof window.SkillDmgCalc.calculateSkillDamage !== 'function') {
            return 0;
        }

        const stats = getActorStats(slot);
        const settings = ensureActorSettings(slot);
        const context = getActorCalculationContext(slot);
        const bonuses = getActorFormulaBonuses(slot, settings.hpPercent);
        const thresholdTableId = params.threshold_table || null;
        const exactTable = thresholdTableId && window.ThresholdRegistry && typeof window.ThresholdRegistry.getById === 'function'
            ? window.ThresholdRegistry.getById(thresholdTableId)
            : null;
        const useExactCap = !!exactTable;
        const oneHit = window.SkillDmgCalc.calculateSkillDamage(getActorPanelAttack(slot), stats, settings.hpPercent, Object.assign({
            skillBaseMult: multiplier,
            defense: context.defense,
            defenseDown: 0,
            charIndex: slot,
            isAdvantage: context.isAdvantage,
            applyCap: useExactCap,
            capOptions: {
                thresholdTableId: useExactCap ? thresholdTableId : null,
                worldCapMode: context.worldCapMode,
                charIndex: slot,
                ignoreTestBuffSettings: true,
                effectTotals: context.effectTotals
            },
            critMode: context.critMode,
            ignoreTestBuffSettings: true,
            effectTotals: context.effectTotals,
            naOptions: {
                randomFactor: context.randomFactor,
                ignoreBaseValueAdjustment: true,
                ignoreTestBuffSettings: true
            }
        }, bonuses));

        let perHit = Number(oneHit.value) || 0;
        const capPerHit = Number(params.cap_per_hit) || 0;
        if (!useExactCap && capPerHit > 0) {
            const capCoef = typeof getSkillDamageCapCoefForFuzzy === 'function'
                ? getSkillDamageCapCoefForFuzzy(slot, stats, {
                    charIndex: slot,
                    ignoreTestBuffSettings: true,
                    effectTotals: context.effectTotals
                })
                : 1;
            const effectiveCap = capPerHit * (Number(capCoef) || 1);
            if (perHit > effectiveCap) perHit = effectiveCap + (perHit - effectiveCap) * 0.01;
            if (typeof applyWorldCap === 'function') {
                perHit = applyWorldCap(perHit, 'skill', stats, context.worldCapMode).ceil().toNumber();
            }
        }
        return perHit * hits;
    }

    function calculateSkillAction(action, result) {
        const skill = action.skill || getSkillById(action.skillId);
        const resolvedActions = getResolvedSkillActions(skill, action);
        const event = {
            type: action.type || 'skill',
            actionId: action.id,
            skillId: action.skillId,
            ownerSlot: action.ownerSlot,
            damage: 0,
            statuses: []
        };
        if (!skill || resolvedActions.length === 0) {
            result.logs.push(`${skill ? skill.name : action.skillId} 暂无可执行 steps。`);
            result.events.push(event);
            return;
        }

        resolvedActions.forEach((resolvedAction) => {
            if (!resolvedAction) return;
            if (resolvedAction.type === 'apply_status') {
                const statusName = resolvedAction.status && resolvedAction.status.name
                    ? resolvedAction.status.name
                    : 'Buff';
                event.statuses.push(statusName);
                result.logs.push(`${skill.name || action.skillId}：赋予 ${statusName}，当前版本先记录，后续接入战斗状态。`);
                return;
            }
            if (resolvedAction.type !== 'damage') return;
            const total = calculateResolvedDamageAction(resolvedAction, action.ownerSlot);
            if (total <= 0) {
                result.logs.push(`${skill.name || action.skillId} 的伤害效果暂不可计算。`);
                return;
            }
            const damageType = resolvedAction.damage && resolvedAction.damage.damage_type;
            const damageKey = action.type === 'summon'
                ? 'summonDamage'
                : damageType === 'ca'
                    ? 'caDamage'
                    : damageType === 'normal_attack'
                        ? 'normalDamage'
                        : 'skillDamage';
            addDamage(result, action.ownerSlot, damageKey, total);
            event.damage += total;
        });
        result.events.push(event);
    }

    function calculateAttack(result) {
        FRONTLINE_SLOTS.forEach((slot) => {
            const settings = ensureActorSettings(slot);
            const charge = settings.charge;
            const useCa = settings.useCa && charge >= 100;
            const behavior = useCa ? 'ca' : 'na';
            const actionId = `turn_${result.turn}_attack_${slot}`;
            const action = {
                id: actionId,
                turn: result.turn,
                type: 'attack',
                source: 'attack',
                ownerSlot: slot,
                skillId: actionId,
                skill: {
                    id: actionId,
                    name: useCa ? '奥义' : '普通攻击',
                    steps: [{ do: behavior }]
                }
            };
            calculateSkillAction(action, result);
        });
    }

    function runSimulation() {
        syncActorSettingsFromDom();
        syncSimulationSettingsFromDom();
        const result = {
            turn: state.activeTurn,
            totalDamage: 0,
            byCharacter: {},
            buffsByCharacter: {},
            logs: [],
            events: []
        };

        ensureTurn(state.activeTurn).forEach((action) => calculateSkillAction(action, result));
        calculateAttack(result);
        state.lastResult = result;
        renderDamageSummary(result);
        return result;
    }

    function renderDamageSummary(result) {
        const container = document.getElementById('burst-damage-summary');
        if (!container) return;
        const resolved = result || {
            totalDamage: 0,
            byCharacter: {},
            buffsByCharacter: {},
            logs: [],
            events: []
        };
        const actionRows = buildBattleLogHtml(resolved);
        const logHtml = resolved.logs && resolved.logs.length
            ? `<div class="burst-summary-log">${resolved.logs.map(escapeHtml).join('<br>')}</div>`
            : '';
        container.innerHTML = `
            ${actionRows}
            <div class="burst-damage-total">
                <span>合计伤害</span>
                <strong>${formatNumber(resolved.totalDamage)}</strong>
            </div>
            ${logHtml}
        `;
    }

    function buildBattleLogHtml(result) {
        const turn = result && result.turn ? result.turn : state.activeTurn;
        if (!result || result.totalDamage <= 0 && (!result.logs || result.logs.length === 0)) {
            return `
                <div class="burst-log-turn-title">第一回合</div>
                <div class="burst-log-empty">点击右侧技能放入 1T，然后点击“攻击 / 结算本回合”。</div>
            `;
        }

        let html = `<div class="burst-log-turn-title">第${turn}回合</div>`;
        ensureTurn(turn).forEach((action) => {
            const skill = action.skill || getSkillById(action.skillId) || {};
            const icon = getSkillIconSrc(skill);
            const actorName = action.ownerSlot == null ? '系统' : getPartyName(action.ownerSlot);
            const actionDamage = getActionDamageEstimate(action, result);
            html += `
                <div class="burst-log-action">
                    <div class="burst-log-action-head">
                        <div class="burst-log-icon">${icon ? `<img src="${escapeHtml(icon)}" alt="">` : `<span>${escapeHtml((skill.name || '?').slice(0, 2))}</span>`}</div>
                        <div>
                            <div class="burst-log-actor">${escapeHtml(actorName)}</div>
                            <div class="burst-log-skill">${escapeHtml(skill.name || action.skillId)}</div>
                        </div>
                    </div>
                    ${actionDamage > 0 ? `<div class="burst-log-line">${escapeHtml(actorName)}：造成 ${formatNumber(actionDamage)} 伤害</div>` : ''}
                    ${renderSkillBuffLines(skill, actorName)}
                </div>
                <div class="burst-log-separator"></div>
            `;
        });

        html += `<div class="burst-log-attack-divider">攻击</div>`;
        FRONTLINE_SLOTS.forEach((slot) => {
            const item = result.byCharacter[slot] || {};
            const attackDamage = (Number(item.caDamage) || 0) + (Number(item.normalDamage) || 0);
            html += `
                <div class="burst-log-line burst-log-attack-line">
                    ${renderBattleActorAvatar(slot)}
                    ${renderTurnBuffSlots(slot, result)}
                    <span class="burst-log-attack-result">
                        <span class="burst-log-attack-name">${escapeHtml(getPartyName(slot))}</span>
                        <strong class="burst-log-attack-damage">${formatNumber(attackDamage)}</strong>
                    </span>
                </div>
            `;
        });
        return html;
    }

    function renderBattleActorAvatar(slot) {
        const avatar = getCharacterAvatar(slot);
        const content = avatar
            ? `<img src="${escapeHtml(buildImageSrc(avatar))}" alt="">`
            : `<span>${slot === 0 ? 'MC' : slot + 1}</span>`;
        return `<span class="burst-log-attack-avatar" title="${escapeHtml(getPartyName(slot))}">${content}</span>`;
    }

    function getTurnBuffDisplayItems(slot, result) {
        const byCharacter = result && result.buffsByCharacter ? result.buffsByCharacter : {};
        const buffs = Array.isArray(byCharacter[slot]) ? byCharacter[slot] : [];
        return buffs.map((buff) => {
            if (!buff) return null;
            if (buff.tooltip || buff.abbrev) return buff;
            if (window.StatusResolver && typeof window.StatusResolver.statusToPartyBuffDisplay === 'function') {
                return window.StatusResolver.statusToPartyBuffDisplay(buff);
            }
            const title = buff.name || buff.status_id || 'Buff';
            return {
                icon: buff.icon || '',
                title,
                abbrev: String(title).slice(0, 2),
                tooltip: title
            };
        }).filter(Boolean);
    }

    function getTurnBuffIconSrc(iconPath) {
        const normalized = String(iconPath || '').trim().replace(/\\/g, '/');
        if (!normalized) return '';
        if (/^https?:\/\//i.test(normalized)) return normalized;
        if (normalized.indexOf('images/') === 0) {
            return normalized.split('/').map(encodeURIComponent).join('/');
        }
        if (/^status_[^/]+\.(png|webp|jpg)$/i.test(normalized)) {
            return buildImageSrc(`buff icon/${normalized}`);
        }
        return buildImageSrc(normalized);
    }

    function renderTurnBuffSlots(slot, result) {
        const buffs = getTurnBuffDisplayItems(slot, result);
        const html = buffs.map((buff) => {
            const icon = getTurnBuffIconSrc(buff.icon);
            const content = icon
                ? `<img src="${escapeHtml(icon)}" alt="">`
                : `<span>${escapeHtml(buff.abbrev || String(buff.title || 'Buff').slice(0, 2))}</span>`;
            return `<span class="burst-log-buff-slot filled" title="${escapeHtml(buff.tooltip || buff.title || 'Buff')}">${content}</span>`;
        }).join('');
        return `<span class="burst-log-buff-strip" aria-label="${escapeHtml(getPartyName(slot))}本回合 Buff">${html}</span>`;
    }

    function getActionDamageEstimate(action, result) {
        if (!action || action.ownerSlot == null) return 0;
        const event = result && Array.isArray(result.events)
            ? result.events.find(item => item.actionId === action.id)
            : null;
        return event ? Number(event.damage) || 0 : 0;
    }

    function renderSkillBuffLines(skill, actorName) {
        return getResolvedSkillActions(skill, { skillId: skill && skill.id }).map((resolvedAction) => {
            if (!resolvedAction || resolvedAction.type !== 'apply_status' || !resolvedAction.status) return '';
            const status = resolvedAction.status;
            const buffName = status.name || status.status_id || 'Buff';
            const duration = status.duration && status.duration.value != null ? `（${status.duration.value}回合）` : '';
            return `<div class="burst-log-line">${escapeHtml(actorName)}：技能的buff加成 ${escapeHtml(buffName)}${escapeHtml(duration)}</div>`;
        }).filter(Boolean).join('');
    }

    window.BurstSimulator = {
        init: createBoard,
        refresh,
        run: runSimulation,
        clear: clearActiveTurn
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createBoard);
    } else {
        createBoard();
    }
})();
