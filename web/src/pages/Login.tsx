import { useAuth } from '../contexts/AuthContext';
import { LogIn } from 'lucide-react';
import { Navigate } from 'react-router-dom';

export default function Login() {
  const { loginWithLine, loading, user } = useAuth();

  // If user is already logged in, redirect to dashboard
  if (user && !loading) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 md:p-10 rounded-2xl shadow-xl max-w-sm w-full text-center border border-gray-100">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-black text-blue-600">ME</span>
        </div>
        <h1 className="text-2xl font-bold mb-2 text-gray-800">ME Admin Panel</h1>
        <p className="text-gray-500 mb-8 text-sm">ระบบจัดการหลังบ้านร้านค้าของคุณ</p>
        
        <button
          onClick={loginWithLine}
          disabled={loading}
          className="w-full bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center space-x-3 transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-green-200"
        >
          {loading ? (
            <div className="flex items-center space-x-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>กำลังตรวจสอบข้อมูล...</span>
            </div>
          ) : (
            <>
              <LogIn size={20} />
              <span className="text-lg">Login with LINE</span>
            </>
          )}
        </button>
        
        <p className="text-xs text-gray-400 mt-6">
          *สงวนสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น
        </p>
      </div>
    </div>
  );
}
