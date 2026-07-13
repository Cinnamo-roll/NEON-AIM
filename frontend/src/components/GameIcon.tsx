import {
  siCounterstrike,
  siFortnite,
  siPubg,
  siValorant,
  type SimpleIcon,
} from "simple-icons";

type GameIconProps = {
  gameId: string;
  className?: string;
};

function SimpleBrandIcon({ icon }: { icon: SimpleIcon }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={icon.path} />
    </svg>
  );
}

function BrandArtwork({ gameId }: { gameId: string }) {
  switch (gameId) {
    case "cs2":
      return <SimpleBrandIcon icon={siCounterstrike} />;
    case "valorant":
      return <SimpleBrandIcon icon={siValorant} />;
    case "fortnite":
      return <SimpleBrandIcon icon={siFortnite} />;
    case "pubg":
      return <SimpleBrandIcon icon={siPubg} />;
    case "apex":
      return (
        <svg className="game-icon-wordmark" viewBox="0 0 54.33 27" aria-hidden="true">
          <path d="M8.71 0H3.18l-2 18.72H.81v.09L0 22.55h.81l-.4 3.83H4l.34-3.83h3.22l.34 3.83h3.58ZM4.66 18.72 5.94 3.83l1.29 14.89ZM22 0h-6.79l-.82 3.83h.82v22.55h4v-7.66H22a3.29 3.29 0 0 0 3.3-3.29V3.29A3.29 3.29 0 0 0 22 0Zm-.72 14.89h-2V3.83h2ZM28.83 3.83h.83v22.56h9.11v-3.84h-5.1v-7.44h3.59v-3.83h-3.59V3.83h5.1V0h-9.11ZM51.35 12.27 54.33 0h-4.24l-1.85 8.31L46.23 0h-3.14l-.83 3.83h.83l2.05 8.44v1.84l-2.98 12.28h4.23l1.85-8.31 2.01 8.31h4.08l-2.98-12.28Z" />
        </svg>
      );
    case "overwatch-2":
      return (
        <svg viewBox="18 8 28 24" aria-hidden="true">
          <path className="game-icon-accent" d="M26.69 14.41a8.75 8.75 0 0 1 10.61 0l2.16-2.67a12.17 12.17 0 0 0-14.95 0Z" />
          <path d="M40.14 12.3 38 15a8.46 8.46 0 0 1 1.54 10.45l-4.76-4.58-2.22-5v7.6L37.23 28a8.75 8.75 0 0 1-10.46 0l4.71-4.53v-7.6l-2.22 5-4.76 4.55A8.46 8.46 0 0 1 26 15l-2.14-2.7a11.89 11.89 0 0 0-3.94 8.85 12.09 12.09 0 0 0 24.17 0 11.9 11.9 0 0 0-3.95-8.85Z" />
        </svg>
      );
    case "call-of-duty":
      return (
        <svg className="game-icon-wordmark game-icon-cod-art" viewBox="245 -167 503 503" aria-hidden="true">
          <path d="M497.83-65.97h-37.1V70.7h63.07V44.92h-25.97Zm69.42 0h-37.1V70.7h63.06V44.92h-25.96ZM343.55-64.42a5.2 5.2 0 0 0-3.83-1.55H289.7a5.2 5.2 0 0 0-3.83 1.55 246 246 0 0 0-13.7 16.27 5.5 5.5 0 0 0-1.07 3.4v94.22a5.5 5.5 0 0 0 1.07 3.4 246 246 0 0 0 13.7 16.27 5.2 5.2 0 0 0 3.82 1.55h50.03a5.2 5.2 0 0 0 3.83-1.55 246 246 0 0 0 13.69-16.27 5.5 5.5 0 0 0 1.07-3.4V11.63h-33.88v36.3h-19.45V-42.2h19.45v35.3h33.88v-37.84a5.5 5.5 0 0 0-1.07-3.4 246 246 0 0 0-13.69-16.27Zm94.91 0a5.2 5.2 0 0 0-3.83-1.55H384.6a5.2 5.2 0 0 0-3.82 1.55 246 246 0 0 0-13.69 16.27 5.5 5.5 0 0 0-1.07 3.4V70.7h33.88V30.43h19.45V70.7h33.88V-44.75a5.5 5.5 0 0 0-1.08-3.4 246 246 0 0 0-13.69-16.27ZM399.9 7.71V-42.2h19.45V7.71Zm114.33 189.83h-19.47V84.2h-33.9v114.88a5.5 5.5 0 0 0 1.07 3.39 246 246 0 0 0 13.71 16.19 5.2 5.2 0 0 0 3.83 1.54h50.06a5.2 5.2 0 0 0 3.83-1.54 246 246 0 0 0 13.7-16.19 5.5 5.5 0 0 0 1.08-3.39V84.2h-33.91Zm-75.95-111.8a5.2 5.2 0 0 0-3.83-1.54h-68.66v136h68.66a5.2 5.2 0 0 0 3.83-1.54 246 246 0 0 0 13.7-16.19 5.5 5.5 0 0 0 1.08-3.39v-93.75a5.5 5.5 0 0 0-1.08-3.39 246 246 0 0 0-13.7-16.19Zm-19.13 78.58v33.22H399.7v-90.68h19.45Zm267.64-80.12h31.7v59.29a5 5 0 0 1-1.13 3.18l-22.24 27.12v46.41H658.6v-46.41l-22.16-27.12a5 5 0 0 1-1.14-3.18V84.2h31.64v50.55l8.24 9.87h3.42l8.19-9.87Zm-381.65.7a2.3 2.3 0 0 0-1.7-.7h-25.28a2.3 2.3 0 0 0-1.7.7 97 97 0 0 0-4.88 6.08 2.6 2.6 0 0 0-.48 1.53v43.1c0 .54.16 1.11.48 1.54l4.88 6.08a2.3 2.3 0 0 0 1.7.7h25.28a2.3 2.3 0 0 0 1.7-.7 97 97 0 0 0 4.88-6.08c.32-.43.48-1 .48-1.54v-43.1c0-.54-.16-1.11-.48-1.53a97 97 0 0 0-4.88-6.08Zm-9.75 35.25v10.9h-9.2V97.07h9.2Zm21.54 23.78h15.1v-19.72h16.18v-13.87h-16.18V98.07h18.26V84.2h-33.36Zm311.75-59.73h-73.56v27.85h19.69V220.2h33.9V112.05h19.69V84.2Z" />
        </svg>
      );
    case "rainbow-six":
      return (
        <svg viewBox="1058 35 67 102" aria-hidden="true">
          <path fillRule="evenodd" d="M1116 75.43c-3.62-3.65-8.92-5.5-15.75-5.5-.41 0-12.1 0-18.73 8.17 0-2.81-.2-10 1.15-15s4.54-10.65 7.91-11.83a2 2 0 0 1 1.27 0c4.21 1.47 7.56 9.22 8.28 11.82h22.26c-1.16-9.34-3.79-15.64-8.22-19.76-4.94-4.59-12.3-6.74-23.18-6.74-11.55 0-19.53 2.94-24.37 9-4.36 5.43-6.39 13.42-6.39 25.14v31.7c0 12.5 1.73 19.91 5.77 24.76 4.34 5.22 11.89 7.66 23.74 7.67h3.47c11.63 0 19.12-2.75 23.58-8.66 3.91-5.17 5.82-12.89 5.82-25 0-.46 0-1-.04-1.47-.09-6.64-.18-17.67-6.77-24.3Zm-14.68 35.41-2 2.9v1.46h2v1.65l-.75 1.08h-18.29l-.76-1.08v-1.65h2v-1.46l-2-2.9V96.9l.11-.27c1.89-4.11 12.93-10.66 19.69-10.66Z" />
        </svg>
      );
    case "delta-force":
      return (
        <svg viewBox="335 0 563 486" aria-hidden="true">
          <path d="M616.67 0 335.57 485.93h562.19L670.67 93.36 542.26 315.78h58.79l-45.31 81.46 130.5-111.63h-58.61l33.31-57.68 105.89 183.42H464.62L616.67 148Z" />
        </svg>
      );
    case "crossfire":
      return (
        <svg className="game-icon-crossfire-art" viewBox="0 0 32 32" aria-hidden="true">
          <path className="game-icon-crossfire-ring" d="M25.4 8.2A12.2 12.2 0 0 0 6.1 10m0 12a12.2 12.2 0 0 0 19.3 1.8M4.7 13.2A12.3 12.3 0 0 0 4 16c0 1 .1 1.9.3 2.8M27.3 18.8A12.3 12.3 0 0 0 28 16c0-1-.1-1.9-.3-2.8" />
          <path d="M14.9 9.5h-4.3l-3.4 3.4v6.2l3.4 3.4h4.3v-3.3h-2.8l-1.6-1.6v-3.2l1.6-1.6h2.8Zm2 0v13h3.4v-4.7h4.2v-3.1h-4.2v-2h4.9V9.5Z" />
        </svg>
      );
    case "neon":
      return (
        <svg className="game-icon-stroke" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M12 5H5v7M28 5h7v7M12 35H5v-7M28 35h7v-7M11.5 29V11l17 18V11" />
          <circle cx="20" cy="20" r="2.6" />
        </svg>
      );
    default:
      return (
        <svg className="game-icon-stroke" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m4 8 8-4 8 4-8 4Zm0 4 8 4 8-4M4 16l8 4 8-4" />
        </svg>
      );
  }
}

export function GameIcon({ gameId, className }: GameIconProps) {
  const classes = ["game-icon", `game-icon-${gameId}`, className].filter(Boolean).join(" ");
  return (
    <span className={classes} aria-hidden="true">
      <BrandArtwork gameId={gameId} />
    </span>
  );
}
