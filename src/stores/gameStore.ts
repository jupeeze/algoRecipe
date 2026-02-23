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
    /** コマンドキューを実行する */
    execute: () => void;
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
};

// ----------------------------------------------------------
// Store
// ----------------------------------------------------------
export const useGameStore = create<GameStore>((set, get) => ({
    ...initialGameState,
    levelData: null,
    evaluationResult: null,

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

    execute: () => {
        const { commandQueue, ingredients, bowl, levelData } = get();

        if (!levelData) return;

        // Phase: 実行中
        set({ phase: 'executing' });

        // エンジンでコマンドを実行
        const result = executeCommands(commandQueue, { ingredients, bowl });

        // レシピ判定
        const evaluationResult = evaluateRecipe(
            result.finalState,
            levelData.recipe,
        );

        // 結果を反映
        set({
            phase: 'result',
            executionResult: result,
            evaluationResult,
            ingredients: result.finalState,
            isCleared: evaluationResult.passed,
        });
    },

    reset: () => {
        const { levelData } = get();
        if (levelData) {
            get().loadLevel(levelData);
        }
    },
}));
