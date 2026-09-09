/**
 * How a live peer connection actually runs, read off its ICE statistics.
 *
 * Which pair of candidates won says a lot about why a match did or did not
 * connect: two host candidates mean the phones are on one network and talk
 * across it; a reflexive candidate means the internet, through a hole STUN
 * found in a NAT; a relay candidate on either side means the TURN server is
 * carrying the packets, which is the only way two phones on cellular get
 * through. Shown in the lobby, it turns "it connected" into something a
 * report can act on.
 */
export type Path = 'lan' | 'direct' | 'relay';

/** The parts of an RTCStats report read here; the browser's own has more. */
interface Report {
  id?: string;
  type?: string;
  state?: string;
  nominated?: boolean;
  selectedCandidatePairId?: string;
  localCandidateId?: string;
  remoteCandidateId?: string;
  candidateType?: string;
}

export function classifyPath(reports: Iterable<Report>): Path | null {
  const byId = new Map<string, Report>();
  let selectedId: string | undefined;
  for (const r of reports) {
    if (r.id) byId.set(r.id, r);
    if (r.type === 'transport' && r.selectedCandidatePairId) selectedId = r.selectedCandidatePairId;
  }

  // The transport names the pair in use where the browser supports it;
  // elsewhere the nominated succeeded pair is the same thing.
  let pair = selectedId ? byId.get(selectedId) : undefined;
  if (!pair) {
    for (const r of byId.values()) {
      if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) { pair = r; break; }
    }
  }
  if (!pair?.localCandidateId || !pair.remoteCandidateId) return null;

  const local = byId.get(pair.localCandidateId)?.candidateType;
  const remote = byId.get(pair.remoteCandidateId)?.candidateType;
  if (!local || !remote) return null;
  if (local === 'relay' || remote === 'relay') return 'relay';
  if (local === 'host' && remote === 'host') return 'lan';
  return 'direct';
}

/** The path in words, for the lobby. */
export const describePath = (path: Path): string => ({
  lan: 'Connected over your own network',
  direct: 'Connected directly',
  relay: 'Connected through a relay',
})[path];
