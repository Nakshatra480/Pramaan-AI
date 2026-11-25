/**
 * Hand-built 2D research objects for the landing page — line-art, in the Pramaan palette.
 * All decorative: callers render them inside aria-hidden wrappers.
 */

const INK = "#191A17";
const MUTED = "#686A62";
const LINE = "#C6C0AD";
const SAGE = "#6F8271";

/** Engraving-style lighthouse on a rocky headland. */
export function LighthouseArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 300" className={className} fill="none" stroke={MUTED} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      {/* light beams */}
      <path d="M120 58 L10 30 M120 58 L10 86" stroke={LINE} strokeDasharray="2 4" />
      <path d="M120 58 L230 30 M120 58 L230 86" stroke={LINE} strokeDasharray="2 4" />
      {/* lantern + gallery */}
      <path d="M110 48 Q120 34 130 48" />
      <path d="M108 48 H132 V68 H108 Z" />
      <path d="M114 48 V68 M120 48 V68 M126 48 V68" stroke={LINE} />
      <path d="M102 68 H138 M104 68 V74 H136 V68" />
      <path d="M104 72 H136" stroke={LINE} />
      {/* tower */}
      <path d="M108 74 L100 210 H140 L132 74" />
      <path d="M106 104 H134 M104 134 H136 M102 164 H138" stroke={LINE} />
      <path d="M116 120 h8 v12 h-8 z M115 176 h10 v16 h-10 z" />
      {/* keeper's house */}
      <path d="M140 186 L160 170 L196 170 L208 186 V210 H140" />
      <path d="M152 192 h10 v10 h-10 z M176 192 h10 v10 h-10 z" stroke={LINE} />
      <path d="M182 170 v-10 h6 v10" />
      {/* headland */}
      <path d="M20 232 Q48 214 82 214 L100 210 H208 Q226 214 236 230" />
      <path d="M14 252 Q60 238 96 242 Q140 232 176 240 Q210 236 238 250" stroke={LINE} />
      <path d="M40 228 l8 6 M66 222 l10 8 M176 220 l12 10 M200 224 l10 8 M120 226 l6 6" stroke={LINE} />
      {/* sea */}
      <path d="M0 270 q15 -5 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" stroke={LINE} />
      <path d="M20 286 q15 -5 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" stroke={LINE} opacity="0.7" />
    </svg>
  );
}

/** Botanical branch — olive leaves with veins. */
export function Branch({ className }: { className?: string }) {
  const leaves: [number, number, number, number][] = [
    [40, 210, -40, 1.0],
    [62, 176, 30, 0.95],
    [70, 150, -55, 0.9],
    [92, 120, 25, 0.85],
    [98, 96, -60, 0.8],
    [118, 70, 20, 0.75],
    [122, 50, -45, 0.65],
  ];
  return (
    <svg viewBox="0 0 180 260" className={className} fill="none">
      <path d="M20 258 C 50 200, 80 140, 132 30" stroke={SAGE} strokeWidth="1.6" strokeLinecap="round" />
      {leaves.map(([x, y, r, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
          <path d="M0 0 C 14 -10, 46 -10, 62 0 C 46 10, 14 10, 0 0 Z" fill={i % 2 ? "#8E9C8F" : "#6F8271"} fillOpacity={0.55 + (i % 3) * 0.12} stroke={SAGE} strokeWidth="0.8" />
          <path d="M2 0 H58" stroke="#FAF8ED" strokeOpacity="0.55" strokeWidth="0.7" />
        </g>
      ))}
    </svg>
  );
}

/** A nautical chart sheet: contour lines, rhumb lines and a small rose. */
export function ChartSheet({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 220" className={className} fill="none" strokeLinecap="round">
      <rect x="0.5" y="0.5" width="319" height="219" rx="3" fill="#F4EEDD" stroke={LINE} />
      <rect x="10" y="10" width="300" height="200" stroke={LINE} strokeOpacity="0.8" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${30 + i * 6} ${200 - i * 4} C ${80 + i * 10} ${140 - i * 14}, ${130 + i * 6} ${170 - i * 10}, ${180 - i * 4} ${110 - i * 6} S ${250 - i * 8} ${40 + i * 6}, ${300 - i * 10} ${30 + i * 8}`} stroke={MUTED} strokeOpacity={0.45 - i * 0.06} strokeWidth="0.9" />
      ))}
      {[...Array(9)].map((_, i) => (
        <path key={`r${i}`} d={`M240 150 L${240 + Math.cos((i * Math.PI) / 4.5) * 200} ${150 + Math.sin((i * Math.PI) / 4.5) * 200}`} stroke={LINE} strokeWidth="0.6" strokeOpacity="0.7" />
      ))}
      <circle cx="240" cy="150" r="22" stroke={MUTED} strokeOpacity="0.6" strokeWidth="0.8" />
      <path d="M240 122 L245 150 L240 178 L235 150 Z" fill={MUTED} fillOpacity="0.35" />
      <path d="M212 150 L240 145 L268 150 L240 155 Z" fill={MUTED} fillOpacity="0.2" />
      {[...Array(14)].map((_, i) => (
        <text key={`d${i}`} x={40 + ((i * 37) % 240)} y={40 + ((i * 53) % 150)} fontSize="6" fill={MUTED} fillOpacity="0.5" fontFamily="serif">
          {[12, 18, 7, 24, 9, 31, 15][i % 7]}
        </text>
      ))}
    </svg>
  );
}

/** Brass-ringed compass. */
export function Compass({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className}>
      <defs>
        <radialGradient id="cmp-brass" cx="35%" cy="30%">
          <stop offset="0" stopColor="#E6D3A3" />
          <stop offset="0.6" stopColor="#B8975A" />
          <stop offset="1" stopColor="#7C6236" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="56" fill="url(#cmp-brass)" />
      <circle cx="60" cy="60" r="46" fill="#FBF8EE" stroke="#7C6236" strokeWidth="1" />
      {[...Array(32)].map((_, i) => {
        const a = (i * Math.PI) / 16;
        const r1 = i % 4 ? 42 : 38;
        return <line key={i} x1={60 + Math.cos(a) * r1} y1={60 + Math.sin(a) * r1} x2={60 + Math.cos(a) * 45} y2={60 + Math.sin(a) * 45} stroke={INK} strokeOpacity="0.5" strokeWidth="0.7" />;
      })}
      <path d="M60 22 L66 60 L60 98 L54 60 Z" fill={INK} fillOpacity="0.75" />
      <path d="M60 22 L66 60 L54 60 Z" fill="#A04A3A" fillOpacity="0.8" />
      <path d="M22 60 L60 55 L98 60 L60 65 Z" fill={MUTED} fillOpacity="0.45" />
      <circle cx="60" cy="60" r="3" fill="#B8975A" stroke={INK} strokeOpacity="0.5" strokeWidth="0.6" />
      <text x="60" y="34" textAnchor="middle" fontSize="7" fontFamily="serif" fill={INK}>N</text>
    </svg>
  );
}

/** A manuscript page: ruled lines and a handwritten-looking heading. */
export function Manuscript({ className, title = "Field notes" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 200 260" className={className} fill="none">
      <rect x="0.5" y="0.5" width="199" height="259" rx="3" fill="#FBF6E8" stroke={LINE} />
      <text x="20" y="34" fontFamily="var(--font-serif)" fontStyle="italic" fontSize="16" fill={MUTED}>
        {title}
      </text>
      {[...Array(15)].map((_, i) => (
        <path key={i} d={`M20 ${54 + i * 13} H${i % 4 === 3 ? 120 : 180}`} stroke={LINE} strokeWidth="0.8" />
      ))}
      <path d="M150 190 c10 -14 26 -14 30 4" stroke={MUTED} strokeOpacity="0.5" />
    </svg>
  );
}
