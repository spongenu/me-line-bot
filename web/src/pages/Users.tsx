import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Calendar, Briefcase, Shield, Check } from 'lucide-react';

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
  const [roleFilter, setRoleFilter] = useState('staff');

  // Role Modal State
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [roleUser, setRoleUser] = useState<User | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);

  // Schedule Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]); // จ-ศ (0=Sun, 1=Mon...)
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Quota Modal State
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [quotaUser, setQuotaUser] = useState<User | null>(null);
  const [quotaYear, setQuotaYear] = useState<number>(new Date().getFullYear());
  const [userQuotas, setUserQuotas] = useState<{ [key: string]: number }>({
    'ลาป่วย': 30,
    'ลากิจ': 3,
    'ลาพักร้อน': 6,
  });
  const [usedDaysMap, setUsedDaysMap] = useState<{ [key: string]: number }>({});
  const [savingQuota, setSavingQuota] = useState(false);

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

  const openRoleModal = (user: User) => {
    setRoleUser(user);
    const currentRoles = (user.UserRoles || []).map(ur => ur.Role.Name.toLowerCase());
    setSelectedRoles(currentRoles);
    setIsRoleModalOpen(true);
  };

  const toggleRole = (roleName: string) => {
    if (selectedRoles.includes(roleName)) {
      setSelectedRoles(selectedRoles.filter(r => r !== roleName));
    } else {
      setSelectedRoles([...selectedRoles, roleName]);
    }
  };

  const saveRoles = async () => {
    if (!roleUser) return;
    setSavingRoles(true);
    try {
      await api.put(`/admin/users/role?user_id=${roleUser.ID}`, {
        roles: selectedRoles
      });
      setIsRoleModalOpen(false);
      fetchUsers();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกสิทธิ์');
    } finally {
      setSavingRoles(false);
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

  const openQuotaModal = async (user: User) => {
    setQuotaUser(user);
    setIsQuotaModalOpen(true);
    await fetchUserQuotas(user.ID, quotaYear);
  };

  const fetchUserQuotas = async (userId: number, year: number) => {
    try {
      const res = await api.get(`/admin/users/leave-quotas?user_id=${userId}&year=${year}`);
      const data = res.data;
      if (data && data.quotas) {
        const qMap: { [key: string]: number } = {};
        data.quotas.forEach((item: any) => {
          qMap[item.leave_type] = item.total_days;
        });
        setUserQuotas(qMap);
      } else {
        setUserQuotas({ 'ลาป่วย': 30, 'ลากิจ': 3, 'ลาพักร้อน': 6 });
      }

      if (data && data.used_days_map) {
        setUsedDaysMap(data.used_days_map);
      } else {
        setUsedDaysMap({});
      }
    } catch (err) {
      console.error('Failed to fetch quotas', err);
    }
  };

  const handleYearChange = async (newYear: number) => {
    setQuotaYear(newYear);
    if (quotaUser) {
      await fetchUserQuotas(quotaUser.ID, newYear);
    }
  };

  const saveUserQuotas = async () => {
    if (!quotaUser) return;
    setSavingQuota(true);
    try {
      await api.put(`/admin/users/leave-quotas/update?user_id=${quotaUser.ID}`, {
        year: quotaYear,
        quotas: userQuotas
      });
      alert('บันทึกโควตาวันลาสำเร็จ');
      setIsQuotaModalOpen(false);
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกโควตา');
    } finally {
      setSavingQuota(false);
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

  // Filter users based on tab
  const filteredUsers = users.filter(user => {
    if (roleFilter === 'all') return true;
    const userRoles = (user.UserRoles || []).map(ur => ur.Role.Name.toLowerCase());
    return userRoles.includes(roleFilter);
  });

  return (
    <div className="space-y-6">
      {/* Header & Filter Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">จัดการสิทธิ์ผู้ใช้งาน</h2>
          <p className="text-sm text-gray-500 mt-1">กำหนดบทบาท สิทธิ์การเข้าถึง และตารางการทำงานของพนักงาน</p>
        </div>

        {/* Tab Filters */}
        <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
          <button
            onClick={() => setRoleFilter('staff')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              roleFilter === 'staff' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            พนักงาน (Staff)
          </button>
          <button
            onClick={() => setRoleFilter('admin')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              roleFilter === 'admin' 
                ? 'bg-white text-purple-600 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            ผู้ดูแล (Admin)
          </button>
          <button
            onClick={() => setRoleFilter('customer')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              roleFilter === 'customer' 
                ? 'bg-white text-gray-800 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            ลูกค้า (Customer)
          </button>
          <button
            onClick={() => setRoleFilter('all')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              roleFilter === 'all' 
                ? 'bg-white text-gray-800 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            ทั้งหมด ({users.length})
          </button>
        </div>
      </div>

      {/* Users List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 hidden md:grid grid-cols-12 text-xs font-bold text-gray-400 uppercase tracking-wider">
          <div className="col-span-4">ผู้ใช้งาน</div>
          <div className="col-span-2">สิทธิ์ปัจจุบัน</div>
          <div className="col-span-6 text-right">การจัดการ</div>
        </div>

        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-8 text-center text-gray-400">กำลังโหลดข้อมูล...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-gray-400">ไม่พบผู้ใช้งานในหมวดหมู่นี้</div>
          ) : filteredUsers.map((user) => {
            const userRoles = (user.UserRoles || []).map(ur => ur.Role.Name.toLowerCase());
            return (
              <div key={user.ID} className="p-4 flex flex-col md:grid md:grid-cols-12 items-start md:items-center justify-between hover:bg-gray-50/80 transition-colors">
                {/* User Info */}
                <div className="col-span-4 flex items-center space-x-3 w-full">
                  {user.PictureURL ? (
                    <img src={user.PictureURL} alt={user.DisplayName || user.Name} className="w-10 h-10 rounded-full object-cover border border-gray-100 shadow-sm" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 font-bold flex items-center justify-center text-sm shadow-sm">
                      {(user.DisplayName || user.Name || 'U').charAt(0)}
                    </div>
                  )}
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm">{user.DisplayName || user.Name}</h4>
                    <p className="text-xs text-gray-400">ID: {user.ID} | {user.LineUserID.substring(0, 10)}...</p>
                  </div>
                </div>

                {/* Roles */}
                <div className="col-span-2 flex flex-wrap gap-1.5 mt-2 md:mt-0">
                  {userRoles.length === 0 ? (
                    <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-500">
                      CUSTOMER
                    </span>
                  ) : (
                    userRoles.map((roleName, idx) => (
                      <span key={idx} className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full ${
                        roleName === 'admin' ? 'bg-purple-100 text-purple-700' :
                        roleName === 'staff' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {roleName.toUpperCase()}
                      </span>
                    ))
                  )}
                </div>

                {/* Actions */}
                <div className="col-span-6 flex flex-wrap gap-2 mt-3 md:mt-0 md:justify-end w-full md:w-auto">
                  <button 
                    onClick={() => openQuotaModal(user)}
                    className="text-amber-700 hover:text-amber-900 text-xs font-semibold bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors inline-flex items-center flex-1 md:flex-none justify-center"
                  >
                    <Briefcase size={14} className="mr-1" /> โควตาวันลา
                  </button>
                  <button 
                    onClick={() => openScheduleModal(user)}
                    className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors inline-flex items-center flex-1 md:flex-none justify-center"
                  >
                    <Calendar size={14} className="mr-1" /> วันทำงาน
                  </button>
                  <button 
                    onClick={() => openRoleModal(user)}
                    className="text-blue-600 hover:text-blue-800 text-xs font-semibold bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors inline-flex items-center flex-1 md:flex-none justify-center"
                  >
                    <Shield size={14} className="mr-1" /> กำหนดสิทธิ์
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Role Modal with Multi-select Chips */}
      {isRoleModalOpen && roleUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                กำหนดบทบาทและสิทธิ์
              </h3>
              <p className="text-xs text-gray-500 mt-1">{roleUser.DisplayName || roleUser.Name}</p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  เลือกสิทธิ์ที่ต้องการมอบหมาย (เลือกได้หลายสิทธิ์)
                </label>
                <div className="grid grid-cols-1 gap-2.5">
                  {/* ADMIN CHIP */}
                  <button
                    type="button"
                    onClick={() => toggleRole('admin')}
                    className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-all text-left ${
                      selectedRoles.includes('admin')
                        ? 'border-purple-500 bg-purple-50/70 text-purple-900 shadow-sm'
                        : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-xl">👑</span>
                      <div>
                        <p className="font-bold text-sm">ADMIN</p>
                        <p className="text-xs text-gray-500">ผู้ดูแลระบบ สามารถจัดการหลังบ้านได้ทั้งหมด</p>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                      selectedRoles.includes('admin') ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-300'
                    }`}>
                      {selectedRoles.includes('admin') && <Check size={12} strokeWidth={3} />}
                    </div>
                  </button>

                  {/* STAFF CHIP */}
                  <button
                    type="button"
                    onClick={() => toggleRole('staff')}
                    className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-all text-left ${
                      selectedRoles.includes('staff')
                        ? 'border-blue-500 bg-blue-50/70 text-blue-900 shadow-sm'
                        : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-xl">💼</span>
                      <div>
                        <p className="font-bold text-sm">STAFF</p>
                        <p className="text-xs text-gray-500">พนักงาน สามารถตอกบัตร ลางาน และแสดงบนจอ IoT</p>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                      selectedRoles.includes('staff') ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'
                    }`}>
                      {selectedRoles.includes('staff') && <Check size={12} strokeWidth={3} />}
                    </div>
                  </button>

                  {/* CUSTOMER CHIP */}
                  <button
                    type="button"
                    onClick={() => toggleRole('customer')}
                    className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-all text-left ${
                      selectedRoles.includes('customer')
                        ? 'border-slate-500 bg-slate-50 text-slate-900 shadow-sm'
                        : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-xl">👤</span>
                      <div>
                        <p className="font-bold text-sm">CUSTOMER</p>
                        <p className="text-xs text-gray-500">ผู้ใช้งานทั่วไป / ลูกค้า</p>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                      selectedRoles.includes('customer') ? 'bg-slate-700 border-slate-700 text-white' : 'border-gray-300'
                    }`}>
                      {selectedRoles.includes('customer') && <Check size={12} strokeWidth={3} />}
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsRoleModalOpen(false)}
                disabled={savingRoles}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium rounded-xl hover:bg-gray-100 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={saveRoles}
                disabled={savingRoles}
                className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow transition-colors disabled:opacity-50"
              >
                {savingRoles ? 'กำลังบันทึก...' : 'บันทึกสิทธิ์'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Leave Quotas Modal */}
      {isQuotaModalOpen && quotaUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-gray-800">โควตาวันลาพนักงาน</h3>
                <p className="text-sm text-gray-500 mt-0.5">{quotaUser.DisplayName || quotaUser.Name}</p>
              </div>
              <div>
                <select 
                  value={quotaYear}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                  className="text-sm font-bold border border-gray-300 rounded-lg p-1.5 bg-gray-50 text-gray-700 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={2025}>ปี 2025</option>
                  <option value={2026}>ปี 2026</option>
                  <option value={2027}>ปี 2027</option>
                </select>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              {['ลาป่วย', 'ลากิจ', 'ลาพักร้อน'].map((type) => {
                const used = usedDaysMap[type] || 0;
                const total = userQuotas[type] !== undefined ? userQuotas[type] : 0;
                const remaining = total - used;

                return (
                  <div key={type} className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-gray-800 text-sm">{type}</span>
                      <span className="text-xs text-gray-500">
                        ใช้ไปแล้ว: <strong className="text-gray-700">{used}</strong> วัน (เหลือ <strong className={remaining > 0 ? 'text-green-600' : 'text-red-500'}>{remaining}</strong> วัน)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="number"
                        min="0"
                        value={userQuotas[type] !== undefined ? userQuotas[type] : ''}
                        onChange={(e) => setUserQuotas({ ...userQuotas, [type]: Number(e.target.value) })}
                        className="w-full text-base font-bold border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-blue-500 focus:border-blue-500"
                      />
                      <span className="text-sm text-gray-500 whitespace-nowrap">วัน/ปี</span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
              <button 
                onClick={() => setIsQuotaModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button 
                onClick={saveUserQuotas}
                disabled={savingQuota}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingQuota ? 'กำลังบันทึก...' : 'บันทึกโควตา'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
