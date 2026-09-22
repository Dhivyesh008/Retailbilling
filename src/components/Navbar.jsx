import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import ConnectivityBadge from './ConnectivityBadge.jsx';

export default function Navbar({ title }) {
  const { currentUser } = useAuth();
  const initials = currentUser?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2) ?? 'RS';

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur">
      {/* Title area — populated by each page */}
      <div className="min-w-0 flex-1">
        {title && <h2 className="truncate text-sm font-bold text-slate-700">{title}</h2>}
      </div>

      <div className="flex items-center gap-3">
        {/* Online / Offline toggle */}
        <ConnectivityBadge />

        {/* Notification bell placeholder */}
        <button className="relative rounded-xl border border-slate-200 p-2 hover:bg-slate-50">
          <Bell size={17} className="text-slate-500" />
        </button>

        {/* Avatar */}
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-bold text-white">
            {initials}
          </span>
          <div className="hidden sm:block">
            <p className="text-xs font-bold leading-none">{currentUser?.name}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">{currentUser?.role}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
