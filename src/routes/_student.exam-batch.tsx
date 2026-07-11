import { useEffect } from "react";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { ExamBatchLayout } from "@/components/exam-batch/layout";
import {
  useExamBatchStudentNav,
  useExamBatchAccess,
} from "@/components/exam-batch/access-gate";
import { useExamBatchVisibility } from "@/hooks/use-exam-batch-visibility";
import { useHydrated } from "@/hooks/use-hydrated";

// Paths that only make sense BEFORE a student is approved. Once the backend
// flips their enrollment to `approved`, they must never see any of these
// pages again — instantly bounce them to the dashboard.
const PRE_APPROVAL_PATHS = new Set<string>([
  "/exam-batch",
  "/exam-batch/",
  "/exam-batch/sessions",
  "/exam-batch/subjects",
  "/exam-batch/enrollment",
  "/exam-batch/pending",
]);

function StudentExamBatchLayout() {
  const nav = useExamBatchStudentNav();
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { moduleVisible, isLoading: visibilityLoading } = useExamBatchVisibility();
  const { canAccessDashboard, isLoading: accessLoading } = useExamBatchAccess();

  // Admin toggled the module off — bounce every student off Exam Batch
  // immediately, without any page refresh. Realtime keeps `moduleVisible`
  // fresh via the shared subscription.
  useEffect(() => {
    if (visibilityLoading) return;
    if (!moduleVisible) navigate({ to: "/dashboard" as never, replace: true });
  }, [moduleVisible, visibilityLoading, navigate]);

  // Once the student is approved, the enrollment flow (sessions / subjects /
  // verification / pending) must never render again. Realtime invalidates
  // `student.access`, so admin approval flips `canAccessDashboard` to true
  // and this effect immediately redirects — no manual refresh.
  useEffect(() => {
    if (!hydrated || accessLoading || visibilityLoading || !moduleVisible) return;
    if (!canAccessDashboard) return;
    const norm = pathname.replace(/\/+$/, "") || "/exam-batch";
    if (PRE_APPROVAL_PATHS.has(norm) || PRE_APPROVAL_PATHS.has(pathname)) {
      navigate({ to: "/exam-batch/dashboard" as never, replace: true });
    }
  }, [
    hydrated,
    accessLoading,
    visibilityLoading,
    moduleVisible,
    canAccessDashboard,
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
