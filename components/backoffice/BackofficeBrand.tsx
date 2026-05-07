import Link from "next/link";

export default function BackofficeBrand({ homeHref }: { homeHref: string }) {
  return (
    <Link href={homeHref} className="flex shrink-0 items-center gap-2">
      <span className="text-xl font-semibold tracking-tight text-foreground">
        Activation<span className="text-primary">IQ</span>
      </span>
    </Link>
  );
}
