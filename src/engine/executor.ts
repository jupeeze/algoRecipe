// ============================================================
// RoboChef — Command Executor
// ============================================================
// ユーザーが組み立てた Command[] を逐次実行し、
// 状態遷移の記録（TimelineEvent[]）を生成する。
// UIとは完全に分離されており、実行は同期的に完了する。

import type {
    Command,
    IngredientState,
    TimelineEvent,
    ExecutionResult,
    AnimationType,
    BowlState,
} from './types';
import { applyAction, applyMix } from './commands';

// ----------------------------------------------------------
// Animation mapping
// ----------------------------------------------------------
const animationMap: Record<string, AnimationType> = {
    CUT: 'cut',
    BOIL: 'boil',
    FRY: 'fry',
    STEAM: 'steam',
    MIX: 'mix',
    SEASON: 'season',
};

const ANIMATION_DURATION = 800; // ms

// ----------------------------------------------------------
// Executor
// ----------------------------------------------------------
export interface ExecutorContext {
    ingredients: IngredientState[];
    bowl: BowlState;
}

/**
 * コマンドキューを実行し、タイムライン（演出データ）を生成する。
 * 描画とは完全に分離された純粋な計算。
 */
export function executeCommands(
    commands: Command[],
    initialContext: ExecutorContext,
): ExecutionResult {
    const timeline: TimelineEvent[] = [];
    let currentIngredients = [...initialContext.ingredients.map((i) => ({ ...i }))];
    let success = true;

    for (const command of commands) {
        const beforeState = currentIngredients.map((i) => ({ ...i }));

        try {
            if (command.actionType === 'MIX') {
                // MIX: ボウル操作 — 対象食材をまとめて混ぜる
                const targetIds = command.useBowl
                    ? initialContext.bowl.ingredientIds
                    : command.targetIds;

                if (targetIds.length < 2) {
                    throw new Error('MIX には2つ以上の食材が必要です');
                }

                currentIngredients = applyMix(currentIngredients, targetIds);
            } else {
                // 通常のアクション: 対象食材それぞれに適用
                const targetIds = command.useBowl
                    ? initialContext.bowl.ingredientIds
                    : command.targetIds;

                if (targetIds.length === 0) {
                    throw new Error('対象の食材が指定されていません');
                }

                const targetSet = new Set(targetIds);
                currentIngredients = currentIngredients.map((ing) => {
                    if (!targetSet.has(ing.id)) {
                        return ing;
                    }
                    return applyAction(command.actionType, ing, command.params);
                });
            }

            timeline.push({
                command,
                beforeState,
                afterState: currentIngredients.map((i) => ({ ...i })),
                animation: animationMap[command.actionType] ?? 'error',
                duration: ANIMATION_DURATION,
            });
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : '不明なエラー';

            timeline.push({
                command,
                beforeState,
                afterState: beforeState, // エラー時は状態を変更しない
                animation: 'error',
                duration: ANIMATION_DURATION,
                error: errorMessage,
            });

            success = false;
            // エラー時は残りのコマンドは実行しない
            break;
        }
    }

    return {
        finalState: currentIngredients,
        timeline,
        success,
    };
}
