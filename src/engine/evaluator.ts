// ============================================================
// RoboChef — State Evaluator
// ============================================================
// 最終的な食材の状態がレシピ（仕様書）の期待と一致するかを判定する。
// 手順（プロセス）の一致ではなく、状態（State）の一致で判定する。

import type { IngredientState, Recipe, RecipeCondition } from './types';

// ----------------------------------------------------------
// Condition Matching
// ----------------------------------------------------------

/**
 * 1つのレシピ条件が満たされているかを判定する。
 * ingredientName で食材を特定し、expected の各プロパティが一致するかチェック。
 */
export function matchCondition(
    ingredients: IngredientState[],
    condition: RecipeCondition,
): boolean {
    // 対象食材を名前で検索
    const target = ingredients.find(
        (ing) => ing.name === condition.ingredientName,
    );

    if (!target) {
        return false; // 食材が見つからない
    }

    const { expected } = condition;

    // 期待される各プロパティを部分一致で比較
    if (expected.isCut !== undefined && target.isCut !== expected.isCut) {
        return false;
    }
    if (expected.isCooked !== undefined && target.isCooked !== expected.isCooked) {
        return false;
    }
    if (expected.cookMethod !== undefined && target.cookMethod !== expected.cookMethod) {
        return false;
    }
    if (expected.isMixed !== undefined && target.isMixed !== expected.isMixed) {
        return false;
    }
    if (expected.seasoning !== undefined && target.seasoning !== expected.seasoning) {
        return false;
    }

    return true;
}

// ----------------------------------------------------------
// Recipe Evaluation
// ----------------------------------------------------------

export interface EvaluationResult {
    /** 全条件をクリアしたか */
    passed: boolean;
    /** 各条件の判定結果 */
    details: ConditionResult[];
    /** クリアした条件数 / 全条件数 */
    score: { passed: number; total: number };
}

export interface ConditionResult {
    condition: RecipeCondition;
    passed: boolean;
}

/**
 * レシピ（仕様書）の全条件を評価する。
 */
export function evaluateRecipe(
    ingredients: IngredientState[],
    recipe: Recipe,
): EvaluationResult {
    const details: ConditionResult[] = recipe.conditions.map((condition) => ({
        condition,
        passed: matchCondition(ingredients, condition),
    }));

    const passedCount = details.filter((d) => d.passed).length;

    return {
        passed: passedCount === recipe.conditions.length,
        details,
        score: {
            passed: passedCount,
            total: recipe.conditions.length,
        },
    };
}
