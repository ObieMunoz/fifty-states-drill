import { shapeBox } from '../lib/geo';
import type { State } from '../types';

/** One state's silhouette, framed to its own bounding box. */
export function StateShape({ s, className }: { s: State; className: string }) {
  return (
    <svg className={className} viewBox={shapeBox(s)} aria-hidden="true">
      <path d={s.d} />
    </svg>
  );
}
