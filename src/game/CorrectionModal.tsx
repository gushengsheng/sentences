interface Option {
  id: string;
  text: string;
}

interface Props {
  options: Option[];
  picked: { id: string; ok: boolean } | null;
  onClose: () => void;
  onPick: (optionId: string) => void;
}

export function CorrectionModal({ options, picked, onClose, onPick }: Props) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>修正</h3>
        <p className="muted">选出忠实于原文的那一句。选错会让这句变成错误。</p>
        {options.map((o) => {
          const mark = picked && picked.id === o.id ? (picked.ok ? 'ok' : 'bad') : '';
          return (
            <button
              key={o.id}
              className={'option ' + mark}
              disabled={!!picked}
              onClick={() => onPick(o.id)}
            >
              {o.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
