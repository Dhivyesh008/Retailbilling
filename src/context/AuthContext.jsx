import { createContext, useContext, useState, useCallback } from 'react';
import { storesDB } from '../db/db.js';

const AuthContext  = createContext(null);
const SESSION_KEY  = 'retailsync_session';
// Demo admin password — in production this would be a backend check
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
   * Login for Manager / Cashier / Staff.
   * Role is selected in Step 0; branch + password validated here.
   * Session user is a synthetic object { role, storeId } — no individual ID.
   */
  const loginBranch = useCallback(async ({ role, storeId, branchPassword }) => {
    const branch = await storesDB.validatePassword(storeId, branchPassword);
    if (!branch) throw new Error('Incorrect branch password. Please try again.');
    const user    = { role, name: role, storeId: branch.id };
    const session = { user, branch };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setCurrentUser(user);
    setCurrentBranch(branch);
    return user;
  }, []);

  /**
   * Admin login — not tied to any branch by default.
   * Pass a branch record to scope the admin's session to that branch.
   */
  const loginAdmin = useCallback(async (password, branch = null) => {
    if (password !== ADMIN_PASSWORD) throw new Error('Incorrect admin password.');
    const user    = { role: 'Admin', name: 'Admin', storeId: branch?.id ?? null };
    const session = { user, branch };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setCurrentUser(user);
    setCurrentBranch(branch);
    return user;
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
      loginBranch, loginAdmin, logout,
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
