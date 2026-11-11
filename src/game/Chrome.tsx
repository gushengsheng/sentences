interface TopbarProps {
  breadcrumb: string;
  modeText: string;
  onExit: () => void;
  onRestart: () => void;
}

export function Topbar({ breadcrumb, modeText, onExit, onRestart }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <button className="back" onClick={onExit}>
          ← 返回
        </button>
        <span className="brand-sub">{breadcrumb}</span>
      </div>
      <div className="top-actions">
        <span className="muted">{modeText}</span>
        <button className="ghost" onClick={onRestart}>
          重开
        </button>
      </div>
    </header>
  );
}

interface HudProps {
  turn: 'A' | 'B';
  turnLabel: string;
  thinking: boolean;
  round: number;
  rounds: number;
  pulse: number | null;
  correct: number;
  wrong: number;
  income: number;
  ap: number;
  canEnd: boolean;
  onEndTurn: () => void;
}

export function Hud({
  turn,
  turnLabel,
  thinking,
  round,
  rounds,
  pulse,
  correct,
  wrong,
  income,
  ap,
  canEnd,
  onEndTurn,
}: HudProps) {
  return (
    <footer className="hud">
      <div className="hud-left">
        <span className={`turn-chip ${turn.toLowerCase()}`}>{turnLabel}</span>
        {thinking && <span className="thinking">思考中…</span>}
        <span className="muted">
          第 {round} / {rounds === 0 ? '不限' : rounds} 轮
        </span>
        {pulse !== null && <span className="muted pulse-hint">灾难 · 第 {pulse} 轮末</span>}
      </div>

      <div className="hud-right">
        <div className="ledger">
          <span>上回合 正确 {correct}</span>
          <span>错误 {wrong}</span>
          <span className="income">
            → 收入 <b>{income}</b>
          </span>
        </div>
        <div className="ap-box">
          <span className="ap-label">AP</span>
          <span className="ap-value">{ap}</span>
        </div>
        <button className="end-turn" disabled={!canEnd} onClick={onEndTurn}>
          结束回合
        </button>
      </div>
    </footer>
  );
}
