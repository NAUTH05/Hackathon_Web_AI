"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { authApi, clearToken, setToken } from "../services/api";
import type { User } from "../types";
import { ROLE_LEVELS } from "../types";

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (data: {
    username: string;
    password: string;
    name: string;
    department?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUser: (partial: Partial<User>) => void;
  isAdmin: boolean;
  isSalaryManager: boolean;
  canCreateEmployee: boolean;
  roleLevel: number;
  hasAccess: (maxLevel: number) => boolean;
  hydrated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => false,
  register: async () => ({ success: false }),
  logout: () => {},
  updateUser: () => {},
  isAdmin: false,
  isSalaryManager: false,
  canCreateEmployee: false,
  roleLevel: 5,
  hasAccess: () => false,
  hydrated: false,
});

const STORAGE_KEY = "fa_current_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Read localStorage only on client after mount to avoid hydration mismatch
  useEffect(() => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) setUser(JSON.parse(data));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user, hydrated]);

  async function login(username: string, password: string): Promise<boolean> {
    try {
      const { token, user: userData } = await authApi.login(username, password);
      setToken(token);
      const u = userData as unknown as User;
      setUser(u);
      return true;
    } catch {
      return false;
    }
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  async function register(data: {
    username: string;
    password: string;
    name: string;
    department?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { token, user: userData } = await authApi.register(data);
      setToken(token);
      const u = userData as unknown as User;
      setUser(u);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Đăng ký thất bại",
      };
    }
  }

  const roleLevel = user?.roleLevel ?? ROLE_LEVELS.EMPLOYEE;
  const isAdmin = user?.role === "admin" || roleLevel === ROLE_LEVELS.ADMIN;
  const isSalaryManager = (user?.roles || []).includes("salary_manager");
  const canCreateEmployee =
    roleLevel <= ROLE_LEVELS.DIRECTOR ||
    (user?.roles || []).includes("hr-manager");
  const hasAccess = (maxLevel: number) => roleLevel <= maxLevel;

  function updateUser(partial: Partial<User>) {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        logout,
        updateUser,
        isAdmin,
        isSalaryManager,
        canCreateEmployee,
        roleLevel,
        hasAccess,
        hydrated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
