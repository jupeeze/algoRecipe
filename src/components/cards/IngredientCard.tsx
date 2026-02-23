// ============================================================
// RoboChef — IngredientCard Component
// ============================================================
// 食材カード = 「引数」の可視化
// ドラッグ可能で、スロットやボウルにドロップできる

import { useDraggable } from '@dnd-kit/core';
import type { IngredientState } from '../../engine/types';

interface IngredientCardProps {
    ingredient: IngredientState;
    compact?: boolean;
}

export function IngredientCard({ ingredient, compact }: IngredientCardProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } =
        useDraggable({
            id: `ingredient-${ingredient.id}`,
            data: { type: 'ingredient', ingredient },
        });

    const style = transform
        ? {
            transform: `translate(${transform.x}px, ${transform.y}px)`,
            zIndex: isDragging ? 100 : undefined,
        }
        : undefined;

    return (
        <div
            ref={setNodeRef}
            className={`card ingredient-card ${isDragging ? 'dragging' : ''} ${compact ? 'compact' : ''}`}
            style={style}
            {...listeners}
            {...attributes}
        >
            <span className="card-icon">{ingredient.icon}</span>
            {!compact && <span className="card-name">{ingredient.name}</span>}
            {!compact && (
                <div className="card-status">
                    {ingredient.isCut && (
                        <span className="status-badge active">✂️ 切った</span>
                    )}
                    {ingredient.isCooked && (
                        <span className="status-badge active">
                            {ingredient.cookMethod === 'fried'
                                ? '🍳 炒めた'
                                : ingredient.cookMethod === 'boiled'
                                    ? '♨️ 茹でた'
                                    : '💨 蒸した'}
                        </span>
                    )}
                    {ingredient.isMixed && (
                        <span className="status-badge active">🥣 混ぜた</span>
                    )}
                    {ingredient.seasoning && (
                        <span className="status-badge active">🧂 {ingredient.seasoning}</span>
                    )}
                </div>
            )}
        </div>
    );
}
