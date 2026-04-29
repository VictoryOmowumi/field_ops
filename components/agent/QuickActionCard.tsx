import Link from "next/link";

type QuickActionCardProps = {
  title: string;
  description: string;
  href: string;
};

export default function QuickActionCard({ title, description, href }: QuickActionCardProps) {
  return (
    <Link href={href} className="block rounded-xl border bg-card p-4 shadow-sm transition hover:bg-muted/50">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}
