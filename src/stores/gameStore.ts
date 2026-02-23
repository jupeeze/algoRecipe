// ============================================================
// RoboChef — Game Store (Zustand)
// ============================================================
// ゲーム全体の状態管理。UIからエンジンへの橋渡し役。

import { create } from 'zustand';
import { produce } from 'immer';
import type {
    GameState,
    Command,
    IngredientState,
    IngredientId,
    LevelData,
    LevelId,
} from '../engine/types';
import { createIngredient } from '../engine/types';
import { executeCommands } from '../engine/executor';
import { evaluateRecipe, type EvaluationResult } from '../engine/evaluator';

// ----------------------------------------------------------
// Store Interface
// ----------------------------------------------------------
interface GameStore extends GameState {
    /** レベルデータ（現在ロード中のもの） */
    levelData: LevelData | null;
    /** 評価結果 */
    evaluationResult: EvaluationResult | null;
    /** レベルごとのスター記録 */
    stars: Record<LevelId, number>;

    // Actions
    /** レベルをロードして初期状態にセットする */
    loadLevel: (level: LevelData) => void;
    /** コマンドキューにコマンドを追加する */
    addCommand: (command: Command) => void;
    /** コマンドキューからコマンドを削除する */
    removeCommand: (index: number) => void;
    /** コマンドキュー内のコマンドを並べ替える */
    reorderCommands: (fromIndex: number, toIndex: number) => void;
    /** ボウルに食材を追加する */
    addToBowl: (ingredientId: IngredientId) => void;
    /** ボウルから食材を取り出す */
    removeFromBowl: (ingredientId: IngredientId) => void;
    /** コマンドキューを一括実行する */
    executeAll: () => void;
    /** ステップ実行を開始する */
    startStepExecution: () => void;
    /** 次のステップを実行する */
    executeStep: () => void;
    /** ゲームをリセットする（現在のレベルを最初から） */
    reset: () => void;
}

// ----------------------------------------------------------
// Initial State
// ----------------------------------------------------------
const initialGameState: Omit<GameState, 'levelId'> & { levelId: string } = {
    levelId: '',
    ingredients: [],
    bowl: { ingredientIds: [] },
    commandQueue: [],
    phase: 'building',
    isCleared: false,
    isStepMode: false,
    stepIndex: -1,
};

// ----------------------------------------------------------
// Store
// ----------------------------------------------------------
export const useGameStore = create<GameStore>((set, get) => ({
    ...initialGameState,
    levelData: null,
    evaluationResult: null,
    stars: {},

    loadLevel: (level: LevelData) => {
        const ingredients: IngredientState[] = level.ingredients.map((def) =>
            createIngredient(def.id, def.name, def.icon),
        );

        set({
            levelId: level.id,
            levelData: level,
            ingredients,
            bowl: { ingredientIds: [] },
            commandQueue: [],
            phase: 'building',
            executionResult: undefined,
            evaluationResult: null,
            isCleared: false,
            isStepMode: false,
            stepIndex: -1,
        });
    },

    addCommand: (command: Command) => {
        set(
            produce((state: GameStore) => {
                state.commandQueue.push(command);
            }),
        );
    },

    removeCommand: (index: number) => {
        set(
            produce((state: GameStore) => {
                state.commandQueue.splice(index, 1);
            }),
        );
    },

    reorderCommands: (fromIndex: number, toIndex: number) => {
        set(
            produce((state: GameStore) => {
                const [moved] = state.commandQueue.splice(fromIndex, 1);
                state.commandQueue.splice(toIndex, 0, moved);
            }),
        );
    },

    addToBowl: (ingredientId: IngredientId) => {
        set(
            produce((state: GameStore) => {
                if (!state.bowl.ingredientIds.includes(ingredientId)) {
                    state.bowl.ingredientIds.push(ingredientId);
                }
            }),
        );
    },

    removeFromBowl: (ingredientId: IngredientId) => {
        set(
            produce((state: GameStore) => {
                state.bowl.ingredientIds = state.bowl.ingredientIds.filter(
                    (id) => id !== ingredientId,
                );
            }),
        );
    },

    executeAll: () => {
        const { commandQueue, ingredients, bowl, levelData } = get();

        if (!levelData) return;

        // Phase: 実行中
        set({ phase: 'executing', isStepMode: false });

        // エンジンでコマンドを実行
        const result = executeCommands(commandQueue, { ingredients, bowl });

        // レシピ判定（スター評価付き）
        const evaluationResult = evaluateRecipe(
            result.finalState,
            levelData.recipe,
            commandQueue,
            levelData.optimalCommandCount,
            levelData.bonusConditions,
            result.success,
        );

        // スター記録を更新（ベストのみ保存）
        const currentStars = get().stars;
        const prevBest = currentStars[levelData.id] ?? 0;
        const newStars = {
            ...currentStars,
            [levelData.id]: Math.max(prevBest, evaluationResult.stars),
        };

        // 結果を反映
        set({
            phase: 'result',
            executionResult: result,
            evaluationResult,
            ingredients: result.finalState,
            isCleared: evaluationResult.passed,
            stars: newStars,
        });
    },

    startStepExecution: () => {
        const { commandQueue, ingredients, bowl, levelData } = get();

        if (!levelData || commandQueue.length === 0) return;

        // 全コマンドを実行してタイムラインを生成（表示用）
        const result = executeCommands(commandQueue, { ingredients, bowl });

        set({
            phase: 'executing',
            isStepMode: true,
            stepIndex: 0,
            executionResult: result,
            // ステップモードでは最初のステップの afterState を表示
            ingredients: result.timeline.length > 0
                ? result.timeline[0].afterState.map((i) => ({ ...i }))
                : ingredients,
        });
    },

    executeStep: () => {
        const { stepIndex, executionResult, levelData, commandQueue } = get();

        if (!executionResult || !levelData) return;

        const nextIndex = stepIndex + 1;

        if (nextIndex >= executionResult.timeline.length) {
            // 全ステップ完了 → 結果判定
            const evaluationResult = evaluateRecipe(
                executionResult.finalState,
                levelData.recipe,
                commandQueue,
                levelData.optimalCommandCount,
                levelData.bonusConditions,
                executionResult.success,
            );

            const currentStars = get().stars;
            const prevBest = currentStars[levelData.id] ?? 0;
            const newStars = {
                ...currentStars,
                [levelData.id]: Math.max(prevBest, evaluationResult.stars),
            };

            set({
                phase: 'result',
                evaluationResult,
                ingredients: executionResult.finalState,
                isCleared: evaluationResult.passed,
                isStepMode: false,
                stars: newStars,
            });
        } else {
            // 次のステップの結果を表示
            const nextEvent = executionResult.timeline[nextIndex];
            set({
                stepIndex: nextIndex,
                ingredients: nextEvent.afterState.map((i) => ({ ...i })),
            });
        }
    },

    reset: () => {
        const { levelData } = get();
        if (levelData) {
            get().loadLevel(levelData);
        }
    },
}));
