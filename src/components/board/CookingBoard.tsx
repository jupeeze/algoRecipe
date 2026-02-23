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
import { CardSlot } from '../cards/CardSlot';
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

// ----------------------------------------------------------
// Command Builder State (local UI state)
// ----------------------------------------------------------
interface CommandSlots {
    [slotId: string]: IngredientState | undefined;
}

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

    // 各アクションカードのスロットの中身（ビルドフェーズ用のローカル状態）
    const [slots, setSlots] = useState<CommandSlots>({});

    // パラメータ選択
    const [paramSelections, setParamSelections] = useState<ParamSelections>({});

    // Level index
    const [currentLevelIndex, setCurrentLevelIndex] = useState(0);

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
        // Simulate state after each command to validate progressively
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
            // Simulate the command effect for next validation
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
        setActiveIngredient(null);

        if (!over || !activeIngredient) return;

        const overData = over.data.current;

        if (overData?.type === 'slot') {
            // スロットに食材をドロップ
            setSlots((prev) => ({
                ...prev,
                [overData.slotId]: activeIngredient,
            }));
        } else if (overData?.type === 'bowl') {
            // ボウルに食材をドロップ
            addToBowl(activeIngredient.id);
        }
    }, [activeIngredient, addToBowl]);

    const handleAddCommand = useCallback(
        (action: ActionDefinition) => {
            // スロットに入っている食材を集める
            const slotIngredients: IngredientState[] = [];
            for (let i = 0; i < action.slotCount; i++) {
                const slotId = `${action.id}-slot-${i}`;
                const ing = slots[slotId];
                if (ing) {
                    slotIngredients.push(ing);
                }
            }

            if (slotIngredients.length === 0 && !action.acceptsBowl) {
                return; // 食材がセットされていない
            }

            const useBowl = action.acceptsBowl && slotIngredients.length === 0 && bowl.ingredientIds.length > 0;

            // パラメータを取得
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
                targetIds: useBowl ? [] : slotIngredients.map((i) => i.id),
                useBowl,
                ...(Object.keys(params).length > 0 ? { params } : {}),
            });

            // スロットをクリア
            const newSlots = { ...slots };
            for (let i = 0; i < action.slotCount; i++) {
                delete newSlots[`${action.id}-slot-${i}`];
            }
            setSlots(newSlots);
        },
        [slots, bowl, addCommand, paramSelections],
    );

    // Null guard (while loading)
    if (!levelData) return null;

    const handleReset = () => {
        setSlots({});
        setParamSelections({});
        reset();
    };

    const handleNextLevel = () => {
        const nextIndex = currentLevelIndex + 1;
        if (nextIndex < levels.length) {
            setCurrentLevelIndex(nextIndex);
            setSlots({});
            setParamSelections({});
            loadLevel(levels[nextIndex]);
        }
    };

    const handleSelectLevel = (index: number) => {
        setCurrentLevelIndex(index);
        setSlots({});
        setParamSelections({});
        loadLevel(levels[index]);
    };

    // レベルごとのスター表示ヘルパー
    const getLevelStars = (levelId: string) => {
        const s = stars[levelId] ?? 0;
        return '⭐'.repeat(s) + '☆'.repeat(3 - s);
    };

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
                        {/* Level selector */}
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
                        <button className="reset-button" onClick={handleReset}>
                            🔄 リセット
                        </button>
                    </div>
                </header>

                {/* Left: Recipe Panel */}
                <RecipePanel level={levelData} evaluationResult={evaluationResult} />

                {/* Center: Cooking Board */}
                <div className="cooking-board">
                    {/* Action Cards (with slots) */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--space-md)',
                        }}
                    >
                        {levelData.availableActions.map((action) => (
                            <div key={action.id} className="action-card card">
                                <div className="action-card-header">
                                    <span className="action-icon">{action.icon}</span>
                                    <span className="action-label">{action.label}</span>
                                    <span className="action-signature">
                                        {action.type.toLowerCase()}({action.acceptsBowl ? 'bowl' : 'ingredient'})
                                    </span>
                                </div>
                                <div className="action-card-slots">
                                    {Array.from({ length: action.slotCount }, (_, i) => {
                                        const slotId = `${action.id}-slot-${i}`;
                                        return (
                                            <CardSlot
                                                key={slotId}
                                                slotId={slotId}
                                                ingredient={slots[slotId]}
                                                onRemove={() =>
                                                    setSlots((prev) => {
                                                        const next = { ...prev };
                                                        delete next[slotId];
                                                        return next;
                                                    })
                                                }
                                            />
                                        );
                                    })}
                                    {action.acceptsBowl && action.slotCount === 0 && (
                                        <div
                                            style={{
                                                fontSize: 'var(--font-size-sm)',
                                                color: 'var(--color-text-dim)',
                                                padding: 'var(--space-sm)',
                                            }}
                                        >
                                            ボウルの中身をまとめて処理
                                        </div>
                                    )}
                                </div>
                                {/* Parameter selectors (for SEASON etc.) */}
                                {action.paramSlots && action.paramSlots.length > 0 && (
                                    <div className="action-card-params">
                                        {action.paramSlots.map((param) => (
                                            <div key={param.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
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
                                <button
                                    className="execute-button"
                                    style={{
                                        marginTop: 'var(--space-sm)',
                                        padding: '6px 14px',
                                        fontSize: 'var(--font-size-sm)',
                                    }}
                                    onClick={() => handleAddCommand(action)}
                                    disabled={phase !== 'building'}
                                >
                                    ＋ キューに追加
                                </button>
                            </div>
                        ))}
                    </div>

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
                                    アクションカードに食材をセットして
                                    <br />
                                    「キューに追加」してね
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
                                            {/* Validation warnings */}
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
                                        marginLeft: 'var(--space-md)',
                                    }}
                                >
                                    ▶▶ ステップ実行
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Right: Card Deck */}
                <div className="card-deck">
                    <div className="card-deck-section">
                        <h3 className="card-deck-section-title">🥕 食材カード</h3>
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

