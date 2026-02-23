// ============================================================
// RoboChef — RecipePanel Component
// ============================================================
// レシピ = 仕様書。期待される最終状態を常時表示する。

import type { LevelData } from '../../engine/types';
import type { EvaluationResult } from '../../engine/evaluator';

interface RecipePanelProps {
    level: LevelData;
    evaluationResult: EvaluationResult | null;
}

/** 期待される状態を日本語で表示するヘルパー */
function describeExpected(expected: Record<string, unknown>): string {
    const parts: string[] = [];
    if (expected.isCut) parts.push('切る');
    if (expected.isCooked) {
        const method = expected.cookMethod;
        if (method === 'fried') parts.push('炒める');
        else if (method === 'boiled') parts.push('茹でる');
        else if (method === 'steamed') parts.push('蒸す');
        else parts.push('加熱する');
    }
    if (expected.isMixed) parts.push('混ぜる');
    if (expected.seasoning) parts.push(`${expected.seasoning}で味付け`);
    return parts.join(' → ');
}

/** 条件をコード風に表現するヘルパー */
function toCodeExpression(ingredientId: string, expected: Record<string, unknown>): string {
    const parts: string[] = [];
    if (expected.isCut) parts.push(`${ingredientId}.isCut === true`);
    if (expected.isCooked) parts.push(`${ingredientId}.isCooked === true`);
    if (expected.cookMethod) parts.push(`${ingredientId}.cookMethod === "${expected.cookMethod}"`);
    if (expected.isMixed) parts.push(`${ingredientId}.isMixed === true`);
    if (expected.seasoning) parts.push(`${ingredientId}.seasoning === "${expected.seasoning}"`);
    return parts.join(' && ');
}

export function RecipePanel({ level, evaluationResult }: RecipePanelProps) {
    return (
        <div className="recipe-panel">
            <h2 className="recipe-panel-title">
                📋 レシピ（仕様書）
            </h2>

            <p className="recipe-panel-description">{level.description}</p>

            <div className="learning-goal">
                <div className="learning-goal-label">💡 学習ポイント</div>
                {level.learningGoal}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {level.recipe.conditions.map((condition, index) => {
                    // 対象食材のアイコンを取得
                    const ingredientDef = level.ingredients.find(
                        (i) => i.name === condition.ingredientName,
                    );
                    const isPassed = evaluationResult?.details[index]?.passed ?? false;

                    return (
                        <div
                            key={index}
                            className={`recipe-condition ${isPassed ? 'passed' : ''}`}
                        >
                            <span className="condition-icon">
                                {ingredientDef?.icon ?? '❓'}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                    {condition.ingredientName}
                                    <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '4px', fontSize: '0.75rem' }}>
                                        {describeExpected(condition.expected as Record<string, unknown>)}
                                    </span>
                                </div>
                                <code className="condition-code">
                                    {toCodeExpression(
                                        ingredientDef?.id ?? condition.ingredientName,
                                        condition.expected as Record<string, unknown>,
                                    )}
                                </code>
                            </div>
                            <span className="condition-check">
                                {isPassed ? '✅' : '⬜'}
                            </span>
                        </div>
                    );
                })}
            </div>

            {level.hints && level.hints.length > 0 && (
                <details style={{ marginTop: 'auto' }}>
                    <summary
                        style={{
                            cursor: 'pointer',
                            color: 'var(--color-text-dim)',
                            fontSize: 'var(--font-size-sm)',
                        }}
                    >
                        💬 ヒントを見る
                    </summary>
                    <ul
                        style={{
                            listStyle: 'none',
                            padding: 'var(--space-sm)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--space-xs)',
                        }}
                    >
                        {level.hints.map((hint, i) => (
                            <li
                                key={i}
                                style={{
                                    fontSize: 'var(--font-size-sm)',
                                    color: 'var(--color-text-muted)',
                                    padding: 'var(--space-xs) 0',
                                    borderBottom: '1px solid var(--color-border)',
                                }}
                            >
                                {hint}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}
