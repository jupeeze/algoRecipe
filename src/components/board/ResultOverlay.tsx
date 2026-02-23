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

function StarDisplay({ stars }: { stars: 0 | 1 | 2 | 3 }) {
    return (
        <div className="star-display">
            {[1, 2, 3].map((i) => (
                <motion.span
                    key={i}
                    className={`star ${i <= stars ? 'filled' : 'empty'}`}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{
                        delay: i * 0.2,
                        type: 'spring',
                        stiffness: 300,
                        damping: 15,
                    }}
                >
                    {i <= stars ? '⭐' : '☆'}
                </motion.span>
            ))}
        </div>
    );
}

function getStarMessage(stars: 0 | 1 | 2 | 3): string {
    switch (stars) {
        case 0: return 'もう一度チャレンジ！';
        case 1: return '完成！もっと効率よくできるかも？';
        case 2: return 'すごい！最適な手順でクリア！';
        case 3: return 'パーフェクト！完璧なプログラミング！';
    }
}

export function ResultOverlay({
    show,
    evaluationResult,
    onRetry,
    onNextLevel,
}: ResultOverlayProps) {
    if (!evaluationResult) return null;

    const { passed, score, stars } = evaluationResult;

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

                        {passed && <StarDisplay stars={stars} />}

                        <h2 className="result-title">
                            {getStarMessage(stars)}
                        </h2>
                        <p className="result-message">
                            {passed
                                ? stars >= 2
                                    ? 'すべての条件をクリア！効率的なプログラムですね！'
                                    : 'クリアしたけど、もっと少ないコマンドで解けるかも…？'
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

