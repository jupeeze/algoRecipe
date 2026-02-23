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
    CALL_RECIPE: 'cut', // CALL_RECIPE は展開後のアニメーションを使う
};

const ANIMATION_DURATION = 800; // ms

// ----------------------------------------------------------
// Command Validation (リアルタイムフィードバック用)
// ----------------------------------------------------------
export interface ValidationResult {
    valid: boolean;
    warnings: string[];
    errors: string[];
}

/**
 * コマンドを実行前にバリデーションする。
 * リアルタイムでUIにフィードバックを返すために使用。
 */
export function validateCommand(
    command: Command,
    ingredients: IngredientState[],
    bowl: BowlState,
): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    const targetIds = command.useBowl
        ? bowl.ingredientIds
        : command.targetIds;

    // ターゲットチェック
    if (command.actionType !== 'CALL_RECIPE') {
        if (targetIds.length === 0) {
            errors.push('対象の食材が指定されていません');
        }
    }

    // MIX チェック
    if (command.actionType === 'MIX' && targetIds.length < 2) {
        errors.push('MIX には2つ以上の食材が必要です');
    }

    // CALL_RECIPE チェック
    if (command.actionType === 'CALL_RECIPE') {
        if (!command.subCommands || command.subCommands.length === 0) {
            errors.push('レシピカードにコマンドが設定されていません');
        }
    }

    // 調理順序の警告（切ってない食材を炒めようとしている等）
    if (['FRY', 'BOIL', 'STEAM'].includes(command.actionType)) {
        for (const id of targetIds) {
            const ing = ingredients.find((i) => i.id === id);
            if (ing && !ing.isCut) {
                warnings.push(
                    `「${ing.name}」がまだ切られていません。先に切ったほうがいいかも？`,
                );
            }
            if (ing && ing.isCooked) {
                warnings.push(
                    `「${ing.name}」は既に加熱済みです`,
                );
            }
        }
    }

    // CUT の重複チェック
    if (command.actionType === 'CUT') {
        for (const id of targetIds) {
            const ing = ingredients.find((i) => i.id === id);
            if (ing && ing.isCut) {
                warnings.push(`「${ing.name}」は既に切られています`);
            }
        }
    }

    // SEASON パラメータチェック
    if (command.actionType === 'SEASON') {
        if (!command.params?.['seasoning']) {
            errors.push('味付けの調味料が指定されていません');
        }
    }

    return {
        valid: errors.length === 0,
        warnings,
        errors,
    };
}

// ----------------------------------------------------------
// Command Flattening (CALL_RECIPE の展開)
// ----------------------------------------------------------

/**
 * CALL_RECIPE コマンドをサブコマンドに展開する。
 * ネストされた CALL_RECIPE も再帰的に展開する。
 */
export function flattenCommands(commands: Command[]): Command[] {
    const result: Command[] = [];
    for (const cmd of commands) {
        if (cmd.actionType === 'CALL_RECIPE' && cmd.subCommands) {
            result.push(...flattenCommands(cmd.subCommands));
        } else {
            result.push(cmd);
        }
    }
    return result;
}

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
    // CALL_RECIPE を展開
    const flatCommands = flattenCommands(commands);

    const timeline: TimelineEvent[] = [];
    let currentIngredients = [...flatCommands.length > 0 ? initialContext.ingredients.map((i) => ({ ...i })) : initialContext.ingredients.map((i) => ({ ...i }))];
    let success = true;

    for (const command of flatCommands) {
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
