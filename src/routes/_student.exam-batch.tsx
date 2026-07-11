import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ExamBatchLayout } from "@/components/exam-batch/layout";
import { useExamBatchStudentNav } from "@/components/exam-batch/access-gate";
import { useExamBatchVisibility } from "@/hooks/use-exam-batch-visibility";

function StudentExamBatchLayout() {
  const nav = useExamBatchStudentNav();
  const navigate = useNavigate();
  const { moduleVisible, isLoading } = useExamBatchVisibility();
  // Admin toggled the module off — bounce every student off Exam Batch
  // immediately, without any page refresh. Realtime keeps `moduleVisible`
  // fresh via the shared subscription.
  useEffect(() => {
    if (isLoading) return;
    if (!moduleVisible) navigate({ to: "/dashboard" as never, replace: true });
  }, [moduleVisible, isLoading, navigate]);
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
