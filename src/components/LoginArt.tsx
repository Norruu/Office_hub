export default function LoginArt() {
  return (
    <svg viewBox="0 0 480 520" role="img" aria-label="Office Hub illustration">
      <defs>
        <linearGradient id="la-purple" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8f6bff" />
          <stop offset="1" stopColor="#5a38e8" />
        </linearGradient>
        <linearGradient id="la-pink" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3a8ee" />
          <stop offset="1" stopColor="#d38be6" />
        </linearGradient>
        <linearGradient id="la-blue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b3bcff" />
          <stop offset="1" stopColor="#8e9bf7" />
        </linearGradient>
      </defs>

      {/* soft platforms */}
      <ellipse cx="240" cy="440" rx="200" ry="50" fill="#d8d3fb" opacity="0.55" />
      <ellipse cx="240" cy="440" rx="125" ry="31" fill="#c6bff8" opacity="0.8" />

      {/* faint background squares */}
      <rect x="20" y="60" width="60" height="40" rx="10" fill="#e6e1ff" opacity="0.7" transform="rotate(-12 50 80)" />
      <rect x="380" y="60" width="70" height="44" rx="10" fill="#ece8ff" opacity="0.8" transform="rotate(10 415 82)" />
      <rect x="390" y="380" width="60" height="40" rx="10" fill="#e3deff" opacity="0.7" transform="rotate(8 420 400)" />

      {/* main app panel */}
      <rect x="168" y="96" width="190" height="320" rx="30" fill="#4a2fd0" opacity="0.28" />
      <rect x="150" y="80" width="190" height="320" rx="30" fill="url(#la-purple)" />
      <circle cx="245" cy="146" r="38" fill="#ffffff" opacity="0.22" />
      <path
        d="M228 146 l12 12 l24 -26"
        fill="none"
        stroke="#ffffff"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx="186" cy={238 + i * 50} r="10" fill="#ffffff" opacity="0.9" />
          <rect x="208" y={232 + i * 50} width={[104, 84, 96][i]} height="12" rx="6" fill="#ffffff" opacity="0.75" />
        </g>
      ))}

      {/* pink card, top left */}
      <g transform="rotate(-10 100 150)">
        <rect x="36" y="108" width="132" height="84" rx="16" fill="url(#la-pink)" />
        <rect x="52" y="122" width="34" height="6" rx="3" fill="#ffffff" opacity="0.85" />
        <rect x="52" y="134" width="22" height="6" rx="3" fill="#ffffff" opacity="0.6" />
        <path d="M56 176 C 78 130, 108 190, 148 138" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
        <circle cx="170" cy="112" r="18" fill="#8b7cf6" />
        <path d="M162 112 l6 6 l11 -12" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* bar chart card, left */}
      <g transform="rotate(-6 90 306)">
        <rect x="24" y="250" width="132" height="112" rx="18" fill="url(#la-blue)" />
        <rect x="46" y="320" width="16" height="22" rx="4" fill="#ffffff" opacity="0.85" />
        <rect x="72" y="304" width="16" height="38" rx="4" fill="#ffffff" opacity="0.85" />
        <rect x="98" y="288" width="16" height="54" rx="4" fill="#ffffff" opacity="0.85" />
        <rect x="124" y="274" width="16" height="68" rx="4" fill="#4f46e5" />
      </g>

      {/* round badge, left */}
      <circle cx="64" cy="214" r="28" fill="#7db0ff" />
      <circle cx="64" cy="214" r="13" fill="none" stroke="#ffffff" strokeWidth="4" />

      {/* tile card, right */}
      <g transform="rotate(7 392 220)">
        <rect x="330" y="168" width="124" height="104" rx="16" fill="url(#la-blue)" />
        <rect x="348" y="186" width="40" height="34" rx="9" fill="#ffffff" opacity="0.85" />
        <rect x="398" y="186" width="40" height="34" rx="9" fill="#5b3df0" opacity="0.9" />
        <rect x="348" y="228" width="40" height="34" rx="9" fill="#ffffff" opacity="0.6" />
        <rect x="398" y="228" width="40" height="34" rx="9" fill="#ffffff" opacity="0.85" />
      </g>

      {/* plus bubble, right */}
      <circle cx="326" cy="124" r="22" fill="#cfc8fb" />
      <path d="M326 114 v20 M316 124 h20" stroke="#6b4df0" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}