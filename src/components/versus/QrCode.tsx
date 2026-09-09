import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * The invite link as a QR code, drawn as one SVG path.
 *
 * Two people in the same room join fastest by pointing a camera at the other
 * phone, so this is the primary affordance on the waiting screen and the typed
 * code is the fallback. One path rather than a rect per module keeps it to a
 * few hundred bytes of DOM instead of a few thousand nodes.
 */
export function QrCode({ text, size = 168 }: { text: string; size?: number }) {
  const { path, count } = useMemo(() => {
    // Type 0 auto-sizes; M tolerates ~15% damage, which is plenty for a screen.
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      }
    }
    return { path: d, count: n };
  }, [text]);

  // One module of quiet zone on each side keeps scanners happy without the
  // full four the spec asks for, which would shrink the code too far on a phone.
  const pad = 1;
  const box = count + pad * 2;

  return (
    <svg
      className="qr"
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      role="img"
      aria-label="QR code linking to this room"
      shapeRendering="crispEdges"
    >
      <rect width={box} height={box} fill="var(--qr-bg)" />
      <g transform={`translate(${pad} ${pad})`}>
        <path d={path} fill="var(--qr-ink)" />
      </g>
    </svg>
  );
}
