import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-3 border-t border-border pt-4 text-xs text-zinc-500">
      <Link className="hover:text-white" href="/about">
        About
      </Link>
      <Link className="hover:text-white" href="/privacy">
        Privacy
      </Link>
      <Link className="hover:text-white" href="/terms">
        Terms
      </Link>
    </footer>
  );
}
