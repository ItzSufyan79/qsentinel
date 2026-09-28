/**
 * The one place the app names an icon concept.
 *
 * Tabler, outline only, and the mapping is fixed — a concept either has an
 * icon or it gets none. Lives in its own module so both the API catalogue
 * (which needs the name as data) and the atom that renders it can import the
 * union without either depending on the other.
 */
export type IconName =
  | "atom"
  | "lock"
  | "shield-check"
  | "alert-triangle"
  | "eye"
  | "scale"
  | "activity"
  | "chart-bar"
  | "list-details"
  | "search"
  | "flask"
  | "clock"
  | "download"
  | "arrow-right"
  | "circle-check"
  | "circle-x"
  | "cpu"
  | "arrows-diff"
  | "grid-dots"
  | "repeat"
  | "signature"
  | "history"
  | "user-check"
  | "lock-question"
  | "book"
  | "magnifying-glass"
  | "player-play"
  | "player-pause"
  | "player-skip-forward"
  | "player-track-next"
  | "player-track-prev"
  | "settings"
  | "bug"
  | "list"
  | "upload"
  | "clipboard"
  | "mood-check"
  | "sparkles"
  | "tools";
