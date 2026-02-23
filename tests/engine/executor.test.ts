// ============================================================
// RoboChef — Executor Unit Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { createIngredient } from '../../src/engine/types';
import type { Command } from '../../src/engine/types';
import { executeCommands, validateCommand, flattenCommands } from '../../src/engine/executor';

describe('executeCommands', () => {
    const carrot = createIngredient('carrot', 'にんじん', '🥕');
    const tomato = createIngredient('tomato', 'トマト', '🍅');

    it('CUT コマンドで食材が切られる', () => {
        const commands: Command[] = [
            { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
        ];

        const result = executeCommands(commands, {
            ingredients: [carrot],
            bowl: { ingredientIds: [] },
        });

        expect(result.success).toBe(true);
        expect(result.finalState[0].isCut).toBe(true);
        expect(result.timeline).toHaveLength(1);
        expect(result.timeline[0].animation).toBe('cut');
    });

    it('FRY コマンドで食材が炒められる', () => {
        const commands: Command[] = [
            { actionType: 'FRY', targetIds: ['carrot'], useBowl: false },
        ];

        const result = executeCommands(commands, {
            ingredients: [carrot],
            bowl: { ingredientIds: [] },
        });

        expect(result.success).toBe(true);
        expect(result.finalState[0].isCooked).toBe(true);
        expect(result.finalState[0].cookMethod).toBe('fried');
    });

    it('複数コマンドを順序通り実行する（CUT → FRY）', () => {
        const commands: Command[] = [
            { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
            { actionType: 'FRY', targetIds: ['carrot'], useBowl: false },
        ];

        const result = executeCommands(commands, {
            ingredients: [carrot],
            bowl: { ingredientIds: [] },
        });

        expect(result.success).toBe(true);
        expect(result.timeline).toHaveLength(2);
        expect(result.finalState[0].isCut).toBe(true);
        expect(result.finalState[0].isCooked).toBe(true);
        expect(result.finalState[0].cookMethod).toBe('fried');
    });

    it('複数の食材に対してそれぞれコマンドを実行できる', () => {
        const commands: Command[] = [
            { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
            { actionType: 'CUT', targetIds: ['tomato'], useBowl: false },
        ];

        const result = executeCommands(commands, {
            ingredients: [carrot, tomato],
            bowl: { ingredientIds: [] },
        });

        expect(result.success).toBe(true);
        expect(result.finalState[0].isCut).toBe(true); // carrot
        expect(result.finalState[1].isCut).toBe(true); // tomato
    });

    it('ターゲットなしのコマンドはエラーになる', () => {
        const commands: Command[] = [
            { actionType: 'CUT', targetIds: [], useBowl: false },
        ];

        const result = executeCommands(commands, {
            ingredients: [carrot],
            bowl: { ingredientIds: [] },
        });

        expect(result.success).toBe(false);
        expect(result.timeline[0].error).toBeDefined();
    });

    it('MIX コマンドで食材が混ぜ合わせられる', () => {
        const commands: Command[] = [
            { actionType: 'MIX', targetIds: ['carrot', 'tomato'], useBowl: false },
        ];

        const result = executeCommands(commands, {
            ingredients: [carrot, tomato],
            bowl: { ingredientIds: [] },
        });

        expect(result.success).toBe(true);
        expect(result.finalState[0].isMixed).toBe(true);
        expect(result.finalState[0].mixedWith).toContain('tomato');
        expect(result.finalState[1].isMixed).toBe(true);
        expect(result.finalState[1].mixedWith).toContain('carrot');
    });

    it('MIX コマンドで食材が1つだけだとエラーになる', () => {
        const commands: Command[] = [
            { actionType: 'MIX', targetIds: ['carrot'], useBowl: false },
        ];

        const result = executeCommands(commands, {
            ingredients: [carrot],
            bowl: { ingredientIds: [] },
        });

        expect(result.success).toBe(false);
        expect(result.timeline[0].error).toContain('2つ以上');
    });

    it('SEASON コマンドで味付けできる', () => {
        const commands: Command[] = [
            {
                actionType: 'SEASON',
                targetIds: ['carrot'],
                useBowl: false,
                params: { seasoning: '塩' },
            },
        ];

        const result = executeCommands(commands, {
            ingredients: [carrot],
            bowl: { ingredientIds: [] },
        });

        expect(result.success).toBe(true);
        expect(result.finalState[0].seasoning).toBe('塩');
    });

    it('タイムラインに beforeState と afterState が記録される', () => {
        const commands: Command[] = [
            { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
        ];

        const result = executeCommands(commands, {
            ingredients: [carrot],
            bowl: { ingredientIds: [] },
        });

        const event = result.timeline[0];
        expect(event.beforeState[0].isCut).toBe(false);
        expect(event.afterState[0].isCut).toBe(true);
    });

    it('ボウルモード（useBowl=true）でボウル内の食材を対象にする', () => {
        const commands: Command[] = [
            { actionType: 'FRY', targetIds: [], useBowl: true },
        ];

        const result = executeCommands(commands, {
            ingredients: [carrot, tomato],
            bowl: { ingredientIds: ['carrot', 'tomato'] },
        });

        expect(result.success).toBe(true);
        expect(result.finalState[0].isCooked).toBe(true);
        expect(result.finalState[1].isCooked).toBe(true);
    });

    it('CALL_RECIPE のサブコマンドが展開されて実行される', () => {
        const commands: Command[] = [
            {
                actionType: 'CALL_RECIPE',
                targetIds: [],
                useBowl: false,
                recipeName: 'カットレシピ',
                subCommands: [
                    { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
                    { actionType: 'CUT', targetIds: ['tomato'], useBowl: false },
                ],
            },
        ];

        const result = executeCommands(commands, {
            ingredients: [carrot, tomato],
            bowl: { ingredientIds: [] },
        });

        expect(result.success).toBe(true);
        expect(result.finalState[0].isCut).toBe(true);
        expect(result.finalState[1].isCut).toBe(true);
        expect(result.timeline.length).toBe(2);
    });
});

describe('validateCommand', () => {
    const carrot = createIngredient('carrot', 'にんじん', '🥕');

    it('有効なCUTコマンドはエラーなし', () => {
        const result = validateCommand(
            { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
            [carrot],
            { ingredientIds: [] },
        );

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('食材未指定はエラー', () => {
        const result = validateCommand(
            { actionType: 'CUT', targetIds: [], useBowl: false },
            [],
            { ingredientIds: [] },
        );

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('切ってない食材をFRYすると警告', () => {
        const result = validateCommand(
            { actionType: 'FRY', targetIds: ['carrot'], useBowl: false },
            [carrot],
            { ingredientIds: [] },
        );

        expect(result.valid).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('既に切られた食材にCUTすると警告', () => {
        const cutCarrot = { ...carrot, isCut: true };
        const result = validateCommand(
            { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
            [cutCarrot],
            { ingredientIds: [] },
        );

        expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('SEASONでパラメータ未指定はエラー', () => {
        const result = validateCommand(
            { actionType: 'SEASON', targetIds: ['carrot'], useBowl: false },
            [carrot],
            { ingredientIds: [] },
        );

        expect(result.valid).toBe(false);
    });

    it('CALL_RECIPEでサブコマンドなしはエラー', () => {
        const result = validateCommand(
            { actionType: 'CALL_RECIPE', targetIds: [], useBowl: false },
            [],
            { ingredientIds: [] },
        );

        expect(result.valid).toBe(false);
    });
});

describe('flattenCommands', () => {
    it('通常のコマンドはそのまま返る', () => {
        const commands: Command[] = [
            { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
        ];

        expect(flattenCommands(commands)).toEqual(commands);
    });

    it('CALL_RECIPEがサブコマンドに展開される', () => {
        const commands: Command[] = [
            {
                actionType: 'CALL_RECIPE',
                targetIds: [],
                useBowl: false,
                subCommands: [
                    { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
                    { actionType: 'FRY', targetIds: ['carrot'], useBowl: false },
                ],
            },
        ];

        const flat = flattenCommands(commands);
        expect(flat.length).toBe(2);
        expect(flat[0].actionType).toBe('CUT');
        expect(flat[1].actionType).toBe('FRY');
    });

    it('ネストされたCALL_RECIPEも再帰展開', () => {
        const commands: Command[] = [
            {
                actionType: 'CALL_RECIPE',
                targetIds: [],
                useBowl: false,
                subCommands: [
                    {
                        actionType: 'CALL_RECIPE',
                        targetIds: [],
                        useBowl: false,
                        subCommands: [
                            { actionType: 'CUT', targetIds: ['carrot'], useBowl: false },
                        ],
                    },
                ],
            },
        ];

        const flat = flattenCommands(commands);
        expect(flat.length).toBe(1);
        expect(flat[0].actionType).toBe('CUT');
    });
});
