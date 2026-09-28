import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Attendances from './pages/Attendances';
import Leaves from './pages/Leaves';
import StaffPortal from './pages/StaffPortal';
import Settings from './pages/Settings';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

const AdminLayoutWrapper = () => {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Staff Portal Routes (Single LIFF entry & Standalone paths) */}
        <Route path="/staff" element={<StaffPortal />} />
        <Route path="/staff/*" element={<StaffPortal />} />
        <Route path="/leave" element={<StaffPortal defaultTab="leave" />} />
        <Route path="/leave/*" element={<StaffPortal defaultTab="leave" />} />
        <Route path="/checkin" element={<StaffPortal defaultTab="checkin" />} />
        <Route path="/history" element={<StaffPortal defaultTab="history" />} />
        
        {/* Admin Routes (Wrapped in AuthProvider via pathless layout route) */}
        <Route element={<AdminLayoutWrapper />}>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="attendances" element={<Attendances />} />
            <Route path="leaves" element={<Leaves />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>

        {/* Catch-all redirect to /staff */}
        <Route path="*" element={<Navigate to="/staff" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

