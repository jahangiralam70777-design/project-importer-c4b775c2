// Student-facing enrollment flow for Exam Batch.
// Only authenticated students may enroll. Every state transition is
// re-validated server-side; the client's view of session state is treated
// as untrusted input.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  enforceRateLimit,
  RATE_LIMITS,
  rateLimitKey,
} from "@/integrations/security/rate-limit";
import { audit } from "./audit";
import { errors, mapSupabaseError } from "./errors";
import {
  enrollSchema,
  type ExamBatchAccess,
  type ExamBatchEnrollmentRow,
  type ExamBatchSessionRow,
} from "./types";

const PUBLIC_SESSION_COLUMNS =
  "id,title,subtitle,level,starts_at,registration_deadline,status,registration_open,is_archived,is_hidden,subjects_count,created_at,updated_at";

// ---------- List sessions visible to the current student ----------
export const listAvailableExamBatchSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { level?: string }) =>
    z.object({ level: z.string().trim().min(1).max(40).optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<ExamBatchSessionRow[]> => {
    console.log("[exam-batch] listAvailableExamBatchSessions userId=", context.userId, "level=", data.level);
    let q = context.supabase
      .from("exam_batch_sessions")
      .select(PUBLIC_SESSION_COLUMNS)
      .eq("is_hidden", false)
      .eq("is_archived", false)
      .eq("status", "active")
      .order("starts_at", { ascending: true });
    if (data.level) q = q.eq("level", data.level);
    const { data: rows, error } = await q;
    if (error) mapSupabaseError(error, "listAvailableExamBatchSessions");
    return (rows ?? []) as ExamBatchSessionRow[];
  });

// ---------- Enroll ----------
// Guest users cannot reach this — requireSupabaseAuth already 401s.
// Rate-limited per user to defeat rapid clicks / duplicate submissions.
export const enrollInExamBatchSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => enrollSchema.parse(i))
  .handler(async ({ data, context }): Promise<ExamBatchEnrollmentRow> => {
    // 1) Client-side clicks can't bypass this — one enroll attempt/user/2s.
    await enforceRateLimit(
      context.supabase,
      rateLimitKey("exam_batch:enroll", "user", context.userId),
      RATE_LIMITS.ADMIN_WRITE,
    );

    // 2) Session must exist and be in a state that accepts enrollment.
    const { data: session, error: sessErr } = await context.supabase
      .from("exam_batch_sessions")
      .select("id,status,registration_open,is_archived,is_hidden,registration_deadline")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (sessErr) mapSupabaseError(sessErr, "enrollInExamBatchSession:load-session");
    if (!session) throw errors.notFound("Session");
    if (session.is_hidden) throw errors.forbidden("This session is not available.");
    if (session.is_archived) throw errors.invalidState("This session has been archived.");
    if (session.status !== "active") throw errors.invalidState("This session is not active.");
    if (!session.registration_open) throw errors.invalidState("Registration for this session is closed.");
    if (session.registration_deadline && new Date(session.registration_deadline).getTime() < Date.now()) {
      throw errors.invalidState("The registration deadline has passed.");
    }

    // 3) Subjects must belong to the same level as the session. We rely on
    //    a single query to prevent tampered subject ids.
    const { data: sessLevelRow, error: lvlErr } = await context.supabase
      .from("exam_batch_sessions")
      .select("level")
      .eq("id", data.sessionId)
      .single();
    if (lvlErr) mapSupabaseError(lvlErr, "enrollInExamBatchSession:load-level");

    const { data: subjects, error: subjErr } = await context.supabase
      .from("exam_batch_subjects")
      .select("id,level")
      .in("id", data.subjectIds);
    if (subjErr) mapSupabaseError(subjErr, "enrollInExamBatchSession:validate-subjects");
    if (!subjects || subjects.length !== data.subjectIds.length) {
      throw errors.invalidState("One or more selected subjects are invalid.");
    }
    if (subjects.some((s: any) => s.level !== sessLevelRow!.level)) {
      throw errors.invalidState("Selected subjects do not belong to this session's level.");
    }

    // 4) Duplicate enrollment guard is enforced by unique(session_id,user_id)
    //    AND checked here so we can return a friendly message.
    const { data: existing, error: existErr } = await context.supabase
      .from("exam_batch_enrollments")
      .select("id,status")
      .eq("session_id", data.sessionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existErr) mapSupabaseError(existErr, "enrollInExamBatchSession:check-existing");
    if (existing) throw errors.conflict("You are already enrolled in this session.");

    // 5) Create the enrollment (status=pending, student_id=null) and its
    //    subject links in a single logical unit. student_id is NEVER assigned
    //    here — only on admin approval.
    const { data: created, error: createErr } = await context.supabase
      .from("exam_batch_enrollments")
      .insert({
        session_id: data.sessionId,
        user_id: context.userId,
        status: "pending",
        student_id: null,
      })
      .select("*")
      .single();
    if (createErr) mapSupabaseError(createErr, "enrollInExamBatchSession:create");

    const subjectRows = data.subjectIds.map((subjectId) => ({
      enrollment_id: created!.id,
      subject_id: subjectId,
      added_by: context.userId,
    }));
    const { error: linkErr } = await context.supabase
      .from("exam_batch_enrollment_subjects")
      .insert(subjectRows);
    if (linkErr) {
      // Compensating delete — enrollment row exists but subjects failed.
      await context.supabase.from("exam_batch_enrollments").delete().eq("id", created!.id);
      mapSupabaseError(linkErr, "enrollInExamBatchSession:link-subjects");
    }

    await audit(context.supabase, context.userId, "enroll", "enrollment", created!.id, {
      sessionId: data.sessionId,
      subjectIds: data.subjectIds,
    });

    return created as ExamBatchEnrollmentRow;
  });

// ---------- My enrollment for a session ----------
export const getMyExamBatchEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<ExamBatchEnrollmentRow | null> => {
    const { data: row, error } = await context.supabase
      .from("exam_batch_enrollments")
      .select("*")
      .eq("session_id", data.sessionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) mapSupabaseError(error, "getMyExamBatchEnrollment");
    return (row ?? null) as ExamBatchEnrollmentRow | null;
  });

// ---------- Permissions probe (single source of truth for the UI) ----------
// The UI must call this before showing Dashboard / Exam / Leaderboard /
// Progress. Access is granted ONLY when status = 'approved' AND a Student ID
// has been assigned. Pending, rejected, and un-enrolled users get read-only
// access to the Pending screen (or nothing).
export const getExamBatchAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<ExamBatchAccess> => {
    console.log("[exam-batch] getExamBatchAccess userId=", context.userId, "sessionId=", data.sessionId);
    const { data: row, error } = await context.supabase
      .from("exam_batch_enrollments")
      .select("status,student_id")
      .eq("session_id", data.sessionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) mapSupabaseError(error, "getExamBatchAccess");

    if (!row) {
      return {
        enrolled: false,
        status: null,
        studentId: null,
        canAccessDashboard: false,
        canTakeExams: false,
        canViewLeaderboard: false,
        canViewProgress: false,
      };
    }

    const approved = row.status === "approved" && typeof row.student_id === "number";
    return {
      enrolled: true,
      status: row.status,
      studentId: row.student_id ?? null,
      canAccessDashboard: approved,
      canTakeExams: approved,
      canViewLeaderboard: approved,
      canViewProgress: approved,
    };
  });

// ---------- All my enrollments (any status) ----------
// Used by the student flow to detect which session the current user is
// enrolled in without asking the browser to remember it. The `state.sessionId`
// localStorage cache is only a fallback: if a user clears their storage,
// this query recovers "where am I in the flow" from the backend.
export const listMyExamBatchEnrollments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<ExamBatchEnrollmentRow[]> => {
    console.log("[exam-batch] listMyExamBatchEnrollments userId=", context.userId);
    const { data, error } = await context.supabase
      .from("exam_batch_enrollments")
      .select(
        "id,session_id,user_id,status,student_id,reviewed_by,reviewed_at,notes,created_at,updated_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) mapSupabaseError(error, "listMyExamBatchEnrollments");
    return (data ?? []) as ExamBatchEnrollmentRow[];
  });

// ---------- Subjects the student can pick for a session ----------
// Priority order:
//   1) Admin-configured `exam_batch_session_subjects` (per-session whitelist).
//   2) Fallback: every published subject at the session's level.
// Returns a stable UI shape — id/name/description/icon/sort_order — so the
// picker never has to reach into the raw table.
export const listExamBatchSessionSubjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(i),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      Array<{
        id: string;
        name: string;
        description: string | null;
        icon: string | null;
        sort_order: number;
      }>
    > => {
      const { data: linked, error: linkErr } = await context.supabase
        .from("exam_batch_session_subjects")
        .select(
          "sort_order, subjects:subject_id(id,name,description,icon,sort_order)",
        )
        .eq("session_id", data.sessionId)
        .order("sort_order", { ascending: true });
      if (linkErr) mapSupabaseError(linkErr, "listExamBatchSessionSubjects:linked");

      if (linked && linked.length > 0) {
        return linked
          .map((r: any) => r.subjects)
          .filter(Boolean)
          .map((s: any) => ({
            id: s.id,
            name: s.name,
            description: s.description ?? null,
            icon: s.icon ?? null,
            sort_order: s.sort_order ?? 0,
          }));
      }

      // Fallback: no per-session list configured — show subjects at the level.
      const { data: sess, error: sessErr } = await context.supabase
        .from("exam_batch_sessions")
        .select("level")
        .eq("id", data.sessionId)
        .maybeSingle();
      if (sessErr) mapSupabaseError(sessErr, "listExamBatchSessionSubjects:session");
      if (!sess) return [];

      const { data: subs, error: subErr } = await context.supabase
        .from("exam_batch_subjects")
        .select("id,name,description,icon,sort_order,status,level")
        .eq("level", sess.level)
        .eq("status", "published")
        .order("sort_order", { ascending: true });
      if (subErr) mapSupabaseError(subErr, "listExamBatchSessionSubjects:subjects");

      return (subs ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? null,
        icon: s.icon ?? null,
        sort_order: s.sort_order ?? 0,
      }));
    },
  );
