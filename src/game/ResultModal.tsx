import { ratingFor, type Difficulty } from '../store';
import { tally, type MatchState, type Side } from '../engine';

interface Props {
  match: MatchState;
  mode: 'ai' | 'hotseat' | 'spectate';
  difficulty: Difficulty;
  onRestart: () => void;
  onReview: () => void;
  onExit: () => void;
}

export function ResultModal({ match, mode, difficulty, onRestart, onReview, onExit }: Props) {
  function sideName(s: Side) {
    if (mode === 'hotseat') return s === 'A' ? '甲方' : '乙方';
    if (mode === 'spectate') return s === 'A' ? '甲·AI' : '乙·AI';
    return s === 'A' ? '你' : '电脑';
  }
  const won = match.winner === 'A';
  const draw = match.winner === null;

  return (
    <div className="overlay">
      <div className="modal result">
        <h2>
          {draw
            ? '平局'
            : mode === 'spectate'
              ? match.winner === 'A'
                ? '甲·AI 获胜'
                : '乙·AI 获胜'
              : won
                ? '你拿下了这个知识碎片'
                : '这个知识碎片失守了'}
        </h2>
        {won && mode !== 'spectate' && <p className="rating">{ratingFor(difficulty)}</p>}
        <table>
          <thead>
            <tr>
              <th />
              <th>正确</th>
              <th>错误</th>
              <th>得分</th>
            </tr>
          </thead>
          <tbody>
            {(['A', 'B'] as Side[]).map((side) => {
              const t = tally(match, side);
              const score = match.finalScore ? match.finalScore[side] : t.correct - t.wrong;
              return (
                <tr key={side} className={match.winner === side ? 'win' : ''}>
                  <td>{sideName(side)}</td>
                  <td>{t.correct}</td>
                  <td>{t.wrong}</td>
                  <td>{score > 0 ? '+' + score : score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="result-actions">
          <button className="primary" onClick={onRestart}>
            再来一局
          </button>
          <button onClick={onReview}>查看回顾</button>
          <button onClick={onExit}>返回知识碎片</button>
        </div>
      </div>
    </div>
  );
}
