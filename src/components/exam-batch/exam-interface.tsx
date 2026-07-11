import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Timer,
  Flag,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  CheckCircle2,
  Circle,
  Bookmark,
  AlertTriangle,
  Send,
  Loader2,
  Trophy,
  Sparkles,
  User,
  BookOpen,
  Layers,
  Hash,
  Award,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { primaryBtnCls, ghostBtnCls, StatusBadge } from "./kit";

// -------------- Placeholder data --------------
const HEADER = {
  subject: "Financial Accounting",
  chapter: "Chapter 4 · Depreciation",
  session: "Session Nov 2026",
  level: "Knowledge",
  studentId: "CAB-2026-00421",
  totalQuestions: 30,
  duration: "60 min",
};

type OptionKey = "A" | "B" | "C" | "D" | "T" | "F";
type Q = {
  id: number;
  text: string;
  kind: "mcq" | "tf";
  options: { key: OptionKey; label: string }[];
};

const QUESTIONS: Q[] = Array.from({ length: HEADER.totalQuestions }).map((_, i) => {
  const tf = i % 7 === 0;
  return {
    id: i + 1,
    kind: tf ? "tf" : "mcq",
    text: tf
      ? `Statement ${i + 1}: Straight-line depreciation allocates equal expense across an asset's useful life.`
      : `Question ${i + 1}: Which of the following best describes the accrual concept as applied to depreciation of a fixed asset used in production?`,
    options: tf
      ? [
          { key: "T", label: "True" },
          { key: "F", label: "False" },
        ]
      : [
          { key: "A", label: "Depreciation is recognised only when cash is paid" },
          { key: "B", label: "Depreciation is spread over the asset's useful life" },
          { key: "C", label: "Depreciation is charged only in the year of disposal" },
          { key: "D", label: "Depreciation is ignored for management accounts" },
        ],
  };
});

// -------------- Header --------------
function ExamHeader({
  time,
  answered,
  onOpenPalette,
}: {
  time: string;
  answered: number;
  onOpenPalette: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 -mx-1 mb-4">
      <div className="glass shadow-card-soft relative overflow-hidden rounded-2xl p-3 sm:p-4 backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-cta-gradient opacity-20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-3">
          <div className="bg-cta-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-glow">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h1 className="font-display truncate text-sm font-bold sm:text-base">
                {HEADER.subject}
              </h1>
              <span className="hidden text-xs text-muted-foreground sm:inline">·</span>
              <p className="truncate text-xs text-muted-foreground sm:text-sm">
                {HEADER.chapter}
              </p>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
              <HeaderChip icon={Layers} label={HEADER.session} />
              <HeaderChip icon={Award} label={HEADER.level} />
              <HeaderChip icon={Hash} label={`${HEADER.totalQuestions} Qs`} />
              <HeaderChip icon={Timer} label={HEADER.duration} />
              <HeaderChip icon={User} label={HEADER.studentId} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <CountdownPill time={time} />
            <button
              onClick={onOpenPalette}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-input bg-background/60 text-foreground/80 transition-colors hover:bg-muted lg:hidden"
              aria-label="Open question palette"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress line */}
        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="bg-cta-gradient h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(answered / HEADER.totalQuestions) * 100}%` }}
            transition={{ type: "spring", stiffness: 140, damping: 22 }}
          />
        </div>
      </div>
    </header>
  );
}

function HeaderChip({ icon: Icon, label }: { icon: typeof User; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2 py-0.5">
      <Icon className="h-3 w-3" />
      <span className="font-medium">{label}</span>
    </span>
  );
}

function CountdownPill({ time }: { time: string }) {
  return (
    <div className="bg-cta-gradient inline-flex items-center gap-2 rounded-xl px-3 py-2 text-white shadow-glow">
      <Timer className="h-4 w-4" />
      <span className="font-display text-sm font-bold tabular-nums sm:text-base">{time}</span>
    </div>
  );
}

// -------------- Question card --------------
function QuestionCard({
  q,
  selected,
  onSelect,
  marked,
  onToggleMark,
}: {
  q: Q;
  selected?: OptionKey;
  onSelect: (k: OptionKey) => void;
  marked: boolean;
  onToggleMark: () => void;
}) {
  return (
    <motion.section
      key={q.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5 sm:p-6"
    >
      <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-cta-gradient opacity-10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-cta-gradient flex h-11 w-11 items-center justify-center rounded-2xl font-display text-sm font-bold text-white shadow-glow">
            Q{q.id}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {q.kind === "tf" ? "True / False" : "Multiple choice"}
            </p>
            <p className="text-xs text-muted-foreground">
              Question {q.id} of {HEADER.totalQuestions}
            </p>
          </div>
        </div>
        <button
          onClick={onToggleMark}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all",
            marked
              ? "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/40"
              : "border border-input bg-background/60 text-foreground/80 hover:bg-muted",
          )}
        >
          <Bookmark className={cn("h-4 w-4", marked && "fill-current")} />
          {marked ? "Marked" : "Mark for review"}
        </button>
      </div>

      <p className="relative mt-5 text-base leading-relaxed sm:text-lg">{q.text}</p>

      <div
        className={cn(
          "relative mt-5 grid gap-2.5",
          q.kind === "tf" ? "sm:grid-cols-2" : "sm:grid-cols-2",
        )}
      >
        {q.options.map((opt) => {
          const isSelected = selected === opt.key;
          return (
            <motion.button
              key={opt.key}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(opt.key)}
              className={cn(
                "group flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all",
                isSelected
                  ? "border-transparent bg-cta-gradient text-white shadow-glow"
                  : "border-input bg-background/50 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted",
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold transition-colors",
                  isSelected
                    ? "bg-white/20 text-white"
                    : "bg-muted text-foreground group-hover:bg-primary/10",
                )}
              >
                {opt.key}
              </div>
              <span
                className={cn(
                  "text-sm leading-snug",
                  isSelected ? "text-white" : "text-foreground",
                )}
              >
                {opt.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.section>
  );
}

// -------------- Palette --------------
type QState = "answered" | "unanswered" | "current" | "marked";

function statusOf(
  i: number,
  current: number,
  answers: Record<number, OptionKey>,
  marks: Record<number, boolean>,
): QState {
  if (i === current) return "current";
  if (marks[i]) return "marked";
  if (answers[i]) return "answered";
  return "unanswered";
}

function PaletteLegend() {
  const rows: { s: QState; label: string }[] = [
    { s: "answered", label: "Answered" },
    { s: "unanswered", label: "Unanswered" },
    { s: "current", label: "Current" },
    { s: "marked", label: "Marked" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 text-[11px]">
      {rows.map((r) => (
        <div key={r.s} className="flex items-center gap-2">
          <PaletteDot state={r.s} />
          <span className="text-muted-foreground">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

function PaletteDot({ state }: { state: QState }) {
  const cls: Record<QState, string> = {
    answered: "bg-emerald-500",
    unanswered: "bg-muted border border-border",
    current: "bg-cta-gradient ring-2 ring-primary/40",
    marked: "bg-amber-500",
  };
  return <span className={cn("inline-block h-3 w-3 rounded-md", cls[state])} />;
}

function PaletteGrid({
  current,
  answers,
  marks,
  onJump,
}: {
  current: number;
  answers: Record<number, OptionKey>;
  marks: Record<number, boolean>;
  onJump: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5">
      {QUESTIONS.map((q, i) => {
        const s = statusOf(i, current, answers, marks);
        return (
          <button
            key={q.id}
            onClick={() => onJump(i)}
            className={cn(
              "aspect-square rounded-xl text-xs font-bold transition-all hover:-translate-y-0.5",
              s === "answered" && "bg-emerald-500 text-white shadow-glow",
              s === "unanswered" &&
                "border border-border bg-background/60 text-foreground hover:bg-muted",
              s === "current" && "bg-cta-gradient text-white shadow-glow ring-2 ring-primary/50",
              s === "marked" && "bg-amber-500 text-white shadow-glow",
            )}
          >
            {q.id}
          </button>
        );
      })}
    </div>
  );
}

function PaletteSidebar(props: {
  current: number;
  answers: Record<number, OptionKey>;
  marks: Record<number, boolean>;
  onJump: (i: number) => void;
}) {
  return (
    <aside className="glass shadow-card-soft sticky top-[168px] hidden h-fit rounded-3xl p-4 lg:block">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">Question Palette</h3>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {Object.keys(props.answers).length}/{HEADER.totalQuestions}
        </span>
      </div>
      <PaletteGrid {...props} />
      <div className="mt-4 border-t border-border/60 pt-3">
        <PaletteLegend />
      </div>
    </aside>
  );
}

function PaletteSheet({
  open,
  onClose,
  ...props
}: {
  open: boolean;
  onClose: () => void;
  current: number;
  answers: Record<number, OptionKey>;
  marks: Record<number, boolean>;
  onJump: (i: number) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="glass shadow-card-soft fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-3xl p-5 lg:hidden"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-semibold">Question Palette</h3>
                <p className="text-xs text-muted-foreground">
                  {Object.keys(props.answers).length}/{HEADER.totalQuestions} answered
                </p>
              </div>
              <button
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-input bg-background/60 hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <PaletteGrid {...props} onJump={(i) => (props.onJump(i), onClose())} />
            <div className="mt-4 border-t border-border/60 pt-3">
              <PaletteLegend />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// -------------- Submit dialog --------------
function SubmitDialog({
  open,
  onClose,
  onSubmit,
  answered,
  time,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  answered: number;
  time: string;
}) {
  const unanswered = HEADER.totalQuestions - answered;
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="glass shadow-card-soft relative w-full max-w-md overflow-hidden rounded-3xl p-6"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cta-gradient opacity-25 blur-3xl" />
              <div className="relative">
                <div className="bg-cta-gradient flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-glow">
                  <Send className="h-5 w-5" />
                </div>
                <h2 className="mt-4 font-display text-xl font-bold">Submit your exam?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Please review your progress before final submission. You cannot change answers
                  afterwards.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2 text-center">
                  <SummaryTile label="Total" value={HEADER.totalQuestions} tone="info" />
                  <SummaryTile label="Answered" value={answered} tone="success" />
                  <SummaryTile label="Unanswered" value={unanswered} tone="warn" />
                  <SummaryTile label="Time left" value={time} tone="primary" />
                </div>

                {unanswered > 0 && (
                  <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      You still have <b>{unanswered}</b> unanswered question
                      {unanswered === 1 ? "" : "s"}. Unanswered questions will be marked as skipped.
                    </p>
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
                  <button onClick={onSubmit} className={cn(primaryBtnCls, "flex-1")}>
                    <Send className="h-4 w-4" />
                    Final Submit
                  </button>
                  <button onClick={onClose} className={cn(ghostBtnCls, "flex-1")}>
                    Continue Exam
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "info" | "success" | "warn" | "primary";
}) {
  const toneCls: Record<string, string> = {
    info: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
    warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
    primary: "bg-cta-gradient text-white ring-primary/20",
  };
  return (
    <div className={cn("rounded-2xl p-3 ring-1 ring-inset", toneCls[tone])}>
      <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">{label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

// -------------- Auto-submit / processing screen --------------
function ProcessingScreen() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        className="glass shadow-card-soft relative w-full max-w-sm overflow-hidden rounded-3xl p-8 text-center"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-cta-gradient opacity-25 blur-3xl" />
        <div className="relative">
          <div className="mx-auto flex h-16 w-16 items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
              className="bg-cta-gradient flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-glow"
            >
              <Loader2 className="h-7 w-7" />
            </motion.div>
          </div>
          <h2 className="mt-5 font-display text-lg font-bold">Time Expired</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Submitting your answers securely — please wait.
          </p>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ width: "10%" }}
              animate={{ width: ["10%", "70%", "95%"] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="bg-cta-gradient h-full"
            />
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Do not close this tab
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// -------------- Submitted screen --------------
function SubmittedScreen({ answered }: { answered: number }) {
  const total = HEADER.totalQuestions;
  const correct = Math.round(answered * 0.72);
  const wrong = Math.max(0, answered - correct);
  const skipped = total - answered;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-2xl"
    >
      <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-6 text-center sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-cta-gradient opacity-25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-52 w-52 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.15 }}
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-glow"
          >
            <Trophy className="h-9 w-9" />
          </motion.div>
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-500 ring-1 ring-emerald-500/30">
            <Sparkles className="h-3.5 w-3.5" /> Exam submitted
          </p>
          <h2 className="mt-3 font-display text-2xl font-bold">Your response has been recorded</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Great effort! Your final performance summary will appear once the exam window closes.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ResultTile label="Marks" value="—" tone="primary" />
            <ResultTile label="Correct" value={correct} tone="success" />
            <ResultTile label="Wrong" value={wrong} tone="danger" />
            <ResultTile label="Skipped" value={skipped} tone="warn" />
          </div>

          <div className="mt-5">
            <StatusBadge status="approved" />
          </div>

          <div className="mt-6 flex items-start gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-left text-xs text-foreground/80">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              Rank will be published after the exam window ends. Keep an eye on the Leaderboard for
              official standings.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ResultTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "primary" | "success" | "danger" | "warn";
}) {
  const toneCls: Record<string, string> = {
    primary: "bg-cta-gradient text-white",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/25",
    danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/25",
    warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/25",
  };
  return (
    <div className={cn("rounded-2xl p-3", toneCls[tone])}>
      <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

// -------------- Main Exam Interface --------------
type Phase = "exam" | "processing" | "submitted";

export function ExamInterface() {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, OptionKey>>({});
  const [marks, setMarks] = useState<Record<number, boolean>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("exam");

  const q = QUESTIONS[current];
  const answeredCount = Object.keys(answers).length;
  const remaining = HEADER.totalQuestions - answeredCount;

  // Static placeholder time (no timer logic per requirements)
  const time = useMemo(() => "42:18", []);

  function select(key: OptionKey) {
    setAnswers((a) => ({ ...a, [current]: key }));
  }
  function toggleMark() {
    setMarks((m) => ({ ...m, [current]: !m[current] }));
  }
  function jump(i: number) {
    setCurrent(Math.max(0, Math.min(QUESTIONS.length - 1, i)));
  }
  function submit() {
    setConfirmOpen(false);
    setPhase("processing");
    setTimeout(() => setPhase("submitted"), 2200);
  }
  function simulateAutoSubmit() {
    setPhase("processing");
    setTimeout(() => setPhase("submitted"), 2400);
  }

  if (phase === "submitted") {
    return (
      <div className="pb-24">
        <SubmittedScreen answered={answeredCount} />
      </div>
    );
  }

  return (
    <div className="pb-28 lg:pb-6">
      <ExamHeader
        time={time}
        answered={answeredCount}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            <QuestionCard
              key={q.id}
              q={q}
              selected={answers[current]}
              onSelect={select}
              marked={!!marks[current]}
              onToggleMark={toggleMark}
            />
          </AnimatePresence>

          {/* Progress row */}
          <div className="glass shadow-card-soft mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3 sm:p-4">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="font-semibold tabular-nums">{answeredCount}</span>
                <span className="text-muted-foreground">answered</span>
              </div>
              <div className="flex items-center gap-2">
                <Circle className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold tabular-nums">{remaining}</span>
                <span className="text-muted-foreground">remaining</span>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <Flag className="h-4 w-4 text-amber-500" />
                <span className="font-semibold tabular-nums">
                  {Object.values(marks).filter(Boolean).length}
                </span>
                <span className="text-muted-foreground">marked</span>
              </div>
            </div>
            <div className="hidden gap-2 sm:flex">
              <button
                onClick={() => jump(current - 1)}
                disabled={current === 0}
                className={cn(ghostBtnCls, "disabled:cursor-not-allowed disabled:opacity-40")}
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              {current === QUESTIONS.length - 1 ? (
                <button onClick={() => setConfirmOpen(true)} className={primaryBtnCls}>
                  <Send className="h-4 w-4" /> Review & Submit
                </button>
              ) : (
                <button onClick={() => jump(current + 1)} className={primaryBtnCls}>
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Simulate auto-submit link (dev/preview aid, UI only) */}
          <div className="mt-3 text-center">
            <button
              onClick={simulateAutoSubmit}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              Preview auto-submit screen
            </button>
          </div>
        </div>

        <PaletteSidebar current={current} answers={answers} marks={marks} onJump={jump} />
      </div>

      {/* Mobile sticky bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/85 p-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            onClick={() => jump(current - 1)}
            disabled={current === 0}
            className={cn(
              "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-input bg-background/60 text-sm font-semibold disabled:opacity-40",
            )}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl bg-cta-gradient text-white shadow-glow"
            aria-label="Question palette"
          >
            <Menu className="h-4 w-4" />
            <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
              {answeredCount}
            </span>
          </button>
          {current === QUESTIONS.length - 1 ? (
            <button
              onClick={() => setConfirmOpen(true)}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-cta-gradient text-sm font-semibold text-white shadow-glow"
            >
              <Send className="h-4 w-4" /> Submit
            </button>
          ) : (
            <button
              onClick={() => jump(current + 1)}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-cta-gradient text-sm font-semibold text-white shadow-glow"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <PaletteSheet
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        current={current}
        answers={answers}
        marks={marks}
        onJump={jump}
      />
      <SubmitDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onSubmit={submit}
        answered={answeredCount}
        time={time}
      />
      {phase === "processing" && <ProcessingScreen />}
    </div>
  );
}

// -------------- Skeleton --------------
export function ExamInterfaceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="glass shadow-card-soft h-24 animate-pulse rounded-2xl bg-muted/30" />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="glass shadow-card-soft h-96 animate-pulse rounded-3xl bg-muted/30" />
        <div className="glass shadow-card-soft hidden h-96 animate-pulse rounded-3xl bg-muted/30 lg:block" />
      </div>
    </div>
  );
}