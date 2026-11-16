import { LEVELS, type LevelId, formatRatingRange } from '../data/levels';

interface Props {
  value: LevelId | null;
  onChange: (level: LevelId) => void;
}

export function LevelPicker({ value, onChange }: Props) {
  return (
    <section className="level-picker" aria-labelledby="level-heading">
      <h2 id="level-heading">Your level</h2>
      <div className="level-options" role="radiogroup" aria-labelledby="level-heading">
        {LEVELS.map((level) => (
          <button
            key={level.id}
            type="button"
            role="radio"
            aria-checked={value === level.id}
            className="level-option"
            onClick={() => onChange(level.id)}
          >
            <span className="level-name">{level.name}</span>
            <span className="level-range">{formatRatingRange(level)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
