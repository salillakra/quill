"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function DocumentSubnav({ id, staff }: { id: string; staff: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: `/documents/${id}`, label: "Overview" },
    { href: `/documents/${id}/ask`, label: "Ask" },
    ...(staff
      ? [
          { href: `/documents/${id}/extract`, label: "Timetable" },
          { href: `/documents/${id}/paper`, label: "Create paper" },
        ]
      : []),
  ];

  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
