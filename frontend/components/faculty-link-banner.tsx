"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { needsFacultyLink } from "@/lib/roles";

export function FacultyLinkBanner() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  if (!needsFacultyLink(me.data)) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      Today is showing everyone’s classes. Ask an admin to connect your name on{" "}
      <Link href="/campus/faculty" className="font-medium underline underline-offset-2 hover:text-amber-100">
        Faculty
      </Link>{" "}
      so you only see yours.
    </div>
  );
}
