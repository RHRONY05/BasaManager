import { createContext, useContext, useMemo, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  userProfileSchema,
  userMembershipSchema,
  type UserProfile,
  type UserMembership,
  type MembershipRole,
} from '@bm/shared';
import { apiFetch, setActiveOrgId } from '../../lib/api/client';
import { keys } from '../../lib/api/keys';

const meDataSchema = z.object({
  user: userProfileSchema,
  memberships: z.array(userMembershipSchema),
});

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';
export type AppRole = MembershipRole | 'admin';

export interface AuthContextValue {
  status: AuthStatus;
  user: UserProfile | null;
  memberships: UserMembership[];
  activeOrg: UserMembership | null;
  role: AppRole | null;
  switchOrg: (orgId: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  /** Optional navigate function (defaults to window.location.assign('/login') or router.navigate) */
  onNavigateToLogin?: () => void;
}

export function AuthProvider({ children, onNavigateToLogin }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('bm.activeOrg');
    }
    return null;
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: keys.me(),
    queryFn: () => apiFetch('/api/me', { schema: meDataSchema }),
    retry: false,
    staleTime: 30_000,
  });

  const memberships = useMemo(() => data?.memberships ?? [], [data?.memberships]);
  const user = data?.user ?? null;

  const activeOrg = useMemo(() => {
    if (!memberships.length) return null;
    if (currentOrgId) {
      const match = memberships.find((m) => m.orgId === currentOrgId);
      if (match) return match;
    }
    const firstActive = memberships.find((m) => m.status === 'active');
    return firstActive ?? memberships[0] ?? null;
  }, [memberships, currentOrgId]);

  const role = activeOrg?.role ?? null;

  // Keep API client active org header and localStorage in sync
  useEffect(() => {
    if (activeOrg) {
      setActiveOrgId(activeOrg.orgId);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bm.activeOrg', activeOrg.orgId);
      }
    } else {
      setActiveOrgId(null);
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('bm.activeOrg');
      }
    }
  }, [activeOrg]);

  const switchOrg = useCallback(
    (orgId: string) => {
      const found = memberships.find((m) => m.orgId === orgId);
      if (found) {
        setCurrentOrgId(orgId);
        setActiveOrgId(orgId);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('bm.activeOrg', orgId);
        }
        queryClient.clear();
        void queryClient.invalidateQueries();
      }
    },
    [memberships, queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore errors on sign out
    } finally {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('bm.activeOrg');
      }
      setActiveOrgId(null);
      setCurrentOrgId(null);
      queryClient.clear();
      if (onNavigateToLogin) {
        onNavigateToLogin();
      } else if (typeof window !== 'undefined') {
        window.location.assign('/login');
      }
    }
  }, [queryClient, onNavigateToLogin]);

  // Listen to session:revoked socket event only if a socket client already exists
  useEffect(() => {
    const socket =
      typeof window !== 'undefined'
        ? (
            window as unknown as {
              __bm_socket?: {
                on: (event: string, cb: () => void) => void;
                off?: (event: string, cb: () => void) => void;
              };
            }
          ).__bm_socket
        : undefined;

    if (socket && typeof socket.on === 'function') {
      const handleRevoked = () => {
        void signOut();
      };
      socket.on('session:revoked', handleRevoked);
      return () => {
        socket.off?.('session:revoked', handleRevoked);
      };
    }
  }, [signOut]);

  let status: AuthStatus = 'loading';
  if (isLoading) {
    status = 'loading';
  } else if (isError || !user) {
    status = 'signedOut';
  } else {
    status = 'signedIn';
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      memberships,
      activeOrg,
      role,
      switchOrg,
      signOut,
    }),
    [status, user, memberships, activeOrg, role, switchOrg, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
