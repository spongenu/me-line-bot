import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Calendar } from 'lucide-react';

interface Role {
  Name: string;
}

interface UserRole {
  Role: Role;
}

interface User {
  ID: number;
  LineUserID: string;
  Name: string;
  DisplayName: string;
  PictureURL: string;
  UserRoles: UserRole[];
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]); // จ-ศ (0=Sun, 1=Mon...)
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const changeRole = async (userId: number, currentRole: string) => {
    const roles = ['customer', 'staff', 'admin'];
    let currentIndex = roles.indexOf(currentRole);
    if (currentIndex === -1) currentIndex = 0;
    
    const nextRole = roles[(currentIndex + 1) % roles.length];
    
    if (confirm(`คุณต้องการเปลี่ยนสิทธิ์ผู้ใช้นี้เป็น "${nextRole.toUpperCase()}" ใช่หรือไม่?`)) {
      try {
        await api.put(`/admin/users/role?user_id=${userId}`, { role_name: nextRole });
        fetchUsers();
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการเปลี่ยนสิทธิ์');
      }
    }
  };

  const openScheduleModal = async (user: User) => {
    setSelectedUser(user);
    setEffectiveDate(new Date().toISOString().split('T')[0]);
    setIsModalOpen(true);
    
    // Fetch current schedule
    try {
      const res = await api.get(`/admin/schedules?user_id=${user.ID}`);
      const schedules = res.data || [];
      if (schedules.length > 0) {
        // Use the latest schedule's working days
        const latest = schedules[0];
        const days = latest.WorkingDays ? latest.WorkingDays.split(',').map(Number) : [];
        setWorkingDays(days);
      } else {
        setWorkingDays([1, 2, 3, 4, 5]); // Default
      }
    } catch (err) {
      console.error('Error fetching schedule', err);
    }
  };

  const toggleDay = (dayStr: number) => {
    if (workingDays.includes(dayStr)) {
      setWorkingDays(workingDays.filter(d => d !== dayStr));
    } else {
      setWorkingDays([...workingDays, dayStr].sort());
    }
  };

  const saveSchedule = async () => {
    if (!selectedUser) return;
    setSavingSchedule(true);
    try {
      await api.put(`/admin/schedules/update?user_id=${selectedUser.ID}`, {
        working_days: workingDays.join(','),
        effective_from: effectiveDate
      });
      alert('บันทึกตารางงานสำเร็จ');
      setIsModalOpen(false);
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกตารางงาน');
    } finally {
      setSavingSchedule(false);
    }
  };

  const daysOfWeek = [
    { id: 1, name: 'จันทร์' },
    { id: 2, name: 'อังคาร' },
    { id: 3, name: 'พุธ' },
    { id: 4, name: 'พฤหัสฯ' },
    { id: 5, name: 'ศุกร์' },
    { id: 6, name: 'เสาร์' },
    { id: 0, name: 'อาทิตย์' }
  ];

  if (loading) return <div className="text-center p-10 text-gray-500">กำลังโหลดข้อมูลพนักงาน...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">จัดการพนักงาน</h2>
          <p className="text-gray-500">จัดการสิทธิ์ (Role) และวันทำงานของพนักงาน</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-4 font-semibold text-gray-600 text-sm">ผู้ใช้งาน</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">สิทธิ์ (Role)</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => {
                const roleName = user.UserRoles && user.UserRoles.length > 0 ? user.UserRoles[0].Role.Name : 'customer';
                
                return (
                  <tr key={user.ID} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center space-x-3">
                        {user.PictureURL ? (
                          <img src={user.PictureURL} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                            {user.DisplayName?.charAt(0) || user.Name.charAt(0) || '?'}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-gray-800">{user.DisplayName || user.Name}</p>
                          <p className="text-xs text-gray-400">ID: {user.ID} | {user.LineUserID.substring(0, 10)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                        roleName === 'admin' ? 'bg-purple-100 text-purple-700' :
                        roleName === 'staff' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {roleName.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => openScheduleModal(user)}
                        className="text-indigo-600 hover:text-indigo-800 text-sm font-medium bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors mr-2 inline-flex items-center"
                      >
                        <Calendar size={16} className="mr-1" /> วันทำงาน
                      </button>
                      <button 
                        onClick={() => changeRole(user.ID, roleName)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        สลับสิทธิ์
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Schedule Modal */}
      {isModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-800">ตั้งค่าวันทำงาน</h3>
              <p className="text-sm text-gray-500 mt-1">{selectedUser.DisplayName || selectedUser.Name}</p>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">วันที่มีผล (Effective Date)</label>
                <input 
                  type="date" 
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">*ตั้งแต่วันนี้เป็นต้นไป พนักงานจะมีตารางงานตามที่เลือกด้านล่าง</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">วันทำงานประจำสัปดาห์</label>
                <div className="grid grid-cols-2 gap-3">
                  {daysOfWeek.map(day => (
                    <label key={day.id} className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={workingDays.includes(day.id)}
                        onChange={() => toggleDay(day.id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">{day.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button 
                onClick={saveSchedule}
                disabled={savingSchedule}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingSchedule ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
