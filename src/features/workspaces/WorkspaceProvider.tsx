import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { fetchProfile } from "@/features/auth/api";
import {
  listWorkspaces,
  deleteWorkspace as apiDeleteWorkspace,
  leaveWorkspace as apiLeaveWorkspace,
  listMembers,
} from "@/features/workspaces/api";
import type {
  Profile,
  Workspace,
  WorkspaceMember,
  WorkspaceType,
} from "@/types";

let bootstrapCreatePromise: Promise<void> | null = null;

interface WorkspaceContextValue {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  members: WorkspaceMember[];
  loading: boolean;
  currentMember: WorkspaceMember | null;

  profile: Profile | null;
  isOwner: boolean;
  isAdmin: boolean;
  isLeader: boolean;
  isMember: boolean;
  workspaceType: WorkspaceType;

  switchWorkspace: (id: string) => void;
  refresh: () => Promise<void>;
  createWorkspace: (name: string, type: WorkspaceType) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  leaveWorkspace: (id: string) => Promise<void>;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
    null,
  );
  const [currentMember, setCurrentMember] = useState<WorkspaceMember | null>(
    null,
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const currentWorkspaceRef = useRef(currentWorkspace);
  currentWorkspaceRef.current = currentWorkspace;

  const loadWorkspaces = useCallback(async (userId: string) => {
    try {
      let wsList = await listWorkspaces();
      const userProfile = await fetchProfile(userId);

      if (wsList.length === 0) {
        bootstrapCreatePromise ??= (async () => {
          try {
            const { error } = await supabase.rpc("create_workspace", {
              p_name: "Personal",
              p_type: "personal",
              p_user_id: userId,
            });
            if (error) {
              console.warn("[WorkspaceProvider] create_workspace failed:", error);
            }
          } catch (err) {
            console.warn("[WorkspaceProvider] create_workspace failed:", err);
          }
        })();
        try {
          await bootstrapCreatePromise;
        } finally {
          bootstrapCreatePromise = null;
        }
        wsList = await listWorkspaces();
      }

      setWorkspaces(wsList);
      setProfile(userProfile);

      if (wsList.length > 0) {
        const savedId = typeof localStorage !== "undefined" ? localStorage.getItem("pritio-workspace-id") : null;
        const prevId = savedId ?? currentWorkspaceRef.current?.id;
        const next = wsList.find((w) => w.id === prevId) ?? wsList[0];

        setCurrentWorkspace(next);

        const memberList = await listMembers(next.id);
        setMembers(memberList);

        const userIdx = memberList.findIndex((m) => m.userId === userId);
        setCurrentMember(userIdx >= 0 ? memberList[userIdx] : null);
      } else {
        setCurrentWorkspace(null);
        setMembers([]);
        setCurrentMember(null);
      }
    } catch (err) {
      console.error("[WorkspaceProvider] loadWorkspaces failed:", err);
    }
  }, []);

  const refresh = useCallback(async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    await loadWorkspaces(user.id);
  }, [loadWorkspaces]);

  const switchWorkspace = useCallback(
    async (id: string) => {
      const ws = workspaces.find((w) => w.id === id);
      if (!ws) return;

      if (typeof localStorage !== "undefined") {
        localStorage.setItem("pritio-workspace-id", id);
      }

      setCurrentWorkspace(ws);
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const memberList = await listMembers(id);
      setMembers(memberList);

      const idx = memberList.findIndex((m) => m.userId === user.id);
      setCurrentMember(idx >= 0 ? memberList[idx] : null);
    },
    [workspaces],
  );

  const createWorkspace = useCallback(
    async (name: string, type: WorkspaceType): Promise<Workspace> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("create_workspace", {
        p_name: name,
        p_type: type,
        p_user_id: session.user.id,
      });
      if (error) throw error;

      const created = data as { id?: string } | null;
      const createdId = created?.id;

      await refresh();
      const wsList = await listWorkspaces();
      const ws = wsList.find((w) => w.id === createdId);
      if (!ws) throw new Error("Workspace not found after creation");
      return ws;
    },
    [refresh],
  );

  const deleteWorkspace = useCallback(
    async (id: string) => {
      await apiDeleteWorkspace(id);
      await refresh();
    },
    [refresh],
  );

  const leaveWorkspace = useCallback(
    async (id: string) => {
      await apiLeaveWorkspace(id);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;
        if (!session?.user) {
          setLoading(false);
          return;
        }

        await loadWorkspaces(session.user.id);
      } catch (err) {
        console.error("[WorkspaceProvider] init error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;

      try {
        if (!session?.user) {
          setWorkspaces([]);
          setMembers([]);
          setCurrentWorkspace(null);
          setCurrentMember(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        await loadWorkspaces(session.user.id);
      } catch (err) {
        console.error("[WorkspaceProvider] onAuthStateChange error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadWorkspaces]);

  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function subscribe() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;
      const uid = session?.user?.id ?? null;
      userIdRef.current = uid;
      if (!uid) return;

      const channel = supabase
        .channel("workspace_members_changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "workspace_members",
            filter: `user_id=eq.${uid}`,
          },
          () => {
            void refresh();
          },
        )
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    }

    let cleanupFn: (() => void) | undefined;

    void subscribe().then((cleanup) => {
      if (!cancelled) cleanupFn = cleanup;
    });

    return () => {
      cancelled = true;
      cleanupFn?.();
    };
  }, [refresh]);

  const isOwner = currentMember?.role === "owner";
  const isAdmin =
    currentMember?.role === "admin" || currentMember?.role === "owner";
  const isLeader =
    currentMember?.role === "leader" ||
    currentMember?.role === "admin" ||
    currentMember?.role === "owner";
  const isMember = currentMember !== null;

  const workspaceType: WorkspaceType = currentWorkspace?.type ?? "personal";

  const value: WorkspaceContextValue = {
    currentWorkspace,
    workspaces,
    members,
    loading,
    currentMember,
    profile,
    isOwner,
    isAdmin,
    isLeader,
    isMember,
    workspaceType,
    switchWorkspace,
    refresh,
    createWorkspace,
    deleteWorkspace,
    leaveWorkspace,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}
