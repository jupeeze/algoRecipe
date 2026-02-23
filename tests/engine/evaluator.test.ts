// ============================================================
// RoboChef — Evaluator Unit Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { createIngredient } from '../../src/engine/types';
import type { Recipe, IngredientState } from '../../src/engine/types';
import { evaluateRecipe, matchCondition } from '../../src/engine/evaluator';

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
});
