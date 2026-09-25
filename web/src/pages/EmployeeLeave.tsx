import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { api } from '../lib/api';

export default function EmployeeLeave() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  
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
        await liff.init({ liffId: import.meta.env.VITE_LIFF_ID });
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
        
        const p = await liff.getProfile();
        setProfile(p);
        
        // Authenticate with backend to get JWT
        const idToken = liff.getIDToken();
        const res = await api.post('/auth/verify-liff', { id_token: idToken });
        localStorage.setItem('token', res.data.token);
      } catch (err) {
        console.error('LIFF init failed', err);
        setErrorMsg('ไม่สามารถเชื่อมต่อ LINE ได้ กรุณาเปิดจากในแอป LINE');
      } finally {
        setLoading(false);
      }
    };
    initLiff();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      
      const msgText = "ฉันได้ยื่นคำขอลางานเข้าระบบแล้ว";
      
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
      const errMsg = err.response?.data?.message || err.response?.data || err.message || JSON.stringify(err);
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
        {errorMsg && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm font-medium border border-red-100">
            {errorMsg}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">ประเภทการลา</label>
            <div className="grid grid-cols-3 gap-2">
              {['ลาป่วย', 'ลากิจ', 'ลาพักร้อน'].map(type => (
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
                  {type}
                </button>
              ))}
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
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 mt-2"
          >
            {isSubmitting ? 'กำลังส่งข้อมูล...' : 'ส่งคำขอลางาน'}
          </button>
        </form>
      </div>
    </div>
  );
}
