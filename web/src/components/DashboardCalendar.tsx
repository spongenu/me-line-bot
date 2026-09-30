import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  }, [monthStr]);

  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay(); // 0 = Sunday

  const days = [];
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

  return (
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 mt-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">ปฏิทินการทำงาน</h3>
          <p className="text-sm text-gray-500">ภาพรวมการขาดงานและการลางาน</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            <ChevronLeft size={20} />
          </button>
          <div className="font-bold text-gray-800 w-32 text-center">
            {currentDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
          </div>
          <button onClick={nextMonth} className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Days Header */}
            <div className="grid grid-cols-7 bg-gray-50 border-t border-l border-r border-gray-200 rounded-t-lg">
              {['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'].map((d, i) => (
                <div key={d} className={`py-3 text-center text-sm font-semibold border-r border-gray-200 last:border-r-0 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'}`}>
                  {d}
                </div>
              ))}
            </div>
            
            {/* Calendar Grid */}
            <div className="grid grid-cols-7 border-l border-gray-200 rounded-b-lg overflow-hidden">
              {days.map((day, i) => {
                if (day === null) {
                  return <div key={`empty-${i}`} className="min-h-[120px] bg-gray-50 border-r border-b border-gray-200"></div>;
                }
                
                const dStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isToday = dStr === todayStr;
                const dayEvents = getDayEvents(day);

                return (
                  <div key={day} className={`min-h-[120px] p-2 border-r border-b border-gray-200 relative ${isToday ? 'bg-blue-50/10' : 'bg-white'}`}>
                    {isToday && <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>}
                    <div className="flex justify-between items-start mb-2">
                      <span className={`font-medium ${isToday ? 'text-blue-600 font-bold bg-blue-100 rounded-full w-7 h-7 flex items-center justify-center' : 'text-gray-700 pl-1'}`}>
                        {day}
                      </span>
                    </div>
                    
                    <div className="space-y-1.5">
                      {dayEvents.map((ev, idx) => (
                        <div 
                          key={`${ev.user_id}-${idx}`} 
                          className={`px-2 py-1 text-[11px] rounded flex flex-col gap-0.5 border ${
                            ev.type === 'absent' ? 'bg-red-50 text-red-700 border-red-100' : 
                            ev.leave_type === 'ลาป่วย' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                            ev.leave_type === 'ลากิจ' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                            'bg-green-50 text-green-700 border-green-100'
                          }`}
                        >
                          <span className="font-bold truncate">
                            {ev.type === 'absent' ? '❌' : ev.leave_type === 'ลาป่วย' ? '🤒' : ev.leave_type === 'ลากิจ' ? '💼' : '🏖'} {ev.user_name.split(' ')[0]}
                          </span>
                          <span className="opacity-80">
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
        </div>
      )}
    </div>
  );
}
