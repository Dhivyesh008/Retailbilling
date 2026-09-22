import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout() {
  const { isCashier } = useAuth();

  return (
    <div className="flex min-h-screen bg-[#f5f7fb]">
      {/* Sidebar is null for Cashiers, so no left margin needed */}
      <Sidebar />
      <div className={`flex flex-1 flex-col ${isCashier ? '' : 'lg:ml-64'}`}>
        <Navbar />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
