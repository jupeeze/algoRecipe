// ============================================================
// RoboChef — State Evaluator
// ============================================================
// 最終的な食材の状態がレシピ（仕様書）の期待と一致するかを判定する。
// 手順（プロセス）の一致ではなく、状態（State）の一致で判定する。

import type {
    IngredientState,
    Recipe,
    RecipeCondition,
    BonusCondition,
    Command,
} from './types';

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
// Bonus Condition Checking
// ----------------------------------------------------------

/**
 * 1つのボーナス条件が満たされているかを判定する。
 */
export function checkBonusCondition(
    condition: BonusCondition,
    commands: Command[],
    executionSuccess: boolean,
): boolean {
    switch (condition.type) {
        case 'useBowl':
            return commands.some((cmd) => cmd.useBowl);
        case 'maxCommands':
            return commands.length <= condition.value;
        case 'noErrors':
            return executionSuccess;
    }
}

// ----------------------------------------------------------
// Star Evaluation
// ----------------------------------------------------------

/**
 * スター評価を計算する。
 * ★☆☆ = クリア
 * ★★☆ = 最適コマンド数以内でクリア
 * ★★★ = ★★ + 全ボーナス条件クリア
 */
export function evaluateStars(
    passed: boolean,
    commandCount: number,
    optimalCommandCount: number,
    bonusConditions: BonusCondition[] | undefined,
    commands: Command[],
    executionSuccess: boolean,
): 0 | 1 | 2 | 3 {
    if (!passed) return 0;

    // ★: クリア
    // ★★: 最適コマンド数以内
    const isOptimal = commandCount <= optimalCommandCount;
    if (!isOptimal) return 1;

    // ★★★: ボーナス条件もすべてクリア
    if (!bonusConditions || bonusConditions.length === 0) return 2;

    const allBonusPassed = bonusConditions.every((bc) =>
        checkBonusCondition(bc, commands, executionSuccess),
    );

    return allBonusPassed ? 3 : 2;
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
    /** スター評価 (0 = 未クリア, 1〜3) */
    stars: 0 | 1 | 2 | 3;
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
    commands: Command[] = [],
    optimalCommandCount: number = Infinity,
    bonusConditions?: BonusCondition[],
    executionSuccess: boolean = true,
): EvaluationResult {
    const details: ConditionResult[] = recipe.conditions.map((condition) => ({
        condition,
        passed: matchCondition(ingredients, condition),
    }));

    const passedCount = details.filter((d) => d.passed).length;
    const passed = passedCount === recipe.conditions.length;

    const stars = evaluateStars(
        passed,
        commands.length,
        optimalCommandCount,
        bonusConditions,
        commands,
        executionSuccess,
    );

    return {
        passed,
        details,
        score: {
            passed: passedCount,
            total: recipe.conditions.length,
        },
        stars,
    };
}
