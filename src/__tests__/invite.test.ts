import { describe, expect, it } from 'vitest';
import { inviteCode, inviteHtml } from '../../server/invite';

const page = `<!doctype html><html><head>
<title>Fifty States Drill</title>
<meta name="description" content="Learn the states.">
<meta property="og:title" content="Fifty States Drill">
<meta property="og:description" content="Learn the states.">
<meta property="og:url" content="https://fifty-states-drill.vercel.app/">
<meta property="og:image" content="https://fifty-states-drill.vercel.app/og.png">
<meta name="twitter:title" content="Fifty States Drill">
<meta name="twitter:description" content="Learn the states.">
</head><body><div id="root"></div></body></html>`;

describe('the invite page', () => {
  it('names the room in the title and the preview tags, and nowhere else', () => {
    const html = inviteHtml(page, 'ACDE', 'https://fifty-states-drill.vercel.app');
    expect(html).toContain('<title>Join room ACDE · Fifty States Drill</title>');
    expect(html).toContain('<meta property="og:title" content="Join room ACDE · Fifty States Drill">');
    expect(html).toContain('<meta name="twitter:title" content="Join room ACDE · Fifty States Drill">');
    expect(html).toContain('<meta property="og:url" content="https://fifty-states-drill.vercel.app/versus/ACDE">');
    expect(html).toMatch(/og:description" content="[^"]*room ACDE/);
    expect(html).toMatch(/twitter:description" content="[^"]*room ACDE/);
    // The image and the page itself are as built.
    expect(html).toContain('content="https://fifty-states-drill.vercel.app/og.png"');
    expect(html).toContain('<meta name="description" content="Learn the states.">');
    expect(html).toContain('<div id="root"></div>');
  });

  it('only accepts a whole room code, folded the way the app folds it', () => {
    expect(inviteCode('ACDE')).toBe('ACDE');
    expect(inviteCode('acde')).toBe('ACDE');
    expect(inviteCode('AC')).toBeNull();
    expect(inviteCode('')).toBeNull();
    expect(inviteCode(undefined)).toBeNull();
    expect(inviteCode('<b>')).toBeNull();
  });
});
