// ============================================================
// RoboChef — Evaluator Unit Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { createIngredient } from '../../src/engine/types';
import type { Recipe, IngredientState, Command, BonusCondition } from '../../src/engine/types';
import { evaluateRecipe, matchCondition, evaluateStars, checkBonusCondition } from '../../src/engine/evaluator';

describe('matchCondition', () => {
    it('切られた食材が期待通りならマッチする', () => {
        const ingredients: IngredientState[] = [
            { ...createIngredient('carrot', 'にんじん', '🥕'), isCut: true },
        ];

        const result = matchCondition(ingredients, {
            ingredientName: 'にんじん',
            expected: { isCut: true },
        });

        expect(result).toBe(true);
    });

    it('切られていない食材は isCut: true にマッチしない', () => {
        const ingredients: IngredientState[] = [
            createIngredient('carrot', 'にんじん', '🥕'),
        ];

        const result = matchCondition(ingredients, {
            ingredientName: 'にんじん',
            expected: { isCut: true },
        });

        expect(result).toBe(false);
    });

    it('存在しない食材名はマッチしない', () => {
        const ingredients: IngredientState[] = [
            createIngredient('carrot', 'にんじん', '🥕'),
        ];

        const result = matchCondition(ingredients, {
            ingredientName: 'たまねぎ',
            expected: { isCut: true },
        });

        expect(result).toBe(false);
    });

    it('複数条件（isCut + cookMethod）を同時にチェックできる', () => {
        const ingredients: IngredientState[] = [
            {
                ...createIngredient('carrot', 'にんじん', '🥕'),
                isCut: true,
                isCooked: true,
                cookMethod: 'fried',
            },
        ];

        const result = matchCondition(ingredients, {
            ingredientName: 'にんじん',
            expected: { isCut: true, isCooked: true, cookMethod: 'fried' },
        });

        expect(result).toBe(true);
    });

    it('cookMethodが異なるとマッチしない', () => {
        const ingredients: IngredientState[] = [
            {
                ...createIngredient('carrot', 'にんじん', '🥕'),
                isCut: true,
                isCooked: true,
                cookMethod: 'boiled',
            },
        ];

        const result = matchCondition(ingredients, {
            ingredientName: 'にんじん',
            expected: { cookMethod: 'fried' },
        });

        expect(result).toBe(false);
    });
});

describe('evaluateRecipe', () => {
    const recipe: Recipe = {
        conditions: [
            { ingredientName: 'にんじん', expected: { isCut: true } },
            { ingredientName: 'トマト', expected: { isCut: true } },
        ],
    };

    it('全条件を満たしたらクリア', () => {
        const ingredients: IngredientState[] = [
            { ...createIngredient('carrot', 'にんじん', '🥕'), isCut: true },
            { ...createIngredient('tomato', 'トマト', '🍅'), isCut: true },
        ];

        const result = evaluateRecipe(ingredients, recipe);

        expect(result.passed).toBe(true);
        expect(result.score.passed).toBe(2);
        expect(result.score.total).toBe(2);
    });

    it('一部の条件しか満たしていないとクリアできない', () => {
        const ingredients: IngredientState[] = [
            { ...createIngredient('carrot', 'にんじん', '🥕'), isCut: true },
            createIngredient('tomato', 'トマト', '🍅'), // 切ってない
        ];

        const result = evaluateRecipe(ingredients, recipe);

        expect(result.passed).toBe(false);
        expect(result.score.passed).toBe(1);
        expect(result.score.total).toBe(2);
        expect(result.details[0].passed).toBe(true);
        expect(result.details[1].passed).toBe(false);
    });

    it('どちらも満たしていないと0点', () => {
        const ingredients: IngredientState[] = [
            createIngredient('carrot', 'にんじん', '🥕'),
            createIngredient('tomato', 'トマト', '🍅'),
        ];

        const result = evaluateRecipe(ingredients, recipe);

        expect(result.passed).toBe(false);
        expect(result.score.passed).toBe(0);
    });

    it('クリア時にスター評価が計算される', () => {
        const ingredients: IngredientState[] = [
            { ...createIngredient('carrot', 'にんじん', '🥕'), isCut: true },
            { ...createIngredient('tomato', 'トマト', '🍅'), isCut: true },
        ];

        const commands: Command[] = [
            { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
            { actionType: 'CUT', targetIds: ['tomato'], useBowl: false },
        ];

        const result = evaluateRecipe(ingredients, recipe, commands, 2);

        expect(result.passed).toBe(true);
        expect(result.stars).toBe(2); // 最適コマンド数ちょうど → ★★
    });

    it('未クリア時はスター0', () => {
        const ingredients: IngredientState[] = [
            createIngredient('carrot', 'にんじん', '🥕'),
            createIngredient('tomato', 'トマト', '🍅'),
        ];

        const result = evaluateRecipe(ingredients, recipe);

        expect(result.stars).toBe(0);
    });
});

describe('evaluateStars', () => {
    const commands: Command[] = [
        { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
        { actionType: 'CUT', targetIds: ['tomato'], useBowl: false },
    ];

    it('未クリアは★0', () => {
        expect(evaluateStars(false, 2, 2, undefined, commands, true)).toBe(0);
    });

    it('クリアだがコマンド過多は★1', () => {
        const manyCommands: Command[] = [...commands, ...commands];
        expect(evaluateStars(true, 4, 2, undefined, manyCommands, true)).toBe(1);
    });

    it('最適コマンド数以内でボーナスなしは★2', () => {
        expect(evaluateStars(true, 2, 2, undefined, commands, true)).toBe(2);
    });

    it('最適コマンド数以内でボーナス条件もクリアは★3', () => {
        const bonusConditions: BonusCondition[] = [{ type: 'noErrors' }];
        expect(evaluateStars(true, 2, 2, bonusConditions, commands, true)).toBe(3);
    });

    it('最適だがボーナス条件未達は★2', () => {
        const bonusConditions: BonusCondition[] = [{ type: 'useBowl' }];
        expect(evaluateStars(true, 2, 2, bonusConditions, commands, true)).toBe(2);
    });
});

describe('checkBonusCondition', () => {
    it('useBowl: ボウル使用コマンドあり → true', () => {
        const commands: Command[] = [
            { actionType: 'FRY', targetIds: [], useBowl: true },
        ];
        expect(checkBonusCondition({ type: 'useBowl' }, commands, true)).toBe(true);
    });

    it('useBowl: ボウル未使用 → false', () => {
        const commands: Command[] = [
            { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
        ];
        expect(checkBonusCondition({ type: 'useBowl' }, commands, true)).toBe(false);
    });

    it('maxCommands: コマンド数以内 → true', () => {
        const commands: Command[] = [
            { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
        ];
        expect(checkBonusCondition({ type: 'maxCommands', value: 3 }, commands, true)).toBe(true);
    });

    it('maxCommands: コマンド数超過 → false', () => {
        const commands: Command[] = [
            { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
            { actionType: 'CUT', targetIds: ['tomato'], useBowl: false },
            { actionType: 'FRY', targetIds: ['carrot'], useBowl: false },
            { actionType: 'FRY', targetIds: ['tomato'], useBowl: false },
        ];
        expect(checkBonusCondition({ type: 'maxCommands', value: 3 }, commands, true)).toBe(false);
    });

    it('noErrors: 実行成功 → true', () => {
        expect(checkBonusCondition({ type: 'noErrors' }, [], true)).toBe(true);
    });

    it('noErrors: 実行失敗 → false', () => {
        expect(checkBonusCondition({ type: 'noErrors' }, [], false)).toBe(false);
    });
});

