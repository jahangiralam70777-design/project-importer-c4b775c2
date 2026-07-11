// Exam Batch realtime bridge — mounted once inside ExamBatchLayout so that
// both admin and student subtrees receive live updates from Supabase
// postgres_changes.
//
// Invalidations are *scoped per table* so a single MCQ upload does not
// force sessions / enrollments / settings / analytics to refetch across
// every mounted admin screen. Query keys follow the convention
// ["exam-batch", "admin", <scope>, ...] and ["exam-batch", "student", ...];
// each realtime scope invalidates only its buckets.

import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Map every realtime table to the query-key buckets it can affect.
// Only these buckets refetch on a burst — everything else stays cached.
const TABLE_SCOPES: Record<string, string[][]> = {
  exam_batch_settings: [
    ["exam-batch", "admin", "settings"],
    ["exam-batch", "admin", "attendance", "settings"],
    ["exam-batch", "public-settings"],
  ],
  exam_batch_sessions: [
    ["exam-batch", "admin", "sessions"],
    ["exam-batch", "student", "sessions"],
    ["exam-batch", "student", "access"],
  ],
  exam_batch_subjects: [
    ["exam-batch", "admin", "subjects"],
    ["exam-batch", "admin", "academic"],
    ["exam-batch", "student", "subjects"],
  ],
  exam_batch_chapters: [
    ["exam-batch", "admin", "chapters"],
    ["exam-batch", "admin", "academic"],
  ],
  exam_batch_levels: [
    ["exam-batch", "admin", "levels"],
    ["exam-batch", "admin", "academic"],
  ],
  exam_batch_mcqs: [
    ["exam-batch", "admin", "mcqs"],
    ["exam-batch", "admin", "mcqs-picker"],
  ],
  exam_batch_exams: [
    ["exam-batch", "admin", "exams"],
    ["exam-batch", "admin", "exams-for-leaderboard"],
    ["exam-batch", "student", "exams"],
  ],
  exam_batch_exam_questions: [
    ["exam-batch", "admin", "exam-questions"],
  ],
  exam_batch_enrollments: [
    ["exam-batch", "admin", "enrollments"],
    ["exam-batch", "student", "my-enrollments"],
    ["exam-batch", "student", "access"],
  ],
  exam_batch_enrollment_subjects: [
    ["exam-batch", "admin", "enrollments"],
    ["exam-batch", "student", "my-enrollments"],
  ],
  exam_batch_attendance_state: [
    ["exam-batch", "admin", "attendance"],
  ],
  exam_batch_attendance_events: [
    ["exam-batch", "admin", "attendance"],
  ],
  exam_batch_comment_rules: [
    ["exam-batch", "admin", "comment-rules"],
  ],
  exam_batch_download_history: [
    ["exam-batch", "admin", "download-history"],
  ],
  exam_batch_notifications: [
    ["exam-batch", "student", "notifications"],
    ["exam-batch", "admin", "notifications"],
  ],
};

const EXAM_BATCH_TABLES = Object.keys(TABLE_SCOPES);

let mountCount = 0;
let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const pending = new Set<string>();

function flush(qc: QueryClient) {
  flushTimer = null;
  const seen = new Set<string>();
  for (const table of pending) {
    for (const key of TABLE_SCOPES[table] ?? []) {
      const sig = key.join("|");
      if (seen.has(sig)) continue;
      seen.add(sig);
      // Only refetch queries currently observed on-screen; cached-but-idle
      // pages stay warm and don't hit the network.
      void qc.invalidateQueries({ queryKey: key, refetchType: "active" });
    }
  }
  pending.clear();
}

/**
 * Subscribes to postgres_changes on every exam-batch table and coalesces
 * bursts of events into scoped, per-table query invalidations. Safe to mount
 * from multiple places — the underlying channel is refcounted.
 */
export function useExamBatchRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    mountCount += 1;

    const scheduleInvalidate = (table: string) => {
      pending.add(table);
      if (flushTimer) return;
      flushTimer = setTimeout(() => flush(qc), 400);
    };

    if (!sharedChannel) {
      const channel = supabase.channel("exam-batch-live");
      for (const table of EXAM_BATCH_TABLES) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (channel as any).on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => scheduleInvalidate(table),
        );
      }
      channel.subscribe();
      sharedChannel = channel;
    }

    return () => {
      mountCount -= 1;
      if (mountCount <= 0) {
        mountCount = 0;
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        pending.clear();
        if (sharedChannel) {
          void supabase.removeChannel(sharedChannel);
          sharedChannel = null;
        }
      }
    };
  }, [qc]);
}
