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
  const [schedules, setSchedules] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedMonth, setSelectedMonth] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  );

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editAttId, setEditAttId] = useState<number | null>(null);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
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
      const [resAtt, resUsers, resSched, resLeave] = await Promise.all([
        api.get(`/admin/attendances?month=${selectedMonth}${selectedUserId ? `&user_id=${selectedUserId}` : ''}`),
        api.get('/admin/users'),
        api.get('/admin/schedules'),
        api.get('/admin/leave-requests')
      ]);
      setAttendances(resAtt.data || []);
      setUsers(resUsers.data || []);
      setSchedules(resSched.data || []);
      setLeaveRequests(resLeave.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
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

  const toLocalIsoString = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openEditModal = (att: any) => {
    setEditAttId(att.ID);
    setEditCheckIn(toLocalIsoString(att.CheckInTime));
    setEditCheckOut(att.CheckOutTime ? toLocalIsoString(att.CheckOutTime) : '');
    setIsEditModalOpen(true);
  };

  const saveAttendanceEdit = async () => {
    if (!editAttId) return;
    setSavingEdit(true);
    try {
      const payload: any = {};
      
      if (editCheckIn) {
        payload.check_in_time = new Date(editCheckIn).toISOString();
      }
      
      if (editCheckOut) {
        payload.check_out_time = new Date(editCheckOut).toISOString();
      } else {
        payload.check_out_time = "";
      }

      await api.put(`/admin/attendances/update?id=${editAttId}`, payload);
      setIsEditModalOpen(false);
      fetchAttendances();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSavingEdit(false);
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

  const getDisplayRows = () => {
    if (loading) return [];
    
    // Start with actual attendances
    const rows: any[] = attendances.map(a => ({
      type: 'attendance',
      dateStr: a.CheckInTime ? a.CheckInTime.substring(0, 10) : a.WorkDate,
      user: a.User,
      att: a
    }));

    // Generate absences
    const staffUsers = users.filter(u => {
      const roles = u.UserRoles && u.UserRoles.length > 0 ? u.UserRoles.map((ur: any) => ur.Role.Name) : ['customer'];
      return roles.includes('staff') && (!selectedUserId || String(u.ID) === selectedUserId);
    });

    const [year, month] = selectedMonth.split('-');
    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
    
    const todayStr = new Date().toISOString().substring(0, 10);
    const endDay = selectedMonth === todayStr.substring(0, 7) ? new Date().getDate() : daysInMonth;

    staffUsers.forEach(user => {
      // Find user schedules
      const userScheds = schedules.filter(s => s.UserID === user.ID).sort((a, b) => new Date(b.EffectiveFrom).getTime() - new Date(a.EffectiveFrom).getTime());
      if (userScheds.length === 0) return; // No schedule set

      // Find user leaves
      const userLeaves = leaveRequests.filter(l => l.UserID === user.ID && l.Status === 'approved');

      for (let day = 1; day <= endDay; day++) {
        const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
        
        // Is there an attendance?
        if (rows.find(r => r.dateStr === dateStr && r.user.ID === user.ID)) continue;

        // Is there a leave?
        const isLeave = userLeaves.find(l => {
           const start = l.StartDate.substring(0, 10);
           const end = l.EndDate.substring(0, 10);
           return dateStr >= start && dateStr <= end;
        });
        if (isLeave) {
          rows.push({
            type: 'leave',
            dateStr: dateStr,
            user: user,
            leave: isLeave
          });
          continue;
        }

        // Determine if it's a scheduled work day
        const dateObj = new Date(dateStr);
        const dayOfWeek = dateObj.getDay(); // 0=Sun, 1=Mon
        
        const activeSched = userScheds.find(s => dateStr >= s.EffectiveFrom.substring(0, 10));
        if (activeSched && activeSched.WorkingDays) {
          const workingDays = activeSched.WorkingDays.split(',').map(Number);
          if (workingDays.includes(dayOfWeek)) {
            rows.push({
              type: 'absent',
              dateStr: dateStr,
              user: user
            });
          }
        }
      }
    });

    // Sort by date descending
    return rows.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  };

  const displayRows = getDisplayRows();


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
                        <button 
                          onClick={() => openEditModal(att)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          แก้ไขเวลา
                        </button>
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

      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-800">แก้ไขเวลาเข้า-ออกงาน</h3>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">เวลาเข้างาน (Check-in)</label>
                <input 
                  type="datetime-local" 
                  value={editCheckIn}
                  onChange={(e) => setEditCheckIn(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">เวลาออกงาน (Check-out)</label>
                <input 
                  type="datetime-local" 
                  value={editCheckOut}
                  onChange={(e) => setEditCheckOut(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">ปล่อยว่างได้ หากยังไม่เช็คเอาท์</p>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button 
                onClick={saveAttendanceEdit}
                disabled={savingEdit}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingEdit ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
