import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, UserX, CheckCircle } from 'lucide-react';

interface CalendarEvent {
  date: string;
  user_id: number;
  user_name: string;
  type: string; // 'absent' | 'leave'
  leave_type?: string;
}

export default function DashboardCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const fetchCalendar = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/dashboard/calendar?month=${monthStr}`);
      setEvents(res.data.events || []);
    } catch (err) {
      console.error('Failed to fetch calendar', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar();
    // Default selected day when switching month
    const today = new Date();
    if (today.getFullYear() === year && today.getMonth() + 1 === month) {
      setSelectedDay(today.getDate());
    } else {
      setSelectedDay(1);
    }
  }, [monthStr]);

  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay(); // 0 = Sunday

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const todayStr = new Date().toISOString().split('T')[0];

  const getDayEvents = (day: number) => {
    const dStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(e => e.date === dStr);
  };

  const selectedDateEvents = selectedDay ? getDayEvents(selectedDay) : [];
  const selectedDateFormatted = selectedDay 
    ? new Date(year, month - 1, selectedDay).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 mt-6">
      {/* Header & Month Navigator */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <CalendarIcon size={20} className="text-blue-600" />
            ปฏิทินการทำงานรายเดือน
          </h3>
          <p className="text-sm text-gray-500">ภาพรวมการขาดงานและการลางานของพนักงาน</p>
        </div>
        
        <div className="flex items-center gap-2 self-center sm:self-auto bg-gray-50 p-1.5 rounded-xl border border-gray-200">
          <button 
            onClick={prevMonth} 
            className="p-1.5 rounded-lg hover:bg-white hover:shadow-xs text-gray-600 transition-all"
            title="เดือนก่อนหน้า"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="font-bold text-gray-800 px-3 text-sm min-w-[120px] text-center">
            {currentDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
          </div>
          <button 
            onClick={nextMonth} 
            className="p-1.5 rounded-lg hover:bg-white hover:shadow-xs text-gray-600 transition-all"
            title="เดือนถัดไป"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <>
          {/* ══════════════════════════════════════════════════
              1. MOBILE VIEW (Dot indicator + Detail list)
             ══════════════════════════════════════════════════ */}
          <div className="block md:hidden">
            {/* Days Header */}
            <div className="grid grid-cols-7 text-center mb-2 text-xs font-bold text-gray-400">
              <div className="text-red-500">อา</div>
              <div>จ</div>
              <div>อ</div>
              <div>พ</div>
              <div>พฤ</div>
              <div>ศ</div>
              <div className="text-blue-500">ส</div>
            </div>

            {/* Mobile Calendar Grid */}
            <div className="grid grid-cols-7 gap-1.5 mb-5">
              {days.map((day, i) => {
                if (day === null) {
                  return <div key={`empty-m-${i}`} className="aspect-square" />;
                }

                const dStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isToday = dStr === todayStr;
                const isSelected = selectedDay === day;
                const dayEvents = getDayEvents(day);

                return (
                  <button
                    key={`m-${day}`}
                    onClick={() => setSelectedDay(day)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-200 scale-105'
                        : isToday
                        ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200'
                        : dayEvents.length > 0
                        ? 'bg-gray-50 text-gray-800 hover:bg-gray-100 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-sm">{day}</span>
                    
                    {/* Dots Indicator */}
                    {dayEvents.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {dayEvents.slice(0, 3).map((ev, idx) => (
                          <div
                            key={idx}
                            className={`w-1.5 h-1.5 rounded-full ${
                              isSelected
                                ? 'bg-white'
                                : ev.type === 'absent'
                                ? 'bg-red-500'
                                : ev.leave_type === 'ลาป่วย'
                                ? 'bg-blue-500'
                                : ev.leave_type === 'ลากิจ'
                                ? 'bg-orange-500'
                                : 'bg-green-500'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Date Detail List (Mobile) */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-gray-800">
                  รายการวันที่ {selectedDateFormatted}
                </h4>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  selectedDateEvents.length > 0 ? 'bg-gray-100 text-gray-700' : 'bg-green-50 text-green-600'
                }`}>
                  {selectedDateEvents.length} รายการ
                </span>
              </div>

              {selectedDateEvents.length === 0 ? (
                <div className="p-4 bg-gray-50 rounded-xl text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                  <CheckCircle size={16} className="text-green-500" />
                  <span>ไม่มีพนักงานลาหรือขาดงานในวันนี้</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {selectedDateEvents.map((ev, idx) => (
                    <div
                      key={`m-ev-${idx}`}
                      className={`p-3 rounded-xl border flex items-center justify-between ${
                        ev.type === 'absent'
                          ? 'bg-red-50/50 border-red-100'
                          : ev.leave_type === 'ลาป่วย'
                          ? 'bg-blue-50/50 border-blue-100'
                          : ev.leave_type === 'ลากิจ'
                          ? 'bg-orange-50/50 border-orange-100'
                          : 'bg-green-50/50 border-green-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base ${
                          ev.type === 'absent'
                            ? 'bg-red-100 text-red-600'
                            : ev.leave_type === 'ลาป่วย'
                            ? 'bg-blue-100 text-blue-600'
                            : ev.leave_type === 'ลากิจ'
                            ? 'bg-orange-100 text-orange-600'
                            : 'bg-green-100 text-green-600'
                        }`}>
                          {ev.type === 'absent' ? <UserX size={18} /> : ev.leave_type === 'ลาป่วย' ? '🤒' : ev.leave_type === 'ลากิจ' ? '💼' : '🏖'}
                        </div>
                        <div>
                          <p className="font-bold text-gray-800 text-sm">{ev.user_name}</p>
                          <p className={`text-xs font-semibold ${
                            ev.type === 'absent'
                              ? 'text-red-600'
                              : ev.leave_type === 'ลาป่วย'
                              ? 'text-blue-600'
                              : ev.leave_type === 'ลากิจ'
                              ? 'text-orange-600'
                              : 'text-green-600'
                          }`}>
                            {ev.type === 'absent' ? 'ขาดงาน' : ev.leave_type}
                          </p>
                        </div>
                      </div>

                      <span className={`text-[11px] px-2 py-1 rounded-full font-bold ${
                        ev.type === 'absent'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {ev.type === 'absent' ? 'ขาดงาน' : 'อนุมัติแล้ว'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════
              2. DESKTOP VIEW (Full Grid with badge cards)
             ══════════════════════════════════════════════════ */}
          <div className="hidden md:block">
            {/* Days Header */}
            <div className="grid grid-cols-7 bg-gray-50 border-t border-l border-r border-gray-200 rounded-t-xl text-center">
              {['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'].map((d, i) => (
                <div 
                  key={d} 
                  className={`py-3 text-sm font-bold border-r border-gray-200 last:border-r-0 ${
                    i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>
            
            {/* Calendar Grid */}
            <div className="grid grid-cols-7 border-l border-gray-200 rounded-b-xl overflow-hidden">
              {days.map((day, i) => {
                if (day === null) {
                  return <div key={`empty-d-${i}`} className="min-h-[120px] bg-gray-50/60 border-r border-b border-gray-200" />;
                }
                
                const dStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isToday = dStr === todayStr;
                const dayEvents = getDayEvents(day);

                return (
                  <div 
                    key={`d-${day}`} 
                    className={`min-h-[120px] p-2 border-r border-b border-gray-200 relative transition-colors ${
                      isToday ? 'bg-blue-50/20' : 'bg-white hover:bg-gray-50/40'
                    }`}
                  >
                    {isToday && <div className="absolute top-0 left-0 w-full h-1 bg-blue-500" />}
                    
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-sm font-medium ${
                        isToday 
                          ? 'text-white font-bold bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-xs' 
                          : 'text-gray-700 pl-1'
                      }`}>
                        {day}
                      </span>
                    </div>
                    
                    <div className="space-y-1.5">
                      {dayEvents.map((ev, idx) => (
                        <div 
                          key={`${ev.user_id}-${idx}`} 
                          className={`px-2 py-1 text-[11px] rounded-md flex flex-col gap-0.5 border shadow-2xs ${
                            ev.type === 'absent' ? 'bg-red-50 text-red-700 border-red-100' : 
                            ev.leave_type === 'ลาป่วย' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                            ev.leave_type === 'ลากิจ' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                            'bg-green-50 text-green-700 border-green-100'
                          }`}
                        >
                          <span className="font-bold truncate flex items-center gap-1">
                            <span>{ev.type === 'absent' ? '❌' : ev.leave_type === 'ลาป่วย' ? '🤒' : ev.leave_type === 'ลากิจ' ? '💼' : '🏖'}</span>
                            <span className="truncate">{ev.user_name.split(' ')[0]}</span>
                          </span>
                          <span className="text-[10px] opacity-80 pl-4">
                            {ev.type === 'absent' ? 'ขาดงาน' : ev.leave_type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
