import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { listSubscriptions, fetchUsageForWorkspace } from "@/features/billing/api";
import { effectivePlanForWorkspace } from "@/features/billing/plans";
import { getLimits, hasFeature as limitsHasFeature, isAtLimit } from "@/features/billing/limits";
import { openUpgrade } from "@/features/billing/upgrade";
import type {
  PlanFeature,
  PlanLimits,
  PlanResource,
  Subscription,
  WorkspacePlan,
  WorkspaceType,
} from "@/types";

interface BillingContextValue {
  subscriptions: Subscription[];
  loading: boolean;
  /** Plan of the current workspace (pro if it has an active subscription/trial). */
  effectivePlan: WorkspacePlan;
  /** Subscription backing the current workspace, if any. */
  currentSubscription: Subscription | null;
  /** When the current workspace's Pro trial ends (null if none). */
  trialEndsAt: string | null;
  currentLimits: PlanLimits;
  usage: {
    members: number;
    activeTasks: number;
    projects: number;
    assignees: number;
    blockedDays: number;
    agendaEvents: number;
    workspaces: number;
  };
  refresh: () => Promise<void>;
  /**
   * Gate for write paths: returns true when the user can still create the
   * resource under their plan, false when blocked. When blocked it opens the
   * upgrade prompt. Call before performing the mutation.
   */
  canCreate: (resource: PlanResource) => boolean;
  /** Feature flags from plan_limits (plan/board views, meetings, due date...). */
  hasFeature: (feature: PlanFeature) => boolean;
  /**
   * Whether the user can still create a workspace of the given type (1 of each
   * type per account). Opens the upgrade prompt when blocked.
   */
  canCreateWorkspace: (type: WorkspaceType) => boolean;
}

const BillingContext = createContext<BillingContextValue | null>(null);

interface BillingProviderProps {
  children: ReactNode;
}

export function BillingProvider({ children }: BillingProviderProps) {
  const { currentWorkspace, workspaces } = useWorkspace();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [remoteUsage, setRemoteUsage] = useState<{
    members: number;
    activeTasks: number;
    projects: number;
    assignees: number;
    blockedDays: number;
    agendaEvents: number;
    plan: WorkspacePlan;
    trialEndsAt: string | null;
  } | null>(null);

  const loadUsage = useCallback(async (workspaceId: string | undefined) => {
    if (!workspaceId) {
      setRemoteUsage(null);
      return;
    }
    const usage = await fetchUsageForWorkspace(workspaceId);
    if (usage) setRemoteUsage(usage);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const subs = await listSubscriptions();
      setSubscriptions(subs);
    } catch (err) {
      console.warn("[billing] refresh failed:", err);
    }
    await loadUsage(currentWorkspace?.id);
  }, [currentWorkspace?.id, loadUsage]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const subs = await listSubscriptions();
        if (!cancelled) setSubscriptions(subs);
      } catch (err) {
        console.warn("[billing] load failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const workspaceId = currentWorkspace?.id ?? null;
    setRemoteUsage(null);
    if (!workspaceId) return;
    void (async () => {
      const usage = await fetchUsageForWorkspace(workspaceId);
      if (!cancelled && usage) setRemoteUsage(usage);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentWorkspace?.id]);

  const workspaceId = currentWorkspace?.id;
  const plan: WorkspacePlan =
    remoteUsage?.plan ?? effectivePlanForWorkspace(subscriptions, workspaceId);
  const currentSubscription = useMemo(
    () =>
      subscriptions.find((s) => s.workspaceId === workspaceId) ?? null,
    [subscriptions, workspaceId],
  );

  const currentLimits = useMemo(
    () => getLimits(plan, currentWorkspace?.type ?? "personal"),
    [plan, currentWorkspace?.type],
  );

  const usage = useMemo(
    () => ({
      members: remoteUsage?.members ?? 0,
      activeTasks: remoteUsage?.activeTasks ?? 0,
      projects: remoteUsage?.projects ?? 0,
      assignees: remoteUsage?.assignees ?? 0,
      blockedDays: remoteUsage?.blockedDays ?? 0,
      agendaEvents: remoteUsage?.agendaEvents ?? 0,
      workspaces: workspaces.length,
    }),
    [remoteUsage, workspaces.length],
  );

  const canCreate = useCallback(
    (resource: PlanResource) => {
      if (isAtLimit(currentLimits, usage, resource)) {
        openUpgrade(resource);
        return false;
      }
      return true;
    },
    [currentLimits, usage],
  );

  const hasFeature = useCallback(
    (feature: PlanFeature) => limitsHasFeature(currentLimits, feature),
    [currentLimits],
  );

  const canCreateWorkspace = useCallback(
    (type: WorkspaceType) => {
      const limits = getLimits("free", type);
      const owned = workspaces.filter((w) => w.type === type).length;
      if (owned >= limits.workspaceLimit) {
        openUpgrade("workspaces");
        return false;
      }
      return true;
    },
    [workspaces],
  );

  const value: BillingContextValue = {
    subscriptions,
    loading,
    effectivePlan: plan,
    currentSubscription,
    trialEndsAt: remoteUsage?.trialEndsAt ?? null,
    currentLimits,
    usage,
    refresh,
    canCreate,
    hasFeature,
    canCreateWorkspace,
  };

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext);
  if (!ctx) {
    throw new Error("useBilling must be used within a BillingProvider");
  }
  return ctx;
}
