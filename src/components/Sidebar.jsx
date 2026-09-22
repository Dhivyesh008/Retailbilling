import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Receipt, Boxes, Users, RotateCcw,
  BarChart3, LogOut, Store, ChevronRight, RefreshCw, Building2, Tag,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const ALL_LINKS = [
  { to: '/dashboard',   label: 'Dashboard',          Icon: LayoutDashboard, roles: ['Admin','Manager','Staff'] },
  { to: '/billing',     label: 'Billing',             Icon: Receipt,         roles: ['Admin','Manager','Staff'] },
  { to: '/inventory',   label: 'Inventory',           Icon: Boxes,           roles: ['Admin','Manager','Staff'] },
  { to: '/customers',   label: 'Customers',           Icon: Users,           roles: ['Admin','Manager'] },
  { to: '/returns',     label: 'Returns',             Icon: RotateCcw,       roles: ['Admin','Manager'] },
  { to: '/reports',     label: 'Reports',             Icon: BarChart3,       roles: ['Admin','Manager'] },
  { to: '/promotions',  label: 'Promotions & Loyalty',Icon: Tag,             roles: ['Admin','Manager'] },
  { to: '/sync-queue',  label: 'Sync Queue',          Icon: RefreshCw,       roles: ['Admin','Manager'] },
];

export default function Sidebar() {
  const nav = useNavigate();
  const { currentUser, currentBranch, logout, isCashier } = useAuth();

  // Cashiers have no sidebar — they're locked to the Billing page
  if (isCashier) return null;

  const role  = currentUser?.role ?? 'Staff';
  const links = ALL_LINKS.filter((l) => l.roles.includes(role));

  const handleLogout = () => { logout(); nav('/'); };

  return (
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

      {/* Workspace pill */}
      <div className="mx-3 mt-8 rounded-xl bg-slate-50 p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Workspace</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-bold">
          <Building2 size={13} className="text-brand shrink-0" />
          {currentBranch?.name ?? 'All Branches'}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">{role}</p>
      </div>

      {/* Nav */}
      <p className="eyebrow mb-3 mt-8 px-3">Navigation</p>
      <nav className="space-y-1">
        {links.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${
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
  );
}
