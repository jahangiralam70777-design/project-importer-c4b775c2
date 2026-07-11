import { createFileRoute } from "@tanstack/react-router";
import { ExamInterface } from "@/components/exam-batch/exam-interface";

export const Route = createFileRoute("/_student/exam-batch-take")({
  component: ExamInterface,
  head: () => ({
    meta: [
      { title: "Exam in Progress · CA Aspire BD" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Take your Exam Batch exam with a distraction-free, secure interface.",
      },
    ],
  }),
});