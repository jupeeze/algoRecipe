// ============================================================
// RoboChef — ResultOverlay Component
// ============================================================
// コマンド実行後の結果（クリア / 失敗）を表示するモーダル

import { motion, AnimatePresence } from 'framer-motion';
import type { EvaluationResult } from '../../engine/evaluator';

interface ResultOverlayProps {
    show: boolean;
    evaluationResult: EvaluationResult | null;
    onRetry: () => void;
    onNextLevel?: () => void;
}

export function ResultOverlay({
    show,
    evaluationResult,
    onRetry,
    onNextLevel,
}: ResultOverlayProps) {
    if (!evaluationResult) return null;

    const { passed, score } = evaluationResult;

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    className="result-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <motion.div
                        className={`result-card ${passed ? 'success' : 'failure'}`}
                        initial={{ scale: 0.8, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.8, y: 20 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                    >
                        <div className="result-icon">
                            {passed ? '🎉' : '🤔'}
                        </div>
                        <h2 className="result-title">
                            {passed ? '完成！' : 'もう一度チャレンジ！'}
                        </h2>
                        <p className="result-message">
                            {passed
                                ? 'すべての条件をクリアしました！すばらしい！'
                                : '惜しい！レシピの条件をもう一度確認してみよう。'}
                        </p>
                        <p className="result-score">
                            {score.passed} / {score.total} 条件クリア
                        </p>
                        <div className="result-actions">
                            {passed && onNextLevel && (
                                <button
                                    className="result-button result-button-primary"
                                    onClick={onNextLevel}
                                >
                                    次のレベルへ →
                                </button>
                            )}
                            <button
                                className="result-button result-button-secondary"
                                onClick={onRetry}
                            >
                                {passed ? 'もう一度' : 'リトライ'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
