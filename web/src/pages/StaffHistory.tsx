import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Calendar, Clock, ChevronLeft, ChevronRight, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface AttendanceRecord {
  id: number;
  work_date: string;
  check_in_time?: string;
  check_out_time?: string;
  work_duration_min: number;
}

interface LeaveRecord {
  id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
}

interface HistoryData {
  month: string;
  total_work_days: number;
  total_work_hours: number;
  records: AttendanceRecord[];
  leave_records: LeaveRecord[];
}

export default function StaffHistory() {
  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async (monthStr: string) => {
    try {
      setLoading(true);
      const res = await api.get(`/user/attendance/history?month=${monthStr}`);
      setData(res.data);
    } catch (err) {
      console.error('Fetch history failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(currentMonth);
  }, [currentMonth]);

  const changeMonth = (offset: number) => {
    const [y, m] = currentMonth.split('-').map(Number);
    const date = new Date(y, m - 1 + offset, 1);
    const newMonthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setCurrentMonth(newMonthStr);
  };

  const formatMonthTitle = (monthStr: string) => {
    const [y, m] = monthStr.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '-';
    return new Date(timeStr).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };

  const formatHoursMinutes = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} นาที`;
    if (m === 0) return `${h} ชม.`;
    return `${h} ชม. ${m} นาที`;
  };

  return (
    <div className="p-4 space-y-4">
      {/* Month Navigator Header */}
      <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
        <button
          onClick={() => changeMonth(-1)}
          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-gray-800 text-sm md:text-base">{formatMonthTitle(currentMonth)}</h2>
        </div>
        <button
          onClick={() => changeMonth(1)}
          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-center">
          <p className="text-xs text-gray-500 font-medium">วันทำงาน (เดือนนี้)</p>
          <p className="text-2xl font-black text-gray-800 mt-1">
            {data?.total_work_days ?? 0} <span className="text-xs font-normal text-gray-500">วัน</span>
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-center">
          <p className="text-xs text-gray-500 font-medium">ชั่วโมงทำงานรวม</p>
          <p className="text-2xl font-black text-blue-600 mt-1">
            {(data?.total_work_hours ?? 0).toFixed(1)} <span className="text-xs font-normal text-gray-500">ชม.</span>
          </p>
        </div>
      </div>

      {/* Records List */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">รายการบันทึกเวลา</h3>

        {loading ? (
          <div className="p-8 text-center text-gray-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500" />
            <p className="text-xs">กำลังโหลดประวัติ...</p>
          </div>
        ) : !data || (data.records.length === 0 && data.leave_records.length === 0) ? (
          <div className="p-8 bg-white rounded-2xl text-center border border-gray-100 text-gray-400 space-y-2">
            <Clock className="w-8 h-8 mx-auto text-gray-300" />
            <p className="text-sm font-medium">ไม่มีประวัติการทำงานในเดือนนี้</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Attendance Records */}
            {data.records.map((rec) => {
              const dateObj = new Date(rec.work_date);
              const dayName = dateObj.toLocaleDateString('th-TH', { weekday: 'short' });
              const dayNumber = dateObj.getDate();
              const hasCheckedOut = !!rec.check_out_time;

              return (
                <div
                  key={rec.id}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex flex-col items-center justify-center font-bold">
                      <span className="text-[10px] font-medium leading-none text-blue-400">{dayName}</span>
                      <span className="text-lg leading-tight">{dayNumber}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        {hasCheckedOut ? (
                          <span className="text-[11px] font-bold px-2 py-0.5 bg-green-50 text-green-700 rounded-md border border-green-200">
                            ปกติ
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md border border-amber-200 flex items-center space-x-1">
                            <AlertCircle className="w-3 h-3 text-amber-500" />
                            <span>ลืมเช็คเอาท์</span>
                          </span>
                        )}
                        {hasCheckedOut && (
                          <span className="text-xs text-gray-500 font-medium">
                            {formatHoursMinutes(rec.work_duration_min)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center text-xs text-gray-700 space-x-2">
                        <span className="flex items-center text-green-600 font-medium">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {formatTime(rec.check_in_time)}
                        </span>
                        <span className="text-gray-300">-</span>
                        <span className={`font-medium ${hasCheckedOut ? 'text-red-500' : 'text-gray-400'}`}>
                          {hasCheckedOut ? formatTime(rec.check_out_time) : 'ไม่ได้บันทึก'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Leave Records for this month */}
            {data.leave_records.map((leave) => (
              <div
                key={`leave-${leave.id}`}
                className="bg-amber-50/50 p-4 rounded-2xl shadow-sm border border-amber-200 flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex flex-col items-center justify-center font-bold">
                    <span className="text-[10px] font-medium leading-none">ลา</span>
                    <span className="text-xs mt-0.5 font-semibold">{leave.leave_type}</span>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-amber-900">
                      {leave.leave_type} (อนุมัติแล้ว)
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {leave.start_date} ถึง {leave.end_date}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
