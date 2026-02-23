// ============================================================
// RoboChef — CardSlot Component
// ============================================================
// 調理カードの「引数スロット」= 関数の引数を受け取る穴
// ドロップゾーンとして機能する

import { useDroppable } from '@dnd-kit/core';
import type { IngredientState } from '../../engine/types';

interface CardSlotProps {
    slotId: string;
    ingredient?: IngredientState;
    onRemove?: () => void;
}

export function CardSlot({ slotId, ingredient, onRemove }: CardSlotProps) {
    const { isOver, setNodeRef } = useDroppable({
        id: slotId,
        data: { type: 'slot', slotId },
    });

    return (
        <div
            ref={setNodeRef}
            className={`card-slot ${isOver ? 'drag-over' : ''} ${ingredient ? 'filled' : 'empty'}`}
        >
            {ingredient ? (
                <div
                    className="card ingredient-card"
                    style={{ cursor: 'pointer', padding: '4px 8px', minWidth: 'auto' }}
                    onClick={onRemove}
                    title="クリックで取り外す"
                >
                    <span className="card-icon" style={{ fontSize: '1.5rem' }}>
                        {ingredient.icon}
                    </span>
                    <span className="card-name" style={{ fontSize: '0.7rem' }}>
                        {ingredient.name}
                    </span>
                </div>
            ) : (
                <span className="slot-placeholder">🎯 ここにドラッグ</span>
            )}
        </div>
    );
}
