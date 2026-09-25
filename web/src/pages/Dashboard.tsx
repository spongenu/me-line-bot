import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardData {
  totalUsers: number;
  pendingLeaves: number;
  forgotCheckout: number;
  chartData: { date: string; hours: number }[];
  systemOpen: boolean;
  lineQuota: number;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>({
    totalUsers: 0,
    pendingLeaves: 0,
    forgotCheckout: 0,
    chartData: [],
    systemOpen: true,
    lineQuota: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const [usersRes, leavesRes, attendancesRes, systemRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/leave-requests'),
        api.get('/admin/attendances'),
        api.get('/admin/system').catch(() => ({ data: { system_open: true, line_quota: 0 } }))
      ]);

      const users = usersRes.data || [];
      const leaves = leavesRes.data || [];
      const attendances = attendancesRes.data || [];
      const system = systemRes.data || { system_open: true, line_quota: 0 };

      const totalUsers = users.filter((u: any) => {
        const roles = u.UserRoles && u.UserRoles.length > 0 ? u.UserRoles.map((ur: any) => ur.Role.Name) : ['customer'];
        return roles.includes('staff');
      }).length;
      const pendingLeaves = leaves.filter((l: any) => l.Status === 'pending').length;
      
      const currentMonth = new Date().toISOString().slice(0, 7);
      const forgotCheckout = attendances.filter((a: any) => 
          !a.CheckOutTime && a.WorkDate && a.WorkDate.startsWith(currentMonth)
      ).length;

      const last7Days = Array.from({length: 7}, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().split('T')[0];
      });

      const chartData = last7Days.map(dateStr => {
        const dayAttendances = attendances.filter((a: any) => a.WorkDate === dateStr);
        const totalMinutes = dayAttendances.reduce((sum: number, a: any) => sum + (a.WorkDurationMin || 0), 0);
        const d = new Date(dateStr);
        const displayDate = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        
        return {
          date: displayDate,
          hours: Number((totalMinutes / 60).toFixed(1))
        };
      });

      setData({
        totalUsers,
        pendingLeaves,
        forgotCheckout,
        chartData,
        systemOpen: system.system_open,
        lineQuota: system.line_quota
      });

    } catch (error) {
      console.error("Error fetching dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const toggleSystem = async () => {
    try {
      const newState = !data.systemOpen;
      await api.put('/admin/system/toggle', { system_open: newState });
      setData(prev => ({ ...prev, systemOpen: newState }));
      alert(newState ? 'เปิดระบบรับเช็คอินแล้ว' : 'ปิดระบบชั่วคราวแล้ว');
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะระบบ');
    }
  };

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500 flex items-center space-x-2">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span>กำลังโหลดแผงควบคุม...</span>
        </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
          <p className="text-gray-500">ภาพรวมการทำงานของพนักงาน</p>
        </div>

        <div className="flex space-x-4 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center space-x-2 border-r pr-4">
            <span className="text-sm text-gray-500 font-medium">โควต้าแชทฟรี:</span>
            <span className="text-sm font-bold text-gray-800 bg-gray-100 px-2 py-1 rounded">{data.lineQuota} / 200</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500 font-medium">สถานะรับเช็คอิน:</span>
            <button 
              onClick={toggleSystem}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${data.systemOpen ? 'bg-green-500' : 'bg-red-500'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${data.systemOpen ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className={`text-sm font-bold ${data.systemOpen ? 'text-green-600' : 'text-red-500'}`}>
              {data.systemOpen ? 'เปิด' : 'ปิด'}
            </span>
          </div>
        </div>
      </div>

      {/* สรุปตัวเลข */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <h3 className="text-gray-500 text-sm font-medium">พนักงานทั้งหมด</h3>
          <div className="flex items-end space-x-2 mt-2">
              <p className="text-4xl font-black text-gray-800">{data.totalUsers}</p>
              <p className="text-gray-500 mb-1 font-medium">คน</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <h3 className="text-gray-500 text-sm font-medium">รออนุมัติวันลา</h3>
          <div className="flex items-end space-x-2 mt-2">
              <p className="text-4xl font-black text-yellow-500">{data.pendingLeaves}</p>
              <p className="text-gray-500 mb-1 font-medium">รายการ</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <h3 className="text-gray-500 text-sm font-medium">ลืมเช็คเอาท์ (เดือนนี้)</h3>
          <div className="flex items-end space-x-2 mt-2">
              <p className="text-4xl font-black text-red-500">{data.forgotCheckout}</p>
              <p className="text-gray-500 mb-1 font-medium">ครั้ง</p>
          </div>
        </div>
      </div>
      
      {/* กราฟ */}
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 mt-6">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-800">ตารางชั่วโมงทำงานรวม</h3>
            <p className="text-sm text-gray-500">สรุปเวลาทำงานของพนักงานทุกคนย้อนหลัง 7 วัน</p>
          </div>
          
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 500 }} 
                    dy={10} 
                />
                <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                    dx={-10} 
                />
                <Tooltip 
                  cursor={{ fill: '#F3F4F6' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', padding: '12px' }}
                  labelStyle={{ fontWeight: 'bold', color: '#374151', marginBottom: '4px' }}
                  formatter={(value: any) => [`${value} ชม.`, 'ชั่วโมงทำงาน']}
                />
                <Bar 
                    dataKey="hours" 
                    name="ชั่วโมงทำงาน" 
                    fill="#3B82F6" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={60}
                    animationDuration={1500}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
      </div>
    </div>
  );
}
