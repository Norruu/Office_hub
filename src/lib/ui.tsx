import type { CSSProperties } from "react";

const ICONS = {
  apps: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  log: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  health: "M22 12h-4l-3 9L9 3l-3 9H2",
  fleet: "M2 4h20v13H2z M8 21h8 M12 17v4",
  updates: "M12 3v12 M7 11l5 5 5-5 M4 21h16",
  backup:
    "M12 3c4.4 0 8 1.1 8 2.5S16.4 8 12 8 4 6.9 4 5.5 7.6 3 12 3z M4 5.5v6C4 12.9 7.6 14 12 14s8-1.1 8-2.5v-6 M4 11.5v6C4 18.9 7.6 20 12 20s8-1.1 8-2.5v-6",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  play: "M8 5v14l11-7z",
  copy: "M9 9h10v10H9z M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

const TILE_COLORS = [
  ["#8f6bff", "#5a38e8"],
  ["#f3a8ee", "#d38be6"],
  ["#7db0ff", "#5b6cf0"],
  ["#6fd3c0", "#3aa6b9"],
];

// One or two letters for the coloured tile on each app card
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "?";
  const second = words.length > 1 ? words[1][0] : "";
  return (first + second).toUpperCase();
}

// The same app always gets the same colour
export function tileStyle(name: string): CSSProperties {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const [a, b] = TILE_COLORS[h % TILE_COLORS.length];
  return { background: `linear-gradient(135deg, ${a}, ${b})` };
}