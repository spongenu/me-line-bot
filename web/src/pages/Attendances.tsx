import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface User {
  ID: number;
  DisplayName: string;
  Name: string;
  UserRoles?: { Role: { Name: string } }[];
}

interface Attendance {
  ID: number;
  User: User;
  CheckInTime: string;
  CheckOutTime: string | null;
  WorkDurationMin: number;
  WorkDate: string;
}

export default function Attendances() {
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Default to current month (YYYY-MM)
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedUserId, setSelectedUserId] = useState('');

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const fetchAttendances = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedMonth) params.append('month', selectedMonth);
      if (selectedUserId) params.append('user_id', selectedUserId);
      
      const res = await api.get(`/admin/attendances?${params.toString()}`);
      setAttendances(res.data || []);
    } catch (err) {
      console.error('Error fetching attendances:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    fetchAttendances();
  }, [selectedMonth, selectedUserId]);

  const handleForceCheckout = async (id: number) => {
    const outTimeStr = prompt('กรุณาระบุเวลาออกงาน ตัวอย่างรูปแบบ:\n2026-09-25T23:00:00Z');
    if (!outTimeStr) return;

    try {
      await api.put(`/admin/attendances/update?id=${id}`, { check_out_time: outTimeStr });
      alert('บันทึกเวลาออกสำเร็จ!');
      fetchAttendances();
    } catch (err) {
      alert('เกิดข้อผิดพลาด กรุณาตรวจสอบรูปแบบเวลา (ต้องเป็น RFC3339 เช่น 2026-09-25T23:00:00Z)');
    }
  };

  // คำนวณสรุปยอดเวลาทำงาน (รวมทุกวันในตาราง)
  const totalMinutes = attendances.reduce((acc, curr) => acc + curr.WorkDurationMin, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  // คำนวณเวลาเช็คอินเฉลี่ย
  let totalCheckInMinutes = 0;
  let checkInCount = 0;
  attendances.forEach(att => {
    if (att.CheckInTime) {
      const d = new Date(att.CheckInTime);
      totalCheckInMinutes += (d.getHours() * 60) + d.getMinutes();
      checkInCount++;
    }
  });
  const avgCheckInMinutes = checkInCount > 0 ? Math.round(totalCheckInMinutes / checkInCount) : 0;
  const avgCheckInTime = checkInCount > 0 
    ? String(Math.floor(avgCheckInMinutes / 60)).padStart(2, '0') + ':' + String(avgCheckInMinutes % 60).padStart(2, '0') + ' น.' 
    : '-';

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">เวลาเข้า-ออกงาน</h2>
          <p className="text-gray-500">สรุปเวลาการทำงานของพนักงานรายบุคคล</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-sm w-full xl:w-auto">
          <div className="flex items-center space-x-2">
            <label htmlFor="monthFilter" className="text-sm font-medium text-gray-600 whitespace-nowrap">เดือน:</label>
            <input 
              type="month" 
              id="monthFilter"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-800"
            />
          </div>
          
          <div className="hidden sm:block w-px h-6 bg-gray-200"></div>
          
          <div className="flex items-center space-x-2 flex-1 min-w-[200px]">
            <label htmlFor="userFilter" className="text-sm font-medium text-gray-600 whitespace-nowrap">พนักงาน:</label>
            <select 
              id="userFilter"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-800 w-full"
            >
              <option value="">-- ดูทุกคน --</option>
              {users.filter(u => {
                const roles = u.UserRoles && u.UserRoles.length > 0 ? u.UserRoles.map((ur: any) => ur.Role.Name) : ['customer'];
                return roles.includes('staff');
              }).map(u => (
                <option key={u.ID} value={u.ID}>{u.DisplayName || u.Name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {selectedUserId && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
            <div className="flex gap-16">
              <div>
                  <p className="text-sm text-blue-800 font-medium">สรุปเวลาทำงานเดือน {selectedMonth}</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">{totalHours} <span className="text-sm font-normal">ชั่วโมง</span></p>
              </div>
              <div>
                  <p className="text-sm text-blue-800 font-medium">เวลาเข้างานเฉลี่ย</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">{avgCheckInTime}</p>
              </div>
            </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-4 font-semibold text-gray-600 text-sm">วันที่</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">พนักงาน</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">เวลาเข้า</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">เวลาออก</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">รวม (ชม.)</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {attendances.map((att) => {
                const checkIn = new Date(att.CheckInTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                const checkOut = att.CheckOutTime 
                    ? new Date(att.CheckOutTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
                    : '-';
                const duration = att.WorkDurationMin > 0 ? (att.WorkDurationMin / 60).toFixed(1) : '-';

                return (
                  <tr key={att.ID} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm font-medium text-gray-700">{att.WorkDate}</td>
                    <td className="p-4 text-sm font-bold text-gray-800">{att.User?.DisplayName || att.User?.Name}</td>
                    <td className="p-4 text-sm text-green-600 font-medium">{checkIn}</td>
                    <td className="p-4 text-sm">
                      {att.CheckOutTime ? (
                        <span className="text-gray-600">{checkOut}</span>
                      ) : (
                        <span className="text-red-500 font-semibold bg-red-50 px-2 py-1 rounded">ลืมเช็คเอาท์</span>
                      )}
                    </td>
                    <td className="p-4 text-sm font-medium text-gray-600">{duration} ชม.</td>
                    <td className="p-4 text-right">
                      {!att.CheckOutTime && (
                        <button 
                          onClick={() => handleForceCheckout(att.ID)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          แก้ไขเวลา
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              
              {!loading && attendances.length === 0 && (
                 <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">ไม่มีประวัติเข้าออกงานในเงื่อนไขที่เลือก</td>
                 </tr>
              )}
              {loading && (
                 <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">กำลังโหลดข้อมูล...</td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
