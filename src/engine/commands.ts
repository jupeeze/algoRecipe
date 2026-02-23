// ============================================================
// RoboChef — Command Definitions
// ============================================================
// 各アクション（関数）が食材（引数）に対してどのような状態変化を起こすかを定義。
// 純粋関数として実装し、副作用を持たない。

import type { IngredientState, ActionType, IngredientId } from './types';

// ----------------------------------------------------------
// Command Applier: 1つのアクションを1つの食材に適用する
// ----------------------------------------------------------
export type CommandApplier = (
    ingredient: IngredientState,
    params?: Record<string, string>,
) => IngredientState;

/**
 * CUT: 食材を切る
 * 前提条件: まだ切られていないこと
 */
export const applyCut: CommandApplier = (ingredient) => {
    if (ingredient.isCut) {
        return ingredient; // 既に切られている → 何もしない
    }
    return { ...ingredient, isCut: true };
};

/**
 * BOIL: 食材を茹でる
 * 前提条件: まだ加熱されていないこと
 */
export const applyBoil: CommandApplier = (ingredient) => {
    if (ingredient.isCooked) {
        return ingredient;
    }
    return { ...ingredient, isCooked: true, cookMethod: 'boiled' };
};

/**
 * FRY: 食材を炒める
 * 前提条件: まだ加熱されていないこと
 */
export const applyFry: CommandApplier = (ingredient) => {
    if (ingredient.isCooked) {
        return ingredient;
    }
    return { ...ingredient, isCooked: true, cookMethod: 'fried' };
};

/**
 * STEAM: 食材を蒸す
 * 前提条件: まだ加熱されていないこと
 */
export const applySteam: CommandApplier = (ingredient) => {
    if (ingredient.isCooked) {
        return ingredient;
    }
    return { ...ingredient, isCooked: true, cookMethod: 'steamed' };
};

/**
 * SEASON: 食材に味付けをする
 */
export const applySeason: CommandApplier = (ingredient, params) => {
    const seasoning = params?.['seasoning'];
    if (!seasoning) {
        return ingredient;
    }
    return { ...ingredient, seasoning };
};

// ----------------------------------------------------------
// Applier Registry
// ----------------------------------------------------------
const applierMap: Record<ActionType, CommandApplier> = {
    CUT: applyCut,
    BOIL: applyBoil,
    FRY: applyFry,
    STEAM: applySteam,
    SEASON: applySeason,
    MIX: applyCut, // MIX は applyMix で別処理（下記）
};

/**
 * 指定アクションを食材に適用する
 */
export function applyAction(
    type: ActionType,
    ingredient: IngredientState,
    params?: Record<string, string>,
): IngredientState {
    const applier = applierMap[type];
    if (!applier || type === 'MIX') {
        return ingredient; // MIXは別ロジック
    }
    return applier(ingredient, params);
}

/**
 * MIX: ボウル内の食材を混ぜ合わせる
 * ボウル操作は複数食材を一度に扱うため、個別のapplierではなく専用関数。
 */
export function applyMix(
    ingredients: IngredientState[],
    targetIds: IngredientId[],
): IngredientState[] {
    // 対象食材のIDセット
    const targetSet = new Set(targetIds);

    return ingredients.map((ing) => {
        if (!targetSet.has(ing.id)) {
            return ing; // 対象外
        }
        // 自分以外の対象食材IDを mixedWith に記録
        const others = targetIds.filter((id) => id !== ing.id);
        return {
            ...ing,
            isMixed: true,
            mixedWith: [...new Set([...ing.mixedWith, ...others])],
        };
    });
}
