import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface User {
  DisplayName: string;
  Name: string;
}

interface LeaveReq {
  ID: number;
  User: User;
  LeaveType: string;
  StartDate: string;
  EndDate: string;
  Reason: string;
  Status: string;
}

export default function Leaves() {
  const [requests, setRequests] = useState<LeaveReq[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    try {
      const res = await api.get('/admin/leave-requests');
      setRequests(res.data || []);
    } catch (err) {
      console.error('Error fetching leave requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const updateStatus = async (id: number, status: string) => {
    if (confirm(`ยืนยันการ ${status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'} คำขอนี้?`)) {
      try {
        await api.put(`/admin/leave-requests/status?id=${id}`, { 
            status: status,
            approved_by: JSON.parse(localStorage.getItem('user') || '{}').id
        });
        fetchRequests();
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการอัปเดตสถานะ');
      }
    }
  };

  if (loading) return <div className="text-center p-10 text-gray-500">กำลังโหลดคำขอลางาน...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">อนุมัติวันลา</h2>
          <p className="text-gray-500">จัดการคำขอลางานของพนักงาน</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-4 font-semibold text-gray-600 text-sm">วันที่ขอลา</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">พนักงาน</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">ประเภท</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">เหตุผล</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">สถานะ</th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((req) => (
                <tr key={req.ID} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 text-sm text-gray-800">{req.StartDate} {req.EndDate !== req.StartDate ? `- ${req.EndDate}` : ''}</td>
                  <td className="p-4 text-sm font-bold text-gray-800">{req.User?.DisplayName || req.User?.Name}</td>
                  <td className="p-4 text-sm text-gray-600">{req.LeaveType}</td>
                  <td className="p-4 text-sm text-gray-600 max-w-xs truncate">{req.Reason || '-'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        req.Status === 'approved' ? 'bg-green-100 text-green-700' :
                        req.Status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                    }`}>
                      {req.Status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    {req.Status === 'pending' ? (
                      <>
                        <button onClick={() => updateStatus(req.ID, 'approved')} className="text-green-600 hover:text-green-800 text-sm font-medium bg-green-50 px-3 py-1.5 rounded-lg transition-colors">อนุมัติ</button>
                        <button onClick={() => updateStatus(req.ID, 'rejected')} className="text-red-600 hover:text-red-800 text-sm font-medium bg-red-50 px-3 py-1.5 rounded-lg transition-colors">ปฏิเสธ</button>
                      </>
                    ) : (
                      <span className="text-gray-400 text-sm">ทำรายการแล้ว</span>
                    )}
                  </td>
                </tr>
              ))}
              
              {requests.length === 0 && (
                 <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">ยังไม่มีคำขอลางาน</td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
