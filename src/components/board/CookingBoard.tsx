// ============================================================
// RoboChef — CookingBoard Component
// ============================================================
// ゲームのメインエリア。コマンドキューの構築・ボウル操作・実行を行う。

import { useState, useCallback } from 'react';
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
import type { ActionDefinition, IngredientState, ActionType } from '../../engine/types';

// Available levels
import level01 from '../../data/levels/level-01.json';
import level02 from '../../data/levels/level-02.json';
import level03 from '../../data/levels/level-03.json';
import type { LevelData } from '../../engine/types';

const levels: LevelData[] = [
    level01 as unknown as LevelData,
    level02 as unknown as LevelData,
    level03 as unknown as LevelData,
];

// ----------------------------------------------------------
// Command Builder State (local UI state)
// ----------------------------------------------------------
interface CommandSlots {
    [slotId: string]: IngredientState | undefined;
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
        loadLevel,
        addCommand,
        removeCommand,
        addToBowl,
        removeFromBowl,
        execute,
        reset,
    } = useGameStore();

    // ドラッグ中の食材
    const [activeIngredient, setActiveIngredient] =
        useState<IngredientState | null>(null);

    // 各アクションカードのスロットの中身（ビルドフェーズ用のローカル状態）
    const [slots, setSlots] = useState<CommandSlots>({});

    // Level index
    const [currentLevelIndex, setCurrentLevelIndex] = useState(0);

    // dnd-kit sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    );

    // Load initial level
    if (!levelData) {
        loadLevel(levels[0]);
        return null;
    }

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const data = active.data.current;
        if (data?.type === 'ingredient') {
            setActiveIngredient(data.ingredient);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
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
    };

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

            addCommand({
                actionType: action.type as ActionType,
                targetIds: useBowl ? [] : slotIngredients.map((i) => i.id),
                useBowl,
            });

            // スロットをクリア
            const newSlots = { ...slots };
            for (let i = 0; i < action.slotCount; i++) {
                delete newSlots[`${action.id}-slot-${i}`];
            }
            setSlots(newSlots);
        },
        [slots, bowl, addCommand],
    );

    const handleReset = () => {
        setSlots({});
        reset();
    };

    const handleNextLevel = () => {
        const nextIndex = currentLevelIndex + 1;
        if (nextIndex < levels.length) {
            setCurrentLevelIndex(nextIndex);
            setSlots({});
            loadLevel(levels[nextIndex]);
        }
    };

    const handleSelectLevel = (index: number) => {
        setCurrentLevelIndex(index);
        setSlots({});
        loadLevel(levels[index]);
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
                        <span className="game-header-level">
                            Level {currentLevelIndex + 1}: {levelData.title}
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
                                    Level {i + 1}: {l.title}
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
                                    {action.acceptsBowl && (
                                        <span
                                            style={{
                                                fontSize: 'var(--font-size-xs)',
                                                color: 'var(--color-text-dim)',
                                                marginLeft: 'auto',
                                            }}
                                        >
                                            🥣 ボウル対応
                                        </span>
                                    )}
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
                                <button
                                    className="execute-button"
                                    style={{
                                        marginTop: 'var(--space-sm)',
                                        padding: '8px 16px',
                                        fontSize: 'var(--font-size-sm)',
                                        background: 'var(--gradient-accent)',
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
                                    const action = levelData.availableActions.find(
                                        (a) => a.type === cmd.actionType,
                                    );
                                    return (
                                        <div key={index} className="command-item">
                                            <span className="command-number">{index + 1}</span>
                                            <span style={{ fontSize: '1.5rem' }}>
                                                {action?.icon ?? '❓'}
                                            </span>
                                            <span style={{ fontWeight: 600 }}>
                                                {action?.label ?? cmd.actionType}
                                            </span>
                                            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                                                (
                                                {cmd.useBowl
                                                    ? 'ボウル全体'
                                                    : cmd.targetIds
                                                        .map((id) => ingredients.find((i) => i.id === id)?.icon ?? id)
                                                        .join(', ')}
                                                )
                                            </span>
                                            <button
                                                className="command-remove"
                                                onClick={() => removeCommand(index)}
                                                title="削除"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Execute Button */}
                    <div className="execute-button-container">
                        <button
                            className="execute-button"
                            onClick={execute}
                            disabled={commandQueue.length === 0 || phase !== 'building'}
                        >
                            ▶ 実行する！
                        </button>
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
