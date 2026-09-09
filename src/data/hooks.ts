import type { Abbr } from '../types';
import { abbrsWhere } from './states';

export interface Hook {
  /** Title. */
  t: string;
  /** The states the hook talks about; tapping it lights exactly these. */
  s: Abbr[];
  /** Body text. */
  b: string;
}

export interface HookGroup {
  g: string;
  items: Hook[];
}

/**
 * Every claim below is checked against the map data in `hooks.test.ts` rather
 * than trusted from memory — that South Carolina touches exactly two states,
 * that Utah and New Mexico meet only at the Four Corners point, and so on.
 */
export const HOOKS: HookGroup[] = [
  {
    g: 'Telling the confusable pairs apart',
    items: [
      {
        t: 'Vermont vs New Hampshire', s: ['VT', 'NH'],
        b: 'Vermont is the western one and touches New York. New Hampshire is the eastern one and touches Maine. Neither touches the other’s giveaway.',
      },
      {
        t: 'North vs South Carolina', s: ['NC', 'SC'],
        b: 'South Carolina touches only two states, Georgia and North Carolina. North Carolina touches four and reaches Virginia and Tennessee.',
      },
      {
        t: 'North vs South Dakota', s: ['ND', 'SD'],
        b: 'South Dakota is the busier one — six neighbours to North Dakota’s three. Bismarck sits north, Pierre south.',
      },
      {
        t: 'Missouri vs Mississippi', s: ['MO', 'MS'],
        b: 'Mississippi reaches the Gulf. Missouri is landlocked in the middle and ties Tennessee for the most neighbours in the country, at eight.',
      },
      {
        t: 'Iowa vs Ohio', s: ['IA', 'OH'],
        b: 'Ohio is the eastern one, on Lake Erie, touching Pennsylvania. Iowa sits between the Mississippi and the Missouri and touches no Great Lake.',
      },
      {
        t: 'Kansas vs Arkansas', s: ['KS', 'AR'],
        b: 'Arkansas spells out “Kansas” but sits well to its south-east. They share no border at all.',
      },
    ],
  },
  {
    g: 'Groups worth learning whole',
    items: [
      {
        t: 'Eight M’s and eight N’s', s: abbrsWhere((s) => s.n[0] === 'M' || s.n[0] === 'N'),
        b: 'Sixteen of the fifty — close to a third of the map — begin with M or N. Learn those two groups and the rest gets much smaller.',
      },
      {
        t: 'The Four Corners', s: ['UT', 'CO', 'AZ', 'NM'],
        b: 'Utah, Colorado, Arizona and New Mexico meet at one point, the only place four states touch. Utah and New Mexico share no border, and neither do Colorado and Arizona — they meet only at that corner.',
      },
      {
        t: 'The four “New” states', s: abbrsWhere((s) => /^New /.test(s.n)),
        b: 'New Hampshire, New Jersey, New York, New Mexico. Three cluster in the north-east; New Mexico is the outlier.',
      },
      {
        t: 'The five directional states', s: abbrsWhere((s) => /^(North|South|West) /.test(s.n)),
        b: 'North and South Carolina, North and South Dakota, and West Virginia — which split from Virginia in 1863 and is the only one without a partner.',
      },
      {
        t: 'The two perfect rectangles', s: ['CO', 'WY'],
        b: 'Colorado and Wyoming are bounded entirely by lines of latitude and longitude. Utah looks close but has a notch bitten out by Wyoming.',
      },
      {
        t: 'Bordering Mexico', s: ['CA', 'AZ', 'NM', 'TX'],
        b: 'Just four, west to east: California, Arizona, New Mexico, Texas.',
      },
    ],
  },
  {
    g: 'Records and oddities',
    items: [
      {
        t: 'Michigan is a mitten', s: ['MI'],
        b: 'The clearest shape on the map. Michigan touches Ohio, Indiana and Wisconsin — but not Illinois or Minnesota, which is the part people get wrong.',
      },
      {
        t: 'Maine stands nearly alone', s: ['ME', 'NH'],
        b: 'The only state with exactly one neighbour: New Hampshire.',
      },
      {
        t: 'Alaska and Hawaii touch nothing', s: ['AK', 'HI'],
        b: 'The only two with no land border, the only two outside the contiguous block, and the last two admitted — both in 1959.',
      },
      {
        t: 'First in, last in', s: ['DE', 'HI'],
        b: 'Delaware ratified first, on 7 December 1787, which is why it is “The First State”. Hawaii came last, on 21 August 1959 — 172 years later.',
      },
      {
        t: 'The busiest borders', s: ['MO', 'TN'],
        b: 'Missouri and Tennessee tie for most neighbours, at eight each. Between them they touch sixteen of the other forty-nine.',
      },
      {
        t: 'A to W', s: ['AL', 'WY'],
        b: 'Alphabetically the fifty run from Alabama to Wyoming. No state begins with B, E, J, Q, X, Y or Z.',
      },
    ],
  },
];
