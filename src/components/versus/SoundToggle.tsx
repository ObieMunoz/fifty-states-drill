import { useSound } from '../../versus/useSound';

/** The one switch for the match's sounds. Remembered, and off in one tap. */
export function SoundToggle() {
  const [on, toggle] = useSound();
  return (
    <button
      type="button"
      className="vs-sound"
      aria-pressed={on}
      aria-label={on ? 'Sound on' : 'Sound off'}
      title={on ? 'Sound on — tap to mute' : 'Sound off — tap to unmute'}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4z" />
        {on ? (
          <>
            <path d="M16.5 9a4.2 4.2 0 0 1 0 6" />
            <path d="M19 6.5a7.6 7.6 0 0 1 0 11" />
          </>
        ) : (
          <path d="M16.5 9.5l5 5m0-5l-5 5" />
        )}
      </svg>
    </button>
  );
}
