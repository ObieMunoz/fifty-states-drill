import { ordSuf } from '../lib/text';
import type { State } from '../types';

/** The definition list shown for a state in Map and Letters. */
export function StateFacts({ s }: { s: State }) {
  return (
    <dl>
      <dt>Code</dt><dd className="mono">{s.a}</dd>
      <dt>Capital</dt><dd>{s.cap}</dd>
      <dt>Admitted</dt>
      <dd>{s.adm} <span className="tag">{s.ord}{ordSuf(s.ord)} state</span></dd>
      <dt>Region</dt>
      <dd>{s.div} <span className="tag">{s.reg}</span></dd>
      <dt>Borders</dt>
      <dd className="mono">{s.nb.length ? s.nb.join(' · ') : 'None — it touches no other state'}</dd>
    </dl>
  );
}
