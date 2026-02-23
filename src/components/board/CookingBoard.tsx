// ============================================================
// RoboChef — CookingBoard Component
// ============================================================
// ゲームのメインエリア。コマンドキューの構築・ボウル操作・実行を行う。

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
    DndContext,
    DragOverlay,
    type DragEndEvent,
    type DragStartEvent,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    useDroppable,
} from '@dnd-kit/core';
import { useGameStore } from '../../stores/gameStore';
import { IngredientCard } from '../cards/IngredientCard';
import { RecipePanel } from '../recipe/RecipePanel';
import { ResultOverlay } from './ResultOverlay';
import { validateCommand } from '../../engine/executor';
import type { ActionDefinition, IngredientState, ActionType } from '../../engine/types';

// Available levels
import level01 from '../../data/levels/level-01.json';
import level0102 from '../../data/levels/level-01-02.json';
import level0103 from '../../data/levels/level-01-03.json';
import level02 from '../../data/levels/level-02.json';
import level03 from '../../data/levels/level-03.json';
import type { LevelData } from '../../engine/types';

const levels: LevelData[] = [
    level01 as unknown as LevelData,
    level0102 as unknown as LevelData,
    level0103 as unknown as LevelData,
    level02 as unknown as LevelData,
    level03 as unknown as LevelData,
];

// パラメータ選択の状態
interface ParamSelections {
    [actionId: string]: Record<string, string>;
}

export function CookingBoard() {
    const {
        levelData,
        ingredients,
        bowl,
        commandQueue,
        phase,
        evaluationResult,
        isCleared,
        isStepMode,
        stepIndex,
        executionResult,
        stars,
        loadLevel,
        addCommand,
        removeCommand,
        addToBowl,
        removeFromBowl,
        executeAll,
        startStepExecution,
        executeStep,
        reset,
    } = useGameStore();

    // ドラッグ中の食材
    const [activeIngredient, setActiveIngredient] =
        useState<IngredientState | null>(null);

    // パラメータ選択
    const [paramSelections, setParamSelections] = useState<ParamSelections>({});

    // Level index
    const [currentLevelIndex, setCurrentLevelIndex] = useState(0);

    // Code input mode
    const [isCodeMode, setIsCodeMode] = useState(false);
    const [codeInput, setCodeInput] = useState('');

    // dnd-kit sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    );

    // Load initial level via useEffect (not during render)
    useEffect(() => {
        if (!levelData) {
            loadLevel(levels[0]);
        }
    }, [levelData, loadLevel]);

    // Real-time validation of command queue
    const validationResults = useMemo(() => {
        if (!levelData || phase !== 'building') return [];
        let simulatedIngredients = levelData.ingredients.map((def) => ({
            id: def.id,
            name: def.name,
            icon: def.icon,
            isCut: false,
            isCooked: false,
            isMixed: false,
            mixedWith: [] as string[],
        }));

        return commandQueue.map((cmd) => {
            const result = validateCommand(cmd, simulatedIngredients, bowl);
            if (cmd.actionType === 'CUT') {
                simulatedIngredients = simulatedIngredients.map((ing) =>
                    cmd.targetIds.includes(ing.id) ? { ...ing, isCut: true } : ing,
                );
            } else if (['FRY', 'BOIL', 'STEAM'].includes(cmd.actionType)) {
                const method = cmd.actionType === 'FRY' ? 'fried' : cmd.actionType === 'BOIL' ? 'boiled' : 'steamed';
                simulatedIngredients = simulatedIngredients.map((ing) =>
                    cmd.targetIds.includes(ing.id) || (cmd.useBowl && bowl.ingredientIds.includes(ing.id))
                        ? { ...ing, isCooked: true, cookMethod: method as 'fried' | 'boiled' | 'steamed' }
                        : ing,
                );
            }
            return result;
        });
    }, [commandQueue, levelData, bowl, phase]);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const { active } = event;
        const data = active.data.current;
        if (data?.type === 'ingredient') {
            setActiveIngredient(data.ingredient);
        }
    }, []);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { over } = event;
        const draggedIngredient = activeIngredient;
        setActiveIngredient(null);

        if (!over || !draggedIngredient) return;

        const overData = over.data.current;

        if (overData?.type === 'action') {
            // ドロップ先がアクションカード → 即座にコマンド追加
            const action = overData.action as ActionDefinition;
            const params: Record<string, string> = {};
            if (action.paramSlots) {
                const selections = paramSelections[action.id] ?? {};
                for (const slot of action.paramSlots) {
                    if (selections[slot.name]) {
                        params[slot.name] = selections[slot.name];
                    }
                }
            }
            addCommand({
                actionType: action.type as ActionType,
                targetIds: [draggedIngredient.id],
                useBowl: false,
                ...(Object.keys(params).length > 0 ? { params } : {}),
            });
        } else if (overData?.type === 'bowl') {
            // ボウルに食材をドロップ
            addToBowl(draggedIngredient.id);
        }
    }, [activeIngredient, addToBowl, addCommand, paramSelections]);

    // コード入力からコマンドをパースして追加
    const handleCodeSubmit = useCallback(() => {
        if (!levelData) return;

        const lines = codeInput
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith('//'));

        const actionMap: Record<string, ActionType> = {
            cut: 'CUT', boil: 'BOIL', fry: 'FRY',
            steam: 'STEAM', mix: 'MIX', season: 'SEASON',
        };

        for (const line of lines) {
            // パース: action(arg1, arg2, ...) or action(arg, "param")
            const match = line.match(/^(\w+)\((.+)\)$/);
            if (!match) continue;

            const [, fnName, argsStr] = match;
            const actionType = actionMap[fnName.toLowerCase()];
            if (!actionType) continue;

            // 引数をパース
            const args = argsStr.split(',').map((a) => a.trim().replace(/"/g, ''));

            if (actionType === 'MIX') {
                // MIX: mix(bowl) or mix(carrot, tomato)
                const useBowl = args.length === 1 && args[0] === 'bowl';
                const targetIds = useBowl ? [] : args.map((a) => {
                    const ing = levelData.ingredients.find(
                        (i) => i.name === a || i.id === a,
                    );
                    return ing?.id ?? a;
                });
                addCommand({ actionType, targetIds, useBowl });
            } else if (actionType === 'SEASON') {
                // SEASON: season(carrot, "ドレッシング")
                const ingArg = args[0];
                const seasoning = args[1];
                const ing = levelData.ingredients.find(
                    (i) => i.name === ingArg || i.id === ingArg,
                );
                addCommand({
                    actionType,
                    targetIds: [ing?.id ?? ingArg],
                    useBowl: ingArg === 'bowl',
                    ...(seasoning ? { params: { seasoning } } : {}),
                });
            } else {
                // 通常: action(ingredient)
                for (const a of args) {
                    const useBowl = a === 'bowl';
                    const ing = levelData.ingredients.find(
                        (i) => i.name === a || i.id === a,
                    );
                    addCommand({
                        actionType,
                        targetIds: useBowl ? [] : [ing?.id ?? a],
                        useBowl,
                    });
                }
            }
        }
        setCodeInput('');
    }, [codeInput, levelData, addCommand]);

    // Null guard (while loading)
    if (!levelData) return null;

    const handleReset = () => {
        setParamSelections({});
        setCodeInput('');
        reset();
    };

    const handleNextLevel = () => {
        const nextIndex = currentLevelIndex + 1;
        if (nextIndex < levels.length) {
            setCurrentLevelIndex(nextIndex);
            setParamSelections({});
            setCodeInput('');
            loadLevel(levels[nextIndex]);
        }
    };

    const handleSelectLevel = (index: number) => {
        setCurrentLevelIndex(index);
        setParamSelections({});
        setCodeInput('');
        loadLevel(levels[index]);
    };

    const getLevelStars = (levelId: string) => {
        const s = stars[levelId] ?? 0;
        return '⭐'.repeat(s) + '☆'.repeat(3 - s);
    };

    // ボウル全体にアクションを適用するハンドラ
    const handleBowlAction = (action: ActionDefinition) => {
        if (bowl.ingredientIds.length === 0) return;
        const params: Record<string, string> = {};
        if (action.paramSlots) {
            const selections = paramSelections[action.id] ?? {};
            for (const slot of action.paramSlots) {
                if (selections[slot.name]) {
                    params[slot.name] = selections[slot.name];
                }
            }
        }
        addCommand({
            actionType: action.type as ActionType,
            targetIds: [],
            useBowl: true,
            ...(Object.keys(params).length > 0 ? { params } : {}),
        });
    };

    // コードプレースホルダー生成
    const codePlaceholder = levelData.ingredients
        .map((i) => `${levelData.availableActions[0]?.type.toLowerCase() ?? 'cut'}(${i.name})`)
        .join('\n');

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="game-layout">
                {/* Header */}
                <header className="game-header">
                    <div>
                        <h1 className="game-header-title">🤖 RoboChef</h1>
                        <span className="game-header-subtitle">Learn to code, one recipe at a time!</span>
                        <span className="game-header-level">
                            {levelData.title}
                        </span>
                    </div>
                    <div className="game-header-actions">
                        <select
                            value={currentLevelIndex}
                            onChange={(e) => handleSelectLevel(Number(e.target.value))}
                            style={{
                                background: 'var(--color-bg-card)',
                                color: 'var(--color-text)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                padding: '6px 12px',
                                fontSize: 'var(--font-size-sm)',
                                fontFamily: 'var(--font-family)',
                            }}
                        >
                            {levels.map((l, i) => (
                                <option key={l.id} value={i}>
                                    {l.title} {getLevelStars(l.id)}
                                </option>
                            ))}
                        </select>
                        {/* Code mode toggle */}
                        <button
                            className={`mode-toggle-button ${isCodeMode ? 'active' : ''}`}
                            onClick={() => setIsCodeMode(!isCodeMode)}
                            title={isCodeMode ? 'ビジュアルモードへ' : 'コード入力モードへ'}
                        >
                            {isCodeMode ? '🎨 ビジュアル' : '💻 コード'}
                        </button>
                        <button className="reset-button" onClick={handleReset}>
                            🔄 リセット
                        </button>
                    </div>
                </header>

                {/* Left: Recipe Panel */}
                <RecipePanel level={levelData} evaluationResult={evaluationResult} />

                {/* Center: Cooking Board */}
                <div className="cooking-board">

                    {isCodeMode ? (
                        /* ============ Code Input Mode ============ */
                        <div className="code-input-area">
                            <h3 style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-sm)' }}>
                                💻 コードを入力してコマンドを追加
                            </h3>
                            <div className="code-input-help">
                                使える関数: {levelData.availableActions.map((a) => (
                                    <code key={a.id}>{a.type.toLowerCase()}()</code>
                                ))}
                                <br />
                                引数には食材名を使おう: {levelData.ingredients.map((i) => (
                                    <code key={i.id}>{i.name}</code>
                                ))}
                            </div>
                            <textarea
                                className="code-textarea"
                                value={codeInput}
                                onChange={(e) => setCodeInput(e.target.value)}
                                placeholder={codePlaceholder}
                                rows={6}
                                spellCheck={false}
                            />
                            <button
                                className="execute-button"
                                onClick={handleCodeSubmit}
                                disabled={!codeInput.trim() || phase !== 'building'}
                                style={{ marginTop: 'var(--space-sm)' }}
                            >
                                ＋ コードからキューに追加
                            </button>
                        </div>
                    ) : (
                        /* ============ Visual Mode — Action Cards as Drop Zones ============ */
                        <div className="action-cards-area">
                            {levelData.availableActions.map((action) => (
                                <ActionDropZone
                                    key={action.id}
                                    action={action}
                                    phase={phase}
                                    paramSelections={paramSelections}
                                    setParamSelections={setParamSelections}
                                    onBowlAction={() => handleBowlAction(action)}
                                    hasBowlItems={bowl.ingredientIds.length > 0}
                                />
                            ))}
                        </div>
                    )}

                    {/* Bowl Area */}
                    <BowlArea
                        bowlIngredientIds={bowl.ingredientIds}
                        allIngredients={ingredients}
                        onRemoveFromBowl={removeFromBowl}
                    />

                    {/* Command Queue */}
                    <div className="command-queue">
                        <h3 className="command-queue-title">
                            <span className="queue-icon">⚡</span>
                            コマンドキュー ({commandQueue.length})
                            {levelData.optimalCommandCount && phase === 'building' && (
                                <span style={{
                                    fontSize: 'var(--font-size-xs)',
                                    color: 'var(--color-text-dim)',
                                    marginLeft: 'auto',
                                    fontWeight: 400,
                                }}>
                                    最適: {levelData.optimalCommandCount}コマンド
                                </span>
                            )}
                        </h3>
                        {commandQueue.length === 0 ? (
                            <div className="command-list-empty">
                                <span className="empty-icon">📝</span>
                                <span>
                                    {isCodeMode
                                        ? 'コードを入力してキューに追加しよう'
                                        : '食材をまな板にドラッグ＆ドロップ！'}
                                </span>
                            </div>
                        ) : (
                            <div className="command-list">
                                {commandQueue.map((cmd, index) => {
                                    const args = cmd.useBowl
                                        ? 'bowl'
                                        : cmd.targetIds
                                            .map((id) => ingredients.find((i) => i.id === id)?.name ?? id)
                                            .join(', ');
                                    const paramStr = cmd.params
                                        ? ', ' + Object.entries(cmd.params).map(([, v]) => `"${v}"`).join(', ')
                                        : '';
                                    const validation = validationResults[index];
                                    const isActiveStep = isStepMode && stepIndex === index;

                                    return (
                                        <div key={index} className={`command-item ${isActiveStep ? 'active-step' : ''}`}>
                                            <span className="command-number">{index + 1}</span>
                                            <span className="command-code">
                                                <span className="cmd-fn">{cmd.actionType.toLowerCase()}</span>
                                                (<span className="cmd-arg">{args}{paramStr}</span>)
                                            </span>
                                            {validation && validation.warnings.length > 0 && phase === 'building' && (
                                                <span className="command-warning" title={validation.warnings.join('\n')}>
                                                    ⚠️
                                                </span>
                                            )}
                                            {validation && !validation.valid && phase === 'building' && (
                                                <span className="command-error" title={validation.errors.join('\n')}>
                                                    ❌
                                                </span>
                                            )}
                                            {phase === 'building' && (
                                                <button
                                                    className="command-remove"
                                                    onClick={() => removeCommand(index)}
                                                    title="削除"
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Step Execution Timeline */}
                    {isStepMode && executionResult && (
                        <div className="timeline-viewer">
                            <h3 style={{
                                fontSize: 'var(--font-size-sm)',
                                fontWeight: 700,
                                color: 'var(--color-text)',
                                marginBottom: 'var(--space-sm)',
                            }}>
                                🔍 ステップ実行中 ({stepIndex + 1} / {executionResult.timeline.length})
                            </h3>
                            {executionResult.timeline.map((event, i) => (
                                <div
                                    key={i}
                                    className={`timeline-step ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'completed' : ''} ${event.error ? 'error' : ''}`}
                                >
                                    <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-sm)' }}>
                                        <span style={{ color: 'var(--color-code-function)' }}>
                                            {event.command.actionType.toLowerCase()}
                                        </span>
                                        ()
                                    </span>
                                    {i === stepIndex && <span style={{ marginLeft: 'auto' }}>◀ いまここ</span>}
                                    {i < stepIndex && <span style={{ marginLeft: 'auto', color: 'var(--color-success)' }}>✓</span>}
                                    {event.error && <span style={{ marginLeft: 'auto', color: 'var(--color-error)', fontSize: 'var(--font-size-xs)' }}>{event.error}</span>}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Execute Buttons */}
                    <div className="execute-button-container">
                        {isStepMode ? (
                            <button
                                className="execute-button"
                                onClick={executeStep}
                            >
                                ▶▶ 次のステップ
                            </button>
                        ) : (
                            <>
                                <button
                                    className="execute-button"
                                    onClick={executeAll}
                                    disabled={commandQueue.length === 0 || phase !== 'building'}
                                >
                                    ▶ 実行する！
                                </button>
                                <button
                                    className="execute-button step-button"
                                    onClick={startStepExecution}
                                    disabled={commandQueue.length === 0 || phase !== 'building'}
                                    style={{
                                        background: 'var(--color-bg-surface)',
                                        color: 'var(--color-primary)',
                                        border: '2px solid var(--color-primary)',
                                    }}
                                >
                                    ▶▶ ステップ実行
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Right: Card Deck (冷蔵庫) */}
                <div className="card-deck fridge">
                    <div className="fridge-door">
                        <div className="fridge-handle" />
                    </div>
                    <div className="card-deck-section">
                        <h3 className="card-deck-section-title">🧊 れいぞうこ</h3>
                        <div className="ingredient-list">
                            {ingredients.map((ing) => (
                                <IngredientCard key={ing.id} ingredient={ing} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Drag Overlay */}
            <DragOverlay>
                {activeIngredient && (
                    <div className="card ingredient-card" style={{ opacity: 0.9, transform: 'scale(1.05)' }}>
                        <span className="card-icon">{activeIngredient.icon}</span>
                        <span className="card-name">{activeIngredient.name}</span>
                    </div>
                )}
            </DragOverlay>

            {/* Result */}
            <ResultOverlay
                show={phase === 'result'}
                evaluationResult={evaluationResult}
                onRetry={handleReset}
                onNextLevel={
                    isCleared && currentLevelIndex < levels.length - 1
                        ? handleNextLevel
                        : undefined
                }
            />
        </DndContext>
    );
}

// ----------------------------------------------------------
// Action Card Drop Zone (まな板スタイル)
// ----------------------------------------------------------
function ActionDropZone({
    action,
    phase,
    paramSelections,
    setParamSelections,
    onBowlAction,
    hasBowlItems,
}: {
    action: ActionDefinition;
    phase: string;
    paramSelections: ParamSelections;
    setParamSelections: React.Dispatch<React.SetStateAction<ParamSelections>>;
    onBowlAction: () => void;
    hasBowlItems: boolean;
}) {
    const { isOver, setNodeRef } = useDroppable({
        id: `action-drop-${action.id}`,
        data: { type: 'action', action },
    });

    // アクションタイプごとの背景テーマ
    const themeClass = action.type === 'CUT' ? 'cutting-board'
        : action.type === 'FRY' ? 'frying-pan'
            : action.type === 'BOIL' ? 'pot'
                : action.type === 'MIX' ? 'mixing-bowl'
                    : action.type === 'SEASON' ? 'spice-rack'
                        : '';

    return (
        <div
            ref={setNodeRef}
            className={`action-dropzone ${themeClass} ${isOver ? 'drag-over' : ''} ${phase !== 'building' ? 'disabled' : ''}`}
        >
            <div className="action-dropzone-header">
                <span className="action-icon">{action.icon}</span>
                <span className="action-label">{action.label}</span>
                <code className="action-signature">
                    {action.type.toLowerCase()}()
                </code>
            </div>
            <div className="action-dropzone-body">
                <span className="dropzone-hint">
                    {isOver ? '✨ ここでドロップ！' : '🫳 食材をここにドラッグ'}
                </span>
            </div>
            {/* Parameter selectors (for SEASON etc.) */}
            {action.paramSlots && action.paramSlots.length > 0 && (
                <div className="action-card-params">
                    {action.paramSlots.map((param) => (
                        <div key={param.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}>
                            <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                {param.label}:
                            </label>
                            <select
                                value={paramSelections[action.id]?.[param.name] ?? ''}
                                onChange={(e) =>
                                    setParamSelections((prev) => ({
                                        ...prev,
                                        [action.id]: {
                                            ...prev[action.id],
                                            [param.name]: e.target.value,
                                        },
                                    }))
                                }
                                style={{
                                    background: 'var(--color-bg)',
                                    color: 'var(--color-text)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-sm)',
                                    padding: '3px 8px',
                                    fontSize: 'var(--font-size-xs)',
                                    fontFamily: 'var(--font-family)',
                                }}
                            >
                                <option value="">選択...</option>
                                {param.options.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>
                    ))}
                </div>
            )}
            {/* Bowl action button (for acceptsBowl actions) */}
            {action.acceptsBowl && hasBowlItems && (
                <button
                    className="bowl-action-button"
                    onClick={onBowlAction}
                    disabled={phase !== 'building'}
                >
                    🥣 ボウルごと{action.label}
                </button>
            )}
        </div>
    );
}

// ----------------------------------------------------------
// Bowl Sub-component
// ----------------------------------------------------------
function BowlArea({
    bowlIngredientIds,
    allIngredients,
    onRemoveFromBowl,
}: {
    bowlIngredientIds: string[];
    allIngredients: IngredientState[];
    onRemoveFromBowl: (id: string) => void;
}) {
    const { isOver, setNodeRef } = useDroppable({
        id: 'bowl-dropzone',
        data: { type: 'bowl' },
    });

    const bowlIngredients = bowlIngredientIds
        .map((id) => allIngredients.find((i) => i.id === id))
        .filter(Boolean) as IngredientState[];

    return (
        <div className="bowl-area">
            <h3 className="bowl-area-title">🥣 ボウル（配列）</h3>
            <div
                ref={setNodeRef}
                className={`bowl-dropzone ${isOver ? 'drag-over' : ''} ${bowlIngredients.length > 0 ? 'has-items' : ''}`}
            >
                {bowlIngredients.length === 0 ? (
                    <span className="bowl-placeholder">
                        食材をここにドラッグして入れよう
                    </span>
                ) : (
                    bowlIngredients.map((ing) => (
                        <div
                            key={ing.id}
                            className="card ingredient-card"
                            style={{ cursor: 'pointer', padding: '4px 8px', minWidth: 'auto' }}
                            onClick={() => onRemoveFromBowl(ing.id)}
                            title="クリックでボウルから取り出す"
                        >
                            <span className="card-icon" style={{ fontSize: '1.5rem' }}>
                                {ing.icon}
                            </span>
                        </div>
                    ))
                )}
            </div>
            <div className="bowl-label">
                bowl = [{bowlIngredients.map((i) => `"${i.name}"`).join(', ')}]
            </div>
        </div>
    );
}

