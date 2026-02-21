export const Logo = (props: React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      viewBox="0 0 200 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Geometric mark — overlapping diamond grid */}
      <rect x="2" y="10" width="12" height="12" rx="1" fill="white" transform="rotate(45 8 16)" />
      <rect x="14" y="10" width="12" height="12" rx="1" fill="#FF1A1A" transform="rotate(45 20 16)" />
      <rect x="8" y="4" width="10" height="10" rx="1" fill="white" fillOpacity="0.35" transform="rotate(45 13 9)" />
      {/* Wordmark */}
      <text
        x="44"
        y="27"
        fill="white"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="24"
        fontWeight="700"
        letterSpacing="3"
      >
        GAMBL.
      </text>
    </svg>
  );
};
