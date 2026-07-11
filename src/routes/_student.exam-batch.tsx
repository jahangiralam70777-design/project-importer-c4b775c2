import { useEffect } from "react";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { ExamBatchLayout } from "@/components/exam-batch/layout";
import {
  useExamBatchStudentNav,
  useExamBatchAccess,
} from "@/components/exam-batch/access-gate";
import { useExamBatchVisibility } from "@/hooks/use-exam-batch-visibility";
import { useHydrated } from "@/hooks/use-hydrated";

// Paths that only make sense BEFORE approval.
const PRE_APPROVAL_PATHS = new Set<string>([
  "/exam-batch",
  "/exam-batch/",
  "/exam-batch/sessions",
  "/exam-batch/subjects",
  "/exam-batch/enrollment",
  "/exam-batch/pending",
]);

// Paths that require approval to reach.
const POST_APPROVAL_PREFIXES = [
  "/exam-batch/dashboard",
  "/exam-batch/available",
  "/exam-batch/upcoming",
  "/exam-batch/leaderboard",
  "/exam-batch/progress",
  "/exam-batch/history",
];

function normalize(p: string) {
  const n = p.replace(/\/+$/, "");
  return n === "" ? "/" : n;
}

function StudentExamBatchLayout() {
  const nav = useExamBatchStudentNav();
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { moduleVisible, isLoading: visibilityLoading } = useExamBatchVisibility();
  const {
    canAccessDashboard,
    enrollment,
    enrollmentStatus,
    isLoading: accessLoading,
  } = useExamBatchAccess();

  // SINGLE ROUTE GUARD for the entire student exam-batch module.
  // No child page runs its own redirect useEffect — this is the only one.
  useEffect(() => {
    if (!hydrated) return;
    if (visibilityLoading) return;

    // Module toggled off by admin → leave exam-batch entirely.
    if (!moduleVisible) {
      navigate({ to: "/dashboard" as never, replace: true });
      return;
    }

    // Don't move anyone while the SSOT is still fetching for the first
    // time — but background refetches (Realtime) keep isLoading = false,
    // so approval flips propagate instantly.
    if (accessLoading) return;

    const here = normalize(pathname);

    // 1) APPROVED — always on the dashboard, never bounce back.
    if (canAccessDashboard) {
      if (PRE_APPROVAL_PATHS.has(here) || PRE_APPROVAL_PATHS.has(pathname)) {
        navigate({ to: "/exam-batch/dashboard" as never, replace: true });
      }
      return;
    }

    // 2) PENDING or REJECTED — pin to /pending, never let them wander into
    //    the post-approval area.
    if (enrollment && (enrollmentStatus === "pending" || enrollmentStatus === "rejected")) {
      const inPostArea = POST_APPROVAL_PREFIXES.some((p) => here.startsWith(p));
      if (inPostArea || here === "/exam-batch/subjects" || here === "/exam-batch/enrollment") {
        navigate({ to: "/exam-batch/pending" as never, replace: true });
      }
      return;
    }

    // 3) NO ENROLLMENT — block post-approval and /pending, allow the
    //    enrollment flow itself (sessions/subjects/enrollment/index).
    const inPostArea = POST_APPROVAL_PREFIXES.some((p) => here.startsWith(p));
    if (inPostArea || here === "/exam-batch/pending") {
      navigate({ to: "/exam-batch/sessions" as never, replace: true });
    }
  }, [
    hydrated,
    visibilityLoading,
    accessLoading,
    moduleVisible,
    canAccessDashboard,
    enrollment,
    enrollmentStatus,
    pathname,
    navigate,
  ]);

  return <ExamBatchLayout nav={nav} />;
}

export const Route = createFileRoute("/_student/exam-batch")({
  component: StudentExamBatchLayout,
  head: () => ({
    meta: [
      { title: "Exam Batch · CA Aspire BD" },
      { name: "description", content: "Your cohort-based exam preparation hub — sessions, subjects, exams and leaderboard." },
      { property: "og:title", content: "Exam Batch · CA Aspire BD" },
      { property: "og:description", content: "Cohort exam prep with live leaderboards and progress tracking." },
    ],
  }),
});
