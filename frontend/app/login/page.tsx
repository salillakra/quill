"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, CalendarDays, FileOutput, ArrowRight } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { homePath } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/status";
import { QuillMascot } from "@/components/quill-mascot";

const FEATURES = [
  { icon: CalendarDays, title: "Campus day", text: "See today’s classes, extras, and what’s due — without the timetable spreadsheet." },
  { icon: FileOutput, title: "Papers & grading", text: "Turn a syllabus into a paper, collect scripts, and release scores when you’re ready." },
  { icon: MessageSquareText, title: "Ask a document", text: "Drop a PDF and ask in plain language. Answers come with page citations." },
];

const DEMO_ACCOUNTS = [
  { label: "Admin", email: "admin@quill.ai" },
  { label: "Educator", email: "educator@quill.ai" },
  { label: "Faculty", email: "faculty@quill.ai" },
  { label: "Analyst", email: "analyst@quill.ai" },
  { label: "Student", email: "student@quill.ai" },
  { label: "Parent", email: "parent@quill.ai" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@quill.ai");
  const [password, setPassword] = useState("quill123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await api.login(email, password);
      router.replace(homePath(user));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn’t sign in. Check email and password.");
      setLoading(false);
    }
  }

  return (
    <div className="bg-mesh relative flex min-h-screen overflow-hidden">
      <div className="float-orb pointer-events-none absolute -left-24 top-10 size-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="float-orb pointer-events-none absolute -right-16 bottom-0 size-80 rounded-full bg-primary/10 blur-3xl" style={{ animationDelay: "-4s" }} />

      <div className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-10 lg:grid-cols-2">
        <div className="hidden fade-up lg:block">
          <QuillMascot size="lg" mood="happy" className="mb-6" />
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-balance">
            Campus work,
            <br />
            <span className="text-gradient">without the clutter.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">
            Timetables, papers, and grades in one calm workspace. Upload a document and ask it — like talking to a colleague who already read it.
          </p>
          <div className="mt-10 space-y-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="flex gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-primary">
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{f.title}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{f.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Card className="mx-auto w-full max-w-sm fade-up shadow-card">
          <CardHeader>
            <div className="flex items-center gap-3">
              <QuillMascot size="md" />
              <div>
                <CardTitle>Welcome back</CardTitle>
                <CardDescription>Sign in to your campus workspace</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  autoComplete="email"
                  spellCheck={false}
                  placeholder="you@school.edu"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </div>
              {error ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? <Spinner className="size-4" /> : <ArrowRight className="size-4" />}
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <div className="mt-6">
              <p className="mb-2 text-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Demo accounts</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {DEMO_ACCOUNTS.map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    onClick={() => {
                      setEmail(a.email);
                      setPassword("quill123");
                    }}
                    className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-center text-[10px] text-muted-foreground">
                Password <span className="font-mono">quill123</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
