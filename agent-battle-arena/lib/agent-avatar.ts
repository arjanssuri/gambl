// Deterministic SVG avatar generator for agent iNFTs
// Same tokenId + name always produces the same image

const PALETTES = [
  ["#FFC700", "#FF6B00"],
  ["#00FFB3", "#0066FF"],
  ["#FF2D55", "#FF6CAB"],
  ["#00E5FF", "#7B2FFF"],
  ["#39FF14", "#005C00"],
  ["#FF4500", "#FFD700"],
  ["#E040FB", "#7C4DFF"],
  ["#00BCD4", "#006064"],
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

export function generateAgentSVG(tokenId: number, name: string): string {
  const seed = hash(`${tokenId}:${name}`);
  const [c1, c2] = PALETTES[seed % PALETTES.length];
  const initials = name
    .split(/\s+/)
    .map(w => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2) || "#";

  // Geometric grid pattern cells
  const cells: string[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cellSeed = hash(`${seed}:${row}:${col}`);
      if (cellSeed % 3 === 0) {
        const opacity = 0.15 + (cellSeed % 6) * 0.08;
        cells.push(
          `<rect x="${col * 30}" y="${row * 30}" width="29" height="29" fill="${c1}" opacity="${opacity.toFixed(2)}"/>`
        );
      }
    }
  }

  // Diagonal accent lines
  const lineOffset = (seed % 5) * 40;
  const lines = Array.from({ length: 6 }, (_, i) =>
    `<line x1="${-60 + lineOffset + i * 50}" y1="0" x2="${180 + lineOffset + i * 50}" y2="240" stroke="${c2}" stroke-width="1" opacity="0.2"/>`
  ).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0a0a"/>
      <stop offset="100%" stop-color="#111"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <clipPath id="clip"><rect width="240" height="240"/></clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="240" height="240" fill="url(#bg)"/>
    ${cells.join("")}
    ${lines}
    <!-- Corner brackets -->
    <path d="M12,24 L12,12 L24,12" stroke="${c1}" stroke-width="2" fill="none" opacity="0.8"/>
    <path d="M228,24 L228,12 L216,12" stroke="${c1}" stroke-width="2" fill="none" opacity="0.8"/>
    <path d="M12,216 L12,228 L24,228" stroke="${c1}" stroke-width="2" fill="none" opacity="0.8"/>
    <path d="M228,216 L228,228 L216,228" stroke="${c1}" stroke-width="2" fill="none" opacity="0.8"/>
    <!-- Center circle -->
    <circle cx="120" cy="105" r="52" fill="none" stroke="url(#accent)" stroke-width="1.5" opacity="0.6"/>
    <circle cx="120" cy="105" r="42" fill="#0a0a0a" opacity="0.8"/>
    <!-- Initials -->
    <text x="120" y="118" font-family="monospace" font-size="${initials.length > 1 ? "32" : "40"}" font-weight="700"
      fill="url(#accent)" text-anchor="middle" dominant-baseline="middle">${initials}</text>
    <!-- Token ID badge -->
    <rect x="84" y="168" width="72" height="20" rx="2" fill="${c1}" opacity="0.15"/>
    <text x="120" y="181" font-family="monospace" font-size="10" fill="${c1}"
      text-anchor="middle" opacity="0.9">AGENT #${tokenId}</text>
  </g>
</svg>`;
}

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export function getAgentAvatarUri(tokenId: number, name: string): string {
  return svgToDataUri(generateAgentSVG(tokenId, name));
}
