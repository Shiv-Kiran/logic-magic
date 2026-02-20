type MagicLogicLogoProps = {
  size?: number;
  showWordmark?: boolean;
};

export function MagicLogicLogo({ size = 34, showWordmark = true }: MagicLogicLogoProps) {
  return (
    <div className="inline-flex items-center gap-3">
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className="shrink-0"
      >
        <rect x="1.5" y="1.5" width="45" height="45" rx="8" fill="#050505" stroke="#FAFAFA" strokeWidth="2" />
        <path d="M13 33V15h4.2l6.8 9.9 6.8-9.9H35v18h-4v-10.7l-6.3 9.1h-1.4L17 22.3V33z" fill="#FAFAFA" />
      </svg>
      {showWordmark ? (
        <span className="font-mono text-sm uppercase tracking-[0.2em] text-zinc-200">
          MagicLogic
        </span>
      ) : null}
    </div>
  );
}
