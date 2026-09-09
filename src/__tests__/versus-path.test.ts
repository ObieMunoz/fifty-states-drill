import { describe, expect, it } from 'vitest';
import { classifyPath } from '../versus/path';

const pair = (id: string, local: string, remote: string, state = 'succeeded', nominated = true) =>
  ({ id, type: 'candidate-pair', state, nominated, localCandidateId: local, remoteCandidateId: remote });
const cand = (id: string, type: 'local-candidate' | 'remote-candidate', candidateType: string) =>
  ({ id, type, candidateType });

describe('connection path', () => {
  it('reads relay when either side went through TURN', () => {
    expect(classifyPath([
      pair('p', 'l', 'r'), cand('l', 'local-candidate', 'relay'), cand('r', 'remote-candidate', 'host'),
    ])).toBe('relay');
    expect(classifyPath([
      pair('p', 'l', 'r'), cand('l', 'local-candidate', 'srflx'), cand('r', 'remote-candidate', 'relay'),
    ])).toBe('relay');
  });

  it('reads lan when both sides used host candidates', () => {
    expect(classifyPath([
      pair('p', 'l', 'r'), cand('l', 'local-candidate', 'host'), cand('r', 'remote-candidate', 'host'),
    ])).toBe('lan');
  });

  it('reads direct for a reflexive path across the internet', () => {
    expect(classifyPath([
      pair('p', 'l', 'r'), cand('l', 'local-candidate', 'srflx'), cand('r', 'remote-candidate', 'srflx'),
    ])).toBe('direct');
    expect(classifyPath([
      pair('p', 'l', 'r'), cand('l', 'local-candidate', 'host'), cand('r', 'remote-candidate', 'prflx'),
    ])).toBe('direct');
  });

  it('prefers the pair the transport selected over any other succeeded pair', () => {
    expect(classifyPath([
      { id: 't', type: 'transport', selectedCandidatePairId: 'p2' },
      pair('p1', 'l1', 'r1'), cand('l1', 'local-candidate', 'relay'), cand('r1', 'remote-candidate', 'relay'),
      pair('p2', 'l2', 'r2'), cand('l2', 'local-candidate', 'host'), cand('r2', 'remote-candidate', 'host'),
    ])).toBe('lan');
  });

  it('falls back to a nominated succeeded pair', () => {
    expect(classifyPath([
      pair('p1', 'l1', 'r1', 'failed'), cand('l1', 'local-candidate', 'host'), cand('r1', 'remote-candidate', 'host'),
      pair('p2', 'l2', 'r2', 'succeeded', false), cand('l2', 'local-candidate', 'relay'), cand('r2', 'remote-candidate', 'host'),
      pair('p3', 'l3', 'r3'), cand('l3', 'local-candidate', 'srflx'), cand('r3', 'remote-candidate', 'srflx'),
    ])).toBe('direct');
  });

  it('is null with no working pair, or with candidates missing', () => {
    expect(classifyPath([])).toBeNull();
    expect(classifyPath([pair('p', 'l', 'r', 'in-progress')])).toBeNull();
    expect(classifyPath([pair('p', 'l', 'r'), cand('l', 'local-candidate', 'host')])).toBeNull();
  });
});
