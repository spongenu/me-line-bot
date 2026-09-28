import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import liff from '@line/liff';
import { api } from '../lib/api';
import Checkin from './Checkin';
import EmployeeLeave from './EmployeeLeave';
import StaffHistory from './StaffHistory';
import { Clock, Calendar, History, User } from 'lucide-react';

interface StaffPortalProps {
  defaultTab?: 'checkin' | 'leave' | 'history';
}

export default function StaffPortal({ defaultTab }: StaffPortalProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'checkin' | 'leave' | 'history'>('checkin');
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Handle URL path query parameter
  useEffect(() => {
    const queryPath = searchParams.get('path');
    if (queryPath === 'leave' || queryPath === '/leave') {
      setActiveTab('leave');
    } else if (queryPath === 'history' || queryPath === '/history') {
      setActiveTab('history');
    } else if (queryPath === 'checkin' || queryPath === '/checkin') {
      setActiveTab('checkin');
    } else if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [searchParams, defaultTab]);

  useEffect(() => {
    const initLiff = async () => {
      try {
        const staffLiffId = import.meta.env.VITE_LIFF_STAFF_ID || import.meta.env.VITE_LIFF_LEAVE_ID;
        if (!staffLiffId) {
          console.warn('VITE_LIFF_STAFF_ID is not defined');
        } else if (!liff.id) {
          await liff.init({ liffId: staffLiffId });
        }

        if (liff.id && !liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }

        if (liff.isLoggedIn()) {
          const p = await liff.getProfile();
          setProfile(p);

          const idToken = liff.getIDToken();
          if (idToken) {
            const res = await api.post('/auth/verify-liff', { id_token: idToken });
            localStorage.setItem('token', res.data.token);
          }
        }
      } catch (err: any) {
        console.error('StaffPortal LIFF init error:', err);
        setErrorMsg('ไม่สามารถเชื่อมต่อ LINE ได้ กรุณาเปิดจากในแอป LINE');
      } finally {
        setLoading(false);
      }
    };

    initLiff();
  }, []);

  const handleTabChange = (tab: 'checkin' | 'leave' | 'history') => {
    setActiveTab(tab);
    setSearchParams({ path: tab });
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-50 space-y-3">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 font-medium text-sm">กำลังเข้าสู่ระบบพนักงาน...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-50 p-6 text-center">
        <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3">
          <User className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">แจ้งเตือน</h2>
        <p className="text-gray-600 text-sm max-w-xs">{errorMsg}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 max-w-md mx-auto relative shadow-xl">
      {/* Header with Employee Profile */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-5 rounded-b-[2rem] shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {profile?.pictureUrl ? (
              <img
                src={profile.pictureUrl}
                alt={profile.displayName}
                className="w-11 h-11 rounded-full border-2 border-white/60 shadow-sm"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center border-2 border-white/60">
                <User className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <p className="text-xs text-blue-200">ยินดีต้อนรับ</p>
              <h1 className="text-base font-bold truncate max-w-[200px]">
                {profile?.displayName || 'พนักงาน'}
              </h1>
            </div>
          </div>
          <div className="bg-white/15 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase border border-white/20">
            STAFF
          </div>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex bg-black/20 p-1 rounded-2xl mt-4 space-x-1 border border-white/10">
          <button
            onClick={() => handleTabChange('checkin')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1 ${
              activeTab === 'checkin'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>เข้า-ออกงาน</span>
          </button>
          <button
            onClick={() => handleTabChange('leave')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1 ${
              activeTab === 'leave'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>ลางาน</span>
          </button>
          <button
            onClick={() => handleTabChange('history')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1 ${
              activeTab === 'history'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>ประวัติ</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="mt-2">
        {activeTab === 'checkin' && <Checkin />}
        {activeTab === 'leave' && <EmployeeLeave />}
        {activeTab === 'history' && <StaffHistory />}
      </div>
    </div>
  );
}
