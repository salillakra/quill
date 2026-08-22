"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useMutation, QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Files,
  FileText,
  LogOut,
  KeyRound,
  CalendarDays,
  Users,
  DoorOpen,
  BookOpen,
  CalendarPlus,
  Clock,
  ClipboardList,
  GraduationCap,
  ListChecks,
  Contact,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { homePath } from "@/lib/roles";
import { Spinner } from "@/components/status";
import { QuillMascot } from "@/components/quill-mascot";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const DOCS_NAV = [
  { href: "/documents", label: "Library", icon: Files },
];

const CAMPUS_NAV = [
  { href: "/campus/today", label: "Today", icon: CalendarDays },
  { href: "/campus/timetable", label: "Timetable", icon: Clock },
  { href: "/campus/faculty", label: "Faculty", icon: Users },
  { href: "/campus/rooms", label: "Rooms", icon: DoorOpen },
  { href: "/campus/courses", label: "Courses", icon: BookOpen },
  { href: "/campus/extra-classes", label: "Extra classes", icon: CalendarPlus },
];

const ASSESSMENT_NAV = [
  { href: "/papers", label: "Papers", icon: FileText },
  { href: "/assessment/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/assessment/grading", label: "Mark scripts", icon: ListChecks },
  { href: "/assessment/students", label: "Students", icon: Contact },
  { href: "/assessment/analytics", label: "Class analytics", icon: GraduationCap },
];

const STUDENT_NAV = [
  { href: "/student/assignments", label: "My assignments", icon: ClipboardList },
];

const PARENT_NAV = [
  { href: "/parent/grades", label: "Grades", icon: GraduationCap },
];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  EDUCATOR: "Educator",
  FACULTY: "Faculty",
  ANALYST: "Analyst",
  STUDENT: "Student",
  PARENT: "Parent",
};

function titleFor(pathname: string): string {
  if (pathname.includes("/documents/") && pathname.endsWith("/ask")) return "Ask";
  if (pathname.includes("/documents/") && pathname.endsWith("/extract")) return "Timetable";
  if (pathname.includes("/documents/") && pathname.endsWith("/paper")) return "Create paper";
  if (pathname.startsWith("/documents/") && pathname !== "/documents") return "Document";
  const all = [...DOCS_NAV, ...CAMPUS_NAV, ...ASSESSMENT_NAV, ...STUDENT_NAV, ...PARENT_NAV];
  const hit = all.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  if (hit) return hit.label;
  return "Workspace";
}

function NavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: typeof DOCS_NAV;
  pathname: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton render={<Link href={item.href} />} isActive={active} tooltip={item.label}>
                  <Icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, retry: false });
  const user = me.data;
  const workspaces = useQuery({
    queryKey: ["auth-workspaces"],
    queryFn: api.listWorkspaces,
    enabled: me.data?.role === "ADMIN",
  });
  const [pwOpen, setPwOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [wsName, setWsName] = useState("");
  const [wsSlug, setWsSlug] = useState("");

  const changePw = useMutation({
    mutationFn: () => api.changePassword({ currentPassword: currentPw, newPassword: newPw }),
    onSuccess: () => {
      toast.success("Password updated");
      setPwOpen(false);
      setCurrentPw("");
      setNewPw("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Password change failed"),
  });

  const createWs = useMutation({
    mutationFn: () => api.createWorkspace({ name: wsName, slug: wsSlug }),
    onSuccess: () => {
      toast.success("Workspace created");
      setWsOpen(false);
      setWsName("");
      setWsSlug("");
      qc.invalidateQueries({ queryKey: ["auth-workspaces"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });

  const switchWs = useMutation({
    mutationFn: (workspaceId: string) => api.switchWorkspace(workspaceId),
    onSuccess: async () => {
      await qc.invalidateQueries();
      toast.success("Workspace switched");
      router.refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Switch failed"),
  });

  useEffect(() => {
    if (!user) return;
    if (user.role === "STUDENT" && !pathname.startsWith("/student")) {
      router.replace("/student/assignments");
    }
    if (user.role === "PARENT" && !pathname.startsWith("/parent")) {
      router.replace("/parent/grades");
    }
  }, [user, pathname, router]);

  if (me.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <QuillMascot size="lg" mood="thinking" />
            <Spinner className="size-4 text-muted-foreground" />
          </div>
      </div>
    );
  }
  if (me.isError) {
    const status = me.error instanceof ApiError ? me.error.status : 0;
    if (status === 401) {
      router.replace("/login");
      return null;
    }
    return <div className="p-8 text-destructive">Failed to load session: {me.error.message}</div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="size-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<Link href={homePath(user)} />}>
                <div className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary/15">
                  <QuillMascot size="sm" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Quill</span>
                  <span className="truncate text-xs text-muted-foreground">{user.workspace?.name ?? "Campus"}</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {user.role === "STUDENT" ? (
            <NavGroup label="Student" items={STUDENT_NAV} pathname={pathname} />
          ) : user.role === "PARENT" ? (
            <NavGroup label="Parent" items={PARENT_NAV} pathname={pathname} />
          ) : (
            <>
              <NavGroup label="Documents" items={DOCS_NAV} pathname={pathname} />
              <NavGroup label="Campus" items={CAMPUS_NAV} pathname={pathname} />
              <NavGroup label="Papers & marking" items={ASSESSMENT_NAV} pathname={pathname} />
            </>
          )}
        </SidebarContent>
        <SidebarFooter>
          <DropdownMenu>
            <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{ROLE_LABEL[user.role] ?? user.role}</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {user.role === "ADMIN" && (
                <DropdownMenuGroup>
                  {(workspaces.data ?? []).map((ws) => (
                    <DropdownMenuItem
                      key={ws.id}
                      onClick={() => {
                        if (ws.id !== user.workspaceId) switchWs.mutate(ws.id);
                      }}
                    >
                      {ws.name}
                      {ws.id === user.workspaceId ? " (current)" : ""}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onClick={() => setWsOpen(true)}>New workspace</DropdownMenuItem>
                </DropdownMenuGroup>
              )}
              {user.workspace?.name && user.role !== "ADMIN" && (
                <DropdownMenuItem disabled>{user.workspace.name}</DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setPwOpen(true)}>
                <KeyRound /> Change password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  api.logout().finally(() => router.replace("/login"));
                }}
              >
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
          <SidebarTrigger />
          <span className="text-sm font-medium">{titleFor(pathname)}</span>
        </header>
        <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              changePw.mutate();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="cur-pw">Current</Label>
              <Input id="cur-pw" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-pw">New</Label>
              <Input id="new-pw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={6} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={changePw.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={wsOpen} onOpenChange={setWsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              createWs.mutate();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="ws-name">Name</Label>
              <Input id="ws-name" value={wsName} onChange={(e) => setWsName(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ws-slug">Slug</Label>
              <Input id="ws-slug" value={wsSlug} onChange={(e) => setWsSlug(e.target.value.toLowerCase())} required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createWs.isPending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  const queryClient = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false } } }),
    [],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Suspense fallback={<ChromeFallback>{children}</ChromeFallback>}>
          <ChromeGate>{children}</ChromeGate>
        </Suspense>
        <Toaster theme="dark" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return children;
  return <ShellInner>{children}</ShellInner>;
}

function ChromeFallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh w-full">
      <div className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar md:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center border-b border-border px-4" />
        <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export { Button };
