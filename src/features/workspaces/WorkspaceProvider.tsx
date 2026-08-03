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

function uid(): string {
  const chars = "0123456789abcdef";
  const sections = [8, 4, 4, 4, 12];
  return sections
    .map((len) => {
      let s = "";
      for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * 16)];
      return s;
    })
    .join("-");
}

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
        console.log("[WorkspaceProvider] No workspaces, creating via RPC...");
        bootstrapCreatePromise ??= (async () => {
          try {
            const { data, error } = await supabase.rpc("create_workspace", {
              p_name: "Personal",
              p_type: "personal",
              p_user_id: userId,
            });
            if (error) throw error;
            console.log("[WorkspaceProvider] RPC result:", data);
          } catch (rpcErr) {
            console.warn("[WorkspaceProvider] RPC failed, trying direct insert:", rpcErr);
            try {
              const wsId = uid();
              const { error: wsErr } = await supabase.from("workspaces").insert({
                id: wsId,
                name: "Personal",
                type: "personal",
              });
              if (wsErr) throw wsErr;
              console.log("[WorkspaceProvider] workspace inserted");

              const { error: mErr } = await supabase.from("workspace_members").insert({
                workspace_id: wsId,
                user_id: userId,
              });
              if (mErr) {
                console.error("[WorkspaceProvider] member insert error code:", mErr.code);
                console.error("[WorkspaceProvider] member insert error details:", mErr.details);
                console.error("[WorkspaceProvider] member insert error hint:", mErr.hint);
                console.error("[WorkspaceProvider] member insert error message:", mErr.message);
                throw mErr;
              }

              console.log("[WorkspaceProvider] Direct insert successful");
            } catch (directErr) {
              console.error("[WorkspaceProvider] Direct insert also failed:", directErr);
            }
          }
        })();
        try {
          await bootstrapCreatePromise;
        } finally {
          bootstrapCreatePromise = null;
        }
        wsList = await listWorkspaces();
        console.log("[WorkspaceProvider] After creation, workspaces:", wsList.length);
      }

      setWorkspaces(wsList);
      setProfile(userProfile);

      if (wsList.length > 0) {
        const savedId = typeof localStorage !== "undefined" ? localStorage.getItem("prio-workspace-id") : null;
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
        localStorage.setItem("prio-workspace-id", id);
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

      const wsId = uid();

      const { error: wsErr } = await supabase.from("workspaces").insert({
        id: wsId,
        name,
        type,
      });
      if (wsErr) throw wsErr;

      const { error: mErr } = await supabase.from("workspace_members").insert({
        workspace_id: wsId,
        user_id: session.user.id,
        role: "owner",
        agenda_shared: false,
        recap_timezone: "America/Mexico_City",
        approval_grace_seconds: 3600,
      });
      if (mErr) throw mErr;

      await refresh();
      const ws = workspaces.find((w) => w.id === wsId);
      if (!ws) throw new Error("Workspace not found after creation");
      return ws;
    },
    [refresh, workspaces],
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
