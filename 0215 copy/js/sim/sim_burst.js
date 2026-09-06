// ==========================================
//  GBF 模拟器 - 单回合爆发 / 回合轴 UI 雏形
// ==========================================
(function () {
    'use strict';

    const state = {
        activeTurn: 1,
        turnCount: 1,
        maxTurnCount: 10,
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
        actorSettingsByTurn: { 1: {} },
        lastResult: null,
        resultsByTurn: {},
        simulationBaseSnapshot: null,
        manualSimulationBaseSnapshot: null
    };

    const FRONTLINE_SLOTS = [0, 1, 2, 3];
    const SUB_SLOTS = [4, 5];
    const SIMULATION_STAT_CATEGORY_SCOPE = Object.freeze({
        weapon: 'build',
        summon: 'build',
        job: 'build',
        chara: 'build',
        charabonus: 'build',
        special: 'build',
        derived: 'build',
        charabuff: 'scenario'
    });
    const ELEMENT_ALIASES = {
        fire: '火', water: '水', earth: '土', wind: '风', light: '光', dark: '暗',
        non_elemental: '无属性', none: '无属性',
        '火': '火', '水': '水', '土': '土', '风': '风', '光': '光', '暗': '暗', '无属性': '无属性'
    };
    const ADVANTAGE_TARGET = { '火': '风', '风': '土', '土': '水', '水': '火', '光': '暗', '暗': '光' };

    const BUILT_IN_ATTACK_SKILLS = Object.freeze({
        na: Object.freeze({
            id: 'builtin_normal_attack',
            name: '平A',
            typeLabel: '内置',
            description: '进行一次普通攻击。',
            steps: Object.freeze([{ do: 'na' }])
        }),
        ca: Object.freeze({
            id: 'builtin_charge_attack',
            name: '奥义',
            typeLabel: '内置',
            description: '发动一次奥义。',
            steps: Object.freeze([{ do: 'ca' }])
        })
    });

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
        },
        {
            id: 'test_double_strike_second_action',
            name: '测试：二动与第二次行动被动',
            description: '自身本回合行动两次；第二次行动时临时获得普通攻刃+100%，行动结束后立即移除。',
            steps: [
                {
                    do: 'buff',
                    target: 'self',
                    unique: true,
                    id: 'test_double_strike_status',
                    name: '二动（测试）',
                    turns: 1,
                    effects: [
                        {
                            effect: 'double_strike',
                            value: 1
                        }
                    ]
                },
                {
                    do: 'buff',
                    target: 'self',
                    unique: true,
                    id: 'test_second_action_watcher',
                    name: '第二次行动被动（测试）',
                    turns: 1,
                    effects: [],
                    triggers: [
                        {
                            event: 'attack_action_start',
                            watch: 'self',
                            insertion: 'modifier',
                            conditions: {
                                path: 'event.attackActionIndex',
                                op: '>=',
                                value: 2
                            },
                            limits: {
                                max_per_turn: 1
                            },
                            steps: [
                                {
                                    do: 'buff',
                                    target: 'self',
                                    id: 'test_second_action_atk_up',
                                    name: '第二次行动攻刃+100%（测试）',
                                    icon: 'buff icon/normal_atk.png',
                                    duration: {
                                        type: 'action',
                                        value: 1,
                                        tick: 'attack_action_end'
                                    },
                                    prop: 'normal_atk',
                                    zone: 'chara_skill',
                                    value: 1,
                                    format: 'percent'
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        {
            id: 'test_party_ta_counter_passive',
            name: '测试：全队每3次TA触发',
            description: '监听前排TA；每累计3次立即造成一次技能伤害，并使自身获得1层测试标记，最多5层。计数余数跨回合保留。',
            steps: [
                {
                    do: 'buff',
                    target: 'self',
                    unique: true,
                    id: 'test_party_ta_counter_watcher',
                    name: '全队TA计数被动（测试）',
                    effects: [],
                    triggers: [
                        {
                            event: 'triple_attack_resolved',
                            watch: 'ally_party',
                            insertion: 'interrupt',
                            counter: {
                                id: 'test_party_ta_count',
                                scope: 'party_shared',
                                add: 1,
                                threshold: 3
                            },
                            steps: [
                                {
                                    do: 'damage',
                                    target: 'enemy_single',
                                    damage_type: 'skill',
                                    mult: 2,
                                    hits: 1,
                                    cap: 100000
                                },
                                {
                                    do: 'buff',
                                    target: 'self',
                                    id: 'test_party_ta_mark',
                                    name: 'TA标记（测试）',
                                    icon: 'buff icon/normal_atk.png',
                                    stacking: {
                                        mode: 'add',
                                        add: 1,
                                        max: 5,
                                        refresh_duration: false
                                    },
                                    effects: []
                                }
                            ]
                        }
                    ]
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

    function normalizeCalculationSettings(settings, fallback) {
        const base = fallback && typeof fallback === 'object' ? fallback : state.calculation;
        const source = settings && typeof settings === 'object' ? settings : {};
        const defense = Number(source.defense == null ? base.defense : source.defense);
        const critMode = String(source.critMode || base.critMode || 'non_crit');
        const worldCapMode = String(source.worldCapMode || base.worldCapMode || '660');
        return {
            enemyElement: normalizeElement(source.enemyElement == null ? base.enemyElement : source.enemyElement),
            defense: Number.isFinite(defense) ? Math.max(0.1, defense) : 10,
            randomMode: (source.randomMode == null ? base.randomMode : source.randomMode) === 'min' ? 'min' : 'theory',
            critMode: ['non_crit', 'expected', 'lower_bound', 'upper_bound'].includes(critMode) ? critMode : 'non_crit',
            worldCapMode: ['660', '1310', 'none'].includes(worldCapMode) ? worldCapMode : '660'
        };
    }

    function getBattleCalculationSettings(battleState) {
        return normalizeCalculationSettings(
            battleState && battleState.calculationSettings,
            state.calculation
        );
    }

    function getSimulationSnapshot(battleState) {
        return battleState && battleState.simulationBaseSnapshot
            ? battleState.simulationBaseSnapshot
            : state.simulationBaseSnapshot;
    }

    function isActorAdvantaged(slot, advantageMode, calculationSettings) {
        if (advantageMode === 'advantage') return true;
        if (advantageMode === 'neutral') return false;
        const actorElement = normalizeElement(getPartyElement(slot));
        const enemyElement = normalizeElement((calculationSettings || state.calculation).enemyElement);
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
        if (!c) return '';
        return String(c['横向图片'] || c['图片'] || c['竖状图片'] || '');
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
        const registered = window.SkillRegistry && typeof window.SkillRegistry.get === 'function'
            ? window.SkillRegistry.get(skillId)
            : null;
        const charabuffSkill = window.CharabuffRegistry && typeof window.CharabuffRegistry.toBattleSkill === 'function'
            ? window.CharabuffRegistry.toBattleSkill(skillId)
            : null;
        const map = typeof globalCharaSkillMap !== 'undefined' && globalCharaSkillMap ? globalCharaSkillMap : {};
        return registered
            || map[skillId]
            || charabuffSkill
            || Object.values(BUILT_IN_ATTACK_SKILLS).find(skill => skill.id === skillId)
            || GENERIC_SKILLS.find(s => s.id === skillId)
            || TEST_SKILL_TEMPLATES.find(s => s.id === skillId)
            || null;
    }

    function getOwnedSkills() {
        const items = [];
        FRONTLINE_SLOTS.concat(SUB_SLOTS).forEach((slot) => {
            if (slot === 0) {
                const job = typeof allClasses !== 'undefined' && currentMC && currentMC.jobId
                    ? allClasses.find(item => item && item.id === currentMC.jobId)
                    : null;
                const ids = [];
                if (currentMC && Array.isArray(currentMC.skillIds)) ids.push(...currentMC.skillIds);
                if (job && job.skill_refs && Array.isArray(job.skill_refs.active)) ids.push(...job.skill_refs.active);
                const seen = new Set();
                ids.forEach((skillId) => {
                    const skill = getSkillById(skillId);
                    if (!skill || String(skill.kind || 'active').toLowerCase() === 'passive' || seen.has(skill.id)) return;
                    seen.add(skill.id);
                    items.push({ ownerSlot: 0, source: 'owned', skillId: skill.id || skillId, skill });
                });
                return;
            }
            const charData = typeof currentParty !== 'undefined' && currentParty ? currentParty[slot] : null;
            if (!charData || charData['ID'] == null) return;
            [1, 2, 3, 4].forEach((pos) => {
                const sid = `${charData['ID']}_${pos}`;
                const skill = getSkillById(sid);
                if (skill && String(skill.kind || 'active').toLowerCase() !== 'passive') {
                    items.push({ ownerSlot: slot, source: 'owned', skillId: sid, skill });
                }
            });
        });
        return items;
    }

    function getBattleStartActions(turn) {
        if (typeof currentMC === 'undefined') return [];
        const job = typeof allClasses !== 'undefined' && currentMC.jobId
            ? allClasses.find(item => item && item.id === currentMC.jobId)
            : null;
        let skills = Array.isArray(currentMC.battleSkills) && currentMC.battleSkills.length > 0
            ? currentMC.battleSkills
            : job && Array.isArray(job.battle_skills)
                ? job.battle_skills
                : [];
        if (skills.length === 0 && job && job.skill_refs && Array.isArray(job.skill_refs.passive)) {
            skills = job.skill_refs.passive.map(getSkillById).filter(Boolean);
        }
        const actions = skills.filter((skill) => {
            return skill && skill.trigger && skill.trigger.event === 'battle_start';
        }).map((skill, index) => ({
            id: `turn_${turn}_battle_start_job_${job ? job.id : 'mc'}_${index}`,
            turn,
            type: 'initial_status',
            source: 'battle_initial',
            ownerSlot: 0,
            skillId: skill.id || `job_${job ? job.id : 'mc'}_battle_start_${index}`,
            skill: cloneJson(skill)
        }));

        FRONTLINE_SLOTS.concat(SUB_SLOTS).forEach((slot) => {
            if (slot === 0 || !window.SkillRegistry || typeof window.SkillRegistry.getByOwner !== 'function') return;
            const charData = typeof currentParty !== 'undefined' && currentParty ? currentParty[slot] : null;
            if (!charData || charData['ID'] == null) return;
            window.SkillRegistry.getByOwner('character', charData['ID'], { kind: 'passive' })
                .filter((skill) => skill && skill.trigger && skill.trigger.event === 'battle_start')
                .forEach((skill, index) => actions.push({
                    id: `turn_${turn}_battle_start_character_${slot}_${skill.id || index}`,
                    turn,
                    type: 'initial_status',
                    source: 'battle_initial',
                    ownerSlot: slot,
                    skillId: skill.id || `character_${charData['ID']}_battle_start_${index}`,
                    skill: cloneJson(skill)
                }));
        });

        if (window.SummonRegistry && typeof window.SummonRegistry.collectPassiveSkills === 'function'
            && window.SkillRegistry && typeof currentSummons !== 'undefined') {
            window.SummonRegistry.collectPassiveSkills(currentSummons, window.SkillRegistry)
                .filter((entry) => entry.skill && entry.skill.trigger && entry.skill.trigger.event === 'battle_start')
                .forEach((entry, index) => actions.push({
                    id: `turn_${turn}_battle_start_summon_${entry.summonSlot}_${index}`,
                    turn,
                    type: 'initial_status',
                    source: 'battle_initial',
                    ownerSlot: entry.ownerSlot == null ? 0 : entry.ownerSlot,
                    summonSlot: entry.summonSlot,
                    skillId: entry.skill.id || entry.skillId,
                    skill: cloneJson(entry.skill)
                }));
        }
        return actions;
    }

    function renderOwnedSkillSlots(slot) {
        const ownedSkills = getOwnedSkills().filter((item) => item.ownerSlot === slot);
        if (ownedSkills.length === 0) return renderEmptySkillSlots(4);
        const placed = new Array(4).fill(null);
        ownedSkills.forEach((item) => {
            const preferred = Math.floor(Number(item.skill && item.skill.slot)) - 1;
            const index = preferred >= 0 && preferred < 4 && !placed[preferred]
                ? preferred
                : placed.findIndex((entry) => !entry);
            if (index >= 0) placed[index] = item;
        });
        const turnActions = ensureTurn(state.activeTurn);
        return placed.map((item) => {
            if (!item) return '<div class="burst-skill-slot empty"></div>';
            const skillId = item.skillId;
            const skill = item.skill;

            const actionIndex = turnActions.findIndex(action => action.ownerSlot === slot && action.skillId === skillId);
            const queued = actionIndex >= 0;
            const cooldownState = getSkillCooldownAtTurn(slot, skillId, skill, state.activeTurn);
            const coolingDown = !queued && cooldownState.remaining > 0;
            const reservedInFuture = !queued && !coolingDown && cooldownState.futureConflictTurn != null;
            const unavailable = coolingDown || reservedInFuture;
            const unavailableTitle = coolingDown
                ? `；冷却中，${cooldownState.remaining}回合后可用`
                : reservedInFuture
                    ? `；已安排于${cooldownState.futureConflictTurn}T，当前使用会与后续计划冲突`
                    : '';
            return `
                <button type="button" class="burst-skill-slot owned${queued ? ' queued' : ''}${coolingDown ? ' cooling-down' : ''}${reservedInFuture ? ' timeline-conflict' : ''}"
                    data-toggle-actor-skill="${escapeHtml(skillId)}" data-owner-slot="${slot}"
                    aria-pressed="${queued}" ${unavailable ? 'disabled aria-disabled="true"' : ''}
                    title="${escapeHtml(getSkillTitle(skill))}${queued ? '；点击取消使用' : unavailableTitle || '；点击放入当前回合'}">
                    ${renderPlacedSkillIcon(skill)}
                    ${queued ? `<span class="burst-skill-order">${actionIndex + 1}</span>` : ''}
                    ${coolingDown ? `<span class="burst-skill-cooldown">CD ${cooldownState.remaining}</span>` : ''}
                    ${reservedInFuture ? `<span class="burst-skill-cooldown">已排 ${cooldownState.futureConflictTurn}T</span>` : ''}
                </button>
            `;
        }).join('');
    }

    function getSummonSkills() {
        const summons = typeof currentSummons !== 'undefined' && Array.isArray(currentSummons) ? currentSummons : [];
        if (!window.SummonRegistry || typeof window.SummonRegistry.collectActiveSkills !== 'function'
            || !window.SkillRegistry) return [];
        return window.SummonRegistry.collectActiveSkills(summons, window.SkillRegistry);
    }

    function getLibraryItems() {
        if (state.activeSkillTab === 'owned') {
            return getOwnedSkills().filter(item => item.ownerSlot === state.selectedActorSlot);
        }
        if (state.activeSkillTab === 'generic') {
            return GENERIC_SKILLS.map(skill => ({ ownerSlot: null, source: 'generic', skillId: skill.id, skill }));
        }
        if (state.activeSkillTab === 'summon') return getSummonSkills();
        if (state.activeSkillTab === 'charabuff') {
            if (!window.CharabuffRegistry || typeof window.CharabuffRegistry.getBattleItems !== 'function') return [];
            return window.CharabuffRegistry.getBattleItems().map((item) => ({
                ownerSlot: null,
                source: 'charabuff',
                skillId: item.skill.id,
                skill: item.skill
            }));
        }
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
        if (!state.enemyActionsByTurn[turn]) state.enemyActionsByTurn[turn] = [];
        if (!state.actorSettingsByTurn[turn]) state.actorSettingsByTurn[turn] = {};
        return state.actionsByTurn[turn];
    }

    function getSkillCooldown(skill) {
        const value = Number(skill && (skill.cooldown != null ? skill.cooldown : skill.cd));
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    }

    function getSkillActionKey(ownerSlot, skillId) {
        return `${ownerSlot == null ? 'system' : ownerSlot}|${String(skillId || '')}`;
    }

    function getSkillCooldownAtTurn(ownerSlot, skillId, skill, turn) {
        const cooldown = getSkillCooldown(skill);
        if (cooldown <= 0) {
            return { cooldown: 0, remaining: 0, availableTurn: turn, futureConflictTurn: null };
        }
        let availableTurn = 1;
        for (let usedTurn = 1; usedTurn < turn; usedTurn++) {
            const used = ensureTurn(usedTurn).some((action) => (
                action && action.ownerSlot === ownerSlot && action.skillId === skillId
            ));
            if (used) availableTurn = Math.max(availableTurn, usedTurn + cooldown);
        }
        let futureConflictTurn = null;
        for (let usedTurn = turn + 1; usedTurn <= state.turnCount; usedTurn++) {
            const used = ensureTurn(usedTurn).some((action) => (
                action && action.ownerSlot === ownerSlot && action.skillId === skillId
            ));
            if (used && usedTurn < turn + cooldown) {
                futureConflictTurn = usedTurn;
                break;
            }
        }
        return {
            cooldown,
            remaining: Math.max(0, availableTurn - turn),
            availableTurn,
            futureConflictTurn
        };
    }

    function invalidateResultsFromTurn(turn) {
        Object.keys(state.resultsByTurn).forEach((key) => {
            if (Number(key) >= Number(turn)) delete state.resultsByTurn[key];
        });
        if (state.lastResult && state.lastResult.turn >= Number(turn)) state.lastResult = null;
    }

    function hasReplayableTimeline() {
        return Object.keys(state.resultsByTurn).length > 0
            || Object.keys(state.actionsByTurn).some((turn) => ensureTurn(Number(turn)).length > 0);
    }

    function createDefaultActorSettings() {
        return {
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
    }

    function getPreviousActorSettings(turn, slot) {
        for (let previousTurn = turn - 1; previousTurn >= 1; previousTurn--) {
            const turnSettings = state.actorSettingsByTurn[previousTurn];
            if (turnSettings && turnSettings[slot]) return cloneJson(turnSettings[slot]);
        }
        return null;
    }

    function ensureActorSettings(slot, turn) {
        const targetTurn = Math.max(1, Math.floor(Number(turn) || state.activeTurn || 1));
        ensureTurn(targetTurn);
        const defaults = createDefaultActorSettings();
        const turnSettings = state.actorSettingsByTurn[targetTurn];
        const settings = turnSettings[slot] || getPreviousActorSettings(targetTurn, slot) || createDefaultActorSettings();
        Object.keys(defaults).forEach((key) => {
            if (settings[key] == null) settings[key] = defaults[key];
        });
        turnSettings[slot] = settings;
        return settings;
    }

    function syncActorSettingsFromDom() {
        const globalHpInput = document.getElementById('current-hp-slider');
        const globalHpPercent = globalHpInput && Number.isFinite(Number(globalHpInput.value))
            ? Math.max(0, Math.min(100, Number(globalHpInput.value)))
            : null;
        FRONTLINE_SLOTS.concat(SUB_SLOTS).forEach((slot) => {
            const settings = ensureActorSettings(slot, state.activeTurn);
            const chargeInput = document.getElementById(`burst-charge-${slot}`);
            const caInput = document.getElementById(`burst-ca-${slot}`);
            const chainSelect = document.getElementById(`burst-chain-${slot}`);
            const calcOverride = document.getElementById(`burst-calc-override-${slot}`);
            const calcRandom = document.getElementById(`burst-calc-random-${slot}`);
            const calcCrit = document.getElementById(`burst-calc-crit-${slot}`);
            const calcAdvantage = document.getElementById(`burst-calc-advantage-${slot}`);
            const calcWorldCap = document.getElementById(`burst-calc-world-cap-${slot}`);

            if (globalHpPercent != null) settings.hpPercent = globalHpPercent;

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

    function getActorCalculationContext(slot, battleState) {
        const calculation = getBattleCalculationSettings(battleState);
        const settings = ensureActorSettings(slot, battleState && battleState.turn);
        const useOverride = !(battleState && battleState.manualTimeline)
            && state.settingsMode === 'advanced'
            && settings.calcOverride;
        const randomMode = useOverride ? settings.randomMode : calculation.randomMode;
        const critMode = useOverride ? settings.critMode : calculation.critMode;
        const advantageMode = useOverride ? settings.advantageMode : 'auto';
        const worldCapMode = useOverride ? settings.worldCapMode : calculation.worldCapMode;
        const isAdvantage = isActorAdvantaged(slot, advantageMode, calculation);
        const snapshot = getSimulationSnapshot(battleState);
        const snapshotActor = snapshot && snapshot.actors
            ? snapshot.actors[slot]
            : null;
        const runtimeEntries = getBattleStatusZoneEntries(slot, battleState);
        const actorEffectTotals = runtimeEntries.length === 0 && snapshotActor && snapshotActor.isAdvantage === isAdvantage
            ? snapshotActor.effectTotals
            : buildSimulationEffectTotals(slot, isAdvantage, runtimeEntries);
        const effectTotals = mergeEnemyDamageEffectTotals(actorEffectTotals, battleState);

        return {
            defense: calculation.defense,
            defenseDown: getEnemyDefenseDownPercent(battleState),
            randomMode,
            randomFactor: getSimulationRandomFactor(randomMode),
            critMode,
            isAdvantage,
            forceAdvantage: advantageMode === 'advantage',
            forceNeutral: advantageMode === 'neutral',
            actorElement: getPartyElement(slot),
            damageElement: getPartyElement(slot),
            enemyElement: calculation.enemyElement,
            mainElement: getPartyElement(0),
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
                    <h3 class="burst-axis-title">回合模拟器（自动）</h3>
                    <div class="burst-axis-subtitle">自动处理攻击、Buff 持续时间、职业开局效果、技能 CD 与触发结算。</div>
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
                            <option value="无属性">无属性</option>
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
                    <button type="button" class="burst-action-btn" data-burst-clear>清空当前回合</button>
                    <button type="button" class="burst-attack-btn" data-burst-attack>攻击 / 结算本回合</button>
                </div>
            </div>

            <div class="burst-turn-navigator" aria-label="回合选择">
                <button type="button" class="burst-turn-nav-btn" data-burst-prev-turn aria-label="上一回合" title="上一回合">←</button>
                <div id="burst-turn-column" class="burst-turn-column"></div>
                <button type="button" class="burst-turn-nav-btn" data-burst-next-turn aria-label="下一回合" title="下一回合">→</button>
            </div>

            <div class="burst-battle-stage">
                <section class="burst-turn-board">
                    <div class="burst-battle-log-column">
                        <div class="burst-section-title">本回合操作队列</div>
                        <div id="burst-action-queue" class="burst-action-queue"></div>
                        <div class="burst-section-title burst-result-title">对战信息</div>
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
                    <button type="button" class="burst-skill-tab" data-skill-tab="charabuff">Buff图鉴</button>
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
        board.querySelector('[data-burst-attack]').addEventListener('click', settleCurrentTurn);
        board.querySelector('[data-burst-prev-turn]').addEventListener('click', () => setActiveTurn(state.activeTurn - 1));
        board.querySelector('[data-burst-next-turn]').addEventListener('click', () => setActiveTurn(state.activeTurn + 1));
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
        renderTurnColumn();
        renderTurnActionQueue();
        renderPartyColumn();
        renderSkillBox();
        renderDamageSummary(state.lastResult);
        const clearButton = document.querySelector('[data-burst-clear]');
        if (clearButton) clearButton.textContent = `清空 ${state.activeTurn}T`;
        const attackButton = document.querySelector('[data-burst-attack]');
        if (attackButton) {
            attackButton.textContent = state.activeTurn < state.maxTurnCount
                ? `攻击 / 结算 ${state.activeTurn}T → ${state.activeTurn + 1}T`
                : `攻击 / 结算 ${state.activeTurn}T`;
        }
    }

    function setActiveTurn(turn) {
        const nextTurn = Math.max(1, Math.min(state.turnCount, Number(turn) || 1));
        syncActorSettingsFromDom();
        state.activeTurn = nextTurn;
        ensureTurn(nextTurn);
        state.lastResult = state.resultsByTurn[nextTurn] || null;
        if (!state.lastResult && nextTurn > 1 && Object.keys(state.resultsByTurn).length > 0) {
            runSimulation({ syncDom: false });
        }
        refresh();
    }

    function renderTurnColumn() {
        const container = document.getElementById('burst-turn-column');
        if (!container) return;
        let html = '';
        for (let turn = 1; turn <= state.turnCount; turn++) {
            const active = turn === state.activeTurn ? ' active' : '';
            const hasActions = ensureTurn(turn).length > 0;
            const resolved = !!state.resultsByTurn[turn];
            const stateClass = `${hasActions ? ' has-actions' : ''}${resolved ? ' resolved' : ' draft'}`;
            const stateLabel = resolved ? '已计算' : hasActions ? '待计算' : '未设置';
            html += `<button type="button" class="burst-turn-cell${active}${stateClass}" data-turn="${turn}" title="${turn}T：${stateLabel}">${turn}T</button>`;
        }
        container.innerHTML = html;
        container.querySelectorAll('[data-turn]').forEach((btn) => {
            btn.addEventListener('click', () => {
                setActiveTurn(parseInt(btn.getAttribute('data-turn'), 10) || 1);
            });
        });
        const prev = document.querySelector('[data-burst-prev-turn]');
        const next = document.querySelector('[data-burst-next-turn]');
        if (prev) prev.disabled = state.activeTurn <= 1;
        if (next) next.disabled = state.activeTurn >= state.turnCount;
    }

    function renderTurnActionQueue() {
        const container = document.getElementById('burst-action-queue');
        if (!container) return;
        const actions = ensureTurn(state.activeTurn);
        if (actions.length === 0) {
            container.innerHTML = '<div class="burst-action-queue-empty">尚未安排技能；攻击会在技能队列之后自动结算。</div>';
            return;
        }
        container.innerHTML = actions.map((action, index) => {
            const skill = action.skill || getSkillById(action.skillId) || {};
            const icon = getSkillIconSrc(skill) || buildImageSrc(skill.image);
            const owner = getActionOwnerLabel(action, skill);
            const iconHtml = icon
                ? `<img src="${escapeHtml(icon)}" alt="">`
                : `<span>${escapeHtml((skill.name || '?').slice(0, 2))}</span>`;
            return `
                <div class="burst-action-queue-item" data-queue-action="${escapeHtml(action.id)}">
                    <span class="burst-action-queue-order">${index + 1}</span>
                    <span class="burst-action-queue-icon">${iconHtml}</span>
                    <span class="burst-action-queue-label">
                        <strong>${escapeHtml(skill.name || action.skillId)}</strong>
                        <small>${escapeHtml(owner)}</small>
                    </span>
                    <span class="burst-action-queue-controls">
                        <button type="button" data-move-action="${escapeHtml(action.id)}" data-move-delta="-1" ${index === 0 ? 'disabled' : ''} title="提前">↑</button>
                        <button type="button" data-move-action="${escapeHtml(action.id)}" data-move-delta="1" ${index === actions.length - 1 ? 'disabled' : ''} title="延后">↓</button>
                        <button type="button" data-remove-queue-action="${escapeHtml(action.id)}" title="移除">×</button>
                    </span>
                </div>
            `;
        }).join('');
        container.querySelectorAll('[data-move-action]').forEach((button) => {
            button.addEventListener('click', () => {
                moveAction(button.getAttribute('data-move-action'), Number(button.getAttribute('data-move-delta')) || 0);
            });
        });
        container.querySelectorAll('[data-remove-queue-action]').forEach((button) => {
            button.addEventListener('click', () => removeAction(button.getAttribute('data-remove-queue-action')));
        });
    }

    function renderPartyColumn() {
        const container = document.getElementById('burst-party-column');
        if (!container) return;
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
                const shouldReplay = hasReplayableTimeline();
                if (control.matches('.burst-charge-input')) {
                    const slot = Number(control.getAttribute('data-actor-slot'));
                    const fill = container.querySelector(`[data-charge-fill="${slot}"]`);
                    if (fill) fill.style.width = `${Math.min(100, ensureActorSettings(slot, state.activeTurn).charge)}%`;
                }
                if (control.hasAttribute('data-calc-override')) renderPartyColumn();
                invalidateResultsFromTurn(state.activeTurn);
                if (shouldReplay) {
                    runSimulation({ syncDom: false });
                    renderTurnColumn();
                }
            });
        });
    }

    function renderActorCalculationPanel() {
        const slot = state.selectedActorSlot;
        const settings = ensureActorSettings(slot, state.activeTurn);
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
        const actorSettings = ensureActorSettings(slot, state.activeTurn);
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
        const owner = item.source === 'summon'
            ? (skill.typeLabel || '召唤石')
            : item.ownerSlot == null ? (skill.typeLabel || item.source) : getPartyName(item.ownerSlot);
        const isToggleSource = item.source === 'owned' || item.source === 'charabuff' || item.source === 'summon';
        const actionIndex = isToggleSource
            ? ensureTurn(state.activeTurn).findIndex(action => (
                action.ownerSlot === item.ownerSlot
                && action.skillId === item.skillId
                && (item.source !== 'charabuff' || action.source === 'charabuff')
            ))
            : -1;
        const queued = actionIndex >= 0;
        const cooldownState = item.source === 'owned' || item.source === 'summon'
            ? getSkillCooldownAtTurn(item.ownerSlot, item.skillId, skill, state.activeTurn)
            : { remaining: 0, futureConflictTurn: null };
        const coolingDown = !queued && cooldownState.remaining > 0;
        const reservedInFuture = !queued && !coolingDown && cooldownState.futureConflictTurn != null;
        const unavailable = coolingDown || reservedInFuture;
        const unavailableTitle = coolingDown
            ? `；冷却中，${cooldownState.remaining}回合后可用`
            : reservedInFuture
                ? `；已安排于${cooldownState.futureConflictTurn}T，当前使用会与后续计划冲突`
                : '';
        return `
            <button type="button" class="burst-skill-card${queued ? ' queued' : ''}${coolingDown ? ' cooling-down' : ''}${reservedInFuture ? ' timeline-conflict' : ''}" data-add-skill="${escapeHtml(item.skillId)}" data-source="${escapeHtml(item.source)}" data-owner-slot="${item.ownerSlot == null ? '' : item.ownerSlot}" aria-pressed="${queued}" ${unavailable ? 'disabled aria-disabled="true"' : ''} title="${escapeHtml(getSkillTitle(skill))}${unavailableTitle}">
                <div class="burst-skill-icon">${iconHtml}</div>
                <div class="burst-skill-meta">
                    <div class="burst-skill-name">${escapeHtml(skill.name || item.skillId)}</div>
                    <div class="burst-skill-owner">${escapeHtml(owner)}</div>
                </div>
                ${queued ? `<span class="burst-library-order">顺序 ${actionIndex + 1}</span>` : ''}
                ${coolingDown ? `<span class="burst-library-cooldown">CD ${cooldownState.remaining}</span>` : ''}
                ${reservedInFuture ? `<span class="burst-library-cooldown">已排 ${cooldownState.futureConflictTurn}T</span>` : ''}
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
        if (!skill && source === 'summon') {
            const summonEntry = getSummonSkills().find((item) => item.skillId === skillId);
            if (summonEntry) {
                skill = summonEntry.skill;
                ownerSlot = summonEntry.ownerSlot;
            }
        }
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
        if (source === 'owned' || source === 'charabuff' || source === 'summon') {
            const existingIndex = turnActions.findIndex(action => (
                action.ownerSlot === ownerSlot
                && action.skillId === skillId
                && (source !== 'charabuff' || action.source === 'charabuff')
            ));
            if (existingIndex >= 0) {
                turnActions.splice(existingIndex, 1);
                invalidateResultsFromTurn(state.activeTurn);
                runSimulation();
                renderTurnColumn();
                renderTurnActionQueue();
                renderPartyColumn();
                renderSkillBox();
                return;
            }
            if (source === 'owned' || source === 'summon') {
                const cooldownState = getSkillCooldownAtTurn(ownerSlot, skillId, skill, state.activeTurn);
                if (cooldownState.remaining > 0 || cooldownState.futureConflictTurn != null) return;
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
        invalidateResultsFromTurn(state.activeTurn);
        runSimulation();
        renderTurnColumn();
        renderTurnActionQueue();
        renderPartyColumn();
        renderSkillBox();
    }

    function moveAction(actionId, delta) {
        const list = ensureTurn(state.activeTurn);
        const index = list.findIndex((action) => action.id === actionId);
        const nextIndex = index + Math.sign(Number(delta) || 0);
        if (index < 0 || nextIndex < 0 || nextIndex >= list.length || nextIndex === index) return;
        const moved = list.splice(index, 1)[0];
        list.splice(nextIndex, 0, moved);
        invalidateResultsFromTurn(state.activeTurn);
        runSimulation();
        renderTurnColumn();
        renderTurnActionQueue();
        renderPartyColumn();
        renderSkillBox();
    }

    function removeAction(actionId) {
        const list = ensureTurn(state.activeTurn);
        const idx = list.findIndex(action => action.id === actionId);
        if (idx >= 0) list.splice(idx, 1);
        invalidateResultsFromTurn(state.activeTurn);
        runSimulation();
        renderTurnColumn();
        renderTurnActionQueue();
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
        const shouldReplay = hasReplayableTimeline();
        state.actionsByTurn[state.activeTurn] = [];
        state.enemyActionsByTurn[state.activeTurn] = [];
        invalidateResultsFromTurn(state.activeTurn);
        state.lastResult = null;
        state.simulationBaseSnapshot = null;
        if (shouldReplay) runSimulation({ syncDom: false });
        renderTurnColumn();
        renderTurnActionQueue();
        renderPartyColumn();
        renderSkillBox();
        renderDamageSummary(state.lastResult);
    }

    function buildSimulationBaseStats(slot) {
        const out = {};
        if (typeof STAT_CONFIG !== 'undefined') {
            STAT_CONFIG.forEach((cfg) => {
                const sourceScope = cfg && SIMULATION_STAT_CATEGORY_SCOPE[cfg.category];
                const includeInBase = sourceScope === 'build';
                out[cfg.key] = includeInBase && typeof party !== 'undefined' && party[slot] && party[slot].stats
                    ? (party[slot].stats[cfg.key] || 0)
                    : 0;
            });
        }
        out._charabuffZoneEffectTotals = {};
        const partyStats = typeof party !== 'undefined' && party[slot] && party[slot].stats
            ? party[slot].stats
            : null;
        out._elementAtkEntries = partyStats && Array.isArray(partyStats._elementAtkEntries)
            ? partyStats._elementAtkEntries
                .filter((entry) => {
                    if (!entry) return false;
                    const sourceId = String(entry.sourceId || '');
                    return entry.zone !== 'chara_skill' && sourceId.indexOf('status:') !== 0;
                })
                .map((entry) => Object.assign({}, entry))
            : [];
        if (typeof overlayCharaEarringElementAtkFromParty === 'function') overlayCharaEarringElementAtkFromParty(out, slot);
        if (typeof overlayCharaLbElementAtkFromParty === 'function') overlayCharaLbElementAtkFromParty(out, slot);
        if (typeof overlayCharaCapsFromParty === 'function') overlayCharaCapsFromParty(out, slot);
        return out;
    }

    function buildSimulationEffectTotals(slot, isAdvantage, additionalZoneEntries) {
        return typeof buildAllEffectsForSlot === 'function'
            ? buildAllEffectsForSlot(slot, {
                isAdvantage,
                ignoreTestBuffSettings: true,
                includeScenarioBuffs: false,
                additionalZoneEntries: Array.isArray(additionalZoneEntries) ? additionalZoneEntries : [],
                persist: false
            }).totals
            : null;
    }

    function createSimulationBaseSnapshot(calculationSettings, options) {
        const calculation = normalizeCalculationSettings(calculationSettings, state.calculation);
        const allowActorOverrides = !(options && options.manualTimeline);
        const actors = {};
        FRONTLINE_SLOTS.concat(SUB_SLOTS).forEach((slot) => {
            const settings = ensureActorSettings(slot, 1);
            const useOverride = allowActorOverrides && state.settingsMode === 'advanced' && settings.calcOverride;
            const advantageMode = useOverride ? settings.advantageMode : 'auto';
            const isAdvantage = isActorAdvantaged(slot, advantageMode, calculation);
            actors[slot] = {
                slot,
                panelAttack: parseDisplayNumber(`char-panel-atk-${slot}`),
                stats: buildSimulationBaseStats(slot),
                effectTotals: buildSimulationEffectTotals(slot, isAdvantage),
                isAdvantage
            };
        });
        return {
            createdAt: Date.now(),
            sourcePolicy: {
                included: ['build'],
                excluded: ['scenario', 'debug'],
                runtime: ['battle_initial', 'battle_runtime'],
                statCategoryScope: Object.assign({}, SIMULATION_STAT_CATEGORY_SCOPE)
            },
            actors
        };
    }

    function cloneJson(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function createBattleState(turn) {
        const actors = {};
        FRONTLINE_SLOTS.concat(SUB_SLOTS).forEach((slot) => {
            const settings = ensureActorSettings(slot, turn);
            actors[slot] = {
                slot,
                hpPercent: settings.hpPercent,
                charge: settings.charge,
                statuses: [],
                attackActionIndex: 0
            };
        });
        return {
            turn,
            phase: 'battle_start',
            enemy: {
                statuses: []
            },
            actors,
            cooldowns: {},
            counters: {},
            flags: {},
            statusTriggerSourceIds: []
        };
    }

    function getBattleActor(slot, battleState) {
        return battleState && battleState.actors ? battleState.actors[slot] : null;
    }

    function getBattleStatuses(slot, battleState) {
        const actor = getBattleActor(slot, battleState);
        return actor && Array.isArray(actor.statuses) ? actor.statuses : [];
    }

    function getEnemyStatuses(battleState) {
        return battleState && battleState.enemy && Array.isArray(battleState.enemy.statuses)
            ? battleState.enemy.statuses
            : [];
    }

    function getEnemyDefenseDownPercent(battleState) {
        const effects = [];
        getEnemyStatuses(battleState).forEach((status) => {
            (Array.isArray(status && status.effects) ? status.effects : []).forEach((effect, index) => {
                if (!effect) return;
                const formula = effect.formula && typeof effect.formula === 'object'
                    ? effect.formula
                    : effect.prop && effect.zone ? effect : null;
                if (effect.effect_type !== 'enemy_defense_down' && (!formula || formula.prop !== 'def_down')) return;
                effects.push({
                    definition: {
                        effect_type: 'enemy_defense_down',
                        prop: 'def_down',
                        zone: formula && formula.zone || effect.zone,
                        value: formula && formula.value != null ? formula.value : effect.value
                    },
                    sourceId: `${status.status_id || 'enemy_status'}:${index}`
                });
            });
        });
        if (window.CharabuffRegistry && typeof window.CharabuffRegistry.resolveEnemyDefenseDownEffects === 'function') {
            return window.CharabuffRegistry.resolveEnemyDefenseDownEffects(effects).total * 100;
        }
        let normal = 0;
        let independent = 0;
        effects.forEach((item) => {
            const value = Math.max(0, Number(item.definition.value) || 0);
            if (item.definition.zone === 'independent') independent += value;
            else normal += value;
        });
        return Math.min(0.99, Math.min(0.5, normal) + independent) * 100;
    }

    function getBattleStatusZoneEntries(slot, battleState) {
        if (!window.StatusResolver || typeof window.StatusResolver.collectZoneEntriesFromStatuses !== 'function') return [];
        const actor = getBattleActor(slot, battleState);
        return window.StatusResolver.collectZoneEntriesFromStatuses(getBattleStatuses(slot, battleState), {
            actor,
            owner: actor,
            state: battleState,
            hpPercent: actor ? actor.hpPercent : null
        });
    }

    function getEnemyStatusZoneEntries(battleState) {
        if (!window.StatusResolver || typeof window.StatusResolver.collectZoneEntriesFromStatuses !== 'function') return [];
        const enemy = battleState && battleState.enemy ? battleState.enemy : null;
        return window.StatusResolver.collectZoneEntriesFromStatuses(getEnemyStatuses(battleState), {
            actor: enemy,
            owner: enemy,
            state: battleState,
            hpPercent: enemy && enemy.hpPercent != null ? enemy.hpPercent : null
        });
    }

    function mergeEnemyDamageEffectTotals(actorTotals, battleState) {
        const totals = Object.assign({}, actorTotals || {});
        const enemyTotals = calculateRuntimeZoneTotals(getEnemyStatusZoneEntries(battleState));
        const takenAmp = Number(enemyTotals.taken_dmg_amp) || 0;
        const takenSupp = Number(enemyTotals.taken_dmg_supp) || 0;
        if (takenAmp !== 0) totals.taken_dmg_amp = (Number(totals.taken_dmg_amp) || 0) + takenAmp;
        if (takenSupp !== 0) {
            totals.taken_dmg_supp = takenSupp;
            ['na_dmg_supp', 'skill_dmg_supp', 'ca_dmg_supp', 'counter_dmg_supp', 'cb_dmg_supp'].forEach((key) => {
                totals[key] = (Number(totals[key]) || 0) + takenSupp;
            });
        }
        return totals;
    }

    function syncResultBuffsFromBattleState(result, battleState) {
        FRONTLINE_SLOTS.concat(SUB_SLOTS).forEach((slot) => {
            const actor = getBattleActor(slot, battleState);
            result.buffsByCharacter[slot] = actor && Array.isArray(actor.statuses)
                ? actor.statuses.filter((status) => (
                    !window.StatusResolver
                    || typeof window.StatusResolver.isStatusDisplayActive !== 'function'
                    || window.StatusResolver.isStatusDisplayActive(status, {
                        actor,
                        owner: actor,
                        state: battleState,
                        hpPercent: actor.hpPercent
                    })
                )).map(cloneJson)
                : [];
        });
    }

    function advanceBattleStateAtTurnEnd(battleState) {
        const tickStatuses = (statuses) => (Array.isArray(statuses) ? statuses : []).filter((status) => {
                if (!status || status.remaining_turns == null) return true;
                const tick = status.duration && status.duration.tick ? status.duration.tick : 'turn_end';
                if (tick !== 'turn_end') return true;
                status.remaining_turns = Math.max(0, Number(status.remaining_turns) - 1);
                return status.remaining_turns > 0;
        });
        FRONTLINE_SLOTS.concat(SUB_SLOTS).forEach((slot) => {
            const actor = getBattleActor(slot, battleState);
            if (!actor) return;
            actor.statuses = tickStatuses(actor.statuses);
        });
        if (battleState.enemy) battleState.enemy.statuses = tickStatuses(battleState.enemy.statuses);
        battleState.phase = 'turn_end';
    }

    function calculateRuntimeZoneTotals(entries) {
        if (typeof BuffRegistry !== 'function' || !Array.isArray(entries) || entries.length === 0) return {};
        const registry = new BuffRegistry();
        const buffTypes = new Set();
        entries.forEach((entry, idx) => {
            if (!entry || !entry.prop || !entry.zone) return;
            const value = Number(entry.value);
            if (!Number.isFinite(value) || value === 0) return;
            registry.addByProp(entry.prop, entry.zone, entry.sourceId || `runtime_status_${idx}`, value);
            const parsed = typeof parseBuffProp === 'function' ? parseBuffProp(entry.prop) : null;
            buffTypes.add(parsed && parsed.buffType ? parsed.buffType : entry.prop);
        });
        const totals = {};
        buffTypes.forEach((buffType) => {
            const total = registry.getTotal(buffType);
            if (Number.isFinite(total) && total !== 0) totals[buffType] = total;
        });
        return totals;
    }

    function getActorStats(slot, battleState) {
        const snapshot = getSimulationSnapshot(battleState);
        const snapshotActor = snapshot && snapshot.actors
            ? snapshot.actors[slot]
            : null;
        const stats = snapshotActor
            ? Object.assign({}, snapshotActor.stats, {
                _charabuffZoneEffectTotals: Object.assign({}, snapshotActor.stats._charabuffZoneEffectTotals || {}),
                _elementAtkEntries: Array.isArray(snapshotActor.stats._elementAtkEntries)
                    ? snapshotActor.stats._elementAtkEntries.map((entry) => Object.assign({}, entry))
                    : []
            })
            : buildSimulationBaseStats(slot);
        const runtimeEntries = getBattleStatusZoneEntries(slot, battleState);
        stats._charabuffZoneEffectTotals = calculateRuntimeZoneTotals(runtimeEntries);
        runtimeEntries.forEach((entry, index) => {
            if (!entry || !entry.prop || typeof parseBuffProp !== 'function' || typeof addElementAtkEntry !== 'function') return;
            const parsed = parseBuffProp(entry.prop);
            if (!parsed || parsed.buffType !== 'element_atk') return;
            addElementAtkEntry(stats, {
                sourceId: `status:runtime:${entry.sourceId || index}`,
                scope: parsed.subtype || 'own_element',
                zone: entry.zone || 'chara_skill',
                value: Number(entry.value) || 0
            });
        });
        return stats;
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

    function getActorPanelAttack(slot, battleState) {
        const snapshot = getSimulationSnapshot(battleState);
        const snapshotActor = snapshot && snapshot.actors
            ? snapshot.actors[slot]
            : null;
        return snapshotActor ? snapshotActor.panelAttack : parseDisplayNumber(`char-panel-atk-${slot}`);
    }

    function isClass5MainCharacter(slot) {
        if (slot !== 0 || typeof allClasses === 'undefined' || typeof currentMC === 'undefined') return false;
        const job = allClasses.find(item => item.id === currentMC.jobId);
        return !!(job && job.type === 'class_5');
    }

    function calculateNormalAttackDamage(slot, battleState, options) {
        const calculationOptions = options || {};
        if (typeof calculateDamage !== 'function' || typeof sumNaFinalWithRanshu !== 'function') return 0;
        const panelAtk = getActorPanelAttack(slot, battleState);
        if (panelAtk <= 0) return 0;

        const stats = getActorStats(slot, battleState);
        const settings = ensureActorSettings(slot, battleState && battleState.turn);
        const hpPercent = settings.hpPercent;
        const context = getActorCalculationContext(slot, battleState);
        const bonuses = getActorFormulaBonuses(slot, hpPercent);
        const raw = calculateDamage(panelAtk, stats, hpPercent, Object.assign({
            isAdvantage: context.isAdvantage,
            forceAdvantage: context.forceAdvantage,
            forceNeutral: context.forceNeutral,
            actorElement: context.actorElement,
            damageElement: context.damageElement,
            enemyElement: context.enemyElement,
            mainElement: context.mainElement,
            defense: context.defense,
            defenseDown: context.defenseDown,
            randomFactor: context.randomFactor,
            charIndex: slot,
            ignoreBaseValueAdjustment: true,
            ignoreTestBuffSettings: true
        }, bonuses));

        const critSources = typeof window.getIndependentCritSources === 'function'
            ? window.getIndependentCritSources(slot, stats, { ignoreTestBuffSettings: true })
            : [];
        const potentialCritMultiplier = typeof window.getCritMultiplierByMode === 'function'
            ? window.getCritMultiplierByMode(context.critMode, critSources)
            : 1;
        const potentialCritAmpRate = typeof window.getCritAmpRateByMode === 'function'
            ? window.getCritAmpRateByMode(context.critMode, critSources)
            : 0;
        const damageElementContext = typeof resolveDamageElementContext === 'function'
            ? resolveDamageElementContext({
                actorElement: context.actorElement,
                damageElement: context.damageElement,
                enemyElement: context.enemyElement,
                mainElement: context.mainElement,
                forceAdvantage: context.forceAdvantage,
                forceNeutral: context.forceNeutral
            })
            : { critEligible: context.isAdvantage };
        const bodyCritEligible = typeof isCritEligibleForDamage === 'function'
            ? isCritEligibleForDamage(damageElementContext)
            : true;
        const critMultiplier = bodyCritEligible ? potentialCritMultiplier : 1;
        const critAmpRate = bodyCritEligible ? potentialCritAmpRate : 0;
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
        const ranshuHits = typeof resolveNaRanshuHits === 'function'
            ? resolveNaRanshuHits(stats, context.effectTotals)
            : Math.max(1, Math.floor(Number(stats.weapon_na_ranshu) || 1));
        const body = sumNaFinalWithRanshu(rawCritPostDef, stats, teshuStats, critOnlyAmp, capOptions, totalSupp, ranshuHits);

        let chasePerSegment = 0;
        let chaseEffects = [];
        let destructionChase = null;
        if (window.BonusDmgCalc && typeof window.BonusDmgCalc.calcNaBonusDamage === 'function') {
            const bonus = window.BonusDmgCalc.calcNaBonusDamage({
                panelAtk,
                stats,
                hpPercent,
                charIndex: slot,
                teshuStats,
                isAdv: context.isAdvantage,
                forceAdvantage: context.forceAdvantage,
                forceNeutral: context.forceNeutral,
                actorElement: context.actorElement,
                damageElement: context.damageElement,
                enemyElement: context.enemyElement,
                mainElement: context.mainElement,
                rawPostDefUsed: Number(raw.damage) || 0,
                extraAmpUsed: critOnlyAmp,
                defense: context.defense,
                defenseDown: context.defenseDown,
                randomFactor: context.randomFactor,
                fallbackElement: getPartyElement(slot),
                ranshuForUi: ranshuHits,
                totalSupp,
                ignoreBaseValueAdjustment: true,
                calcOptions: bonuses,
                totalCritMult: potentialCritMultiplier,
                critOnlyAmpPotential: (Number(stats.weapon_critical_hit_amp) || 0) * potentialCritAmpRate,
                extraAmpNormalBase: 0,
                extraAmpAdvantageBase: 0,
                extraAmpAdvantage: critOnlyAmp,
                extraAmpNormal: critOnlyAmp,
                capOptions,
                dynamicBuffEntries: getBattleStatusZoneEntries(slot, battleState)
            });
            chasePerSegment = (Number(bonus.chasePerHit) || 0) + (Number(bonus.chaseDesPerHit) || 0);
            chaseEffects = (Array.isArray(bonus.chaseEffects) ? bonus.chaseEffects : []).map((effect) => ({
                id: effect.key || `${effect.zone || 'bonus'}_${effect.prop || effect.element || 'na'}`,
                key: effect.key || '',
                prop: effect.prop || '',
                zone: effect.zone || '',
                element: effect.element || null,
                value: Number(effect.pct) || 0,
                multiplier: Number(effect.pct) || 0,
                hitCount: ranshuHits,
                damage: (Number(effect.perHit) || 0) * ranshuHits
            }));
            if ((Number(bonus.chaseDesPerHit) || 0) > 0) {
                destructionChase = {
                    id: 'bonus_na_destruction',
                    key: 'bonus_na_destruction',
                    prop: 'bonus_na_destruction',
                    zone: 'destruction',
                    element: 'destruction',
                    value: Number(bonus.chaseDesPct) || 0,
                    multiplier: Number(bonus.chaseDesPct) || 0,
                    hitCount: ranshuHits,
                    damage: (Number(bonus.chaseDesPerHit) || 0) * ranshuHits
                };
            }
        }

        const baseDamage = Number(body.sum) || 0;
        const bonusHits = destructionChase ? chaseEffects.concat([destructionChase]) : chaseEffects;
        if (calculationOptions.returnBreakdown) {
            return {
                baseDamage,
                bonusHits,
                ranshuHits,
                totalDamage: baseDamage + chasePerSegment * ranshuHits
            };
        }
        return baseDamage + chasePerSegment * ranshuHits;
    }

    function calculateCaAttackDamage(slot, overrides, battleState) {
        if (!window.CaDmgCalc || typeof window.CaDmgCalc.calculateCaDamage !== 'function') return 0;
        const panelAtk = getActorPanelAttack(slot, battleState);
        if (panelAtk <= 0) return 0;
        overrides = overrides || {};
        const stats = getActorStats(slot, battleState);
        const settings = ensureActorSettings(slot, battleState && battleState.turn);
        const context = getActorCalculationContext(slot, battleState);
        const bonuses = getActorFormulaBonuses(slot, settings.hpPercent);
        const result = window.CaDmgCalc.calculateCaDamage(panelAtk, stats, settings.hpPercent, Object.assign({
            defense: context.defense,
            defenseDown: context.defenseDown,
            charIndex: slot,
            isAdvantage: context.isAdvantage,
            forceAdvantage: context.forceAdvantage,
            forceNeutral: context.forceNeutral,
            actorElement: context.actorElement,
            damageElement: overrides.damageElement || context.damageElement,
            enemyElement: context.enemyElement,
            mainElement: context.mainElement,
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

    function calculateNormalRoundDamage(slot, battleState) {
        const settings = ensureActorSettings(slot, battleState && battleState.turn);
        const mode = settings.chain;
        const attacks = mode === 'ta' ? 3 : mode === 'da' ? 2 : 1;
        return calculateNormalAttackDamage(slot, battleState) * attacks;
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
        return appendSkillChaseCommand(window.StatusResolver.getSkillActions(skill, {
            skillId: action && action.skillId ? action.skillId : skill.id,
            skillName: skill.name || skill.id,
            ownerSlot: action ? action.ownerSlot : null
        }));
    }

    function appendSkillChaseCommand(commands) {
        const bonus = window.BonusDmgCalc;
        if (!bonus || !commands.some((command) => command.type === 'damage'
            && bonus.isElementalSkillDamage(command.damage))) return commands;
        return commands.concat({ type: 'skill_chase' });
    }

    function getBattleSkillChaseEffects(slot, battleState) {
        return window.BonusDmgCalc ? window.BonusDmgCalc.resolveSkillChaseEffects({
            stats: getActorStats(slot, battleState),
            actorElement: getPartyElement(slot),
            dynamicBuffEntries: getBattleStatusZoneEntries(slot, battleState)
        }) : [];
    }

    function accumulateSkillChase(command, slot, battleState, accumulator) {
        if (!window.BonusDmgCalc || !window.BonusDmgCalc.isElementalSkillDamage(command.damage)) return false;
        if (!accumulator.effects) accumulator.effects = getBattleSkillChaseEffects(slot, battleState);
        return true;
    }

    function recordSkillChase(accumulator, action, result, event) {
        const hits = window.BonusDmgCalc
            ? window.BonusDmgCalc.calcSkillChaseDamage(accumulator.baseDamage, accumulator.effects) : [];
        const damage = hits.reduce((sum, hit) => sum + hit.damage, 0);
        if (damage > 0) {
            addDamage(result, action.ownerSlot, 'skillDamage', damage);
            event.damage += damage;
            event.skillChaseHits = (event.skillChaseHits || []).concat(hits);
            event.skillChaseDamage = (event.skillChaseDamage || 0) + damage;
            event.hitCount = (event.hitCount || 0) + hits.length;
            if (result && Array.isArray(result.logs)) {
                hits.forEach((hit) => result.logs.push(`冴手：${getPartyName(action.ownerSlot)} 追加${ELEMENT_ALIASES[hit.element] || hit.element}属性技能伤害 ${formatNumber(hit.damage)}（${hit.pct * 100}%）。`));
            }
        }
        return hits;
    }

    // 自动模拟也逐 hit 推进次数状态；冴手在整个技能结束时另行追加。
    function calculateRuntimeDamageAction(command, slot, battleState, skipHitDurations) {
        const params = command.damage || {};
        if (slot == null || skipHitDurations || !window.ManualBattleResolution || !window.BonusDmgCalc
            || !window.BonusDmgCalc.isElementalSkillDamage(params)) {
            return { totalDamage: calculateResolvedDamageAction(command, slot, battleState), hitCount: Math.max(1, Number(params.hits) || 1) };
        }
        battleState.hitSequence = Number(battleState.hitSequence) || 0;
        return window.ManualBattleResolution.resolveSkillDamage(battleState, { actorSlot: slot, damage: params }, {
            deferSkillChase: true,
            getSkillChaseEffects: () => [],
            calculateHit: () => calculateResolvedDamageAction({
                damage: Object.assign({}, params, { hits: 1 })
            }, slot, battleState)
        });
    }

    function calculateResolvedDamageAction(resolvedAction, slot, battleState) {
        const params = resolvedAction && resolvedAction.damage ? resolvedAction.damage : {};
        if (params.damage_type === 'ca') {
            return calculateCaAttackDamage(slot, {
                caMultiplier: params.multiplier == null ? null : Number(params.multiplier),
                caFixed: params.fixed == null ? null : Number(params.fixed),
                damageElement: params.element || null
            }, battleState);
        }
        if (params.damage_type === 'normal_attack') {
            return calculateNormalRoundDamage(slot, battleState);
        }
        const hits = Math.max(1, Math.floor(Number(params.hits) || 1));
        const multiplier = Number(params.multiplier) || 0;
        if (slot == null || multiplier <= 0 || !window.SkillDmgCalc || typeof window.SkillDmgCalc.calculateSkillDamage !== 'function') {
            return 0;
        }

        const stats = getActorStats(slot, battleState);
        const settings = ensureActorSettings(slot, battleState && battleState.turn);
        const context = getActorCalculationContext(slot, battleState);
        const bonuses = getActorFormulaBonuses(slot, settings.hpPercent);
        const thresholdTableId = params.threshold_table || null;
        const exactTable = thresholdTableId && window.ThresholdRegistry && typeof window.ThresholdRegistry.getById === 'function'
            ? window.ThresholdRegistry.getById(thresholdTableId)
            : null;
        const useExactCap = !!exactTable;
        const oneHit = window.SkillDmgCalc.calculateSkillDamage(getActorPanelAttack(slot, battleState), stats, settings.hpPercent, Object.assign({
            skillBaseMult: multiplier,
            defense: context.defense,
            defenseDown: context.defenseDown,
            charIndex: slot,
            isAdvantage: context.isAdvantage,
            forceAdvantage: context.forceAdvantage,
            forceNeutral: context.forceNeutral,
            actorElement: context.actorElement,
            damageElement: params.element || context.damageElement,
            enemyElement: context.enemyElement,
            mainElement: context.mainElement,
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

    function prepareManualDamageCalculation(calculationSettings) {
        syncActorSettingsFromDom();
        let calculation;
        if (calculationSettings && typeof calculationSettings === 'object') {
            calculation = normalizeCalculationSettings(calculationSettings, state.calculation);
        } else {
            syncSimulationSettingsFromDom();
            calculation = normalizeCalculationSettings(state.calculation, state.calculation);
        }
        state.manualSimulationBaseSnapshot = createSimulationBaseSnapshot(calculation, { manualTimeline: true });
        return cloneJson(state.manualSimulationBaseSnapshot);
    }

    function adaptManualBattleState(manualState, calculationSettings) {
        const source = manualState || {};
        const turn = Math.max(1, Math.floor(Number(source.turn) || 1));
        const actors = {};
        FRONTLINE_SLOTS.concat(SUB_SLOTS).forEach((slot) => {
            const actor = source.actors && source.actors[slot] ? source.actors[slot] : {};
            const settings = ensureActorSettings(slot, turn);
            actors[slot] = Object.assign({}, actor, {
                slot,
                hpPercent: actor.hpPercent == null ? settings.hpPercent : actor.hpPercent,
                statuses: Array.isArray(actor.statuses) ? actor.statuses : []
            });
        });
        return Object.assign({}, source, {
            turn,
            manualTimeline: true,
            calculationSettings: normalizeCalculationSettings(calculationSettings, state.calculation),
            simulationBaseSnapshot: state.manualSimulationBaseSnapshot,
            actors,
            enemy: source.enemy && typeof source.enemy === 'object'
                ? Object.assign({ statuses: [] }, source.enemy)
                : { statuses: [] }
        });
    }

    function ensureManualDamageSnapshot(calculationSettings) {
        if (!state.manualSimulationBaseSnapshot) prepareManualDamageCalculation(calculationSettings);
    }

    function getManualNormalBreakdown(slot, manualState, calculationSettings) {
        ensureManualDamageSnapshot(calculationSettings);
        const battleState = adaptManualBattleState(manualState, calculationSettings);
        const breakdown = calculateNormalAttackDamage(slot, battleState, { returnBreakdown: true });
        return breakdown && typeof breakdown === 'object'
            ? breakdown
            : { baseDamage: 0, bonusHits: [], ranshuHits: 1, totalDamage: 0 };
    }

    function getManualBonusHitSources(manualState, slot, calculationSettings) {
        return getManualNormalBreakdown(slot, manualState, calculationSettings).bonusHits.map((source) => Object.assign({}, source));
    }

    function getManualSkillChaseEffects(manualState, slot, calculationSettings) {
        ensureManualDamageSnapshot(calculationSettings);
        return getBattleSkillChaseEffects(slot, adaptManualBattleState(manualState, calculationSettings));
    }

    function calculateManualHitDamage(hit, manualState, calculationSettings) {
        const definition = hit || {};
        const slot = Number(definition.actorSlot == null ? 0 : definition.actorSlot);
        ensureManualDamageSnapshot(calculationSettings);
        const battleState = adaptManualBattleState(manualState, calculationSettings);
        const damageType = String(definition.damageType || definition.damage_type || '').toLowerCase();

        if (damageType === 'normal_attack') {
            if (definition.kind === 'bonus') {
                const sourceDamage = Number(definition.bonusSource && definition.bonusSource.damage);
                const source = definition.bonusSource || {};
                const breakdown = calculateNormalAttackDamage(slot, battleState, { returnBreakdown: true });
                const sourceHitCount = Math.max(1, Math.floor(Number(source.hitCount)
                    || Number(breakdown && breakdown.ranshuHits) || 1));
                if (Number.isFinite(sourceDamage)) {
                    return { damage: Math.max(0, sourceDamage), hitCount: sourceHitCount };
                }
                const matched = breakdown && Array.isArray(breakdown.bonusHits)
                    ? breakdown.bonusHits.find((entry) => (
                        (source.id && entry.id === source.id)
                        || (source.key && entry.key === source.key)
                        || (source.zone && entry.zone === source.zone
                            && Math.abs((Number(entry.value) || 0) - (Number(source.value) || 0)) < 1e-10)
                    ))
                    : null;
                return {
                    damage: Math.max(0, Number(matched && matched.damage) || 0),
                    hitCount: Math.max(1, Math.floor(Number(matched && matched.hitCount) || sourceHitCount))
                };
            }
            const breakdown = getManualNormalBreakdown(slot, battleState, calculationSettings);
            return {
                damage: Math.max(0, Number(breakdown.baseDamage) || 0),
                hitCount: Math.max(1, Math.floor(Number(breakdown.ranshuHits) || 1))
            };
        }

        if (damageType === 'ca') {
            return calculateCaAttackDamage(slot, {
                caMultiplier: definition.multiplier == null ? null : Number(definition.multiplier),
                caFixed: definition.fixed == null ? null : Number(definition.fixed)
            }, battleState);
        }

        return calculateResolvedDamageAction({
            type: 'damage',
            damage: {
                damage_type: damageType || 'skill',
                element: definition.element || null,
                multiplier: Number(definition.multiplier) || 0,
                hits: 1,
                threshold_table: definition.thresholdTableId || definition.threshold_table || null,
                cap_per_hit: Number(definition.capPerHit != null ? definition.capPerHit : definition.cap_per_hit) || 0
            }
        }, slot, battleState);
    }

    function resolveStatusTargetSlots(target, ownerSlot, targetSlots) {
        if (target === 'ally_slots' && Array.isArray(targetSlots)) {
            return Array.from(new Set(targetSlots.map(Number).filter((slot) => (
                Number.isInteger(slot) && FRONTLINE_SLOTS.concat(SUB_SLOTS).includes(slot)
            ))));
        }
        if (target === 'self' || !target) return ownerSlot == null ? [] : [ownerSlot];
        if (target === 'ally_party') return FRONTLINE_SLOTS.slice();
        if (target === 'ally_all') return FRONTLINE_SLOTS.concat(SUB_SLOTS);
        return [];
    }

    function applyResolvedEnemyStatus(action, resolvedAction, result, event, battleState) {
        if (!battleState.enemy) battleState.enemy = { statuses: [] };
        if (!Array.isArray(battleState.enemy.statuses)) battleState.enemy.statuses = [];
        const status = cloneJson(resolvedAction.status);
        if (!status) return;
        status.status_id = status.status_id || `enemy_status_${action.skillId}_${event.statuses.length}`;
        status.source_skill_id = action.skillId;
        status.source_action_id = action.id;
        status.source_scope = action.source === 'battle_initial' ? 'battle_initial' : 'battle_runtime';
        status.owner_slot = action.ownerSlot;
        status.target_type = 'enemy';
        status.applied_turn = battleState.turn;
        status.remaining_turns = status.duration && status.duration.value != null
            && ['turn', 'turns'].includes(status.duration.type)
            ? Math.max(0, Number(status.duration.value) || 0)
            : null;

        const existingIndex = battleState.enemy.statuses.findIndex((item) => (
            item && item.status_id === status.status_id
        ));
        if (existingIndex >= 0) battleState.enemy.statuses[existingIndex] = status;
        else battleState.enemy.statuses.push(status);

        const skillName = action.skill && action.skill.name ? action.skill.name : action.skillId;
        const statusName = status.name || status.status_id || 'Debuff';
        event.statuses.push({
            statusId: status.status_id,
            name: statusName,
            targetSlot: null,
            targetType: 'enemy'
        });
        result.logs.push(`${skillName}：敌方获得 ${statusName}。`);
    }

    function applyResolvedStatus(action, resolvedAction, result, event, battleState, runtimeContext) {
        if (resolvedAction.target === 'enemy_single' || resolvedAction.target === 'enemy_all') {
            applyResolvedEnemyStatus(action, resolvedAction, result, event, battleState);
            return;
        }
        const targetSlots = resolveStatusTargetSlots(resolvedAction.target, action.ownerSlot, resolvedAction.target_slots);
        const skillName = action.skill && action.skill.name ? action.skill.name : action.skillId;
        if (targetSlots.length === 0) {
            result.logs.push(`${skillName}：暂不支持状态目标 ${resolvedAction.target || 'unknown'}。`);
            return;
        }

        targetSlots.forEach((targetSlot) => {
            const actor = getBattleActor(targetSlot, battleState);
            if (!actor) return;
            const status = cloneJson(resolvedAction.status);
            if (!status) return;
            status.status_id = status.status_id || `status_${action.skillId}_${event.statuses.length}`;
            status.source_skill_id = action.skillId;
            status.source_action_id = action.id;
            status.source_scope = action.source === 'battle_initial' ? 'battle_initial' : 'battle_runtime';
            status.owner_slot = action.ownerSlot;
            status.target_slot = targetSlot;
            status.applied_turn = battleState.turn;
            status.remaining_turns = status.duration && status.duration.value != null
                && ['turn', 'turns'].includes(status.duration.type)
                ? Math.max(0, Number(status.duration.value) || 0)
                : null;
            if (status.duration && status.duration.type === 'action') {
                const triggerEvent = runtimeContext && runtimeContext.triggerEvent;
                status.remaining_actions = Math.max(1, Number(status.duration.value) || 1);
                status.bound_action_id = triggerEvent && triggerEvent.actionId ? triggerEvent.actionId : null;
                status.bound_action_index = triggerEvent && triggerEvent.attackActionIndex != null
                    ? Number(triggerEvent.attackActionIndex)
                    : null;
                status.bound_action_actor_slot = triggerEvent && triggerEvent.actorSlot != null
                    ? Number(triggerEvent.actorSlot)
                    : action.ownerSlot;
            }

            const existingIndex = actor.statuses.findIndex((item) => item && item.status_id === status.status_id);
            if (existingIndex >= 0 && status.stacking && status.stacking.mode === 'add') {
                const existing = actor.statuses[existingIndex];
                const add = Math.max(0, Number(status.stacking.add) || 1);
                const max = Math.max(1, Number(status.stacking.max) || Number.MAX_SAFE_INTEGER);
                status.stacks = Math.min(max, Math.max(1, Number(existing.stacks) || 1) + add);
                if (status.stacking.refresh_duration === false) {
                    status.remaining_turns = existing.remaining_turns;
                    status.remaining_actions = existing.remaining_actions;
                    status.remaining_hits = existing.remaining_hits;
                }
                actor.statuses[existingIndex] = status;
            } else if (existingIndex >= 0) {
                actor.statuses[existingIndex] = status;
            } else {
                if (status.stacking) {
                    const max = Math.max(1, Number(status.stacking.max) || Number.MAX_SAFE_INTEGER);
                    status.stacks = Math.min(max, Math.max(1, Number(status.stacks) || 1));
                }
                actor.statuses.push(status);
            }

            const displayContext = {
                actor,
                owner: getBattleActor(action.ownerSlot, battleState),
                state: battleState,
                hpPercent: actor.hpPercent
            };
            const isDisplayActive = !window.StatusResolver
                || typeof window.StatusResolver.isStatusDisplayActive !== 'function'
                || window.StatusResolver.isStatusDisplayActive(status, displayContext);
            result.buffsByCharacter[targetSlot] = actor.statuses.filter((item) => (
                !window.StatusResolver
                || typeof window.StatusResolver.isStatusDisplayActive !== 'function'
                || window.StatusResolver.isStatusDisplayActive(item, displayContext)
            )).map(cloneJson);
            if (!isDisplayActive) return;
            const statusName = status.name || status.status_id || 'Buff';
            event.statuses.push({
                statusId: status.status_id,
                name: statusName,
                targetSlot,
                stacks: status.stacks
            });
            const stackText = status.stacks != null ? `（${status.stacks}层）` : '';
            result.logs.push(`${skillName}：${getPartyName(targetSlot)} 获得 ${statusName}${stackText}。`);
        });
    }

    function expireActionStatuses(eventType, payload, battleState, runtime) {
        let removed = 0;
        FRONTLINE_SLOTS.concat(SUB_SLOTS).forEach((slot) => {
            const actor = getBattleActor(slot, battleState);
            if (!actor || !Array.isArray(actor.statuses)) return;
            actor.statuses = actor.statuses.filter((status) => {
                if (!status || !status.duration || status.duration.type !== 'action') return true;
                const tick = status.duration.tick || 'attack_action_end';
                if (tick !== eventType) return true;
                if (status.bound_action_actor_slot != null
                    && Number(status.bound_action_actor_slot) !== Number(payload && payload.actorSlot)) return true;
                if (status.bound_action_id && payload && payload.actionId
                    && String(status.bound_action_id) !== String(payload.actionId)) return true;
                if (status.bound_action_index != null && payload && payload.attackActionIndex != null
                    && Number(status.bound_action_index) !== Number(payload.attackActionIndex)) return true;
                status.remaining_actions = Math.max(0, Number(status.remaining_actions || 1) - 1);
                if (status.remaining_actions > 0) return true;
                removed++;
                return false;
            });
        });
        if (removed > 0) syncRuntimeStatusTriggers(runtime, battleState);
        return removed;
    }

    function getRuntimeAction(context) {
        const frameSource = context && context.frame && context.frame.source;
        if (context && context.frame && context.frame.kind !== 'trigger' && frameSource && frameSource.source === 'scheduled') {
            return Object.assign({
                id: context.frame.id,
                type: context.frame.kind,
                skill: getSkillById(frameSource.skillId)
            }, frameSource);
        }
        const triggerSource = context && context.triggerSource;
        if (triggerSource) {
            const skillId = triggerSource.skillId || triggerSource.id;
            return {
                id: context.frame ? context.frame.id : `trigger_${skillId}`,
                type: 'trigger',
                source: 'battle_trigger',
                ownerSlot: triggerSource.ownerSlot,
                skillId,
                skill: triggerSource.status ? {
                    id: skillId,
                    name: triggerSource.status.name || skillId,
                    icon: triggerSource.status.icon || ''
                } : triggerSource.skill || getSkillById(skillId) || {
                    id: skillId,
                    name: triggerSource.status && triggerSource.status.name
                        ? triggerSource.status.name
                        : skillId
                }
            };
        }
        return context && context.action ? context.action : {
            id: context && context.frame ? context.frame.id : 'runtime_action',
            type: 'runtime',
            source: 'battle_runtime',
            ownerSlot: context && context.ownerSlot != null ? context.ownerSlot : null,
            skillId: context && context.skillId ? context.skillId : 'runtime_effect',
            skill: null
        };
    }

    function ensureRuntimeResultEvent(context, action) {
        if (context && context.resultEvent) return context.resultEvent;
        if (context && context.frame && context.frame.context && context.frame.context.resultEvent) {
            return context.frame.context.resultEvent;
        }
        const event = {
            type: action.type || 'trigger',
            actionId: action.id,
            skillId: action.skillId,
            skillName: action.skill && action.skill.name ? action.skill.name : action.skillId,
            ownerSlot: action.ownerSlot,
            damage: 0,
            statuses: [],
            triggered: action.source === 'battle_trigger'
        };
        if (context && context.result && Array.isArray(context.result.events)) {
            context.result.events.push(event);
            if (event.triggered && context.battleState && context.battleState.phase === 'attack'
                && Array.isArray(context.result.attackTimeline)) {
                context.result.attackTimeline.push({ kind: 'trigger', event });
            }
        }
        if (context && context.frame && context.frame.context) context.frame.context.resultEvent = event;
        return event;
    }

    function getRuntimeTargetSlots(command, ownerSlot) {
        return resolveStatusTargetSlots(
            command && command.target,
            ownerSlot,
            command && command.target_slots
        );
    }

    function statusMatchesCommand(status, command) {
        if (!status || !command) return false;
        const statusId = command.status_id || command.id;
        if (statusId && String(status.status_id) !== String(statusId)) return false;
        const requiredTag = command.tag;
        if (requiredTag) {
            const tags = Array.isArray(status.tags) ? status.tags : [];
            if (!tags.includes(requiredTag)) return false;
        }
        return !!statusId || !!requiredTag || command.all === true;
    }

    function registerTriggerDefinitions(runtime, skill, ownerSlot, sourcePrefix) {
        if (!runtime || !skill) return [];
        const definitions = Array.isArray(skill.triggers)
            ? skill.triggers
            : skill.trigger
                ? [skill.trigger]
                : [];
        const ids = [];
        definitions.forEach((trigger, index) => {
            if (!trigger || !trigger.event || trigger.event === 'battle_start') return;
            const id = `${sourcePrefix}_${index}`;
            const registered = runtime.registerTriggerSource({
                id,
                sourceId: sourcePrefix,
                ownerSlot,
                skillId: skill.id || sourcePrefix,
                skill,
                trigger,
                steps: Array.isArray(trigger.steps) ? trigger.steps : (skill.steps || [])
            });
            if (registered) ids.push(registered);
        });
        return ids;
    }

    function registerBattlePassiveTriggers(runtime) {
        if (!runtime) return;
        const seen = new Set();
        const registerSkill = (skill, ownerSlot, prefix) => {
            if (!skill || String(skill.kind || '').toLowerCase() !== 'passive') return;
            const identity = `${ownerSlot}|${skill.id || prefix}`;
            if (seen.has(identity)) return;
            seen.add(identity);
            registerTriggerDefinitions(runtime, skill, ownerSlot, prefix);
        };

        (typeof currentMC !== 'undefined' && currentMC && Array.isArray(currentMC.battleSkills) ? currentMC.battleSkills : [])
            .forEach((skill, index) => registerSkill(skill, 0, `passive_mc_${skill.id || index}`));

        FRONTLINE_SLOTS.concat(SUB_SLOTS).forEach((slot) => {
            if (slot === 0 || !window.SkillRegistry || typeof window.SkillRegistry.getByOwner !== 'function') return;
            const charData = typeof currentParty !== 'undefined' && currentParty ? currentParty[slot] : null;
            if (!charData || charData['ID'] == null) return;
            window.SkillRegistry.getByOwner('character', charData['ID'], { kind: 'passive' })
                .forEach((skill, index) => registerSkill(skill, slot, `passive_${slot}_${skill.id || index}`));
        });

        if (window.SummonRegistry && typeof window.SummonRegistry.collectPassiveSkills === 'function'
            && window.SkillRegistry && typeof currentSummons !== 'undefined') {
            window.SummonRegistry.collectPassiveSkills(currentSummons, window.SkillRegistry)
                .forEach((entry, index) => registerSkill(
                    entry.skill,
                    entry.ownerSlot == null ? 0 : entry.ownerSlot,
                    `passive_summon_${entry.summonSlot}_${entry.skill.id || index}`
                ));
        }
    }

    function syncRuntimeStatusTriggers(runtime, battleState) {
        if (!runtime || !battleState) return;
        (battleState.statusTriggerSourceIds || []).forEach((sourceId) => runtime.removeTriggerSource(sourceId));
        battleState.statusTriggerSourceIds = [];
        FRONTLINE_SLOTS.concat(SUB_SLOTS).forEach((slot) => {
            getBattleStatuses(slot, battleState).forEach((status, statusIndex) => {
                const sourcePrefix = `status_${slot}_${status.status_id || statusIndex}`;
                const definitions = Array.isArray(status.triggers)
                    ? status.triggers
                    : status.trigger
                        ? [status.trigger]
                        : [];
                definitions.forEach((trigger, triggerIndex) => {
                    if (!trigger || !trigger.event) return;
                    const id = `${sourcePrefix}_${triggerIndex}`;
                    const registered = runtime.registerTriggerSource({
                        id,
                        sourceId: id,
                        ownerSlot: status.target_slot != null ? status.target_slot : slot,
                        sourceOwnerSlot: status.owner_slot,
                        skillId: status.source_skill_id || status.status_id || id,
                        skill: getSkillById(status.source_skill_id),
                        status,
                        trigger,
                        steps: Array.isArray(trigger.steps) ? trigger.steps : (status.steps || [])
                    });
                    if (registered) battleState.statusTriggerSourceIds.push(registered);
                });
            });
        });
    }

    function createResolutionRuntime(battleState) {
        if (!window.BattleResolution || !window.StatusResolver) return null;
        const effects = new window.BattleResolution.EffectExecutorRegistry();
        const runtime = new window.BattleResolution.ResolutionEngine({
            state: battleState,
            effects,
            normalizeSteps: (steps, context) => appendSkillChaseCommand(window.StatusResolver.getSkillActions({ steps }, {
                skillId: context && context.skillId,
                skillName: context && context.triggerSource && context.triggerSource.skill
                    ? context.triggerSource.skill.name
                    : context && context.skillId,
                ownerSlot: context && context.ownerSlot
            }))
        });

        effects.register('apply_status', (command, context) => {
            const action = getRuntimeAction(context);
            const event = ensureRuntimeResultEvent(context, action);
            const statusCountBefore = event.statuses.length;
            applyResolvedStatus(action, command, context.result, event, battleState, context);
            syncRuntimeStatusTriggers(runtime, battleState);
            return {
                events: event.statuses.slice(statusCountBefore).map((status) => ({
                    type: 'status_applied',
                    payload: {
                        actorSlot: status.targetSlot,
                        ownerSlot: action.ownerSlot,
                        skillId: action.skillId,
                        statusId: status.statusId,
                        stacks: status.stacks,
                        targetType: status.targetType || 'ally'
                    }
                }))
            };
        });

        effects.register('damage', (command, context) => {
            const action = getRuntimeAction(context);
            const event = ensureRuntimeResultEvent(context, action);
            const accumulator = context.frame.skillChase || (context.frame.skillChase = { baseDamage: 0 });
            const eligible = action.type !== 'summon' && accumulateSkillChase(command, action.ownerSlot, battleState, accumulator);
            const resolved = calculateRuntimeDamageAction(command, action.ownerSlot, battleState, action.type === 'summon');
            const total = resolved.totalDamage;
            if (eligible) accumulator.baseDamage += total;
            event.hitCount = (event.hitCount || 0) + resolved.hitCount;
            if ((resolved.hits || []).some((hit) => hit.durationChanges && (
                hit.durationChanges.actor.expired.length || hit.durationChanges.enemy.expired.length
            ))) syncRuntimeStatusTriggers(runtime, battleState);
            const damageType = command.damage && command.damage.damage_type;
            const payload = {
                actorSlot: action.ownerSlot,
                ownerSlot: action.ownerSlot,
                skillId: action.skillId,
                damageType,
                damage: total,
                attackActionIndex: action.attackActionIndex || 0
            };
            const events = [{ type: 'damage_resolved', payload }];
            if (damageType === 'normal_attack') {
                const chain = ensureActorSettings(action.ownerSlot, battleState.turn).chain;
                payload.multiattack = chain;
                events.push({ type: 'normal_attack_resolved', payload });
                if (chain === 'ta') events.push({ type: 'triple_attack_resolved', payload });
            } else if (damageType === 'ca') {
                events.push({ type: 'charge_attack_resolved', payload });
            }
            if (total > 0) {
                const damageKey = action.type === 'summon'
                    ? 'summonDamage'
                    : damageType === 'ca'
                        ? 'caDamage'
                        : damageType === 'normal_attack'
                            ? 'normalDamage'
                            : 'skillDamage';
                addDamage(context.result, action.ownerSlot, damageKey, total);
                event.damage += total;
            } else if (damageType !== 'normal_attack' && damageType !== 'ca' && context.result) {
                context.result.logs.push(`${action.skill && action.skill.name ? action.skill.name : action.skillId} 的伤害效果暂不可计算。`);
            }
            return { events };
        });

        effects.register('skill_chase', (command, context) => {
            const action = getRuntimeAction(context);
            const event = ensureRuntimeResultEvent(context, action);
            const hits = recordSkillChase(context.frame.skillChase || {}, action, context.result, event);
            return { events: hits.map((hit) => ({
                type: 'damage_resolved',
                payload: Object.assign({}, hit, {
                    actorSlot: action.ownerSlot, ownerSlot: action.ownerSlot, skillId: action.skillId
                })
            })) };
        });

        effects.register('counter', (command) => {
            const key = String(command.id || command.counter_id || 'counter');
            const current = Number(battleState.counters[key]) || 0;
            const operation = String(command.operation || command.op || 'add');
            const value = Number(command.value == null ? 1 : command.value) || 0;
            if (operation === 'set') battleState.counters[key] = value;
            else if (operation === 'reset') battleState.counters[key] = 0;
            else if (operation === 'consume') battleState.counters[key] = Math.max(0, current - value);
            else battleState.counters[key] = current + value;
            return { value: battleState.counters[key] };
        });

        effects.register('set_flag', (command) => {
            const key = String(command.id || command.flag || 'flag');
            battleState.flags[key] = command.value == null ? true : cloneJson(command.value);
            return { value: battleState.flags[key] };
        });

        effects.register('remove_status', (command, context) => {
            const action = getRuntimeAction(context);
            let removed = 0;
            getRuntimeTargetSlots(command, action.ownerSlot).forEach((slot) => {
                const actor = getBattleActor(slot, battleState);
                if (!actor) return;
                const before = actor.statuses.length;
                actor.statuses = actor.statuses.filter((status) => !statusMatchesCommand(status, command));
                removed += before - actor.statuses.length;
            });
            syncRuntimeStatusTriggers(runtime, battleState);
            return { value: removed };
        });

        effects.register('extend_status', (command, context) => {
            const action = getRuntimeAction(context);
            const turns = Number(command.turns || command.value) || 0;
            let changed = 0;
            getRuntimeTargetSlots(command, action.ownerSlot).forEach((slot) => {
                getBattleStatuses(slot, battleState).forEach((status) => {
                    if (!statusMatchesCommand(status, command) || status.remaining_turns == null) return;
                    status.remaining_turns = Math.max(0, Number(status.remaining_turns) + turns);
                    changed++;
                });
            });
            return { value: changed };
        });

        effects.register('reduce_cooldown', (command, context) => {
            const action = getRuntimeAction(context);
            const amount = Math.max(0, Number(command.turns || command.value) || 0);
            const targetSkillId = command.skill_id || command.skillId;
            Object.values(battleState.cooldowns).forEach((cooldown) => {
                if (!cooldown || cooldown.owner_slot !== action.ownerSlot) return;
                if (targetSkillId && String(cooldown.skill_id) !== String(targetSkillId)) return;
                cooldown.available_turn = Math.max(battleState.turn, Number(cooldown.available_turn) - amount);
            });
            return { value: amount };
        });

        const buildScheduledEffect = (command, context, kind) => {
            const action = getRuntimeAction(context);
            let commands = Array.isArray(command.commands)
                ? command.commands
                : window.StatusResolver.getSkillActions({ steps: command.steps || [] }, {
                    skillId: command.skill_id || action.skillId,
                    skillName: command.name || action.skillId,
                    ownerSlot: command.owner_slot != null ? command.owner_slot : action.ownerSlot
                });
            const ownerSlot = command.owner_slot != null ? command.owner_slot : action.ownerSlot;
            const isAttack = command.action_type === 'attack';
            let attackActionIndex = 0;
            if (isAttack) {
                const actor = getBattleActor(ownerSlot, battleState);
                if (actor) attackActionIndex = ++actor.attackActionIndex;
                const attackType = command.attack_type || command.behavior || 'na';
                const lifecyclePayload = {
                    actorSlot: ownerSlot,
                    ownerSlot,
                    attackType,
                    attackActionIndex
                };
                commands = [
                    { type: 'emit_event', event: 'attack_action_start', payload: lifecyclePayload },
                    ...commands,
                    { type: 'emit_event', event: 'attack_action_end', payload: lifecyclePayload },
                    { type: 'expire_action_statuses', event: 'attack_action_end', payload: lifecyclePayload }
                ];
            }
            return {
                id: command.action_id || `${kind}_${battleState.turn}_${runtime.frameSequence + 1}`,
                kind,
                source: {
                    id: command.action_id,
                    type: command.action_type || kind,
                    source: 'scheduled',
                    ownerSlot,
                    skillId: command.skill_id || action.skillId,
                    attackActionIndex
                },
                commands,
                tags: Array.isArray(command.tags) ? command.tags : [kind]
            };
        };

        effects.register('schedule_action', (command, context) => ({
            followUps: [buildScheduledEffect(command, context, 'scheduled_action')]
        }));
        effects.register('cancel_action', () => ({ control: { cancelRemaining: true } }));
        effects.register('replace_action', (command, context) => ({
            control: { cancelRemaining: true },
            followUps: [buildScheduledEffect(command, context, 'replacement_action')]
        }));
        effects.register('emit_event', (command, context) => ({
            events: [{
                type: command.event || command.event_type || 'custom_event',
                payload: Object.assign({
                    actorSlot: getRuntimeAction(context).ownerSlot
                }, cloneJson(command.payload || {}))
            }]
        }));
        effects.register('expire_action_statuses', (command) => ({
            value: expireActionStatuses(command.event || 'attack_action_end', command.payload || {}, battleState, runtime)
        }));

        if (typeof window.BattleResolution.installEffectExecutors === 'function') {
            window.BattleResolution.installEffectExecutors(effects);
        }

        registerBattlePassiveTriggers(runtime);
        if (typeof window.BattleResolution.collectTriggerSources === 'function') {
            window.BattleResolution.collectTriggerSources({
                battleState,
                frontlineSlots: FRONTLINE_SLOTS.slice(),
                subSlots: SUB_SLOTS.slice(),
                getSkillById
            }).forEach((source) => runtime.registerTriggerSource(source));
        }
        syncRuntimeStatusTriggers(runtime, battleState);
        return runtime;
    }

    function calculateSkillAction(action, result, battleState, runtime) {
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
        const cooldown = getSkillCooldown(skill);
        const cooldownKey = getSkillActionKey(action.ownerSlot, action.skillId);
        const cooldownState = battleState.cooldowns[cooldownKey];
        const respectsCooldown = action.source !== 'attack' && action.source !== 'battle_initial';
        if (respectsCooldown && cooldownState && cooldownState.available_turn > battleState.turn) {
            event.skipped = 'cooldown';
            result.logs.push(`${skill ? skill.name : action.skillId}：冷却中，本回合无法使用。`);
            result.events.push(event);
            return;
        }
        if (!skill || resolvedActions.length === 0) {
            result.logs.push(`${skill ? skill.name : action.skillId} 暂无可执行 steps。`);
            result.events.push(event);
            return;
        }

        if (runtime) {
            if (action.type === 'skill' && action.ownerSlot != null) {
                runtime.emitLifecycle('skill_used', {
                    actionId: action.id,
                    actorSlot: action.ownerSlot,
                    ownerSlot: action.ownerSlot,
                    skillId: action.skillId,
                    actionType: action.type,
                    source: action.source
                }, { action, result, resultEvent: event, battleState });
            }
            const attackPayload = action.type === 'attack' ? {
                actionId: action.id,
                actorSlot: action.ownerSlot,
                ownerSlot: action.ownerSlot,
                skillId: action.skillId,
                attackType: action.skillId === BUILT_IN_ATTACK_SKILLS.ca.id ? 'ca' : 'na',
                attackActionIndex: action.attackActionIndex || 1
            } : null;
            if (attackPayload) {
                runtime.emitLifecycle('attack_action_start', attackPayload, { action, result, resultEvent: event, battleState });
            }
            runtime.resolveAction({
                id: action.id,
                kind: action.type || 'skill',
                source: action,
                commands: resolvedActions,
                tags: action.type === 'attack' ? ['attack'] : ['skill'],
                context: { action, result, resultEvent: event, battleState }
            });
            if (attackPayload) {
                runtime.emitLifecycle('attack_action_end', Object.assign({}, attackPayload, {
                    damage: event.damage
                }), { action, result, resultEvent: event, battleState });
                expireActionStatuses('attack_action_end', attackPayload, battleState, runtime);
            }
        } else {
            const skillChase = { baseDamage: 0 };
            resolvedActions.forEach((resolvedAction) => {
                if (!resolvedAction) return;
                if (resolvedAction.type === 'skill_chase') {
                    recordSkillChase(skillChase, action, result, event);
                    return;
                }
                if (resolvedAction.type === 'apply_status') {
                    applyResolvedStatus(action, resolvedAction, result, event, battleState);
                    return;
                }
                if (resolvedAction.type !== 'damage') return;
                const eligible = action.type !== 'summon'
                    && accumulateSkillChase(resolvedAction, action.ownerSlot, battleState, skillChase);
                const resolved = calculateRuntimeDamageAction(resolvedAction, action.ownerSlot, battleState, action.type === 'summon');
                const total = resolved.totalDamage;
                if (eligible) skillChase.baseDamage += total;
                event.hitCount = (event.hitCount || 0) + resolved.hitCount;
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
        }
        if (respectsCooldown && cooldown > 0) {
            battleState.cooldowns[cooldownKey] = {
                owner_slot: action.ownerSlot,
                skill_id: action.skillId,
                cooldown,
                used_turn: battleState.turn,
                available_turn: battleState.turn + cooldown
            };
        }
        result.events.push(event);
    }

    function getActorExtraAttackCount(slot, battleState) {
        let count = 0;
        getBattleStatuses(slot, battleState).forEach((status) => {
            (Array.isArray(status.effects) ? status.effects : []).forEach((effect) => {
                if (!effect || effect.effect_type !== 'extra_attack') return;
                count = Math.max(count, Math.max(0, Math.floor(Number(effect.count) || 0)));
            });
        });
        return Math.min(10, count);
    }

    function calculateAttack(result, battleState, runtime) {
        battleState.phase = 'attack';
        FRONTLINE_SLOTS.forEach((slot) => {
            const settings = ensureActorSettings(slot, battleState.turn);
            const charge = settings.charge;
            const useCa = settings.useCa && charge >= 100;
            const actionCount = 1 + getActorExtraAttackCount(slot, battleState);
            for (let actionOffset = 0; actionOffset < actionCount; actionOffset++) {
                const behavior = actionOffset === 0 && useCa ? 'ca' : 'na';
                const actionIndex = ++battleState.actors[slot].attackActionIndex;
                const actionId = `turn_${result.turn}_attack_${slot}_${actionIndex}`;
                const skill = BUILT_IN_ATTACK_SKILLS[behavior];
                const action = {
                    id: actionId,
                    turn: result.turn,
                    type: 'attack',
                    source: 'attack',
                    ownerSlot: slot,
                    skillId: skill.id,
                    skill,
                    attackActionIndex: actionIndex
                };
                result.attackActions.push(action);
                result.attackTimeline.push({ kind: 'action', action });
                calculateSkillAction(action, result, battleState, runtime);
            }
        });
        battleState.phase = 'turn_end';
    }

    function createTurnResult(turn) {
        return {
            turn,
            totalDamage: 0,
            byCharacter: {},
            buffsByCharacter: {},
            logs: [],
            events: [],
            eventTrace: [],
            initialActions: [],
            attackActions: [],
            attackTimeline: [],
            plannedActions: [],
            plannedEnemyActions: [],
            startState: null,
            endState: null,
            battleState: null
        };
    }

    function runSimulation(options) {
        options = options || {};
        if (options.syncDom !== false) syncActorSettingsFromDom();
        syncSimulationSettingsFromDom();
        state.simulationBaseSnapshot = createSimulationBaseSnapshot();
        const battleState = createBattleState(1);
        const runtime = createResolutionRuntime(battleState);
        const replayResults = {};

        for (let turn = 1; turn <= state.turnCount; turn++) {
            battleState.turn = turn;
            battleState.phase = turn === 1 ? 'battle_start' : 'turn_start';
            Object.values(battleState.actors).forEach((actor) => { actor.attackActionIndex = 0; });
            const result = createTurnResult(turn);
            result.plannedActions = cloneJson(ensureTurn(turn));
            result.plannedEnemyActions = cloneJson(state.enemyActionsByTurn[turn] || []);
            result.startState = cloneJson(battleState);
            const traceStart = runtime ? runtime.getTrace().length : 0;
            syncResultBuffsFromBattleState(result, battleState);

            if (turn === 1) {
                if (runtime) runtime.emitLifecycle('battle_start', { turn }, { result, battleState });
                result.initialActions = getBattleStartActions(turn);
                result.initialActions.forEach((action) => calculateSkillAction(action, result, battleState, runtime));
            }
            if (runtime) runtime.emitLifecycle('turn_start', { turn }, { result, battleState });
            battleState.phase = 'skill';
            ensureTurn(turn).forEach((action) => calculateSkillAction(action, result, battleState, runtime));
            calculateAttack(result, battleState, runtime);
            syncResultBuffsFromBattleState(result, battleState);
            if (runtime) {
                runtime.emitLifecycle('turn_end', { turn }, { result, battleState });
                runtime.flushDeferred('turn_end', { result, battleState });
            }
            advanceBattleStateAtTurnEnd(battleState);
            syncRuntimeStatusTriggers(runtime, battleState);
            result.eventTrace = runtime ? runtime.getTrace().slice(traceStart) : [];
            result.endState = cloneJson(battleState);
            result.battleState = cloneJson(result.endState);
            replayResults[turn] = result;
        }

        state.resultsByTurn = replayResults;
        state.lastResult = replayResults[state.activeTurn] || null;
        renderDamageSummary(state.lastResult);
        return state.lastResult;
    }

    function settleCurrentTurn() {
        const settledTurn = state.activeTurn;
        const result = runSimulation();
        if (settledTurn >= state.maxTurnCount) {
            refresh();
            return result;
        }
        state.turnCount = Math.max(state.turnCount, settledTurn + 1);
        state.activeTurn = settledTurn + 1;
        ensureTurn(state.activeTurn);
        state.lastResult = state.resultsByTurn[state.activeTurn] || null;
        refresh();
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
            events: [],
            initialActions: [],
            attackActions: [],
            attackTimeline: []
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
                <div class="burst-log-turn-title">第${state.activeTurn}回合</div>
                <div class="burst-log-empty">设置 ${state.activeTurn}T 的技能后，点击“攻击 / 结算本回合”进入下一回合。</div>
            `;
        }

        let html = `<div class="burst-log-turn-title">第${turn}回合</div>`;
        const initialActions = (Array.isArray(result.initialActions) ? result.initialActions : []).filter((action) => {
            const resolvedEvent = Array.isArray(result.events)
                ? result.events.find((event) => event && event.actionId === action.id)
                : null;
            return !resolvedEvent
                || Number(resolvedEvent.damage) > 0
                || (Array.isArray(resolvedEvent.statuses) && resolvedEvent.statuses.length > 0);
        });
        if (initialActions.length > 0) {
            html += `<div class="burst-log-attack-divider">开局效果</div>`;
            initialActions.forEach((action) => {
                const skill = action.skill || {};
                const icon = getSkillIconSrc(skill);
                const actorName = getActionOwnerLabel(action, skill);
                html += `
                    <div class="burst-log-action">
                        <div class="burst-log-action-head">
                            <div class="burst-log-icon">${icon ? `<img src="${escapeHtml(icon)}" alt="">` : `<span>${escapeHtml((skill.name || '?').slice(0, 2))}</span>`}</div>
                            <div>
                                <div class="burst-log-actor">${escapeHtml(actorName)}</div>
                                <div class="burst-log-skill">${escapeHtml(skill.name || action.skillId)}</div>
                            </div>
                        </div>
                        ${renderSkillBuffLines(skill, actorName, action)}
                    </div>
                    <div class="burst-log-separator"></div>
                `;
            });
        }
        ensureTurn(turn).forEach((action) => {
            const skill = action.skill || getSkillById(action.skillId) || {};
            const icon = getSkillIconSrc(skill);
            const actorName = getActionOwnerLabel(action, skill);
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
                    ${renderSkillBuffLines(skill, actorName, action)}
                </div>
                <div class="burst-log-separator"></div>
            `;
        });

        html += `<div class="burst-log-attack-divider">攻击</div>`;
        const attackActions = Array.isArray(result.attackActions) ? result.attackActions : [];
        const triggeredEvents = Array.isArray(result.events)
            ? result.events.filter((event) => event && event.triggered && (Number(event.damage) > 0 || event.statuses.length > 0))
            : [];
        const attackTimeline = Array.isArray(result.attackTimeline) && result.attackTimeline.length > 0
            ? result.attackTimeline.filter((entry) => entry && (entry.kind !== 'trigger'
                || entry.event && (Number(entry.event.damage) > 0 || entry.event.statuses.length > 0)))
            : attackActions.map((action) => ({ kind: 'action', action }))
                .concat(triggeredEvents.map((event) => ({ kind: 'trigger', event })));
        attackTimeline.forEach((entry, index) => {
            if (entry.kind === 'trigger') {
                const event = entry.event;
                const skill = getSkillById(event.skillId) || {};
                const displaySkillName = event.skillName || skill.name || event.skillId || '自动触发';
                const actorName = event.ownerSlot == null ? '系统' : getPartyName(event.ownerSlot);
                const statusLines = (Array.isArray(event.statuses) ? event.statuses : []).map((status) => {
                    const targetName = status.targetType === 'enemy'
                        ? '敌方'
                        : status.targetSlot == null ? actorName : getPartyName(status.targetSlot);
                    const stackText = status.stacks != null ? `（${status.stacks}层）` : '';
                    return `<div class="burst-log-line">${escapeHtml(targetName)}：获得 ${escapeHtml(status.name || status.statusId)}${escapeHtml(stackText)}</div>`;
                }).join('');
                html += `
                    <div class="burst-log-action burst-log-triggered-action">
                        <div class="burst-log-action-head">
                            <div class="burst-log-icon"><span>${escapeHtml(displaySkillName.slice(0, 2))}</span></div>
                            <div>
                                <div class="burst-log-actor">${escapeHtml(actorName)}</div>
                                <div class="burst-log-skill">${escapeHtml(displaySkillName)}</div>
                            </div>
                        </div>
                        ${Number(event.damage) > 0 ? `<div class="burst-log-line">${escapeHtml(actorName)}：追加造成 ${formatNumber(event.damage)} 伤害</div>` : ''}
                        ${statusLines}
                    </div>
                    ${index < attackTimeline.length - 1 ? '<div class="burst-log-separator"></div>' : ''}
                `;
                return;
            }
            const action = entry.action;
            const skill = action.skill || getSkillById(action.skillId) || {};
            const actorName = getPartyName(action.ownerSlot);
            const actionDamage = getActionDamageEstimate(action, result);
            html += `
                <div class="burst-log-action burst-log-built-in-action">
                    <div class="burst-log-action-head">
                        <div class="burst-log-icon"><span>${escapeHtml((skill.name || '?').slice(0, 2))}</span></div>
                        <div>
                            <div class="burst-log-actor">${escapeHtml(actorName)}</div>
                            <div class="burst-log-skill">${escapeHtml(skill.name || action.skillId)}</div>
                        </div>
                    </div>
                    <div class="burst-log-line">${escapeHtml(actorName)}：造成 ${formatNumber(actionDamage)} 伤害</div>
                    ${renderTurnBuffSlots(action.ownerSlot, result)}
                </div>
                ${index < attackTimeline.length - 1 ? '<div class="burst-log-separator"></div>' : ''}
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

    function getActionOwnerLabel(action, skill) {
        if (action && action.source === 'summon') return skill && skill.typeLabel ? skill.typeLabel : '召唤石';
        if (action && action.summonSlot != null) return '召唤石被动';
        return action && action.ownerSlot != null ? getPartyName(action.ownerSlot) : '系统';
    }

    function renderSkillBuffLines(skill, actorName, action) {
        return getResolvedSkillActions(skill, { skillId: skill && skill.id }).map((resolvedAction) => {
            if (!resolvedAction || resolvedAction.type !== 'apply_status' || !resolvedAction.status) return '';
            const status = resolvedAction.status;
            const buffName = status.name || status.status_id || 'Buff';
            const duration = status.duration && status.duration.value != null ? `（${status.duration.value}回合）` : '';
            const targetLabel = resolvedAction.target === 'enemy_single' || resolvedAction.target === 'enemy_all'
                ? '敌方获得'
                : resolvedAction.target === 'ally_party'
                    ? '己方前排获得'
                    : resolvedAction.target === 'ally_all'
                        ? '己方全体获得'
                        : resolvedAction.target === 'ally_slots' && Array.isArray(resolvedAction.target_slots)
                            ? `${resolvedAction.target_slots.map((slot) => `${Number(slot) + 1}号位`).join('、')}获得`
                        : `${action && action.source === 'summon' && action.ownerSlot != null
                            ? getPartyName(action.ownerSlot)
                            : actorName}获得`;
            return `<div class="burst-log-line">${escapeHtml(targetLabel)} ${escapeHtml(buffName)}${escapeHtml(duration)}</div>`;
        }).filter(Boolean).join('');
    }

    window.BurstSimulator = {
        init: createBoard,
        refresh,
        run: runSimulation,
        clear: clearActiveTurn,
        prepareManualDamageCalculation,
        calculateManualHitDamage,
        getManualBonusHitSources,
        getManualSkillChaseEffects,
        getBaseSnapshot: function () {
            return state.simulationBaseSnapshot
                ? JSON.parse(JSON.stringify(state.simulationBaseSnapshot))
                : null;
        },
        getBattleState: function () {
            return state.lastResult && state.lastResult.battleState
                ? cloneJson(state.lastResult.battleState)
                : null;
        },
        getEventTrace: function (turn) {
            const targetTurn = turn == null ? state.activeTurn : Number(turn);
            const result = state.resultsByTurn[targetTurn];
            return result && Array.isArray(result.eventTrace) ? cloneJson(result.eventTrace) : [];
        },
        getTurnState: function () {
            return {
                activeTurn: state.activeTurn,
                turnCount: state.turnCount,
                actionsByTurn: cloneJson(state.actionsByTurn),
                enemyActionsByTurn: cloneJson(state.enemyActionsByTurn),
                actorSettingsByTurn: cloneJson(state.actorSettingsByTurn),
                resultsByTurn: cloneJson(state.resultsByTurn)
            };
        },
        getTurnSnapshots: function (turn) {
            const targetTurn = Math.max(1, Math.floor(Number(turn) || state.activeTurn));
            const result = state.resultsByTurn[targetTurn];
            return result ? {
                turn: targetTurn,
                startState: cloneJson(result.startState),
                endState: cloneJson(result.endState)
            } : null;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createBoard);
    } else {
        createBoard();
    }
})();
