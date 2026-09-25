import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Users, Clock, CalendarDays, LogOut } from 'lucide-react';

export default function Layout() {
  const { logout, user } = useAuth();
  
  const navItems = [
    { to: '/dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { to: '/users', icon: <Users size={20} />, label: 'พนักงาน (Users)' },
    { to: '/attendances', icon: <Clock size={20} />, label: 'เวลาเข้า-ออก' },
    { to: '/leaves', icon: <CalendarDays size={20} />, label: 'อนุมัติวันลา' },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar (Desktop) */}
      <div className="w-64 bg-white shadow-sm border-r hidden md:flex md:flex-col">
        <div className="p-5 border-b flex items-center justify-center">
          <h1 className="text-2xl font-black text-blue-600 tracking-tight">ME Admin</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center space-x-3 p-3 rounded-lg transition-colors font-medium ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        
        <div className="p-4 border-t">
          <div className="flex items-center space-x-3 mb-4 p-2">
            {user?.picture_url ? (
               <img src={user.picture_url} alt="Profile" className="w-10 h-10 rounded-full border border-gray-200" />
            ) : (
               <div className="w-10 h-10 rounded-full bg-gray-200"></div>
            )}
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-bold text-gray-800 truncate">{user?.display_name || 'Admin'}</p>
              <p className="text-xs text-gray-500 truncate">Administrator</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center justify-center space-x-2 text-red-600 hover:bg-red-50 w-full p-2.5 rounded-lg transition-colors font-semibold"
          >
            <LogOut size={18} />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="bg-white shadow-sm border-b md:hidden p-4 flex justify-between items-center z-10">
          <h1 className="text-xl font-black text-blue-600">ME Admin</h1>
          {/* Simple bottom navigation for mobile can be added, or just rely on a hamburger menu */}
        </header>
        
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
        
        {/* Mobile Bottom Tab Bar */}
        <nav className="md:hidden bg-white border-t flex justify-around p-2 pb-safe">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center p-2 rounded-lg ${
                    isActive ? 'text-blue-600' : 'text-gray-500'
                  }`
                }
              >
                {item.icon}
                <span className="text-[10px] mt-1 font-medium">{item.label}</span>
              </NavLink>
            ))}
        </nav>
      </div>
    </div>
  );
}
