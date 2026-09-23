import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Receipt, Boxes, Users, RotateCcw,
  BarChart3, LogOut, Store, ChevronRight, ChevronDown, Check, Plus,
  RefreshCw, Building2, Tag, Package, Sparkles, MapPin, X, Loader2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useDB } from '../context/DBContext.jsx';
import { createStore } from '../services/supabaseService.js';
import { db } from '../db/db.js';

const ALL_LINKS = [
  { to: '/dashboard',      label: 'Dashboard',           Icon: LayoutDashboard, roles: ['Admin','Manager','Staff'] },
  { to: '/products',       label: 'Products',            Icon: Package,         roles: ['Admin','Manager','Staff'] },
  { to: '/billing',        label: 'Billing',             Icon: Receipt,         roles: ['Admin','Manager','Staff'] },
  { to: '/inventory',      label: 'Inventory',           Icon: Boxes,           roles: ['Admin','Manager','Staff'] },
  { to: '/customers',      label: 'Customers',           Icon: Users,           roles: ['Admin','Manager'] },
  { to: '/returns',        label: 'Returns',             Icon: RotateCcw,       roles: ['Admin','Manager'] },
  { to: '/reports',        label: 'Reports',             Icon: BarChart3,       roles: ['Admin','Manager'] },
  { to: '/promotions',     label: 'Promotions & Loyalty',Icon: Tag,             roles: ['Admin','Manager'] },
  { to: '/pricing-rules',  label: 'Pricing Engine',      Icon: Sparkles,        roles: ['Admin','Manager'] },
  { to: '/sync-queue',     label: 'Sync Queue',          Icon: RefreshCw,       roles: ['Admin','Manager'] },
];

export default function Sidebar() {
  const nav = useNavigate();
  const { currentUser, currentBranch, logout, isCashier, isAdmin, switchBranch } = useAuth();
  const { stores, refresh } = useDB();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchLocation, setNewBranchLocation] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cashiers have no sidebar — they're locked to the Billing page
  if (isCashier) return null;

  const role  = currentUser?.role ?? 'Staff';
  const links = ALL_LINKS.filter((l) => l.roles.includes(role));

  const handleLogout = () => { logout(); nav('/'); };

  const handleSelectBranch = (store) => {
    switchBranch(store);
    setDropdownOpen(false);
  };

  const handleCreateBranch = async (e) => {
    e.preventDefault();
    if (!newBranchName.trim()) {
      setCreateError('Please enter a branch name.');
      return;
    }

    setCreating(true);
    setCreateError('');
    try {
      const created = await createStore({
        name: newBranchName.trim(),
        location: newBranchLocation.trim() || 'General',
      });
      await db.stores.put(created);
      await refresh();
      switchBranch(created);
      setNewBranchName('');
      setNewBranchLocation('');
      setModalOpen(false);
    } catch (err) {
      console.error('[Sidebar] Error creating branch:', err);
      setCreateError(err.message || 'Failed to create branch');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
        {/* Brand */}
        <div className="flex items-center gap-3 px-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-white shadow-lg">
            <Store size={19} />
          </span>
          <span className="text-lg font-extrabold tracking-tight">
            Retail<span className="text-brand">Sync</span>
          </span>
        </div>

        {/* Workspace pill / Branch switcher */}
        <div className="relative mx-1 mt-6" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full text-left rounded-xl border border-slate-200/80 bg-slate-50 p-3 hover:bg-slate-100/80 hover:border-slate-300 transition group"
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Workspace</p>
              <ChevronDown
                size={14}
                className={`text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-800 truncate">
              <Building2 size={14} className="text-brand shrink-0" />
              <span className="truncate">{currentBranch?.name ?? 'All Branches'}</span>
            </p>
            <div className="mt-0.5 flex items-center justify-between text-xs text-slate-400">
              <span>{role}</span>
              {currentBranch?.location && (
                <span className="flex items-center gap-0.5 text-[11px] text-slate-500 font-medium">
                  <MapPin size={10} />
                  {currentBranch.location}
                </span>
              )}
            </div>
          </button>

          {/* Branch Dropdown */}
          {dropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Select Branch
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleSelectBranch(null)}
                    className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition ${
                      !currentBranch ? 'bg-blue-50 text-brand' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Building2 size={13} />
                      <span>All Branches</span>
                    </div>
                    {!currentBranch && <Check size={13} className="text-brand shrink-0" />}
                  </button>
                )}

                {stores.map((s) => {
                  const isActive = currentBranch?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectBranch(s)}
                      className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition ${
                        isActive ? 'bg-blue-50 text-brand' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <p className="truncate">{s.name}</p>
                        {s.location && (
                          <p className="text-[10px] text-slate-400 font-normal">{s.location}</p>
                        )}
                      </div>
                      {isActive && <Check size={13} className="text-brand shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-1 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    setModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-bold text-brand hover:bg-blue-50 transition"
                >
                  <Plus size={14} />
                  <span>Add Another Branch</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <p className="eyebrow mb-3 mt-6 px-3">Navigation</p>
        <nav className="space-y-1 overflow-y-auto flex-1 pr-1">
          {links.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                  isActive ? 'bg-blue-50 text-brand' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <Icon size={18} />
              <span className="flex-1">{label}</span>
              <ChevronRight size={15} className="opacity-0 transition group-[.active]:opacity-100" />
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="mt-auto flex items-center gap-3 border-t border-slate-100 px-3 pt-5 text-sm font-bold text-slate-500 hover:text-red-600"
        >
          <LogOut size={18} /> Logout
        </button>
      </aside>

      {/* Add Branch Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="card w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-brand font-bold">
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900">Add New Branch</h3>
                  <p className="text-xs text-slate-500">Create a store branch synced with Supabase</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            {createError && (
              <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-200">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateBranch} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700">Branch Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RetailSync City Centre"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="field mt-1.5 w-full bg-white text-sm"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Location / City</label>
                <input
                  type="text"
                  placeholder="e.g. Coimbatore, Salem, Chennai"
                  value={newBranchLocation}
                  onChange={(e) => setNewBranchLocation(e.target.value)}
                  className="field mt-1.5 w-full bg-white text-sm"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn-primary inline-flex items-center gap-1.5 px-5 py-2.5 text-xs disabled:opacity-50"
                >
                  {creating && <Loader2 size={14} className="animate-spin" />}
                  <span>{creating ? 'Creating…' : 'Create Branch'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

