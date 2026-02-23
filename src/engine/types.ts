// ============================================================
// RoboChef — Core Type Definitions
// ============================================================
// UIに一切依存しない純粋なドメインモデル。
// 「食材＝データ」「調理カード＝関数」「ボウル＝配列」の対応関係を型で表現する。

// ----------------------------------------------------------
// IDs
// ----------------------------------------------------------
export type IngredientId = string;
export type ActionId = string;
export type LevelId = string;

// ----------------------------------------------------------
// Ingredient (食材 = 引数/データ)
// ----------------------------------------------------------
export interface IngredientState {
  /** 食材の一意識別子 */
  id: IngredientId;
  /** 表示名 (例: "にんじん", "たまねぎ") */
  name: string;
  /** 表示アイコン (emoji or asset key) */
  icon: string;
  /** カットされたか */
  isCut: boolean;
  /** 加熱されたか */
  isCooked: boolean;
  /** 加熱方法 */
  cookMethod?: 'boiled' | 'fried' | 'steamed';
  /** 混ぜられたか (ボウル操作) */
  isMixed: boolean;
  /** 何と一緒に混ぜられたか (配列操作の結果) */
  mixedWith: IngredientId[];
  /** 味付け */
  seasoning?: string;
}

/** 新しい食材を初期状態で生成するヘルパー */
export function createIngredient(
  id: IngredientId,
  name: string,
  icon: string,
): IngredientState {
  return {
    id,
    name,
    icon,
    isCut: false,
    isCooked: false,
    isMixed: false,
    mixedWith: [],
  };
}

// ----------------------------------------------------------
// Action (調理操作 = 関数)
// ----------------------------------------------------------
export type ActionType = 'CUT' | 'BOIL' | 'FRY' | 'STEAM' | 'MIX' | 'SEASON' | 'CALL_RECIPE';

export interface ActionDefinition {
  /** アクションの一意識別子 */
  id: ActionId;
  /** アクション種別 */
  type: ActionType;
  /** 表示名 (例: "切る", "炒める") */
  label: string;
  /** 表示アイコン */
  icon: string;
  /** 必要な引数スロットの数 */
  slotCount: number;
  /** バッチ操作可能か（ボウルを受け取れるか） */
  acceptsBowl: boolean;
  /** 追加パラメータスロット (例: SEASONの "調味料名") */
  paramSlots?: ParamSlotDef[];
}

export interface ParamSlotDef {
  name: string;
  label: string;
  options: string[];  // 選択肢 (例: ["塩","砂糖","醤油"])
}

// ----------------------------------------------------------
// Command (ユーザーが組み立てたコマンド = 関数呼び出し)
// ----------------------------------------------------------
export interface Command {
  /** 使用するアクション */
  actionType: ActionType;
  /** 対象食材 (スロットに嵌め込まれた食材ID) */
  targetIds: IngredientId[];
  /** ボウル全体を対象とするか */
  useBowl: boolean;
  /** 追加パラメータ (例: 調味料名) */
  params?: Record<string, string>;
  /** CALL_RECIPE 用: 展開されるサブコマンド列 */
  subCommands?: Command[];
  /** CALL_RECIPE 用: レシピ名 */
  recipeName?: string;
}

// ----------------------------------------------------------
// Timeline (実行結果のアニメーション用イベント)
// ----------------------------------------------------------
export type AnimationType =
  | 'cut'
  | 'boil'
  | 'fry'
  | 'steam'
  | 'mix'
  | 'season'
  | 'error';

export interface TimelineEvent {
  /** 実行したコマンド */
  command: Command;
  /** コマンド実行前の状態 */
  beforeState: IngredientState[];
  /** コマンド実行後の状態 */
  afterState: IngredientState[];
  /** アニメーション種別 */
  animation: AnimationType;
  /** アニメーション時間 (ms) */
  duration: number;
  /** エラーが発生した場合のメッセージ */
  error?: string;
}

// ----------------------------------------------------------
// ExecutionResult
// ----------------------------------------------------------
export interface ExecutionResult {
  /** 最終状態 */
  finalState: IngredientState[];
  /** タイムラインイベント列 */
  timeline: TimelineEvent[];
  /** 全コマンドが正常に実行されたか */
  success: boolean;
}

// ----------------------------------------------------------
// Recipe (レシピ = 期待される最終状態 = 仕様書)
// ----------------------------------------------------------
export interface RecipeCondition {
  /** 対象食材の名前 (データ駆動のため name で照合) */
  ingredientName: string;
  /** 期待される状態 (部分一致) */
  expected: Partial<
    Pick<IngredientState, 'isCut' | 'isCooked' | 'cookMethod' | 'isMixed' | 'seasoning'>
  >;
}

export interface Recipe {
  /** 全ての条件を満たしたらクリア */
  conditions: RecipeCondition[];
}

// ----------------------------------------------------------
// Bonus Conditions (★★★ 判定用)
// ----------------------------------------------------------
export type BonusCondition =
  | { type: 'useBowl' }          // ボウルを使用したか
  | { type: 'maxCommands'; value: number }  // コマンド数が value 以下か
  | { type: 'noErrors' };        // エラーなしで実行完了

// ----------------------------------------------------------
// User-Defined Recipe (関数定義 = ユーザーが作ったレシピカード)
// ----------------------------------------------------------
export interface UserRecipe {
  /** レシピ名 (関数名) */
  name: string;
  /** コマンド列 (関数本体) */
  commands: Command[];
  /** 説明 */
  description?: string;
}

// ----------------------------------------------------------
// Bowl (ボウル = 配列)
// ----------------------------------------------------------
export interface BowlState {
  /** ボウルに入っている食材ID */
  ingredientIds: IngredientId[];
}

// ----------------------------------------------------------
// Level (ステージ定義 = JSON データ)
// ----------------------------------------------------------
export interface LevelData {
  /** レベルID */
  id: LevelId;
  /** ワールド番号 */
  world: number;
  /** ワールド内レベル番号 */
  levelInWorld: number;
  /** タイトル */
  title: string;
  /** 説明 / ストーリーテキスト */
  description: string;
  /** 学習目標テキスト */
  learningGoal: string;
  /** 使用可能な食材の定義 */
  ingredients: Array<{
    id: IngredientId;
    name: string;
    icon: string;
  }>;
  /** 使用可能なアクション */
  availableActions: ActionDefinition[];
  /** 期待される最終状態（レシピ＝仕様書） */
  recipe: Recipe;
  /** ★★判定: 最適コマンド数 */
  optimalCommandCount: number;
  /** ★★★判定: ボーナス条件 */
  bonusConditions?: BonusCondition[];
  /** ヒント（任意） */
  hints?: string[];
}

// ----------------------------------------------------------
// Game State (ゲーム全体の状態)
// ----------------------------------------------------------
export interface GameState {
  /** 現在のレベル */
  levelId: LevelId;
  /** 食材の現在の状態 */
  ingredients: IngredientState[];
  /** ボウルの状態 */
  bowl: BowlState;
  /** ユーザーが組み立てたコマンドキュー */
  commandQueue: Command[];
  /** 実行フェーズか */
  phase: 'building' | 'executing' | 'result';
  /** 実行結果 */
  executionResult?: ExecutionResult;
  /** クリアしたか */
  isCleared: boolean;
  /** ステップ実行モード */
  isStepMode: boolean;
  /** 現在のステップインデックス (ステップ実行時) */
  stepIndex: number;
}
