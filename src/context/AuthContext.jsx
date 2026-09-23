/**
 * AuthContext.jsx
 *
 * Authentication provider.
 * - Admin login: password checked against hardcoded value (or Supabase users table).
 * - Branch login: store + user record validated against Supabase `users` table.
 * - Session is persisted in localStorage for page reloads.
 */
import { createContext, useContext, useState, useCallback } from 'react';
import { fetchStores, validateStorePassword } from '../services/supabaseService.js';

const AuthContext = createContext(null);
const SESSION_KEY = 'retailsync_session';
const ADMIN_PASSWORD = 'Admin@9999';

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function AuthProvider({ children }) {
  const saved = loadSession();
  const [currentUser,   setCurrentUser]   = useState(saved?.user   ?? null);
  const [currentBranch, setCurrentBranch] = useState(saved?.branch ?? null);

  /**
   * Login for Manager / Cashier / Staff roles.
   * Validates against Supabase `users` table (password_hash field).
   */
  const loginBranch = useCallback(async ({ role, storeId, branchPassword }) => {
    if (!storeId) throw new Error('Please select a branch.');
    const result = await validateStorePassword(storeId, branchPassword, role);
    if (!result) throw new Error('Incorrect branch password. Please try again.');

    const branch = { id: result.id, name: result.name, location: result.location };
    const user   = { id: result.userId, role, name: result.userName || role, storeId: branch.id };
    const session = { user, branch };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setCurrentUser(user);
    setCurrentBranch(branch);
    return user;
  }, []);

  /**
   * Admin login — checks the hardcoded admin password.
   * Optionally scoped to a branch.
   */
  const loginAdmin = useCallback(async (password, branch = null) => {
    if (password !== ADMIN_PASSWORD) throw new Error('Incorrect admin password.');
    const user    = { id: 1, role: 'Admin', name: 'Admin', storeId: branch?.id ?? null };
    const session = { user, branch };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setCurrentUser(user);
    setCurrentBranch(branch);
    return user;
  }, []);

  /**
   * Fetch all stores from Supabase for the login branch selector.
   */
  const getStores = useCallback(() => fetchStores(), []);

  const switchBranch = useCallback((branch) => {
    setCurrentBranch(branch);
    const session = loadSession();
    if (session) {
      session.branch = branch;
      if (session.user) {
        session.user.storeId = branch?.id ?? null;
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setCurrentBranch(null);
  }, []);

  const isAdmin   = currentUser?.role === 'Admin';
  const isManager = currentUser?.role === 'Manager';
  const isCashier = currentUser?.role === 'Cashier';
  const isStaff   = currentUser?.role === 'Staff';
  const canManage = isAdmin || isManager;

  return (
    <AuthContext.Provider value={{
      currentUser, currentBranch,
      loginBranch, loginAdmin, getStores, logout, switchBranch,
      isAdmin, isManager, isCashier, isStaff, canManage,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
