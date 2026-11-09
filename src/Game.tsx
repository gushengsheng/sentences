import { useEffect, useMemo, useRef, useState } from 'react';
import {
  apply,
  createMatch,
  incomeOf,
  nextPulseRound,
  tally,
  type Action,
  type Book,
  type Chapter,
  type MatchState,
  type Side,
} from './engine';
import { decideNext, newAiMemory, presetById, type AiConfig } from './ai';
import { clearSave, ratingFor, writeSave, type Difficulty } from './store';

interface GameProps {
  book: Book;
  chapter: Chapter;
  fragmentId: string;
  rounds: number;
  mode: 'ai' | 'hotseat';
  presetId: string;
  custom: AiConfig;
  difficulty: Difficulty;
  initialState?: MatchState;
  onExit: () => void;
  onFinish: (result: { won: boolean; margin: number }) => void;
}

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000_000);
}

export default function Game(props: GameProps) {
  const { book, chapter, fragmentId, rounds, mode, presetId, custom, difficulty, initialState, onExit, onFinish } =
    props;

  const meta = useMemo(
    () => ({
      bookId: book.id,
      bookTitle: book.title,
      chapterId: chapter.id,
      chapterTitle: chapter.title ?? '',
    }),
    [book.id, book.title, chapter.id, chapter.title],
  );

  const [match, setMatch] = useState<MatchState>(
    () => initialState ?? createMatch(chapter, fragmentId, rounds, randomSeed(), meta),
  );
  const [pageIdx, setPageIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [modalUnit, setModalUnit] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean } | null>(null);

  const memA = useRef(newAiMemory());
  const memB = useRef(newAiMemory());
  const reported = useRef(false);

  const aiConfig: AiConfig = presetId === 'custom' ? custom : presetById(presetId);
  const humanTurn = mode === 'hotseat' || match.turn === 'A';
  const thinking = mode === 'ai' && !match.ended && match.turn === 'B';

  useEffect(() => {
    if (match.ended) return;
    writeSave({
      schemaVersion: 3,
      bookId: match.bookId,
      chapterId: match.chapterId,
      fragmentId: match.fragmentId,
      rounds,
      mode,
      presetId,
      difficulty,
      state: match,
      savedAt: Date.now(),
    });
  }, [match, rounds, mode, presetId, difficulty]);

  useEffect(() => {
    if (!match.ended || reported.current) return;
    reported.current = true;
    clearSave();
    onFinish({
      won: match.winner === 'A',
      margin: (match.finalIncome?.A ?? 0) - (match.finalIncome?.B ?? 0),
    });
  }, [match, onFinish]);

  useEffect(() => {
    if (match.ended || mode !== 'ai' || match.turn !== 'B') return;
    const timer = window.setTimeout(() => {
      const mem = memB.current;
      const action = decideNext(match, aiConfig, Math.random, mem);
      const r = apply(match, action);
      if (r.error) apply(match, { kind: 'endTurn' });
      else if (action.kind === 'correct' && r.correctResult) mem.confirmed.add(action.unitId);
      setMatch({ ...match });
    }, 550);
    return () => window.clearTimeout(timer);
  }, [match, mode, aiConfig, presetId, custom]);

  const pages = match.pages ?? [];
  const page = pages[Math.min(pageIdx, Math.max(0, pages.length - 1))];

  const paragraphs = useMemo(() => {
    if (!page) return [] as { paragraph: number; ids: string[] }[];
    const groups: { paragraph: number; ids: string[] }[] = [];
    for (const id of page.unitIds) {
      const p = match.units[id].paragraph;
      const last = groups[groups.length - 1];
      if (last && last.paragraph === p) last.ids.push(id);
      else groups.push({ paragraph: p, ids: [id] });
    }
    return groups;
  }, [match, page]);

  function sideName(s: Side) {
    if (mode === 'hotseat') return s === 'A' ? '甲方' : '乙方';
    return s === 'A' ? '你' : '电脑';
  }

  function notify(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1500);
  }

  function run(action: Action) {
    const r = apply(match, action);
    if (r.error) {
      notify(r.error);
      return;
    }
    setMatch({ ...match });
    if (r.correctResult !== undefined) {
      setFlash({ ok: r.correctResult });
      window.setTimeout(() => setFlash(null), 800);
    }
  }

  function restart() {
    reported.current = false;
    memA.current = newAiMemory();
    memB.current = newAiMemory();
    setMatch(createMatch(chapter, fragmentId, rounds, randomSeed(), meta));
    setPageIdx(0);
    setSelected(null);
    setModalUnit(null);
  }

  const ledger = match.ledger[match.turn];
  const currentIncome = match.lastGrant[match.turn];
  const pulse = nextPulseRound(match);

  function clickCell(id: string) {
    if (!humanTurn || match.ended) return;
    const cell = match.cells[id];
    if (cell.owner === null) {
      if (match.ap[match.turn] < 1) {
        notify('AP 不足');
        return;
      }
      run({ kind: 'claim', unitId: id });
      return;
    }
    setSelected((cur) => (cur === id ? null : id));
  }

  const won = match.ended && match.winner === 'A';
  const breadcrumb = [match.bookTitle, match.chapterTitle, match.fragmentTitle]
    .filter((v, i, arr) => !!v && arr.indexOf(v) === i)
    .join(' · ');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <button className="back" onClick={onExit}>
            ← 返回
          </button>
          <span className="brand-sub">{breadcrumb}</span>
        </div>
        <div className="top-actions">
          <span className="muted">
            {mode === 'ai' ? `人机 · ${presetById(presetId).name}` : '双人'} ·{' '}
            {rounds === 0 ? '不限轮' : `${rounds} 轮`}
          </span>
          <button className="ghost" onClick={restart}>
            重开
          </button>
        </div>
      </header>

      <main className="board">
        {paragraphs.map((g) => (
          <p className="para" key={g.paragraph}>
            {g.ids.map((id) => {
              const unit = match.units[id];
              const cell = match.cells[id];

              if (!cell.revealed) {
                const w = Math.min(26, Math.max(5, Math.round(unit.original.length * 0.95)));
                return (
                  <button
                    key={id}
                    className="unit hidden"
                    style={{ width: `${w}em` }}
                    disabled={!humanTurn || match.ended}
                    onClick={() => clickCell(id)}
                    title="占领 · 1 AP"
                  >
                    <span className="ink" />
                  </button>
                );
              }

              const cls = [
                'unit',
                'owned',
                cell.owner ? cell.owner.toLowerCase() : 'blank',
                selected === id ? 'selected' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <span
                  key={id}
                  className={cls}
                  role="button"
                  tabIndex={0}
                  aria-disabled={!humanTurn || match.ended}
                  onClick={() => clickCell(id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') clickCell(id);
                  }}
                >
                  {unit.text}
                </span>
              );
            })}
          </p>
        ))}
      </main>

      {pages.length > 1 && (
        <nav className="pager">
          <button
            className="page-btn"
            disabled={pageIdx <= 0}
            onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
          >
            ← 上一页
          </button>
          <span className="page-ind">
            {page?.title ?? `第 ${pageIdx + 1} 页`} · {pageIdx + 1} / {pages.length}
          </span>
          <button
            className="page-btn"
            disabled={pageIdx >= pages.length - 1}
            onClick={() => setPageIdx((i) => Math.min(pages.length - 1, i + 1))}
          >
            下一页 →
          </button>
        </nav>
      )}

      {selected && humanTurn && !match.ended && (
        <div className="panel">
          <div className="panel-head">
            <span>
              {match.cells[selected].owner === match.turn
                ? '己方句元'
                : `对方句元 · ${sideName(match.cells[selected].owner as Side)}`}
            </span>
            <button className="x" onClick={() => setSelected(null)}>
              ×
            </button>
          </div>
          <p className="panel-text">{match.units[selected].text}</p>
          <div className="panel-actions">
            {match.cells[selected].owner === match.turn && (
              <>
                <button
                  className="primary"
                  disabled={match.ap[match.turn] < 1}
                  onClick={() => setModalUnit(selected)}
                >
                  修正 · 1 AP
                </button>
                <button
                  onClick={() => {
                    run({ kind: 'abandon', unitId: selected });
                    setSelected(null);
                  }}
                >
                  放弃 · 0 AP
                </button>
              </>
            )}
            {match.cells[selected].owner !== match.turn && (
              <button
                className="primary"
                disabled={match.ap[match.turn] < 2}
                onClick={() => {
                  run({ kind: 'convert', unitId: selected });
                  setSelected(null);
                }}
              >
                转化 · 2 AP
              </button>
            )}
          </div>
        </div>
      )}

      <footer className="hud">
        <div className="hud-left">
          <span className={`turn-chip ${match.turn.toLowerCase()}`}>{sideName(match.turn)}</span>
          {thinking && <span className="thinking">思考中…</span>}
          <span className="muted">
            第 {match.rounds === 0 ? match.round : Math.min(match.round, match.rounds)} /{' '}
            {match.rounds === 0 ? '不限' : match.rounds} 轮
          </span>
          {pulse !== null && <span className="muted pulse-hint">腐化 · 第 {pulse} 轮末</span>}
        </div>

        <div className="hud-right">
          <div className="ledger">
            <span>上回合 正确 {ledger.correct}</span>
            <span>错误 {ledger.wrong}</span>
            <span className="income">
              → 收入 <b>{currentIncome}</b>
            </span>
          </div>
          <div className="ap-box">
            <span className="ap-label">AP</span>
            <span className="ap-value">{match.ap[match.turn]}</span>
          </div>
          <button
            className="end-turn"
            disabled={!humanTurn || match.ended}
            onClick={() => {
              run({ kind: 'endTurn' });
              setSelected(null);
            }}
          >
            结束回合
          </button>
        </div>
      </footer>

      {modalUnit && (
        <div className="overlay" onClick={() => setModalUnit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>修正</h3>
            <p className="muted">选出忠实于原文的那一句。选错会让这句变成错误。</p>
            {match.units[modalUnit].options.map((o) => (
              <button
                key={o.id}
                className="option"
                onClick={() => {
                  run({ kind: 'correct', unitId: modalUnit, optionId: o.id });
                  setModalUnit(null);
                }}
              >
                {o.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {flash && (
        <div className={`flash ${flash.ok ? 'ok' : 'bad'}`}>
          {flash.ok ? '✓ 修正成功' : '✗ 与原文不符'}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      {match.ended && (
        <div className="overlay">
          <div className="modal result">
            <h2>{won ? '你拿下了这个知识碎片' : '这个知识碎片失守了'}</h2>
            {won && <p className="rating">{ratingFor(difficulty)}</p>}
            <table>
              <thead>
                <tr>
                  <th />
                  <th>正确</th>
                  <th>错误</th>
                  <th>收入</th>
                </tr>
              </thead>
              <tbody>
                {(['A', 'B'] as Side[]).map((side) => {
                  const t = tally(match, side);
                  return (
                    <tr key={side} className={match.winner === side ? 'win' : ''}>
                      <td>{sideName(side)}</td>
                      <td>{t.correct}</td>
                      <td>{t.wrong}</td>
                      <td>{match.finalIncome ? match.finalIncome[side] : incomeOf(match, side)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="result-actions">
              <button className="primary" onClick={restart}>
                再来一局
              </button>
              <button onClick={onExit}>返回知识碎片</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
