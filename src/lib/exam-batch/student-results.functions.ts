// Student-facing Result / Leaderboard / Progress / History surface for
// Exam Batch. Every request revalidates ownership server-side; nothing here
// trusts the client to identify which student is asking. Rank and position
// are gated behind the exam window ending (server time only).
//
// Caching contract:
//   - Result scoring is materialised in `exam_batch_attempt_results` via the
//     idempotent `exam_batch_score_attempt` RPC. Repeat reads never rescore.
//   - Leaderboard is served from `exam_batch_leaderboard_entries` (frozen).
//     First read after the exam window ends triggers a one-shot freeze via
//     the idempotent `exam_batch_generate_leaderboard` RPC.
//   - Progress is served from `exam_batch_progress_summaries`. Cache miss
//     falls back to the recompute RPC; hits are returned as-is.
//
// Nothing in this file writes to student-owned rows directly — every mutation
// goes through the atomic RPCs documented in `results.README.md`.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit } from "./audit";
import { errors, mapSupabaseError } from "./errors";
import {
  attemptIdInput,
  examIdInput,
  historyInput,
  progressWindowInput,
  type AdminLeaderboardView,
  type ExamBatchAttemptResultRow,
  type ExamBatchLeaderboardEntryRow,
  type ExamBatchLeaderboardRow,
  type ProgressSummary,
  type ResultVisibility,
  type StudentHistoryItem,
  type StudentLeaderboardView,
} from "./results.types";

const STUDENT_LEADERBOARD_TOP = 20;
const STUDENT_VISIBILITY_MS = 24 * 60 * 60 * 1000; // 24 hours

const RESULT_COLUMNS =
  "attempt_id,exam_id,user_id,student_id,correct,wrong,skipped,total_questions,marks,max_marks,percentage,time_used_seconds,duration_seconds,submitted_at,scored_at";

const LEADERBOARD_COLUMNS =
  "exam_id,session_id,status,generated_at,frozen_at,entry_count,version";

const LEADERBOARD_ENTRY_COLUMNS =
  "exam_id,attempt_id,user_id,student_id,rank,marks,max_marks,percentage,correct,wrong,skipped,time_used_seconds,submitted_at";

// ============================================================================
// Ownership guards — every function asserts server-side
// ============================================================================

async function loadOwnAttempt(supabase: any, userId: string, attemptId: string) {
  const { data, error } = await supabase
    .from("exam_batch_attempts")
    .select("id,exam_id,user_id,status,started_at,expected_finish_at,submitted_at")
    .eq("id", attemptId)
    .maybeSingle();
  if (error) mapSupabaseError(error, "loadOwnAttempt");
  if (!data) throw errors.notFound("Attempt");
  if (data.user_id !== userId) throw errors.forbidden("This attempt does not belong to you.");
  return data as {
    id: string;
    exam_id: string;
    user_id: string;
    status: string;
    started_at: string;
    expected_finish_at: string;
    submitted_at: string | null;
  };
}

async function loadExamMeta(supabase: any, examId: string) {
  const { data, error } = await supabase
    .from("exam_batch_exams")
    .select("id,session_id,title,subject_id,window_start,window_end,duration_minutes")
    .eq("id", examId)
    .maybeSingle();
  if (error) mapSupabaseError(error, "loadExamMeta");
  if (!data) throw errors.notFound("Exam");
  return data as {
    id: string;
    session_id: string;
    title: string;
    subject_id: string;
    window_start: string;
    window_end: string;
    duration_minutes: number;
  };
}

async function assertEnrolledInExam(
  supabase: any,
  userId: string,
  exam: { id: string; session_id: string; subject_id: string },
) {
  const { data: enrollment, error } = await supabase
    .from("exam_batch_enrollments")
    .select("id,status,student_id")
    .eq("session_id", exam.session_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) mapSupabaseError(error, "assertEnrolledInExam:enrollment");
  if (!enrollment || enrollment.status !== "approved" || typeof enrollment.student_id !== "number") {
    throw errors.forbidden("Your enrollment is not approved for this session.");
  }
  const { data: subj, error: subjErr } = await supabase
    .from("exam_batch_enrollment_subjects")
    .select("subject_id")
    .eq("enrollment_id", enrollment.id)
    .eq("subject_id", exam.subject_id)
    .maybeSingle();
  if (subjErr) mapSupabaseError(subjErr, "assertEnrolledInExam:subject");
  if (!subj) throw errors.forbidden("You are not enrolled in this exam's subject.");
  return { enrollmentId: enrollment.id as string, studentId: enrollment.student_id as number };
}

// ============================================================================
// getExamBatchAttemptResult — student's own result (marks/correct/wrong/…)
// ============================================================================

export const getExamBatchAttemptResult = createServerFn({ method: "POST" })
  .validator((i: unknown) => attemptIdInput.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ResultVisibility> => {
    const attempt = await loadOwnAttempt(context.supabase, context.userId, data.attemptId);
    if (attempt.status === "in_progress") {
      throw errors.invalidState("This attempt has not been submitted yet.");
    }

    // Idempotent score — first call materialises the row; later calls no-op.
    let result: ExamBatchAttemptResultRow | null = null;
    {
      const { data: existing, error } = await context.supabase
        .from("exam_batch_attempt_results")
        .select(RESULT_COLUMNS)
        .eq("attempt_id", attempt.id)
        .maybeSingle();
      if (error) mapSupabaseError(error, "getExamBatchAttemptResult:load");
      result = existing as ExamBatchAttemptResultRow | null;
    }
    if (!result) {
      const { data: rpc, error } = await context.supabase.rpc("exam_batch_score_attempt", {
        _attempt_id: attempt.id,
      });
      if (error) mapSupabaseError(error, "getExamBatchAttemptResult:score");
      const row = Array.isArray(rpc) ? rpc[0] : rpc;
      if (!row) throw errors.invalidState("Could not compute the result for this attempt.");
      result = row as ExamBatchAttemptResultRow;
    }

    const exam = await loadExamMeta(context.supabase, result.exam_id);

    // Rank/position must remain hidden until the exam window has ended.
    let rankVisible = false;
    let rank: number | null = null;
    let entryCount: number | null = null;
    const now = Date.now();
    if (now >= new Date(exam.window_end).getTime()) {
      const { data: entry, error: entryErr } = await context.supabase
        .from("exam_batch_leaderboard_entries")
        .select("rank")
        .eq("exam_id", exam.id)
        .eq("attempt_id", attempt.id)
        .maybeSingle();
      if (entryErr) mapSupabaseError(entryErr, "getExamBatchAttemptResult:rank");
      if (entry) {
        rankVisible = true;
        rank = entry.rank as number;
        const { data: lb, error: lbErr } = await context.supabase
          .from("exam_batch_leaderboards")
          .select("entry_count")
          .eq("exam_id", exam.id)
          .maybeSingle();
        if (lbErr) mapSupabaseError(lbErr, "getExamBatchAttemptResult:lb");
        entryCount = (lb?.entry_count as number | undefined) ?? null;
      }
    }

    return {
      marks: Number(result.marks),
      maxMarks: Number(result.max_marks),
      correct: result.correct,
      wrong: result.wrong,
      skipped: result.skipped,
      totalQuestions: result.total_questions,
      percentage: Number(result.percentage),
      timeUsedSeconds: result.time_used_seconds,
      durationSeconds: result.duration_seconds,
      submittedAt: result.submitted_at,
      rankVisible,
      rank,
      entryCount,
    };
  });

// ============================================================================
// getExamBatchStudentLeaderboard — top 20 + own position, 24h visibility
// ============================================================================

async function ensureFrozen(
  supabase: any,
  userId: string,
  examId: string,
): Promise<ExamBatchLeaderboardRow | null> {
  const { data: lb, error } = await supabase
    .from("exam_batch_leaderboards")
    .select(LEADERBOARD_COLUMNS)
    .eq("exam_id", examId)
    .maybeSingle();
  if (error) mapSupabaseError(error, "ensureFrozen:load");
  if (lb && lb.status === "frozen") return lb as ExamBatchLeaderboardRow;

  const { data: rpc, error: rpcErr } = await supabase.rpc(
    "exam_batch_generate_leaderboard",
    { _exam_id: examId, _force: false },
  );
  if (rpcErr) mapSupabaseError(rpcErr, "ensureFrozen:rpc");
  const row = Array.isArray(rpc) ? rpc[0] : rpc;
  if (row) {
    await audit(supabase, userId, "leaderboard.publish", "leaderboard", examId, {
      version: (row as any).version,
    });
    return row as ExamBatchLeaderboardRow;
  }
  return lb ?? null;
}

export const getExamBatchStudentLeaderboard = createServerFn({ method: "POST" })
  .validator((i: unknown) => examIdInput.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<StudentLeaderboardView> => {
    const exam = await loadExamMeta(context.supabase, data.examId);
    const guard = await assertEnrolledInExam(context.supabase, context.userId, exam);

    const now = Date.now();
    const windowEnd = new Date(exam.window_end).getTime();

    let lb: ExamBatchLeaderboardRow | null = null;
    if (now >= windowEnd) {
      lb = await ensureFrozen(context.supabase, context.userId, exam.id);
    } else {
      const { data: raw, error } = await context.supabase
        .from("exam_batch_leaderboards")
        .select(LEADERBOARD_COLUMNS)
        .eq("exam_id", exam.id)
        .maybeSingle();
      if (error) mapSupabaseError(error, "getExamBatchStudentLeaderboard:lb");
      lb = raw as ExamBatchLeaderboardRow | null;
    }

    const frozenAt = lb?.frozen_at ?? null;
    const visibleUntil = frozenAt
      ? new Date(new Date(frozenAt).getTime() + STUDENT_VISIBILITY_MS).toISOString()
      : null;
    const isVisibleToStudent =
      lb?.status === "frozen" &&
      !!frozenAt &&
      now <= new Date(frozenAt).getTime() + STUDENT_VISIBILITY_MS;

    if (!isVisibleToStudent) {
      await audit(context.supabase, context.userId, "history.view", "leaderboard", exam.id, {
        gated: true,
        reason: lb ? "outside_visibility_window" : "window_not_ended",
      });
      return {
        exam: {
          id: exam.id,
          title: exam.title,
          windowEnd: exam.window_end,
          frozenAt,
          status: lb?.status ?? "pending",
          visibleUntil,
          isVisibleToStudent: false,
          entryCount: lb?.entry_count ?? 0,
        },
        top: [],
        self: null,
      };
    }

    const { data: topRows, error: topErr } = await context.supabase
      .from("exam_batch_leaderboard_entries")
      .select(LEADERBOARD_ENTRY_COLUMNS)
      .eq("exam_id", exam.id)
      .order("rank", { ascending: true })
      .limit(STUDENT_LEADERBOARD_TOP);
    if (topErr) mapSupabaseError(topErr, "getExamBatchStudentLeaderboard:top");

    const { data: selfRow, error: selfErr } = await context.supabase
      .from("exam_batch_leaderboard_entries")
      .select(LEADERBOARD_ENTRY_COLUMNS)
      .eq("exam_id", exam.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (selfErr) mapSupabaseError(selfErr, "getExamBatchStudentLeaderboard:self");

    const top = (topRows ?? []).map((r: ExamBatchLeaderboardEntryRow) => ({
      rank: r.rank,
      studentId: r.student_id,
      marks: Number(r.marks),
      percentage: Number(r.percentage),
      timeUsedSeconds: r.time_used_seconds,
      isSelf: r.student_id === guard.studentId,
    }));

    const self = selfRow
      ? {
          rank: (selfRow as ExamBatchLeaderboardEntryRow).rank,
          studentId: (selfRow as ExamBatchLeaderboardEntryRow).student_id,
          marks: Number((selfRow as ExamBatchLeaderboardEntryRow).marks),
          percentage: Number((selfRow as ExamBatchLeaderboardEntryRow).percentage),
          timeUsedSeconds: (selfRow as ExamBatchLeaderboardEntryRow).time_used_seconds,
        }
      : null;

    await audit(context.supabase, context.userId, "history.view", "leaderboard", exam.id, {
      selfRank: self?.rank ?? null,
    });

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        windowEnd: exam.window_end,
        frozenAt,
        status: lb?.status ?? "frozen",
        visibleUntil,
        isVisibleToStudent: true,
        entryCount: lb?.entry_count ?? top.length,
      },
      top,
      self,
    };
  });

// ============================================================================
// getExamBatchStudentHistory — enrolled-subjects only, paginated
// ============================================================================

export const getExamBatchStudentHistory = createServerFn({ method: "POST" })
  .validator((i: unknown) => historyInput.parse(i ?? {}))
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ data, context }): Promise<{ items: StudentHistoryItem[]; total: number }> => {
      // 1. Approved enrollments for this student, optionally filtered to a session.
      let enrQuery = context.supabase
        .from("exam_batch_enrollments")
        .select("id,session_id,student_id,status")
        .eq("user_id", context.userId)
        .eq("status", "approved");
      if (data.sessionId) enrQuery = enrQuery.eq("session_id", data.sessionId);
      const { data: enrollments, error: enrErr } = await enrQuery;
      if (enrErr) mapSupabaseError(enrErr, "history:enrollments");
      const rows = (enrollments ?? []) as Array<{ id: string; session_id: string }>;
      if (rows.length === 0) return { items: [], total: 0 };

      const enrollmentIds = rows.map((r) => r.id);
      const sessionIds = Array.from(new Set(rows.map((r) => r.session_id)));

      // 2. Subjects the student is enrolled in (per enrollment).
      const { data: subjRows, error: subjErr } = await context.supabase
        .from("exam_batch_enrollment_subjects")
        .select("enrollment_id,subject_id")
        .in("enrollment_id", enrollmentIds);
      if (subjErr) mapSupabaseError(subjErr, "history:subjects");
      const subjectIds = Array.from(
        new Set((subjRows ?? []).map((r: any) => r.subject_id as string)),
      );
      const filteredSubjectIds = data.subjectId
        ? subjectIds.filter((s) => s === data.subjectId)
        : subjectIds;
      if (filteredSubjectIds.length === 0) return { items: [], total: 0 };

      // 3. Exams for those (session, subject) pairs, ordered by window_start desc.
      let examQuery = context.supabase
        .from("exam_batch_exams")
        .select(
          "id,session_id,title,subject_id,window_start,window_end,duration_minutes,is_published,is_hidden,is_archived,status",
        )
        .in("session_id", sessionIds)
        .in("subject_id", filteredSubjectIds)
        .eq("is_published", true)
        .eq("is_hidden", false)
        .eq("is_archived", false)
        .eq("status", "active")
        .order("window_start", { ascending: false });
      const { data: examRows, error: examErr } = await examQuery;
      if (examErr) mapSupabaseError(examErr, "history:exams");
      const allExams = (examRows ?? []) as Array<{
        id: string;
        session_id: string;
        title: string;
        subject_id: string;
        window_start: string;
        window_end: string;
        duration_minutes: number;
      }>;
      const total = allExams.length;
      const page = allExams.slice(data.offset, data.offset + data.limit);
      if (page.length === 0) return { items: [], total };

      const pageExamIds = page.map((e) => e.id);

      // 4. Attempts (own) + results in one round trip each.
      const { data: attemptRows, error: attErr } = await context.supabase
        .from("exam_batch_attempts")
        .select("id,exam_id,status,started_at,submitted_at")
        .eq("user_id", context.userId)
        .in("exam_id", pageExamIds);
      if (attErr) mapSupabaseError(attErr, "history:attempts");
      const attemptsByExam = new Map<string, { id: string; status: string }>();
      for (const a of (attemptRows ?? []) as Array<{ id: string; exam_id: string; status: string }>) {
        attemptsByExam.set(a.exam_id, { id: a.id, status: a.status });
      }
      const attemptIds = Array.from(attemptsByExam.values()).map((a) => a.id);

      let resultsByAttempt = new Map<string, ExamBatchAttemptResultRow>();
      if (attemptIds.length > 0) {
        const { data: resRows, error: resErr } = await context.supabase
          .from("exam_batch_attempt_results")
          .select(RESULT_COLUMNS)
          .in("attempt_id", attemptIds);
        if (resErr) mapSupabaseError(resErr, "history:results");
        for (const r of (resRows ?? []) as ExamBatchAttemptResultRow[]) {
          resultsByAttempt.set(r.attempt_id, r);
        }
      }

      // 5. For exams whose window ended, load leaderboard entries (own) in one query.
      const now = Date.now();
      const endedExamIds = page
        .filter((e) => now >= new Date(e.window_end).getTime())
        .map((e) => e.id);
      const rankByExam = new Map<string, { rank: number; entryCount: number }>();
      if (endedExamIds.length > 0) {
        const { data: entRows, error: entErr } = await context.supabase
          .from("exam_batch_leaderboard_entries")
          .select("exam_id,rank")
          .in("exam_id", endedExamIds)
          .eq("user_id", context.userId);
        if (entErr) mapSupabaseError(entErr, "history:entries");
        const { data: lbRows, error: lbErr } = await context.supabase
          .from("exam_batch_leaderboards")
          .select("exam_id,entry_count")
          .in("exam_id", endedExamIds);
        if (lbErr) mapSupabaseError(lbErr, "history:lb");
        const counts = new Map<string, number>();
        for (const l of (lbRows ?? []) as Array<{ exam_id: string; entry_count: number }>) {
          counts.set(l.exam_id, l.entry_count);
        }
        for (const e of (entRows ?? []) as Array<{ exam_id: string; rank: number }>) {
          rankByExam.set(e.exam_id, { rank: e.rank, entryCount: counts.get(e.exam_id) ?? 0 });
        }
      }

      const items: StudentHistoryItem[] = page.map((exam) => {
        const attempt = attemptsByExam.get(exam.id);
        const result = attempt ? resultsByAttempt.get(attempt.id) : undefined;
        const ended = now >= new Date(exam.window_end).getTime();
        const rankInfo = ended ? rankByExam.get(exam.id) : undefined;

        let resultView: ResultVisibility | null = null;
        if (result) {
          resultView = {
            marks: Number(result.marks),
            maxMarks: Number(result.max_marks),
            correct: result.correct,
            wrong: result.wrong,
            skipped: result.skipped,
            totalQuestions: result.total_questions,
            percentage: Number(result.percentage),
            timeUsedSeconds: result.time_used_seconds,
            durationSeconds: result.duration_seconds,
            submittedAt: result.submitted_at,
            rankVisible: !!rankInfo,
            rank: rankInfo?.rank ?? null,
            entryCount: rankInfo?.entryCount ?? null,
          };
        }

        let status: StudentHistoryItem["status"] = "missed";
        if (attempt) {
          status = attempt.status === "in_progress" ? "in_progress" : "attended";
        }

        return {
          attemptId: attempt?.id ?? null,
          examId: exam.id,
          sessionId: exam.session_id,
          title: exam.title,
          subjectId: exam.subject_id,
          windowStart: exam.window_start,
          windowEnd: exam.window_end,
          status,
          result: resultView,
        };
      });

      return { items, total };
    },
  );

// ============================================================================
// getExamBatchStudentProgress — cached summary; on-demand recompute fallback
// ============================================================================

function emptySummary(window: "daily" | "weekly" | "30d"): ProgressSummary {
  return {
    window,
    examsScheduled: 0,
    examsAttended: 0,
    attendanceRate: 0,
    completionRate: 0,
    averageMarks: 0,
    averagePercentage: 0,
    highestPercentage: 0,
    lowestPercentage: 0,
    accuracy: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalSkipped: 0,
    updatedAt: new Date(0).toISOString(),
  };
}

function toSummary(row: any): ProgressSummary {
  const scheduled = Number(row.exams_scheduled ?? 0);
  const attended = Number(row.exams_attended ?? 0);
  const submitted = Number(row.exams_submitted ?? 0);
  const correct = Number(row.total_correct ?? 0);
  const wrong = Number(row.total_wrong ?? 0);
  const skipped = Number(row.total_skipped ?? 0);
  const answered = correct + wrong;
  return {
    window: row.time_window as ProgressSummary["window"],
    examsScheduled: scheduled,
    examsAttended: attended,
    attendanceRate: scheduled === 0 ? 0 : Math.round((attended / scheduled) * 10000) / 100,
    completionRate: attended === 0 ? 0 : Math.round((submitted / attended) * 10000) / 100,
    averageMarks: Number(row.avg_marks ?? 0),
    averagePercentage: Number(row.avg_percentage ?? 0),
    highestPercentage: Number(row.highest_percentage ?? 0),
    lowestPercentage: Number(row.lowest_percentage ?? 0),
    accuracy: answered === 0 ? 0 : Math.round((correct / answered) * 10000) / 100,
    totalCorrect: correct,
    totalWrong: wrong,
    totalSkipped: skipped,
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
  };
}

export const getExamBatchStudentProgress = createServerFn({ method: "POST" })
  .validator((i: unknown) => progressWindowInput.parse(i ?? {}))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ProgressSummary> => {
    const { data: cached, error } = await context.supabase
      .from("exam_batch_progress_summaries")
      .select(
        "user_id,time_window,exams_scheduled,exams_attended,exams_submitted,avg_marks,avg_percentage,highest_percentage,lowest_percentage,total_correct,total_wrong,total_skipped,updated_at",
      )
      .eq("user_id", context.userId)
      .eq("time_window", data.window)
      .maybeSingle();
    if (error) mapSupabaseError(error, "getExamBatchStudentProgress:load");

    if (cached) return toSummary(cached);

    // Cache miss → best-effort recompute, then re-read. Never blocks on error.
    try {
      await context.supabase.rpc("exam_batch_recompute_progress", { _user_id: context.userId });
      await audit(context.supabase, context.userId, "progress.update", "progress", context.userId, {
        window: data.window,
        trigger: "cache_miss",
      });
    } catch (err) {
      console.error("[exam-batch] progress recompute (student fallback) failed", err);
    }

    const { data: refreshed } = await context.supabase
      .from("exam_batch_progress_summaries")
      .select(
        "user_id,time_window,exams_scheduled,exams_attended,exams_submitted,avg_marks,avg_percentage,highest_percentage,lowest_percentage,total_correct,total_wrong,total_skipped,updated_at",
      )
      .eq("user_id", context.userId)
      .eq("time_window", data.window)
      .maybeSingle();
    return refreshed ? toSummary(refreshed) : emptySummary(data.window);
  });

// Re-export types so consumers can `import { ResultVisibility } from ".../index"`.
export type {
  AdminLeaderboardView,
  ExamBatchLeaderboardEntryRow,
  ExamBatchLeaderboardRow,
  ProgressSummary,
  ResultVisibility,
  StudentHistoryItem,
  StudentLeaderboardView,
};
