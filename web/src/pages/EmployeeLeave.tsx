import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { api } from '../lib/api';

interface LeaveBalance {
  leave_type: string;
  year: number;
  total_days: number;
  used_days: number;
  pending_days: number;
  remaining_days: number;
}

export default function EmployeeLeave() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  
  const [leaveType, setLeaveType] = useState('ลาป่วย');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const initLiff = async () => {
      try {
        const staffLiffId = import.meta.env.VITE_LIFF_STAFF_ID || import.meta.env.VITE_LIFF_LEAVE_ID;
        if (staffLiffId && !liff.id) {
          await liff.init({ liffId: staffLiffId });
        }
        
        if (liff.id && !liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
        
        if (liff.isLoggedIn()) {
          const p = await liff.getProfile();
          setProfile(p);
          
          // Authenticate with backend to get JWT
          const idToken = liff.getIDToken();
          if (idToken) {
            const res = await api.post('/auth/verify-liff', { id_token: idToken });
            localStorage.setItem('token', res.data.token);
          }
        }

        // Fetch user leave balances
        try {
          const balanceRes = await api.get('/user/leave-balances');
          setBalances(balanceRes.data);
        } catch (bErr) {
          console.error('Failed to fetch leave balances', bErr);
        }
      } catch (err) {
        console.error('LIFF init failed', err);
        setErrorMsg('ไม่สามารถเชื่อมต่อ LINE ได้ กรุณาเปิดจากในแอป LINE');
      } finally {
        setLoading(false);
      }
    };
    initLiff();
  }, []);

  const calculateDays = (start: string, end: string) => {
    if (!start || !end) return 1;
    const s = new Date(start);
    const e = new Date(end);
    const diffTime = e.getTime() - s.getTime();
    if (diffTime < 0) return 0;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const requestedDays = calculateDays(startDate, endDate);
  const currentBalance = balances.find(b => b.leave_type === leaveType);
  const remainingDays = currentBalance ? currentBalance.remaining_days : 0;
  const isQuotaExceeded = requestedDays > remainingDays || remainingDays <= 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requestedDays <= 0) {
      setErrorMsg('วันที่สิ้นสุดต้องไม่มาก่อนวันที่เริ่มต้น');
      return;
    }

    if (isQuotaExceeded) {
      setErrorMsg(`โควตา${leaveType}ไม่เพียงพอ (เหลือ ${remainingDays} วัน แต่ขอยื่น ${requestedDays} วัน)`);
      return;
    }

    if (!reason.trim()) {
      setErrorMsg('กรุณาระบุเหตุผลการลา');
      return;
    }
    
    setIsSubmitting(true);
    setErrorMsg('');
    
    try {
      // Save to backend first
      await api.post('/user/leave-requests', {
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim()
      });
      
      const msgText = `ฉันได้ยื่นคำขอ${leaveType} (${startDate} ถึง ${endDate}) จำนวน ${requestedDays} วัน เข้าระบบแล้ว`;
      
      await liff.sendMessages([
        {
          type: 'text',
          text: msgText
        }
      ]);
      
      setSuccess(true);
      setTimeout(() => {
        liff.closeWindow();
      }, 2000);
      
    } catch (err: any) {
      console.error('Failed to send message', err);
      const errMsg = err.response?.data?.error || err.response?.data?.message || err.response?.data || err.message || JSON.stringify(err);
      setErrorMsg(`เกิดข้อผิดพลาด: ${errMsg}`);
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><div className="text-gray-500">กำลังโหลด...</div></div>;
  }

  if (success) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-50 p-6">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">ยื่นใบลาสำเร็จ</h2>
        <p className="text-gray-500 text-center">ระบบได้ส่งคำขอของคุณให้แอดมินแล้ว<br/>หน้าต่างจะปิดอัตโนมัติ...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="bg-blue-600 p-6 rounded-b-[2rem] shadow-md mb-6">
        <h1 className="text-2xl font-bold text-white text-center">แบบฟอร์มขอลางาน</h1>
        {profile && (
          <div className="flex items-center justify-center mt-4 space-x-3">
            <img src={profile.pictureUrl} alt="" className="w-10 h-10 rounded-full border-2 border-white/50" />
            <p className="text-white/90 font-medium">{profile.displayName}</p>
          </div>
        )}
      </div>
      
      <div className="px-4">
        {/* Quota Summary Cards */}
        {balances.length > 0 && (
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">โควตาวันลาของคุณ (ปี {new Date().getFullYear()})</h3>
            <div className="grid grid-cols-3 gap-2">
              {balances.map((b) => (
                <div 
                  key={b.leave_type} 
                  onClick={() => setLeaveType(b.leave_type)}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    leaveType === b.leave_type
                      ? 'border-blue-500 bg-blue-50/60 shadow-sm'
                      : 'border-gray-100 bg-gray-50/50 hover:bg-gray-50'
                  }`}
                >
                  <p className="text-xs font-medium text-gray-600 truncate">{b.leave_type}</p>
                  <p className={`text-lg font-black mt-0.5 ${b.remaining_days > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                    {b.remaining_days}
                  </p>
                  <p className="text-[10px] text-gray-400">จาก {b.total_days} วัน</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm font-medium border border-red-100">
            {errorMsg}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">ประเภทการลา</label>
            <div className="grid grid-cols-3 gap-2">
              {['ลาป่วย', 'ลากิจ', 'ลาพักร้อน'].map(type => {
                const bal = balances.find(b => b.leave_type === type);
                return (
                  <button
                    type="button"
                    key={type}
                    onClick={() => setLeaveType(type)}
                    className={`py-2 px-1 text-sm font-medium rounded-xl border transition-colors ${
                      leaveType === type 
                        ? 'bg-blue-50 border-blue-500 text-blue-700' 
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div>{type}</div>
                    {bal && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        เหลือ {bal.remaining_days} วัน
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">วันที่เริ่ม</label>
              <input 
                type="date" 
                required
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border-gray-300 rounded-xl focus:ring-blue-500 focus:border-blue-500 p-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">ถึงวันที่</label>
              <input 
                type="date" 
                required
                min={startDate}
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full border-gray-300 rounded-xl focus:ring-blue-500 focus:border-blue-500 p-2.5 text-sm"
              />
            </div>
          </div>

          <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 flex items-center justify-between text-xs text-blue-800">
            <span>จำนวนวันที่ขอยื่น: <strong className="text-sm font-bold text-blue-900">{requestedDays}</strong> วัน</span>
            <span>โควตาคงเหลือ: <strong className={`text-sm font-bold ${remainingDays >= requestedDays ? 'text-green-600' : 'text-red-600'}`}>{remainingDays}</strong> วัน</span>
          </div>

          {isQuotaExceeded && (
            <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-100">
              ⚠️ โควตา{leaveType}ของคุณไม่เพียงพอ (เหลือ {remainingDays} วัน แต่ต้องการลา {requestedDays} วัน) ระบบไม่อนุญาตให้ยื่นลา
            </div>
          )}
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">เหตุผลการลา</label>
            <textarea 
              required
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="ระบุเหตุผล..."
              className="w-full border-gray-300 rounded-xl focus:ring-blue-500 focus:border-blue-500 p-3 text-sm resize-none"
            ></textarea>
          </div>
          
          <button 
            type="submit" 
            disabled={isSubmitting || isQuotaExceeded}
            className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:bg-gray-400 disabled:cursor-not-allowed mt-2"
          >
            {isSubmitting ? 'กำลังส่งข้อมูล...' : isQuotaExceeded ? 'โควตาวันลาไม่เพียงพอ' : 'ส่งคำขอลางาน'}
          </button>
        </form>
      </div>
    </div>
  );
}

