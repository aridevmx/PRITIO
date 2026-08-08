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
import { listSubscriptions, fetchProTrialUsed, fetchUsageForWorkspace } from "@/features/billing/api";
import { effectivePlanForWorkspace } from "@/features/billing/plans";
import { getLimits, isAtLimit } from "@/features/billing/limits";
import { openUpgrade } from "@/features/billing/upgrade";
import type {
  PlanLimits,
  PlanResource,
  Subscription,
  WorkspacePlan,
} from "@/types";

interface BillingContextValue {
  subscriptions: Subscription[];
  loading: boolean;
  /** Plan of the current workspace (pro if it has an active subscription). */
  effectivePlan: WorkspacePlan;
  /** Subscription backing the current workspace, if any. */
  currentSubscription: Subscription | null;
  /** Whether the account already used its one-time Pro trial. */
  proTrialUsed: boolean;
  currentLimits: PlanLimits;
  usage: {
    members: number;
    activeTasks: number;
    projects: number;
    assignees: number;
    blockedDays: number;
    workspaces: number;
  };
  refresh: () => Promise<void>;
  /**
   * Gate for write paths: returns true when the user can still create the
   * resource under their plan, false when blocked. When blocked it opens the
   * upgrade prompt. Call before performing the mutation.
   */
  canCreate: (resource: PlanResource) => boolean;
}

const BillingContext = createContext<BillingContextValue | null>(null);

interface BillingProviderProps {
  children: ReactNode;
}

export function BillingProvider({ children }: BillingProviderProps) {
  const { currentWorkspace, workspaces } = useWorkspace();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [proTrialUsed, setProTrialUsed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [remoteUsage, setRemoteUsage] = useState<{
    members: number;
    activeTasks: number;
    projects: number;
    assignees: number;
    blockedDays: number;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [subs, trialUsed] = await Promise.all([
        listSubscriptions(),
        fetchProTrialUsed(),
      ]);
      setSubscriptions(subs);
      setProTrialUsed(trialUsed);
    } catch (err) {
      console.warn("[billing] refresh failed:", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [subs, trialUsed] = await Promise.all([
          listSubscriptions(),
          fetchProTrialUsed(),
        ]);
        if (!cancelled) {
          setSubscriptions(subs);
          setProTrialUsed(trialUsed);
        }
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
      if (!cancelled) setRemoteUsage(usage);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentWorkspace?.id]);

  const workspaceId = currentWorkspace?.id;
  const plan = effectivePlanForWorkspace(subscriptions, workspaceId);
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

  const value: BillingContextValue = {
    subscriptions,
    loading,
    effectivePlan: plan,
    currentSubscription,
    proTrialUsed,
    currentLimits,
    usage,
    refresh,
    canCreate,
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
