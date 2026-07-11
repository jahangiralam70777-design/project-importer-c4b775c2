import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Home,
  LayoutDashboard,
  ListChecks,
  CalendarClock,
  Trophy,
  LineChart,
  History,
} from "lucide-react";
import {
  listAvailableExamBatchSessions,
  getExamBatchAccess,
  listMyExamBatchEnrollments,
} from "@/lib/exam-batch/student-enrollment.functions";
import { useExamBatchFlow } from "./flow-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { useExamBatchVisibility } from "@/hooks/use-exam-batch-visibility";
import type { SubNavItem } from "./kit";
import type { ExamBatchEnrollmentRow } from "@/lib/exam-batch/types";

/**
 * Resolve the student's current exam-batch session + backend access.
 *
 * Session preference order (backend-driven):
 *   1. An `approved` enrollment (student is in an active batch).
 *   2. A `pending` enrollment (verification in progress).
 *   3. The session cached in `flow-store` (localStorage).
 *   4. The first `active` session from the public list.
 *   5. Whatever comes back first from the public list.
 *
 * This means even if the browser cache is wiped, the student always lands
 * on the session that actually reflects their current backend state.
 */
export function useExamBatchAccess() {
  const { state } = useExamBatchFlow();

  const sessionsQuery = useQuery({
    queryKey: ["exam-batch", "student", "sessions"],
    queryFn: () => listAvailableExamBatchSessions({ data: {} }),
    staleTime: 30_000,
  });
  const enrollmentsQuery = useQuery({
    queryKey: ["exam-batch", "student", "my-enrollments"],
    queryFn: () => listMyExamBatchEnrollments({ data: {} }),
    staleTime: 30_000,
  });

  const sessions = sessionsQuery.data ?? [];
  const enrollments: ExamBatchEnrollmentRow[] = enrollmentsQuery.data ?? [];

  const currentEnrollment = useMemo(() => {
    if (!enrollments.length) return null;
    return (
      enrollments.find((e) => e.status === "approved") ??
      enrollments.find((e) => e.status === "pending") ??
      enrollments[0]
    );
  }, [enrollments]);

  const current = useMemo(() => {
    if (currentEnrollment) {
      const match = sessions.find((s) => s.id === currentEnrollment.session_id);
      if (match) return match;
    }
    if (state.sessionId) {
      const match = sessions.find((s) => s.id === state.sessionId);
      if (match) return match;
    }
    return (
      sessions.find((s) => s.status === "active") ?? sessions[0] ?? null
    );
  }, [sessions, currentEnrollment, state.sessionId]);

  const sessionId = current?.id ?? null;

  const accessQuery = useQuery({
    queryKey: ["exam-batch", "student", "access", sessionId],
    queryFn: () => getExamBatchAccess({ data: { sessionId: sessionId as string } }),
    enabled: !!sessionId,
    staleTime: 15_000,
  });

  const canAccessDashboard = accessQuery.data?.canAccessDashboard ?? false;
  const studentId = accessQuery.data?.studentId ?? null;
  const enrollmentStatus = accessQuery.data?.status ?? currentEnrollment?.status ?? null;

  return {
    sessionId,
    session: current,
    enrollment: currentEnrollment,
    enrollmentStatus,
    canAccessDashboard,
    studentId,
    isLoading:
      sessionsQuery.isLoading ||
      enrollmentsQuery.isLoading ||
      (!!sessionId && accessQuery.isLoading),
    isError:
      sessionsQuery.isError || enrollmentsQuery.isError || accessQuery.isError,
  };
}

/**
 * Nav shown BEFORE admin approval — students move page-by-page through the
 * enrollment flow (Sessions → Subjects → Verification → Pending) via in-page
 * navigation, so the sub-nav exposes only the entry point.
 */
const preApprovalNav: SubNavItem[] = [
  { title: "Sessions", to: "/exam-batch/sessions", icon: Home },
];

/** Nav shown AFTER admin approval — exam dashboard only. */
const postApprovalNav: SubNavItem[] = [
  { title: "Dashboard", to: "/exam-batch/dashboard", icon: LayoutDashboard },
  { title: "Available Exams", to: "/exam-batch/available", icon: ListChecks },
  { title: "Upcoming Exams", to: "/exam-batch/upcoming", icon: CalendarClock },
  { title: "Leaderboard", to: "/exam-batch/leaderboard", icon: Trophy },
  { title: "Progress", to: "/exam-batch/progress", icon: LineChart },
  { title: "History", to: "/exam-batch/history", icon: History },
];

export function useExamBatchStudentNav(): SubNavItem[] {
  const { canAccessDashboard } = useExamBatchAccess();
  const { moduleVisible } = useExamBatchVisibility();
  return useMemo(
    () => (!moduleVisible ? [] : canAccessDashboard ? postApprovalNav : preApprovalNav),
    [canAccessDashboard, moduleVisible],
  );
}

/**
 * Redirects the student to `/exam-batch/pending` when the backend has not yet
 * approved them. Use at the top of every post-approval page component.
 * Backend is the single source of truth — no local `approved` flag.
 */
export function useRequireExamBatchApproval(): { ready: boolean } {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const { canAccessDashboard, isLoading, sessionId } = useExamBatchAccess();
  const { moduleVisible, isLoading: visibilityLoading } = useExamBatchVisibility();

  useEffect(() => {
    if (!hydrated) return;
    if (isLoading || visibilityLoading) return;
    if (!moduleVisible) {
      navigate({ to: "/dashboard" as never, replace: true });
      return;
    }
    if (!sessionId) {
      navigate({ to: "/exam-batch" as never });
      return;
    }
    if (!canAccessDashboard) {
      navigate({ to: "/exam-batch/pending" as never });
    }
  }, [hydrated, isLoading, visibilityLoading, moduleVisible, sessionId, canAccessDashboard, navigate]);

  const ready = hydrated && !isLoading && !visibilityLoading && moduleVisible && canAccessDashboard;
  return { ready };
}
