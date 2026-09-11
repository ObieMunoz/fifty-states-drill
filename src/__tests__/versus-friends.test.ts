import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_FRIENDS, addFriend, agoLabel, loadFriends, removeFriend, touchFriend } from '../versus/friends';
import { noticeFor, openRoomMessage, parsePayload, rematchPayload, roomFromMessage } from '../versus/notify';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  // The suite runs in node, where localStorage does not exist.
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
});

describe('friends', () => {
  it('keeps who was added, most recently played first', () => {
    addFriend({ id: 'a', name: '  Sam ' }, 1000);
    addFriend({ id: 'b', name: 'Ada' }, 3000);
    addFriend({ id: 'c', name: 'Kim' }, 2000);
    expect(loadFriends().map((f) => f.name)).toEqual(['Ada', 'Kim', 'Sam']);
    expect(loadFriends()[2]).toEqual({ id: 'a', name: 'Sam', last: 1000 });
  });

  it('is one row per player, carrying the latest name and date', () => {
    addFriend({ id: 'a', name: 'Sam' }, 1000);
    addFriend({ id: 'a', name: 'Samuel' }, 5000);
    expect(loadFriends()).toEqual([{ id: 'a', name: 'Samuel', last: 5000 }]);
  });

  it('touches a friend after a match, and leaves a stranger alone', () => {
    addFriend({ id: 'a', name: 'Sam' }, 1000);
    touchFriend({ id: 'a', name: 'Sam' }, 9000);
    touchFriend({ id: 'z', name: 'Nobody' }, 9000);
    expect(loadFriends()).toEqual([{ id: 'a', name: 'Sam', last: 9000 }]);
  });

  it('removes by id, and ignores an id or name that is nothing', () => {
    addFriend({ id: 'a', name: 'Sam' }, 1000);
    addFriend({ id: '', name: 'Ghost' }, 1000);
    addFriend({ id: 'b', name: '   ' }, 1000);
    expect(loadFriends()).toHaveLength(1);
    expect(removeFriend('a')).toEqual([]);
    expect(loadFriends()).toEqual([]);
  });

  it('caps the list and drops the least recent', () => {
    for (let i = 0; i < MAX_FRIENDS + 5; i++) addFriend({ id: `p${i}`, name: `P${i}` }, i);
    const rows = loadFriends();
    expect(rows).toHaveLength(MAX_FRIENDS);
    expect(rows[0].id).toBe(`p${MAX_FRIENDS + 4}`);
    expect(rows.some((f) => f.id === 'p0')).toBe(false);
  });

  it('survives whatever is in storage', () => {
    store.set('fiftyStatesDrill.versus.friends.v1', '{ not json');
    expect(loadFriends()).toEqual([]);
    store.set('fiftyStatesDrill.versus.friends.v1', '[1, {"id":"a"}, {"id":"b","name":"B","last":2}]');
    expect(loadFriends()).toEqual([{ id: 'b', name: 'B', last: 2 }]);
  });

  it('describes when they were last played in round terms', () => {
    const day = 24 * 60 * 60 * 1000;
    const now = 100 * day;
    expect(agoLabel(now, now)).toBe('today');
    expect(agoLabel(now - day, now)).toBe('yesterday');
    expect(agoLabel(now - 3 * day, now)).toBe('3 days ago');
    expect(agoLabel(now - 45 * day, now)).toBe('a month ago');
    expect(agoLabel(now - 100 * day, now)).toBe('3 months ago');
    expect(agoLabel(now + day, now)).toBe('today');
  });
});

describe('rematch notifications', () => {
  it('round-trips the payload the server sends', () => {
    const wire = JSON.stringify(rematchPayload('ACDE', 'Obie'));
    expect(parsePayload(wire)).toEqual({ kind: 'rematch', code: 'ACDE', from: 'Obie' });
    expect(parsePayload(rematchPayload('ACDE', 'Obie'))).toEqual({ kind: 'rematch', code: 'ACDE', from: 'Obie' });
  });

  it('rejects anything that is not a rematch', () => {
    expect(parsePayload('nope')).toBeNull();
    expect(parsePayload(undefined)).toBeNull();
    expect(parsePayload('{"kind":"other"}')).toBeNull();
    expect(parsePayload('{"kind":"rematch","from":"x"}')).toBeNull();
    expect(parsePayload('{"kind":"rematch","code":"../","from":"x"}')).toBeNull();
  });

  it('keeps a code to the room’s own characters and a name to a line', () => {
    // Nothing of a room code survives, so there is no room to open.
    expect(parsePayload({ kind: 'rematch', code: 'ac de/../..', from: 'x' })).toBeNull();
    expect(parsePayload({ kind: 'rematch', code: 'AC<DE>', from: 'x'.repeat(100) })).toMatchObject({ code: 'ACDE' });
    expect(parsePayload({ kind: 'rematch', code: 'ACDE', from: 'x'.repeat(100) })?.from).toHaveLength(40);
  });

  it('says who wants what, and where a tap goes', () => {
    const n = noticeFor({ kind: 'rematch', code: 'ACDE', from: 'Obie' });
    expect(n.title).toBe('Obie wants a rematch');
    expect(n.body).toMatch(/ACDE/);
    expect(n.url).toBe('/versus/ACDE');
    expect(n.tag).toBe('rematch:ACDE');
  });
});

describe('the tap on a notification', () => {
  it('tells the page which room, and the page reads only that', () => {
    expect(roomFromMessage(openRoomMessage('ACDE'))).toBe('ACDE');
    expect(roomFromMessage({ type: 'OPEN_ROOM', code: 'ac/de' })).toBeNull();
    expect(roomFromMessage({ type: 'SKIP_WAITING' })).toBeNull();
    expect(roomFromMessage('ACDE')).toBeNull();
    expect(roomFromMessage(null)).toBeNull();
  });
});
