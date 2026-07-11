import {
  Home,
  CalendarRange,
  BookOpenCheck,
  ClipboardList,
  Clock,
  LayoutDashboard,
  ListChecks,
  CalendarClock,
  Trophy,
  LineChart,
  History,
  Sparkles,
  ArrowRight,
  Play,
  CheckCircle2,
  Award,
  Target,
  Flame,
} from "lucide-react";
import {
  Facebook,
  Users,
  Youtube,
  MessageCircle,
  ShieldCheck,
  HelpCircle,
  Phone,
  ChevronLeft,
  BadgeCheck,
  Calculator,
  Scale,
  TrendingUp,
  Landmark,
  FileText,
  BookOpen,
} from "lucide-react";
import {
  Bell,
  ChevronRight,
  Fingerprint,
  LifeBuoy,
  Zap,
  PlayCircle,
  Timer,
  Search,
  Filter,
  Download,
  Printer,
  Crown,
  Medal,
  Star,
  CalendarDays,
  TrendingDown,
  BarChart2,
  PieChart,
  Percent,
  CalendarCheck,
  Inbox,
  Hourglass,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useExamBatchFlow } from "./flow-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { useRequireExamBatchApproval, useExamBatchAccess } from "./access-gate";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  listAvailableExamBatchSessions,
  getExamBatchAccess,
  listMyExamBatchEnrollments,
  listExamBatchSessionSubjects,
  enrollInExamBatchSession,
  getMyExamBatchEnrollment,
} from "@/lib/exam-batch/student-enrollment.functions";
import { listExamBatchExamsForSession } from "@/lib/exam-batch/student-exam.functions";
import {
  getExamBatchStudentLeaderboard,
  getExamBatchStudentHistory,
  getExamBatchStudentProgress,
} from "@/lib/exam-batch/student-results.functions";
import { getExamBatchPublicSettings } from "@/lib/exam-batch/public-settings.functions";
import { VerificationBody, resolveContent } from "./verification-view";

import type { ExamBatchSessionRow } from "@/lib/exam-batch/types";
import { Layers, GraduationCap } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  SessionCard,
  StatCard,
  StatusBadge,
  DataTable,
  EmptyState,
  Stepper,
  SkeletonGrid,
  primaryBtnCls,
  ghostBtnCls,
  type Column,
  type SessionCardData,
} from "./kit";
import {
  LineChart as LineChartSvg,
  BarChart as BarChartSvg,
  DonutChart,
  AnimatedCounter,
} from "./charts";
import {
  mockExams,
  mockLeaderboard,
  type ExamRow,
  type LeaderRow,
} from "./mock-data";
import { mockExamCards } from "./mock-data";

// Translate a backend `ExamBatchSessionRow` into the `SessionCardData` shape
// the presentational `SessionCard` expects. `totalStudents` is not tracked
// on the sessions row — we display `subjects_count` and let the enrollment
// number stay hidden until a real aggregate query lands in a later phase.
function toSessionCardData(
  s: ExamBatchSessionRow,
  opts?: { current?: boolean },
): SessionCardData {
  return {
    id: s.id,
    title: s.title,
    subtitle: s.subtitle ?? undefined,
    status: s.status === "active" ? "active" : "closed",
    registrationOpen: s.registration_open,
    totalStudents: 0,
    startsAt: s.starts_at,
    registrationDeadline: s.registration_deadline ?? undefined,
    subjectsCount: s.subjects_count,
    isCurrent: opts?.current,
  };
}


function useExamBatchCurrentSessionId(): {
  sessionId: string | null;
  isLoading: boolean;
  isError: boolean;
  sessionTitle: string | null;
} {
  const { state } = useExamBatchFlow();
  const q = useQuery({
    queryKey: ["exam-batch", "student", "sessions"],
    queryFn: () => listAvailableExamBatchSessions({ data: {} }),
  });
  const sessions = q.data ?? [];
  const current = sessions.length
    ? (state.sessionId && sessions.find((x) => x.id === state.sessionId)) ||
      sessions.find((x) => x.status === "active") ||
      sessions[0]
    : null;
  return {
    sessionId: current?.id ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    sessionTitle: current?.title ?? null,
  };
}

const ENROLL_STEPS = [
  { label: "Session", hint: "Choose batch" },
  { label: "Subjects", hint: "Pick papers" },
  { label: "Review", hint: "Confirm details" },
  { label: "Approval", hint: "Verification" },
];

const subjectIconMap: Record<string, LucideIcon> = {
  accounting: Calculator,
  law: Scale,
  economics: TrendingUp,
  quant: Landmark,
  cost: FileText,
  audit: BookOpen,
};

// -------- Home --------
// NOTE: All redirect logic lives in the parent layout route
// `src/routes/_student.exam-batch.tsx`. Do NOT add a `useEffect` that
// navigates based on enrollment status here — it will race the layout
// guard and cause the flicker this file was written to avoid.
export function StudentHome() {
  const navigate = useNavigate();
  const { setSession } = useExamBatchFlow();
  const { enrollment } = useExamBatchAccess();

  const sessionsQuery = useQuery({
    queryKey: ["exam-batch", "student", "sessions"],
    queryFn: () => listAvailableExamBatchSessions({ data: {} }),
    staleTime: 30_000,
  });

  const sessions = sessionsQuery.data ?? [];

  const pickSession = (id: string) => {
    setSession(id);
    navigate({ to: "/exam-batch/subjects" as never });
  };

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch"
        title="Available exam sessions"
        description="Pick a session to see its subjects and start your enrollment."
        icon={Home}
      />
      {sessionsQuery.isLoading ? (
        <SkeletonGrid count={3} />
      ) : sessionsQuery.isError ? (
        <EmptyState
          icon={Home}
          title="Couldn't load sessions"
          description={(sessionsQuery.error as Error)?.message ?? "Please try again."}
          action={
            <button
              type="button"
              className={primaryBtnCls}
              onClick={() => void sessionsQuery.refetch()}
            >
              Retry
            </button>
          }
        />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No exam sessions available yet"
          description="An admin will publish new exam batch sessions soon. Check back shortly — this page updates in real time."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map((s) => {
            const data = toSessionCardData(s, {
              current: enrollment?.session_id === s.id,
            });
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <SessionCard
                  data={data}
                  actions={
                    s.registration_open ? (
                      <button
                        type="button"
                        onClick={() => pickSession(s.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90"
                      >
                        Enroll <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur"
                      >
                        Registration closed
                      </button>
                    )
                  }
                />
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );
}


// ============================================================
// -------- Leaderboard (Top 20 + own row) --------
// ============================================================
type LeaderboardEntry = {
  rank: number;
  studentId: string;
  name: string;
  marks: number;
  finishTime: string; // "hh:mm:ss"
  batch: string;
};

const CURRENT_STUDENT_ID = "CAB-2026-00421";

function pad(n: number, w = 2) {
  return String(n).padStart(w, "0");
}
function fmtDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function buildLeaderboard(count = 46): LeaderboardEntry[] {
  const names = [
    "Nusrat Jahan",
    "Rahim Uddin",
    "Sadia Rahman",
    "Faisal Karim",
    "Tanvir Alam",
    "Ayesha Siddiqua",
    "Imran Hossain",
    "Sabbir Ahmed",
    "Mehnaz Chowdhury",
    "Nashid Kabir",
    "Rifat Islam",
    "Farhana Yasmin",
    "Adnan Rahman",
    "Sumaiya Akter",
    "Zahid Hasan",
    "Nabila Anjum",
    "Fahim Reza",
    "Rakib Sharif",
    "Tania Parvin",
    "Mahmud Alam",
    "Sanjida Islam",
    "Rezaul Karim",
    "Anika Tabassum",
    "Shakil Ahmed",
  ];
  const arr: LeaderboardEntry[] = [];
  for (let i = 0; i < count; i++) {
    const marks = Math.max(20, 100 - i * 1.6 - (i % 3));
    arr.push({
      rank: i + 1,
      studentId: `CAB-2026-${pad(1000 + i * 3 + (i % 7), 5)}`,
      name: names[i % names.length],
      marks: Math.round(marks),
      finishTime: fmtDuration(1800 + i * 47 + (i % 5) * 11),
      batch: i % 2 ? "Aug 2026" : "Nov 2026",
    });
  }
  // Inject current student at rank 34
  arr[33] = {
    ...arr[33],
    studentId: CURRENT_STUDENT_ID,
    name: "You (Rahim Uddin)",
    marks: 62,
    finishTime: fmtDuration(3540),
  };
  return arr;
}

function rankMedal(rank: number) {
  if (rank === 1) return { Icon: Crown, cls: "text-amber-500", ring: "ring-amber-500/40" };
  if (rank === 2) return { Icon: Medal, cls: "text-zinc-400", ring: "ring-zinc-400/40" };
  if (rank === 3) return { Icon: Medal, cls: "text-orange-400", ring: "ring-orange-400/40" };
  return null;
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .replace(/^You \(/, "")
    .replace(/\)$/, "")
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <div className="bg-cta-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold text-white shadow-glow">
      {initials}
    </div>
  );
}

function LeaderboardRow({
  row,
  isMe,
}: {
  row: LeaderboardEntry;
  isMe: boolean;
}) {
  const medal = rankMedal(row.rank);
  return (
    <tr
      className={cn(
        "border-t border-border/60 transition-colors",
        isMe
          ? "bg-primary/8 ring-1 ring-inset ring-primary/30"
          : "hover:bg-muted/40",
      )}
    >
      <td className="px-3 py-2.5 align-middle">
        <div className="flex items-center gap-2">
          {medal ? (
            <span
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-background ring-1",
                medal.ring,
                medal.cls,
              )}
            >
              <medal.Icon className="h-4 w-4" />
            </span>
          ) : (
            <span
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-xl font-display text-xs font-bold tabular-nums",
                isMe ? "bg-cta-gradient text-white shadow-glow" : "bg-muted text-foreground",
              )}
            >
              {row.rank}
            </span>
          )}
          {isMe && (
            <span className="hidden rounded-full bg-cta-gradient px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-glow sm:inline">
              You
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{row.studentId}</span>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={row.name} />
          <div className="min-w-0">
            <p className={cn("truncate font-semibold", isMe && "text-primary")}>{row.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.batch}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <span className="font-display text-base font-bold tabular-nums">{row.marks}</span>
        <span className="ml-0.5 text-xs text-muted-foreground">/100</span>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
          <Hourglass className="h-3.5 w-3.5 text-muted-foreground" />
          {row.finishTime}
        </span>
      </td>
    </tr>
  );
}

function LeaderboardCard({ row, isMe }: { row: LeaderboardEntry; isMe: boolean }) {
  const medal = rankMedal(row.rank);
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "glass shadow-card-soft rounded-2xl p-3.5",
        isMe && "ring-1 ring-primary/40",
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        {medal ? (
          <span
            className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background ring-1",
              medal.ring,
              medal.cls,
            )}
          >
            <medal.Icon className="h-5 w-5" />
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-display text-sm font-bold tabular-nums",
              isMe ? "bg-cta-gradient text-white shadow-glow" : "bg-muted text-foreground",
            )}
          >
            {row.rank}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className={cn("truncate font-semibold", isMe && "text-primary")}>{row.name}</p>
            {isMe && (
              <span className="shrink-0 rounded-full bg-cta-gradient px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white shadow-glow">
                You
              </span>
            )}
          </div>
          <p className="truncate whitespace-nowrap font-mono text-[11px] text-muted-foreground">{row.studentId}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-lg font-bold tabular-nums leading-none">{row.marks}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">/ 100</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <span className="truncate">{row.batch}</span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Hourglass className="h-3 w-3" />
          {row.finishTime}
        </span>
      </div>
    </motion.article>
  );
}

function SelectPlaceholder({
  label,
  value,
  icon: Icon = Filter,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="glass flex min-w-0 items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-semibold">{value}</p>
      </div>
      <ChevronRight className="ml-1 h-3.5 w-3.5 shrink-0 rotate-90 text-muted-foreground" />
    </div>
  );
}

export function LeaderboardSkeleton() {
  return (
    <div className="glass shadow-card-soft rounded-3xl p-4">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/40" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/40" />
        ))}
      </div>
    </div>
  );
}

export function StudentLeaderboard() {
  const navigate = useNavigate();
  const gate = useRequireExamBatchApproval();
  const ctx = useExamBatchCurrentSessionId();
  const [examId, setExamId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const examsQuery = useQuery({
    queryKey: ["exam-batch", "student", "exams", ctx.sessionId],
    queryFn: () => listExamBatchExamsForSession({ data: { sessionId: ctx.sessionId as string } }),
    enabled: !!ctx.sessionId,
  });
  const exams = examsQuery.data ?? [];

  // Auto-pick most recent ended/live exam once loaded.
  useEffect(() => {
    if (examId || !exams.length) return;
    const preferred =
      exams.find((e) => e.availability === "ended") ??
      exams.find((e) => e.availability === "live") ??
      exams[0];
    if (preferred) setExamId(preferred.id);
  }, [examId, exams]);

  const boardQuery = useQuery({
    queryKey: ["exam-batch", "student", "leaderboard", examId],
    queryFn: () => getExamBatchStudentLeaderboard({ data: { examId: examId as string } }),
    enabled: !!examId,
  });
  const board = boardQuery.data ?? null;

  const filteredTop = useMemo(() => {
    if (!board) return [];
    const q = search.trim().toLowerCase();
    if (!q) return board.top;
    return board.top.filter((r) => String(r.studentId).toLowerCase().includes(q));
  }, [board, search]);

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch"
        title="Leaderboard"
        description="Top 20 performers for each exam in your enrolled subjects."
        icon={Trophy}
        action={
          <Link
            to={"/exam-batch/leaderboard/preview" as never}
            preload="intent"
            className={cn(ghostBtnCls, "hidden sm:inline-flex")}
          >
            <Printer className="h-4 w-4" />
            Preview PDF
          </Link>
        }
      />

      {/* KPI cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Your rank"
          value={board?.self ? `#${board.self.rank}` : "—"}
          icon={Trophy}
          tone="primary"
        />
        <StatCard
          label="Your marks"
          value={board?.self ? board.self.marks : "—"}
          icon={Star}
          tone="success"
        />
        <StatCard
          label="Total ranked"
          value={board?.exam.entryCount ?? "—"}
          icon={Users}
          tone="info"
        />
        <StatCard
          label="Top score"
          value={board?.top[0]?.marks ?? "—"}
          icon={Crown}
          tone="warning"
        />
      </div>

      {/* Filters */}
      <div className="glass shadow-card-soft mb-4 flex flex-col gap-2 rounded-2xl p-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search leaderboard"
            placeholder="Search by student ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-input bg-background/60 pl-9 pr-3 text-sm outline-none ring-ring/20 transition focus:ring-2"
          />
        </div>
        <label className="inline-flex min-w-[240px] items-center gap-2 rounded-xl border border-input bg-background/60 px-3 text-sm">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Exam
          </span>
          <select
            aria-label="Select exam"
            value={examId ?? ""}
            onChange={(e) => setExamId(e.target.value || null)}
            disabled={!exams.length}
            className="h-10 flex-1 bg-transparent outline-none disabled:cursor-not-allowed"
          >
            {!exams.length && <option value="">No exams yet</option>}
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SectionCard>
        {ctx.isLoading || examsQuery.isLoading || boardQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-muted/40" />
            ))}
          </div>
        ) : ctx.isError || examsQuery.isError || boardQuery.isError ? (
          <EmptyState
            icon={Trophy}
            title="Unable to load leaderboard"
            description="Please refresh the page. If the issue persists, contact support."
          />
        ) : !ctx.sessionId ? (
          <EmptyState
            icon={Trophy}
            title="No active session"
            description="You will see leaderboards once you are enrolled in a session."
          />
        ) : !examId || !board ? (
          <EmptyState
            icon={Trophy}
            title="Select an exam"
            description="Pick an exam from the dropdown above to view its leaderboard."
          />
        ) : !board.exam.isVisibleToStudent ? (
          <EmptyState
            icon={Trophy}
            title="Leaderboard not published yet"
            description={
              board.exam.frozenAt
                ? `Rankings for “${board.exam.title}” have been archived.`
                : `Rankings for “${board.exam.title}” appear after the exam window closes.`
            }
          />
        ) : filteredTop.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matching entries"
            description="Try a different search or clear the filter."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/60">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Rank</th>
                  <th className="px-3 py-2.5 font-semibold">Student ID</th>
                  <th className="px-3 py-2.5 font-semibold">Marks</th>
                  <th className="px-3 py-2.5 font-semibold">Percentage</th>
                  <th className="px-3 py-2.5 font-semibold">Time (s)</th>
                </tr>
              </thead>
              <tbody>
                {filteredTop.map((r) => (
                  <tr
                    key={`${r.studentId}-${r.rank}`}
                    className={cn(
                      "border-t border-border/60 transition-colors hover:bg-muted/30",
                      r.isSelf && "bg-primary/10 font-semibold",
                    )}
                  >
                    <td className="px-3 py-2.5 align-middle tabular-nums">#{r.rank}</td>
                    <td className="px-3 py-2.5 align-middle tabular-nums">{r.studentId}</td>
                    <td className="px-3 py-2.5 align-middle tabular-nums">{r.marks}</td>
                    <td className="px-3 py-2.5 align-middle tabular-nums">
                      {r.percentage.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5 align-middle tabular-nums">{r.timeUsedSeconds}</td>
                  </tr>
                ))}
                {board.self &&
                !filteredTop.some((r) => r.studentId === board.self!.studentId) ? (
                  <tr className="border-t-2 border-dashed border-border bg-primary/5 font-semibold">
                    <td className="px-3 py-2.5 align-middle tabular-nums">#{board.self.rank}</td>
                    <td className="px-3 py-2.5 align-middle tabular-nums">
                      {board.self.studentId}
                    </td>
                    <td className="px-3 py-2.5 align-middle tabular-nums">{board.self.marks}</td>
                    <td className="px-3 py-2.5 align-middle tabular-nums">
                      {board.self.percentage.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5 align-middle tabular-nums">
                      {board.self.timeUsedSeconds}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="mt-4">
        <button
          type="button"
          className={cn(ghostBtnCls, "!text-xs")}
          onClick={() => navigate({ to: "/exam-batch/history" as never })}
        >
          <History className="h-4 w-4" />
          View exam history
        </button>
      </div>
    </>
  );
}

// ============================================================
// -------- Progress Center --------
// ============================================================
export function ProgressSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/40" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-60 animate-pulse rounded-3xl bg-muted/40 lg:col-span-2" />
        <div className="h-60 animate-pulse rounded-3xl bg-muted/40" />
      </div>
    </div>
  );
}

function Heatmap() {
  // 12 weeks x 7 days
  const cells = Array.from({ length: 12 * 7 }).map((_, i) => (i * 37) % 5);
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: "repeat(12, minmax(0,1fr))" }}
      role="img"
      aria-label="12 week study heatmap"
    >
      {cells.map((v, i) => {
        const tones = [
          "bg-muted/60",
          "bg-primary/25",
          "bg-primary/45",
          "bg-primary/70",
          "bg-cta-gradient shadow-glow",
        ];
        return (
          <div key={i} className={cn("aspect-square rounded-[4px]", tones[v])} />
        );
      })}
    </div>
  );
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-28 w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} strokeWidth="10" className="fill-none stroke-muted" />
          <motion.circle
            cx="50"
            cy="50"
            r={r}
            strokeWidth="10"
            strokeLinecap="round"
            className="fill-none stroke-[url(#progressGrad)]"
            initial={{ strokeDasharray: c, strokeDashoffset: c }}
            animate={{ strokeDashoffset: off }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          />
          <defs>
            <linearGradient id="progressGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.5" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold tabular-nums">
            <AnimatedCounter value={value} />
            <span className="text-sm">%</span>
          </span>
        </div>
      </div>
      <p className="mt-2 text-xs font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

export function StudentProgress() {
  const gate = useRequireExamBatchApproval();
  const [window, setWindow] = useState<"daily" | "weekly" | "30d">("30d");
  const query = useQuery({
    queryKey: ["exam-batch", "student", "progress", window],
    queryFn: () => getExamBatchStudentProgress({ data: { window } }),
  });
  const p = query.data ?? null;
  const fmtPct = (n: number | undefined) =>
    typeof n === "number" ? `${Math.round(n)}%` : "—";
  const fmt = (n: number | undefined) => (typeof n === "number" ? String(n) : "—");

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch"
        title="Progress Center"
        description="Your batch performance across daily, weekly and monthly windows."
        icon={LineChart}
        action={
          <div className="inline-flex rounded-xl border border-border/60 bg-background/60 p-1">
            {(["daily", "weekly", "30d"] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindow(w)}
                className={cn(
                  "h-8 rounded-lg px-3 text-xs font-semibold transition",
                  window === w
                    ? "bg-cta-gradient text-white shadow-glow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {w === "daily" ? "Today" : w === "weekly" ? "This week" : "30 days"}
              </button>
            ))}
          </div>
        }
      />

      {query.isLoading ? (
        <ProgressSkeleton />
      ) : query.isError ? (
        <EmptyState
          icon={LineChart}
          title="Unable to load progress"
          description="Please refresh the page. If the issue persists, contact support."
        />
      ) : !p ? (
        <EmptyState
          icon={LineChart}
          title="No progress yet"
          description="Your progress will appear here after your first exam."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Exams scheduled"
              value={fmt(p.examsScheduled)}
              icon={CalendarDays}
              tone="primary"
            />
            <StatCard
              label="Exams attended"
              value={fmt(p.examsAttended)}
              icon={CalendarCheck}
              tone="info"
            />
            <StatCard
              label="Attendance"
              value={fmtPct(p.attendanceRate)}
              icon={CalendarCheck}
              tone="success"
            />
            <StatCard
              label="Completion"
              value={fmtPct(p.completionRate)}
              icon={BarChart2}
              tone="warning"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Average marks"
              value={fmt(Math.round(p.averageMarks))}
              hint={`${fmtPct(p.averagePercentage)} avg`}
              icon={Target}
              tone="primary"
            />
            <StatCard
              label="Highest %"
              value={fmtPct(p.highestPercentage)}
              icon={Award}
              tone="success"
            />
            <StatCard
              label="Lowest %"
              value={fmtPct(p.lowestPercentage)}
              icon={TrendingDown}
              tone="warning"
            />
            <StatCard
              label="Accuracy"
              value={fmtPct(p.accuracy)}
              hint={`${p.totalCorrect}/${p.totalCorrect + p.totalWrong + p.totalSkipped} qns`}
              icon={Percent}
              tone="info"
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SectionCard
              title="Answer distribution"
              description={`Window: ${p.window === "30d" ? "Last 30 days" : p.window === "weekly" ? "This week" : "Today"}`}
              className="lg:col-span-2"
            >
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                  <p className="font-display text-3xl font-bold tabular-nums text-emerald-500">
                    {p.totalCorrect}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Correct
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                  <p className="font-display text-3xl font-bold tabular-nums text-rose-500">
                    {p.totalWrong}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Wrong
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                  <p className="font-display text-3xl font-bold tabular-nums text-muted-foreground">
                    {p.totalSkipped}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Skipped
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Updated {new Date(p.updatedAt).toLocaleString()}
              </p>
            </SectionCard>
            <SectionCard title="Completion rate">
              <div className="flex items-center justify-center py-3">
                <ProgressRing
                  value={Math.max(0, Math.min(100, Math.round(p.completionRate)))}
                  label="Submitted / attended"
                />
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </>
  );
}

// ============================================================
// -------- Exam History (Timeline + Table + Cards) --------
// ============================================================
type HistoryItem = {
  id: string;
  subject: string;
  chapter: string;
  title: string;
  date: string;
  marks: number;
  total: number;
  position: number;
  duration: string;
  status: "passed" | "failed" | "excellent";
};

const HISTORY: HistoryItem[] = [
  {
    id: "h1",
    subject: "Financial Accounting",
    chapter: "Ch. 4 · Depreciation",
    title: "Weekly Mock 12",
    date: new Date(Date.now() - 2 * 86400000).toISOString(),
    marks: 82,
    total: 100,
    position: 14,
    duration: "58 min",
    status: "excellent",
  },
  {
    id: "h2",
    subject: "Business Law",
    chapter: "Ch. 2 · Contracts",
    title: "Chapter Test 06",
    date: new Date(Date.now() - 9 * 86400000).toISOString(),
    marks: 68,
    total: 100,
    position: 42,
    duration: "45 min",
    status: "passed",
  },
  {
    id: "h3",
    subject: "Cost Accounting",
    chapter: "Ch. 7 · Overheads",
    title: "Grand Test 01",
    date: new Date(Date.now() - 18 * 86400000).toISOString(),
    marks: 74,
    total: 100,
    position: 28,
    duration: "3h 45m",
    status: "passed",
  },
  {
    id: "h4",
    subject: "Economics",
    chapter: "Ch. 3 · Demand & Supply",
    title: "Weekly Mock 11",
    date: new Date(Date.now() - 25 * 86400000).toISOString(),
    marks: 44,
    total: 100,
    position: 96,
    duration: "52 min",
    status: "failed",
  },
];

function statusChip(s: HistoryItem["status"]) {
  if (s === "excellent")
    return { cls: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/30", label: "Excellent" };
  if (s === "passed")
    return { cls: "bg-sky-500/15 text-sky-500 ring-sky-500/30", label: "Passed" };
  return { cls: "bg-rose-500/15 text-rose-500 ring-rose-500/30", label: "Retake" };
}

function HistoryCard({ h }: { h: HistoryItem }) {
  const chip = statusChip(h.status);
  const pct = Math.round((h.marks / h.total) * 100);
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35 }}
      className="glass shadow-card-soft group relative overflow-hidden rounded-3xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-glow"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cta-gradient opacity-10 blur-3xl" />
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset",
                chip.cls,
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {chip.label}
            </span>
            <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {h.subject}
            </span>
          </div>
          <h3 className="mt-1.5 truncate font-display text-base font-bold">{h.title}</h3>
          <p className="truncate text-xs text-muted-foreground">{h.chapter}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold tabular-nums leading-none">{h.marks}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            / {h.total} · {pct}%
          </p>
        </div>
      </div>

      <div className="relative mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-xs">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Exam date
          </p>
          <p className="mt-0.5 truncate font-semibold">
            {new Date(h.date).toLocaleDateString(undefined, {
              day: "2-digit",
              month: "short",
              year: "2-digit",
            })}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Position
          </p>
          <p className="mt-0.5 truncate font-semibold">#{h.position}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Duration
          </p>
          <p className="mt-0.5 truncate font-semibold">{h.duration}</p>
        </div>
      </div>

      <div className="relative mt-3 flex items-center justify-between gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="bg-cta-gradient h-full"
            style={{ width: `${pct}%` }}
            aria-label={`Score ${pct}%`}
          />
        </div>
        <button className={cn(ghostBtnCls, "h-9 min-h-9 px-3 text-xs")} type="button">
          Review
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.article>
  );
}

export function HistorySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="glass shadow-card-soft h-40 animate-pulse rounded-3xl bg-muted/30" />
      ))}
    </div>
  );
}

export function StudentHistory() {
  const gate = useRequireExamBatchApproval();
  const navigate = useNavigate();
  const ctx = useExamBatchCurrentSessionId();
  const [subjectId, setSubjectId] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const examsQuery = useQuery({
    queryKey: ["exam-batch", "student", "exams", ctx.sessionId],
    queryFn: () => listExamBatchExamsForSession({ data: { sessionId: ctx.sessionId as string } }),
    enabled: !!ctx.sessionId,
  });
  const subjects = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of examsQuery.data ?? []) {
      if (!seen.has(e.subjectId)) {
        seen.add(e.subjectId);
        out.push(e.subjectId);
      }
    }
    return out;
  }, [examsQuery.data]);

  const historyQuery = useQuery({
    queryKey: [
      "exam-batch",
      "student",
      "history",
      ctx.sessionId,
      subjectId,
      offset,
      limit,
    ],
    queryFn: () =>
      getExamBatchStudentHistory({
        data: {
          sessionId: ctx.sessionId ?? undefined,
          subjectId: subjectId || undefined,
          offset,
          limit,
        },
      }),
    enabled: !!ctx.sessionId,
  });
  const items = historyQuery.data?.items ?? [];
  const total = historyQuery.data?.total ?? 0;
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const goResult = (attemptId: string | null) => {
    if (!attemptId) return;
    navigate({ to: "/exam-batch-take" as never, search: { attemptId } as never });
  };

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch"
        title="Exam history"
        description="Every attempt with marks, position, duration and answer review."
        icon={History}
        action={
          <label className="inline-flex min-w-[220px] items-center gap-2 rounded-xl border border-input bg-background/60 px-3 text-sm">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Subject
            </span>
            <select
              aria-label="Filter by subject"
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setOffset(0);
              }}
              className="h-10 flex-1 bg-transparent outline-none"
            >
              <option value="">All subjects</option>
              {subjects.map((id) => (
                <option key={id} value={id}>
                  {id.slice(0, 8)}…
                </option>
              ))}
            </select>
          </label>
        }
      />

      {historyQuery.isLoading || ctx.isLoading ? (
        <HistorySkeleton />
      ) : historyQuery.isError ? (
        <EmptyState
          icon={Inbox}
          title="Unable to load history"
          description="Please refresh the page. If the issue persists, contact support."
        />
      ) : !ctx.sessionId ? (
        <EmptyState
          icon={Inbox}
          title="No active session"
          description="Your history will appear here after you enroll in a session."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No exam history yet"
          description="Once you complete your first exam, your attempts and results will appear here."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {items.map((h) => {
              const pct = h.result?.percentage ?? null;
              const marks = h.result?.marks ?? null;
              const max = h.result?.maxMarks ?? null;
              const cls =
                h.status === "attended"
                  ? "bg-emerald-500/15 text-emerald-500 ring-emerald-500/30"
                  : h.status === "in_progress"
                    ? "bg-sky-500/15 text-sky-500 ring-sky-500/30"
                    : "bg-rose-500/15 text-rose-500 ring-rose-500/30";
              const label =
                h.status === "attended"
                  ? "Attended"
                  : h.status === "in_progress"
                    ? "In progress"
                    : "Missed";
              return (
                <motion.article
                  key={`${h.examId}-${h.attemptId ?? "na"}`}
                  initial={{ opacity: 0, y: 6 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.35 }}
                  className="glass shadow-card-soft group relative overflow-hidden rounded-3xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-glow"
                >
                  <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cta-gradient opacity-10 blur-3xl" />
                  <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset",
                          cls,
                        )}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {label}
                      </span>
                      <h3 className="mt-1.5 truncate font-display text-base font-bold">
                        {h.title}
                      </h3>
                      <p className="truncate text-xs text-muted-foreground">
                        {new Date(h.windowStart).toLocaleString()} → {" "}
                        {new Date(h.windowEnd).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold tabular-nums leading-none">
                        {marks ?? "—"}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {max ? `/ ${max}` : ""} {pct != null ? `· ${pct.toFixed(1)}%` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="relative mt-3 flex items-center justify-between gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="bg-cta-gradient h-full"
                        style={{ width: `${pct ?? 0}%` }}
                        aria-label={`Score ${pct ?? 0}%`}
                      />
                    </div>
                    <button
                      type="button"
                      className={cn(ghostBtnCls, "h-9 min-h-9 px-3 text-xs")}
                      disabled={!h.attemptId}
                      onClick={() => goResult(h.attemptId)}
                    >
                      Review
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages} · {total} attempts
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={cn(ghostBtnCls, "!text-xs")}
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <button
                  type="button"
                  className={cn(ghostBtnCls, "!text-xs")}
                  disabled={page >= totalPages}
                  onClick={() => setOffset(offset + limit)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ============================================================
// -------- Leaderboard PDF Preview --------
// ============================================================
export function StudentLeaderboardPdfPreview() {
  const rows = useMemo(() => buildLeaderboard(30).slice(0, 20), []);
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Print preview
          </p>
          <h1 className="font-display text-xl font-bold sm:text-2xl">
            Leaderboard — Grand Test 01
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link to={"/exam-batch/leaderboard" as never} className={ghostBtnCls}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Link>
          <button className={primaryBtnCls} type="button">
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      {/* Printable sheet */}
      <div className="glass shadow-card-soft mx-auto rounded-3xl bg-background p-6 print:rounded-none print:shadow-none sm:p-10">
        {/* Header */}
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-border/70 pb-5">
          <div className="bg-cta-gradient flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-display text-xl font-bold text-white shadow-glow">
            CA
          </div>
          <div className="min-w-0 text-center">
            <h2 className="font-display text-lg font-bold sm:text-xl">CA Aspire BD</h2>
            <p className="text-xs text-muted-foreground">
              Official Exam Batch Leaderboard · Grand Test 01
            </p>
          </div>
          <div className="hidden text-right text-[10px] text-muted-foreground sm:block">
            <p className="font-semibold uppercase tracking-widest">Issue date</p>
            <p className="mt-0.5 tabular-nums">
              {new Date().toLocaleDateString(undefined, {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        </header>

        {/* Meta strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <p className="font-semibold uppercase tracking-widest text-muted-foreground">Session</p>
            <p className="mt-0.5 font-semibold">August 2026</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-widest text-muted-foreground">Level</p>
            <p className="mt-0.5 font-semibold">CA Foundation</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-widest text-muted-foreground">Total</p>
            <p className="mt-0.5 font-semibold tabular-nums">1,284 students</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-widest text-muted-foreground">Duration</p>
            <p className="mt-0.5 font-semibold">3h 00m</p>
          </div>
        </div>

        {/* Table */}
        <div className="mt-5 overflow-x-auto rounded-2xl border border-border/70">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-muted/50 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Position</th>
                <th className="px-3 py-2 font-semibold">Student ID</th>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Marks</th>
                <th className="px-3 py-2 font-semibold">Finish time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.studentId} className="border-t border-border/70">
                  <td className="px-3 py-2 font-semibold tabular-nums">#{r.rank}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                    {r.studentId}
                  </td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 font-display font-bold tabular-nums">
                    {r.marks}
                    <span className="ml-0.5 text-xs text-muted-foreground">/100</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.finishTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Comment section */}
        <section className="mt-5 rounded-2xl border border-dashed border-border/70 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Instructor comments
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            Congratulations to the top performers of Grand Test 01. Overall accuracy improved by
            <b> 6.2%</b> compared to the previous exam. Keep focusing on <b>Depreciation</b> and
            <b> Contracts</b> chapters — they remain the highest-weight topics for the upcoming
            module.
          </p>
        </section>

        {/* Footer */}
        <footer className="mt-6 grid grid-cols-1 gap-3 border-t border-border/70 pt-5 text-xs sm:grid-cols-2">
          <div>
            <p className="font-display font-bold">CA Aspire BD</p>
            <p className="mt-1 text-muted-foreground">
              Nation's premium Chartered Accountancy exam preparation platform.
            </p>
          </div>
          <ul className="space-y-1 sm:text-right">
            <li className="flex items-center gap-2 text-muted-foreground sm:justify-end">
              <BookOpen className="h-3.5 w-3.5" /> www.caaspirebd.com
            </li>
            <li className="flex items-center gap-2 text-muted-foreground sm:justify-end">
              <Facebook className="h-3.5 w-3.5" /> facebook.com/caaspirebd
            </li>
            <li className="flex items-center gap-2 text-muted-foreground sm:justify-end">
              <Users className="h-3.5 w-3.5" /> Facebook Group · CA Aspire BD Family
            </li>
            <li className="flex items-center gap-2 text-muted-foreground sm:justify-end">
              <Youtube className="h-3.5 w-3.5" /> youtube.com/@caaspirebd
            </li>
          </ul>
        </footer>

        <p className="mt-5 text-center text-[10px] text-muted-foreground">
          Generated by CA Aspire BD · © {new Date().getFullYear()} · Ranks are provisional until
          verified by the academic office.
        </p>
      </div>
    </div>
  );
}
// -------- Sessions (student) --------
// Redirects handled by layout guard — see StudentHome note.
export function StudentSessions() {
  const navigate = useNavigate();
  const { setSession } = useExamBatchFlow();
  const { enrollment } = useExamBatchAccess();
  const sessionsQuery = useQuery({
    queryKey: ["exam-batch", "student", "sessions"],
    queryFn: () => listAvailableExamBatchSessions({ data: {} }),
    staleTime: 30_000,
  });
  const sessions = sessionsQuery.data ?? [];
  const pickSession = (id: string) => {
    setSession(id);
    navigate({ to: "/exam-batch/subjects" as never });
  };
  return (
    <>
      <PageHeader
        eyebrow="Exam Batch · Step 1"
        title="Choose your exam session"
        description="Pick the cohort you'd like to enroll in. You can only be active in one batch at a time."
        icon={CalendarRange}
      />
      <Stepper steps={ENROLL_STEPS} current={0} />
      {sessionsQuery.isLoading ? (
        <SkeletonGrid count={3} />
      ) : sessionsQuery.isError ? (
        <EmptyState
          icon={CalendarRange}
          title="Couldn't load sessions"
          description={(sessionsQuery.error as Error)?.message ?? "Please try again."}
          action={
            <button
              type="button"
              className={primaryBtnCls}
              onClick={() => void sessionsQuery.refetch()}
            >
              Retry
            </button>
          }
        />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No exam sessions available yet"
          description="An admin hasn't published any sessions yet. This page updates in real time."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map((s) => {
            const data = toSessionCardData(s, {
              current: enrollment?.session_id === s.id,
            });
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <SessionCard
                  data={data}
                  actions={
                    s.registration_open ? (
                      <button
                        type="button"
                        onClick={() => pickSession(s.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90"
                      >
                        Continue <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur"
                      >
                        Registration closed
                      </button>
                    )
                  }
                />
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );
}


// -------- Subject selection --------
// Redirects handled by layout guard — see StudentHome note.
export function StudentSubjects() {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const { state, setSubjects } = useExamBatchFlow();

  const sessionsQuery = useQuery({
    queryKey: ["exam-batch", "student", "sessions"],
    queryFn: () => listAvailableExamBatchSessions({ data: {} }),
    staleTime: 30_000,
  });
  const session = useMemo(
    () => sessionsQuery.data?.find((s) => s.id === state.sessionId) ?? null,
    [sessionsQuery.data, state.sessionId],
  );

  const subjectsQuery = useQuery({
    queryKey: ["exam-batch", "student", "session-subjects", state.sessionId],
    queryFn: () =>
      listExamBatchSessionSubjects({ data: { sessionId: state.sessionId as string } }),
    enabled: !!state.sessionId,
    staleTime: 30_000,
  });
  const subjects = subjectsQuery.data ?? [];

  const [picked, setPicked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!hydrated) return;
    const map: Record<string, boolean> = {};
    state.subjectIds.forEach((id) => (map[id] = true));
    setPicked(map);
  }, [hydrated, state.subjectIds]);
  const toggle = (id: string) => setPicked((p) => ({ ...p, [id]: !p[id] }));
  const selectedIds = Object.entries(picked)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const count = selectedIds.length;

  const goBack = () => navigate({ to: "/exam-batch" as never });
  const goContinue = () => {
    setSubjects(selectedIds);
    navigate({ to: "/exam-batch/enrollment" as never });
  };

  if (hydrated && !state.sessionId) {
    return (
      <>
        <PageHeader
          eyebrow="Exam Batch · Step 2"
          title="Pick a session first"
          description="Choose an exam session from the Home page before selecting subjects."
          icon={BookOpenCheck}
        />
        <div className="mt-4">
          <button className={primaryBtnCls} onClick={goBack} type="button">
            <ChevronLeft className="h-4 w-4" /> Back to sessions
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch · Step 2"
        title={session ? `Subjects · ${session.title}` : "Choose your subjects"}
        description="Pick the papers you'll prepare for in this batch. You can update this later."
        icon={BookOpenCheck}
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/30">
            <BadgeCheck className="h-3.5 w-3.5" /> {count} selected
          </span>
        }
      />
      <Stepper steps={ENROLL_STEPS} current={1} />

      {subjectsQuery.isLoading ? (
        <SkeletonGrid count={4} />
      ) : subjectsQuery.isError ? (
        <EmptyState
          icon={BookOpenCheck}
          title="Couldn't load subjects"
          description={(subjectsQuery.error as Error)?.message ?? "Please try again."}
          action={
            <button
              type="button"
              className={primaryBtnCls}
              onClick={() => void subjectsQuery.refetch()}
            >
              Retry
            </button>
          }
        />
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          title="No subjects configured yet"
          description="An admin hasn't added subjects for this session's level yet. This page updates live."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {subjects.map((s) => {
            const active = !!picked[s.id];
            return (
              <motion.label
                key={s.id}
                whileHover={{ y: -2 }}
                className={`glass shadow-card-soft group relative flex cursor-pointer flex-col gap-4 overflow-hidden rounded-3xl p-5 transition-all hover:shadow-glow ${
                  active ? "ring-2 ring-primary/60" : "ring-1 ring-inset ring-border/60"
                }`}
              >
                {active && (
                  <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-cta-gradient opacity-20 blur-3xl" />
                )}
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="bg-cta-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-glow">
                      <BookOpenCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-base font-semibold">{s.name}</p>
                      {s.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {s.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggle(s.id)}
                    className="h-5 w-5 shrink-0 accent-[color:var(--primary)]"
                  />
                </div>
              </motion.label>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button className={ghostBtnCls} onClick={goBack} type="button">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <button
          className={primaryBtnCls}
          disabled={count === 0}
          onClick={goContinue}
          type="button"
        >
          Continue to verification <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 p-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <p className="text-xs font-semibold">
            {count} <span className="text-muted-foreground">selected</span>
          </p>
          <button
            className={primaryBtnCls}
            disabled={count === 0}
            onClick={goContinue}
            type="button"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}


// -------- Enrollment --------
export function StudentEnrollment() {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const { state } = useExamBatchFlow();
  // Redirects handled by layout guard — see StudentHome note.



  const sessionsQuery = useQuery({
    queryKey: ["exam-batch", "student", "sessions"],
    queryFn: () => listAvailableExamBatchSessions({ data: {} }),
    staleTime: 30_000,
  });
  const session = useMemo(
    () => sessionsQuery.data?.find((s) => s.id === state.sessionId) ?? null,
    [sessionsQuery.data, state.sessionId],
  );

  const subjectsQuery = useQuery({
    queryKey: ["exam-batch", "student", "session-subjects", state.sessionId],
    queryFn: () =>
      listExamBatchSessionSubjects({ data: { sessionId: state.sessionId as string } }),
    enabled: !!state.sessionId,
    staleTime: 30_000,
  });
  const pickedSubjects = useMemo(
    () =>
      (subjectsQuery.data ?? []).filter((s) => state.subjectIds.includes(s.id)),
    [subjectsQuery.data, state.subjectIds],
  );

  const enrollMut = useMutation({
    mutationFn: () =>
      enrollInExamBatchSession({
        data: {
          sessionId: state.sessionId as string,
          subjectIds: state.subjectIds,
        },
      }),
    onSuccess: () => {
      toast.success("Submitted for approval");
      void queryClient.invalidateQueries({ queryKey: ["exam-batch"] });
      navigate({ to: "/exam-batch/pending" as never });
    },
    onError: (e: Error) => {
      // If the backend says the student is already enrolled, that's not an
      // error the user needs to see — they've already submitted. Silently
      // route them to the Pending page so polling can take over.
      const msg = (e?.message || "").toLowerCase();
      if (msg.includes("already enrolled")) {
        void queryClient.invalidateQueries({ queryKey: ["exam-batch"] });
        navigate({ to: "/exam-batch/pending" as never });
        return;
      }
      toast.error(e.message || "Enrollment failed");
    },
  });


  const publicSettingsQuery = useQuery({
    queryKey: ["exam-batch", "public-settings"],
    queryFn: () => getExamBatchPublicSettings(),
    staleTime: 30_000,
  });
  const content = publicSettingsQuery.data?.content ?? null;
  const resolved = resolveContent(content);

  const submitEnroll = () => {
    if (!state.sessionId || state.subjectIds.length === 0) return;
    enrollMut.mutate();
  };

  if (hydrated && (!state.sessionId || state.subjectIds.length === 0)) {
    return (
      <>
        <PageHeader
          eyebrow="Exam Batch · Step 3"
          title="Pick a session and subjects first"
          description="Choose your session and select at least one subject before continuing to verification."
          icon={ClipboardList}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className={primaryBtnCls}
            type="button"
            onClick={() => navigate({ to: "/exam-batch" as never })}
          >
            <ChevronLeft className="h-4 w-4" /> Back to sessions
          </button>
          {state.sessionId && (
            <button
              className={ghostBtnCls}
              type="button"
              onClick={() => navigate({ to: "/exam-batch/subjects" as never })}
            >
              Choose subjects
            </button>
          )}
        </div>
      </>
    );
  }

  const aside = resolved.verificationVisible ? (
    <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
      <SectionCard title="Enrollment summary">
        <ul className="space-y-3 text-sm">
          <li className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Session</span>
            <span className="min-w-0 truncate text-right font-semibold">
              {session?.title ?? "—"}
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Level</span>
            <span className="min-w-0 truncate text-right font-semibold">
              {session?.subtitle ?? session?.level ?? "—"}
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Subjects</span>
            <span className="font-semibold">
              {state.subjectIds.length} selected
            </span>
          </li>
          <li className="flex items-center justify-between border-t border-border/60 pt-3">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge status="pending" />
          </li>
        </ul>
        {pickedSubjects.length > 0 && (
          <ul className="mt-3 grid grid-cols-1 gap-2">
            {pickedSubjects.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/40 p-2.5"
              >
                <div className="bg-cta-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-glow">
                  <BookOpenCheck className="h-4 w-4" />
                </div>
                <p className="truncate text-sm font-semibold">{s.name}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <button
            className={primaryBtnCls}
            type="button"
            onClick={submitEnroll}
            disabled={enrollMut.isPending}
          >
            <ShieldCheck className="h-4 w-4" />
            {enrollMut.isPending ? "Submitting…" : "Submit for approval"}
          </button>
          <button
            className={ghostBtnCls}
            type="button"
            onClick={() => navigate({ to: "/exam-batch/subjects" as never })}
          >
            <ChevronLeft className="h-4 w-4" /> Back to subjects
          </button>
        </div>
      </SectionCard>
    </aside>
  ) : null;

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch · Step 3"
        title="Verification"
        description={
          resolved.verificationInstructions ||
          "Complete these quick steps to verify your identity and unlock your batch."
        }
        icon={ShieldCheck}
      />
      {resolved.verificationVisible && (
        <Stepper steps={ENROLL_STEPS} current={2} />
      )}

      <VerificationBody content={content} interactive aside={aside} />

      {resolved.verificationVisible && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 p-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-md items-center justify-between gap-2">
            <p className="truncate text-xs font-semibold">
              {state.subjectIds.length}{" "}
              <span className="text-muted-foreground">subjects</span>
            </p>
            <button
              className={primaryBtnCls}
              type="button"
              onClick={submitEnroll}
              disabled={enrollMut.isPending}
            >
              <ShieldCheck className="h-4 w-4" />
              {enrollMut.isPending ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}


// -------- Pending approval --------
// Reads ONLY from the SSOT hook. Approval flips arrive via Supabase
// Realtime → the layout guard redirects to /dashboard on the same tick.
// There is no local polling, no local invalidation, no local redirect.
export function StudentPending() {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const { state, reset } = useExamBatchFlow();
  const {
    sessionId: resolvedSessionId,
    session: resolvedSession,
    enrollment,
    enrollmentStatus,
    isLoading: accessLoading,
  } = useExamBatchAccess();

  const activeSessionId = enrollment?.session_id ?? state.sessionId ?? resolvedSessionId;
  const session = resolvedSession;
  const effectiveEnrollment = enrollment;
  const status = enrollmentStatus;

  if (hydrated && !accessLoading && !activeSessionId) {
    return (
      <>
        <PageHeader
          eyebrow="Exam Batch · Step 4"
          title="Nothing pending yet"
          description="Complete the verification step to submit your enrollment for approval."
          icon={Clock}
        />
        <div className="mt-4">
          <button
            className={primaryBtnCls}
            type="button"
            onClick={() => navigate({ to: "/exam-batch" as never })}
          >
            <ChevronLeft className="h-4 w-4" /> Back to sessions
          </button>
        </div>
      </>
    );
  }

  if (hydrated && !accessLoading && activeSessionId && !effectiveEnrollment) {
    return (
      <>
        <PageHeader
          eyebrow="Exam Batch · Step 4"
          title="No enrollment on file"
          description="You haven't submitted a verification yet for this session."
          icon={Clock}
        />
        <div className="mt-4">
          <button
            className={primaryBtnCls}
            type="button"
            onClick={() => navigate({ to: "/exam-batch" as never })}
          >
            <ChevronLeft className="h-4 w-4" /> Back to sessions
          </button>
        </div>
      </>
    );
  }

  if (hydrated && status === "rejected") {
    return (
      <>
        <PageHeader
          eyebrow="Exam Batch · Step 4"
          title="Enrollment rejected"
          description={
            effectiveEnrollment?.notes ||
            "Your enrollment was rejected. Contact the admin or start a fresh application."
          }
          icon={Clock}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className={primaryBtnCls}
            type="button"
            onClick={() => {
              reset();
              navigate({ to: "/exam-batch" as never });
            }}
          >
            Start over
          </button>
        </div>
      </>
    );
  }

  return <StudentPendingView
    session={session}
    effectiveEnrollment={effectiveEnrollment}
    status={status}
  />;
}


function StudentPendingView({
  session,
  effectiveEnrollment,
  status,
}: {
  session: { title?: string | null; subtitle?: string | null; level?: string | null } | null;
  effectiveEnrollment: { created_at: string; notes?: string | null } | null;
  status: string | null;
}) {
  const publicSettingsQuery = useQuery({
    queryKey: ["exam-batch", "public-settings"],
    queryFn: () => getExamBatchPublicSettings(),
    staleTime: 30_000,
  });
  const resolved = resolveContent(publicSettingsQuery.data?.content ?? null);

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch · Step 4"
        title={resolved.pendingTitle}
        description={resolved.pendingDescription}
        icon={Clock}
      />
      <Stepper steps={ENROLL_STEPS} current={3} />


      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-6"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-cta-gradient opacity-25 blur-3xl" />
            <div className="relative flex flex-col items-center gap-4 text-center">
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-500/15 text-amber-500 ring-1 ring-inset ring-amber-500/30">
                <Hourglass className="h-8 w-8" />
              </span>
              <div>
                <p className="font-display text-xl font-bold">Awaiting admin approval</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You will get access to the Exam Dashboard once an admin approves
                  your enrollment. This page updates in real time.
                </p>
              </div>
              <div className="mt-2 h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "45%" }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  className="bg-cta-gradient h-full"
                />
              </div>
            </div>
          </motion.div>

          <SectionCard title="What you submitted">
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Session</span>
                <span className="min-w-0 truncate text-right font-semibold">
                  {session?.title ?? "—"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Level</span>
                <span className="min-w-0 truncate text-right font-semibold">
                  {session?.subtitle ?? session?.level ?? "—"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Submitted</span>
                <span className="font-semibold">
                  {effectiveEnrollment
                    ? new Date(effectiveEnrollment.created_at).toLocaleString()
                    : "—"}
                </span>
              </li>
              <li className="flex items-center justify-between border-t border-border/60 pt-3">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={status ?? "pending"} />
              </li>
            </ul>
          </SectionCard>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <SectionCard title="What's next">
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-muted-foreground">Verification submitted.</span>
              </li>
              <li className="flex items-start gap-3">
                <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span className="text-muted-foreground">Waiting for admin approval.</span>
              </li>
              <li className="flex items-start gap-3">
                <LayoutDashboard className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Exam Dashboard unlocks after approval.
                </span>
              </li>
            </ol>
          </SectionCard>
        </aside>
      </div>
    </>
  );
}


// -------- Exam dashboard (post-approval) --------

// Live ticking timestamp for countdown seconds
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function StudentIdBadge({ id = "1001" }: { id?: string }) {
  return (
    <div className="relative inline-flex max-w-full rounded-2xl bg-cta-gradient p-[1.5px] shadow-glow">
      <div className="glass flex items-center gap-2.5 rounded-[14px] bg-background/85 px-3.5 py-2 backdrop-blur">
        <span className="bg-cta-gradient inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white">
          <Fingerprint className="h-3.5 w-3.5" />
        </span>
        <div className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Student ID
          </span>
          <span className="font-display text-sm font-bold tabular-nums">{id}</span>
        </div>
      </div>
    </div>
  );
}

function CountUnit({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[64px] flex-1 rounded-2xl bg-white/15 px-3 py-3 text-center backdrop-blur ring-1 ring-inset ring-white/25">
      <p className="font-display text-2xl font-black leading-none tabular-nums text-white sm:text-3xl">
        {String(value).padStart(2, "0")}
      </p>
      <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-white/75">
        {label}
      </p>
    </div>
  );
}

function ExamCountdownHero({
  session,
  level,
  examDate,
}: {
  session: string;
  level: string;
  examDate: string;
}) {
  const now = useNow(1000);
  const target = new Date(examDate).getTime();
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff / 3600000) % 24);
  const mins = Math.floor((diff / 60000) % 60);
  const secs = Math.floor((diff / 1000) % 60);
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-3xl shadow-card-soft"
    >
      <div className="bg-cta-gradient absolute inset-0" />
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-black/25 blur-3xl" />
      <div className="relative flex flex-col gap-5 p-5 text-white sm:p-7">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] backdrop-blur">
              <Timer className="h-3 w-3" /> Exam countdown
            </span>
            <h2 className="mt-3 truncate font-display text-2xl font-black sm:text-3xl">
              {session}
            </h2>
            <p className="mt-1 text-sm text-white/85">
              {level} ·{" "}
              <span className="font-semibold text-white">
                {new Date(examDate).toLocaleDateString(undefined, {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-2 rounded-2xl bg-white/15 px-3 py-2 backdrop-blur sm:inline-flex">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs font-semibold">Approved</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          <CountUnit label="Days" value={days} />
          <CountUnit label="Hours" value={hours} />
          <CountUnit label="Minutes" value={mins} />
          <CountUnit label="Seconds" value={secs} />
        </div>
      </div>
    </motion.section>
  );
}

// Top 20 leaderboard placeholders (extends the 5 from mock-data)
const dashLeaderboard: (LeaderRow & { studentId: string; isMe?: boolean })[] = Array.from(
  { length: 20 },
  (_, i) => {
    const base = mockLeaderboard[i % mockLeaderboard.length];
    return {
      ...base,
      id: `top-${i + 1}`,
      rank: i + 1,
      score: 990 - i * 8 - (i % 3),
      accuracy: Math.max(58, 94 - i),
      studentId: String(1000 + i + 1),
      isMe: i + 1 === 7,
      name:
        i < mockLeaderboard.length
          ? base.name
          : [
              "Ayesha Noor",
              "Imran Hossain",
              "Priya Das",
              "Karim Sheikh",
              "Meherun Nesa",
              "Sabbir Khan",
              "Lamia Akter",
              "Rifat Chowdhury",
              "Sultana Begum",
              "Nayeem Rahman",
              "Farhan Islam",
              "Zarin Tasnim",
              "Hasan Mahmud",
              "Rumana Yasmin",
              "Adnan Kabir",
            ][i - mockLeaderboard.length] ?? "Student",
    };
  },
);

const dashHistory = [
  {
    id: "h1",
    subject: "Financial Accounting",
    exam: "Ch. 4 · Depreciation",
    date: "08 Jul 2026",
    marks: "82 / 100",
    status: "approved" as const,
  },
  {
    id: "h2",
    subject: "Business Law",
    exam: "Ch. 7 · Contracts",
    date: "05 Jul 2026",
    marks: "74 / 100",
    status: "approved" as const,
  },
  {
    id: "h3",
    subject: "Economics",
    exam: "Grand Test 01",
    date: "01 Jul 2026",
    marks: "88 / 100",
    status: "approved" as const,
  },
  {
    id: "h4",
    subject: "Quantitative Aptitude",
    exam: "Ch. 3 · Ratios",
    date: "28 Jun 2026",
    marks: "—",
    status: "pending" as const,
  },
];

const dashNotifications = [
  {
    id: "n1",
    icon: Trophy,
    title: "You climbed to Rank #7",
    hint: "Weekly Mock 03 results are live",
    at: "5m ago",
    tone: "from-amber-500 to-orange-500",
  },
  {
    id: "n2",
    icon: PlayCircle,
    title: "New exam available",
    hint: "Financial Accounting · Ch. 4 opens now",
    at: "1h ago",
    tone: "from-emerald-500 to-green-500",
  },
  {
    id: "n3",
    icon: CalendarClock,
    title: "Reminder: Business Law tomorrow",
    hint: "Tomorrow, 09:00 AM · 60 min",
    at: "3h ago",
    tone: "from-indigo-500 to-purple-500",
  },
  {
    id: "n4",
    icon: Sparkles,
    title: "Answer key released",
    hint: "Grand Test 01 · view explanations",
    at: "Yesterday",
    tone: "from-fuchsia-500 to-pink-500",
  },
];

export function StudentDashboard() {
  // Reads from the SSOT hook — no local access query, no local redirect.
  // The layout guard at `_student.exam-batch.tsx` handles the "not
  // approved → /pending" case, so we never see this component render
  // without approval.
  const {
    session: currentSession,
    sessionId,
    canAccessDashboard,
    studentId: studentIdValue,
    isLoading: accessLoading,
    isError: accessError,
  } = useExamBatchAccess();

  const sessionsIsLoading = accessLoading;

  const examsQuery = useQuery({
    queryKey: ["exam-batch", "student", "exams", sessionId],
    queryFn: () => listExamBatchExamsForSession({ data: { sessionId: sessionId as string } }),
    enabled: !!sessionId && canAccessDashboard,
  });

  const publicSettingsQuery = useQuery({
    queryKey: ["exam-batch", "public-settings"],
    queryFn: () => getExamBatchPublicSettings(),
    staleTime: 30_000,
  });
  const countdown = publicSettingsQuery.data?.countdown;
  const showCountdown = !!(
    countdown &&
    countdown.enabled &&
    countdown.showOnDashboard &&
    countdown.targetIso
  );


  const exams = examsQuery.data ?? [];
  const availableCount = exams.filter(
    (e) => e.availability === "available" || e.availability === "live",
  ).length;
  const upcomingCount = exams.filter(
    (e) => e.availability === "announced" || e.availability === "upcoming",
  ).length;

  const studentIdDisplay =
    typeof studentIdValue === "number" ? String(studentIdValue) : accessLoading ? "…" : "—";
  const sessionTitle = currentSession?.title ?? (sessionsIsLoading ? "Loading…" : "—");
  const sessionLevel = currentSession?.level ?? (sessionsIsLoading ? "…" : "—");
  const availableDisplay = !sessionId
    ? "—"
    : examsQuery.isLoading
      ? "…"
      : String(availableCount);
  const upcomingDisplay = !sessionId
    ? "—"
    : examsQuery.isLoading
      ? "…"
      : String(upcomingCount);

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch"
        title="Exam dashboard"
        description="Your personalized command center — approved for this batch."
        icon={LayoutDashboard}
      />

      {showCountdown && countdown ? (
        <div className="mt-6">
          <ExamCountdownHero
            session={countdown.label || sessionTitle}
            level={sessionLevel}
            examDate={countdown.targetIso as string}
          />
        </div>
      ) : null}



      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Current Session"
          value={<span className="truncate block" title={sessionTitle}>{sessionTitle}</span>}
          hint={currentSession?.subtitle ?? undefined}
          icon={Layers}
          tone="primary"
        />
        <StatCard
          label="Current Level"
          value={sessionLevel}
          icon={GraduationCap}
          tone="info"
        />
        <StatCard
          label="Student ID"
          value={studentIdDisplay}
          hint={studentIdValue == null ? "Assigned after approval" : "Server-generated · unique"}
          icon={Fingerprint}
          tone="success"
        />
        <StatCard
          label="Available Exams"
          value={availableDisplay}
          hint="Open now"
          icon={ListChecks}
          tone="warning"
        />
        <StatCard
          label="Upcoming Exams"
          value={upcomingDisplay}
          hint="Scheduled next"
          icon={CalendarClock}
          tone="primary"
        />
      </section>

      {sessionsQuery.isError || accessQuery.isError || examsQuery.isError ? (
        <div className="mt-6">
          <EmptyState
            icon={ListChecks}
            title="Unable to load dashboard"
            description="Please refresh the page. If the issue persists, contact support."
          />
        </div>
      ) : null}
    </>
  );
}


// -------- Available exams --------
export function StudentAvailable() {
  const navigate = useNavigate();
  const gate = useRequireExamBatchApproval();
  const ctx = useExamBatchCurrentSessionId();
  const [q, setQ] = useState("");
  const examsQuery = useQuery({
    queryKey: ["exam-batch", "student", "exams", ctx.sessionId],
    queryFn: () => listExamBatchExamsForSession({ data: { sessionId: ctx.sessionId as string } }),
    enabled: !!ctx.sessionId,
  });
  const rows = useMemo(() => {
    const list = (examsQuery.data ?? []).filter(
      (e) => e.availability === "available" || e.availability === "live",
    );
    const term = q.trim().toLowerCase();
    return term ? list.filter((e) => e.title.toLowerCase().includes(term)) : list;
  }, [examsQuery.data, q]);

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch"
        title="Available exams"
        description="Live and open exams you can attempt right now."
        icon={ListChecks}
      />
      <div className="glass shadow-card-soft mb-4 flex items-center gap-2 rounded-2xl p-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search exams"
            placeholder="Search exam title…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 w-full rounded-xl border border-input bg-background/60 pl-9 pr-3 text-sm outline-none ring-ring/20 focus:ring-2"
          />
        </div>
      </div>
      <SectionCard>
        {ctx.isLoading || examsQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-3xl bg-muted/30" />
            ))}
          </div>
        ) : ctx.isError || examsQuery.isError ? (
          <EmptyState
            icon={ListChecks}
            title="Unable to load exams"
            description="Please refresh the page. If the issue persists, contact support."
          />
        ) : !ctx.sessionId ? (
          <EmptyState
            icon={ListChecks}
            title="No active session"
            description="Enroll in a session to see available exams."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No exams available"
            description="Check back soon — new exams are scheduled every week."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((e) => (
              <motion.article
                key={e.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass shadow-card-soft relative flex flex-col gap-3 overflow-hidden rounded-3xl p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-bold">{e.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {e.subtitle ?? e.level}
                    </p>
                  </div>
                  <StatusBadge status={e.availability === "live" ? "live" : "active"} />
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border/60 bg-background/40 p-2.5 text-center text-[11px]">
                  <div>
                    <p className="font-display text-sm font-bold tabular-nums">
                      {e.totalQuestions}
                    </p>
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      Qns
                    </p>
                  </div>
                  <div className="border-x border-border/60">
                    <p className="font-display text-sm font-bold tabular-nums">
                      {e.durationMinutes}m
                    </p>
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      Time
                    </p>
                  </div>
                  <div>
                    <p className="truncate font-display text-sm font-bold">
                      {new Date(e.windowEnd).toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short",
                      })}
                    </p>
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      Until
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className={cn(primaryBtnCls, "justify-center")}
                  onClick={() =>
                    navigate({
                      to: "/exam-batch-take" as never,
                      search: { examId: e.id } as never,
                    })
                  }
                >
                  <PlayCircle className="h-4 w-4" />
                  {e.availability === "live" ? "Continue" : "Start Exam"}
                </button>
              </motion.article>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}

export function StudentUpcoming() {
  const gate = useRequireExamBatchApproval();
  const ctx = useExamBatchCurrentSessionId();
  const examsQuery = useQuery({
    queryKey: ["exam-batch", "student", "exams", ctx.sessionId],
    queryFn: () => listExamBatchExamsForSession({ data: { sessionId: ctx.sessionId as string } }),
    enabled: !!ctx.sessionId,
  });
  const rows = useMemo(
    () => (examsQuery.data ?? []).filter((e) => e.availability === "announced"),
    [examsQuery.data],
  );

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch"
        title="Upcoming exams"
        description="Plan your prep for what's next on the calendar."
        icon={CalendarClock}
      />
      {ctx.isLoading || examsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-3xl bg-muted/30" />
          ))}
        </div>
      ) : ctx.isError || examsQuery.isError ? (
        <EmptyState
          icon={CalendarClock}
          title="Unable to load upcoming exams"
          description="Please refresh the page. If the issue persists, contact support."
        />
      ) : !ctx.sessionId ? (
        <EmptyState
          icon={CalendarClock}
          title="No active session"
          description="Enroll in a session to see the upcoming schedule."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing scheduled yet"
          description="Upcoming exams will appear here as they are announced."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((e) => {
            const startsAt = new Date(e.windowStart).getTime();
            const nowMs = new Date(e.serverTime).getTime();
            const diff = Math.max(0, startsAt - nowMs);
            const days = Math.floor(diff / 86_400_000);
            const hours = Math.floor((diff % 86_400_000) / 3_600_000);
            return (
              <SectionCard
                key={e.id}
                title={e.title}
                description={e.subtitle ?? e.level}
                action={<StatusBadge status="upcoming" />}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Scheduled
                    </p>
                    <p className="mt-0.5 font-semibold">
                      {new Date(e.windowStart).toLocaleString(undefined, {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Duration
                    </p>
                    <p className="mt-0.5 font-semibold">{e.durationMinutes} min</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Starts in
                    </p>
                    <p className="mt-0.5 font-semibold tabular-nums">
                      {days}d {hours}h
                    </p>
                  </div>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </>
  );
}

