import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Settings as SettingsIcon, Save, RefreshCw, Power } from 'lucide-react';

interface QuotaItem {
  leave_type: string;
  total_days: number;
}

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [savingQuotas, setSavingQuotas] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Global Quotas State
  const [quotas, setQuotas] = useState<{ [key: string]: number }>({
    'ลาป่วย': 30,
    'ลากิจ': 3,
    'ลาพักร้อน': 6,
  });

  // Sync State
  const [syncYear, setSyncYear] = useState<number>(new Date().getFullYear());
  const [overwrite, setOverwrite] = useState<boolean>(false);

  // System status
  const [systemOpen, setSystemOpen] = useState(true);
  const [togglingSystem, setTogglingSystem] = useState(false);

  const fetchSettings = async () => {
    try {
      // Fetch default quotas
      const qRes = await api.get('/admin/settings/leave-quotas');
      if (qRes.data && Array.isArray(qRes.data)) {
        const qMap: { [key: string]: number } = {};
        qRes.data.forEach((item: QuotaItem) => {
          qMap[item.leave_type] = item.total_days;
        });
        setQuotas(qMap);
      }

      // Fetch system status
      const sRes = await api.get('/admin/system');
      if (sRes.data) {
        setSystemOpen(sRes.data.system_open);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveDefaultQuotas = async () => {
    setSavingQuotas(true);
    try {
      const payload: QuotaItem[] = Object.entries(quotas).map(([type, days]) => ({
        leave_type: type,
        total_days: Number(days) || 0
      }));

      await api.put('/admin/settings/leave-quotas/update', payload);
      alert('บันทึกโควตาเริ่มต้นของระบบสำเร็จ');
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกโควตาเริ่มต้น');
    } finally {
      setSavingQuotas(false);
    }
  };

  const handleSyncQuotas = async () => {
    if (!confirm(`คุณต้องการดึงโควตาเริ่มต้นไปสร้างให้พนักงานทุกคนประจำปี ${syncYear} ใช่หรือไม่?`)) {
      return;
    }

    setSyncing(true);
    try {
      const res = await api.post('/admin/settings/leave-quotas/sync', {
        year: syncYear,
        overwrite_existing: overwrite
      });

      alert(`ดึงโควตาสำเร็จ! ดำเนินการอัปเดตไปทั้งหมด ${res.data.synced_count} รายการ`);
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการดึงโควตาประจำปี');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleSystem = async () => {
    setTogglingSystem(true);
    try {
      const nextStatus = !systemOpen;
      await api.put('/admin/system/toggle', { system_open: nextStatus });
      setSystemOpen(nextStatus);
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะระบบ');
    } finally {
      setTogglingSystem(false);
    }
  };

  if (loading) {
    return <div className="text-center p-10 text-gray-500">กำลังโหลดการตั้งค่า...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-800 flex items-center">
          <SettingsIcon className="mr-2 text-blue-600" size={26} /> ตั้งค่าระบบ
        </h2>
        <p className="text-gray-500">จัดการโควตาวันลาเริ่มต้นของร้าน และการทำงานของระบบ</p>
      </div>

      {/* Default Quotas Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        <div className="border-b border-gray-100 pb-4">
          <h3 className="text-lg font-bold text-gray-800">1. โควตาวันลามาตรฐานของร้าน (Default Quotas)</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            ค่าเริ่มต้นนี้จะถูกนำไปใช้เป็นแม่แบบ (Template) ให้กับพนักงานทุกคนในร้าน
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['ลาป่วย', 'ลากิจ', 'ลาพักร้อน'].map((type) => (
            <div key={type} className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <label className="block text-sm font-bold text-gray-700 mb-2">{type}</label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="0"
                  value={quotas[type] !== undefined ? quotas[type] : ''}
                  onChange={(e) => setQuotas({ ...quotas, [type]: Number(e.target.value) })}
                  className="w-full text-lg font-bold border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-500 whitespace-nowrap">วัน/ปี</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSaveDefaultQuotas}
            disabled={savingQuotas}
            className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm"
          >
            <Save size={18} />
            <span>{savingQuotas ? 'กำลังบันทึก...' : 'บันทึกโควตาเริ่มต้น'}</span>
          </button>
        </div>
      </div>

      {/* Sync Annual Quota Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        <div className="border-b border-gray-100 pb-4">
          <h3 className="text-lg font-bold text-gray-800">2. ดึงโควตาประจำปีให้พนักงานทุกคน (Annual Quota Sync)</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            เมื่อขึ้นปีใหม่ สามารถกดปุ่มนี้เพื่อคัดลอกโควตามาตรฐานด้านบน ไปแจกจ่ายให้พนักงาน (Staff) ทุกคนพร้อมกันได้ทันที
          </p>
        </div>

        <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-6">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">เลือกปีที่ต้องการแจกจ่าย:</label>
              <select
                value={syncYear}
                onChange={(e) => setSyncYear(Number(e.target.value))}
                className="text-sm font-bold border border-gray-300 rounded-lg p-2 bg-white text-gray-800 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={2025}>ปี 2025</option>
                <option value={2026}>ปี 2026</option>
                <option value={2027}>ปี 2027</option>
                <option value={2028}>ปี 2028</option>
              </select>
            </div>

            <div className="flex items-center pt-4 sm:pt-0">
              <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span>เขียนทับโควตาเดิม (หากพนักงานมีโควตาของปีนี้อยู่แล้ว)</span>
              </label>
            </div>
          </div>

          <p className="text-xs text-amber-700">
            *หากไม่ติ๊ก "เขียนทับโควตาเดิม" ระบบจะสร้างโควตาเฉพาะพนักงานใหม่ที่ยังไม่มีข้อมูลในปีนั้นเท่านั้น จะไม่กระทบคนที่เคยตั้งค่าพิเศษไว้
          </p>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSyncQuotas}
            disabled={syncing}
            className="flex items-center space-x-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? 'กำลังดึงข้อมูล...' : `ดึงโควตาเริ่มต้นให้พนักงานประจำปี ${syncYear}`}</span>
          </button>
        </div>
      </div>

      {/* System Status Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-gray-800">3. สถานะเปิด/ปิดร้าน</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            เมื่อปิดระบบ พนักงานจะไม่สามารถเช็คอินหรือเข้าใช้งานระบบบางส่วนได้
          </p>
        </div>
        <button
          onClick={handleToggleSystem}
          disabled={togglingSystem}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold transition-colors ${
            systemOpen
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
          }`}
        >
          <Power size={18} />
          <span>{systemOpen ? 'ระบบเปิดใช้งาน (Open)' : 'ระบบปิดอยู่ (Closed)'}</span>
        </button>
      </div>
    </div>
  );
}
