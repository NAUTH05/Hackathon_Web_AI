import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

// ─── Backend proxy URL (same as next.config rewrites target) ───
const BACKEND_URL = (
  process.env.API_PROXY_TARGET || "http://localhost:5000"
).replace(/\/$/, "");

// ─── Tool declarations for Gemini Function Calling ───
const toolDeclarations: any[] = [
  {
    name: "get_my_shifts",
    description:
      "Lấy thông tin ca làm việc được phân công cho nhân viên hiện tại. Trả về danh sách ca kèm ngày trong tuần, giờ bắt đầu, giờ kết thúc.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: "get_attendance_today",
    description:
      "Lấy trạng thái chấm công ngày hôm nay của nhân viên hiện tại. Trả về thời gian check-in, check-out, trạng thái (đúng giờ/trễ), số phút trễ, giờ làm việc.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: "get_leave_requests",
    description:
      "Lấy danh sách đơn nghỉ phép gần đây của nhân viên hiện tại. Trả về loại nghỉ phép, ngày bắt đầu, ngày kết thúc, trạng thái duyệt.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: "get_overtime_requests",
    description:
      "Lấy danh sách các yêu cầu tăng ca (OT) gần đây của nhân viên hiện tại. Trả về ngày, giờ bắt đầu, giờ kết thúc, số giờ và trạng thái duyệt.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: "search_employees",
    description:
      "Tìm kiếm thông tin đồng nghiệp (tên, chức vụ, email, phòng ban). Trả về danh sách tối đa 5 người khớp với từ khóa tìm kiếm.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: "Tên hoặc mã nhân viên cần tìm",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_my_penalties",
    description:
      "Lấy danh sách các vi phạm hoặc cảnh báo gần đây của nhân viên hiện tại. Trả về lý do, hình thức (cảnh báo/trừ tiền), số tiền (nếu có) và trạng thái.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: "get_attendance_stats",
    description:
      "Lấy thống kê nhanh về tình hình đi làm (tổng số NV, số người đã check-in, đi muộn, chưa check-in) của hôm nay và tháng này. Tính năng này chủ yếu dành cho cấp Quản lý.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
];

// ─── Build the System Instruction dynamically with user context ───
function buildSystemInstruction(userContext?: UserContext): string {
  const now = new Date().toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const dayNames = [
    "Chủ nhật",
    "Thứ hai",
    "Thứ ba",
    "Thứ tư",
    "Thứ năm",
    "Thứ sáu",
    "Thứ bảy",
  ];
  const dayOfWeek =
    dayNames[
    new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      weekday: "short",
    }) === "Sun"
      ? 0
      : new Date(
        new Date().toLocaleDateString("en-CA", {
          timeZone: "Asia/Ho_Chi_Minh",
        })
      ).getDay()
    ];

  let userInfo = "";
  if (userContext) {
    userInfo = `
## THÔNG TIN NGƯỜI DÙNG HIỆN TẠI
- Tên: ${userContext.name}
- Vai trò: ${userContext.role === "admin" ? "Quản trị viên" : "Người dùng"}
- Cấp quyền: ${userContext.roleLevel} (1=Admin, 2=Giám đốc, 3=Trưởng phòng, 4=Tổ trưởng, 5=Nhân viên)
- Phòng ban: ${userContext.department || "Chưa xác định"}
- Mã nhân viên (employeeId): ${userContext.employeeId || "Không có"}

Hãy sử dụng tên người dùng để chào hỏi thân thiện khi phù hợp.`;
  }

  return `Bạn là "AquaFlow HRM System Assistant" — trợ lý thông minh của hệ thống quản lý nhân sự AquaFlow HRM System.

## VAI TRÒ CỦA BẠN
- Bạn có thể hướng dẫn người dùng cách thao tác các tính năng trên trang web.
- Bạn có thể tra cứu thông tin cá nhân của người dùng hiện tại (ca làm việc, trạng thái chấm công, đơn nghỉ phép) bằng cách sử dụng các công cụ (tools) được cung cấp.
- Bạn KHÔNG được phép can thiệp, thay đổi, ghi bất kỳ dữ liệu nào trong hệ thống.
- Bạn TUYỆT ĐỐI KHÔNG trả lời bất kỳ câu hỏi nào liên quan đến LƯƠNG, TIỀN LƯƠNG, hoặc thông tin tài chính. Nếu được hỏi, hãy từ chối lịch sự.
- Nếu người dùng hỏi câu hỏi ngoài phạm vi (lập trình, cuộc sống, kiến thức chung), hãy lịch sự từ chối.

## THỜI GIAN HIỆN TẠI
- Bây giờ là: ${now}
- Hôm nay là: ${dayOfWeek}
${userInfo}

## CÁCH SỬ DỤNG TOOLS
- Khi người dùng hỏi về ca làm việc, lịch làm việc → gọi tool \`get_my_shifts\`
- Khi người dùng hỏi về chấm công, check-in/out hôm nay → gọi tool \`get_attendance_today\`
- Khi người dùng hỏi về nghỉ phép, đơn từ → gọi tool \`get_leave_requests\`
- Khi người dùng hỏi về tăng ca, lịch OT → gọi tool \`get_overtime_requests\`
- Khi người dùng hỏi tìm kiếm thông tin đồng nghiệp, email, chức vụ → gọi tool \`search_employees\`
- Khi người dùng hỏi về vi phạm, cảnh báo, bị trừ tiền chuyên cần → gọi tool \`get_my_penalties\`
- Khi quản lý hỏi về tình hình đi làm hôm nay, thống kê nhân sự → gọi tool \`get_attendance_stats\`
- Nếu không liên quan đến dữ liệu cá nhân, trả lời trực tiếp mà không cần gọi tool.

## TÍNH NĂNG NHẮC NHỞ
- Khi người dùng yêu cầu nhắc nhở (ví dụ: "Nhắc tôi chấm công ra lúc 17:00"), hãy tạo một nhắc nhở.
- Để tạo nhắc nhở, hãy THÊM vào cuối câu trả lời một khối JSON ẩn theo định dạng sau (phải nằm trên 1 dòng riêng, bắt đầu bằng <!--REMINDER: và kết thúc bằng -->):
  <!--REMINDER:{"time":"HH:mm","message":"Nội dung nhắc nhở"}-->
- Ví dụ: <!--REMINDER:{"time":"17:00","message":"Đã đến giờ chấm công ra! 🔔"}-->
- LUÔN xác nhận với người dùng rằng bạn đã đặt nhắc nhở thành công.

## CÁC TÍNH NĂNG CỦA HỆ THỐNG

### 1. Dashboard (Trang chủ - "/")
- Hiển thị tổng quan nhanh: số nhân viên, số ca hôm nay, trạng thái chấm công.

### 2. Chấm công GPS ("/attendance")
- Nhân viên chấm công bằng vị trí GPS và nhận diện khuôn mặt.
- Nhấn nút "Chấm công vào" để bắt đầu và "Chấm công ra" để kết thúc ca.

### 3. Lịch sử chấm công ("/history")
- Xem lịch sử chi tiết các lần chấm công (chỉ dành cho Manager trở lên).

### 4. Bảng công tháng ("/timesheet")
- Xem bảng tổng hợp giờ công theo tháng (chỉ dành cho Manager trở lên).

### 5. Bảng công ngày ("/daily-timesheet")
- Xem chi tiết chấm công theo từng ngày cụ thể (chỉ dành cho Manager trở lên).

### 6. Quản lý nhân viên ("/employees")
- Thêm, sửa, xóa thông tin nhân viên (chỉ dành cho Manager trở lên).

### 7. Ca làm việc ("/shifts")
- Tạo và quản lý các ca làm việc (chỉ dành cho Manager trở lên).

### 8. Phòng ban ("/departments")
- Quản lý cơ cấu phòng ban (chỉ dành cho Director trở lên).

### 9. Lịch làm việc ("/my-schedule")
- Nhân viên xem lịch làm việc cá nhân theo tuần/tháng.

### 10. Bảng quản lý lương ("/salary")
- Xem và quản lý thông tin lương.

### 11. Tăng ca - OT ("/overtime")
- Đăng ký và quản lý tăng ca.

### 12. Vi phạm & Cảnh báo ("/penalties")
- Xem danh sách vi phạm (chỉ dành cho Manager trở lên).

### 13. Nghỉ phép & Ngày lễ ("/leave")
- Đăng ký nghỉ phép, xem ngày lễ.

### 14. Nhật ký hệ thống ("/logs")
- Xem log hoạt động hệ thống (chỉ dành cho Admin).

### 15. Báo cáo ("/reports")
- Xem báo cáo tổng hợp (chỉ dành cho Director trở lên).

### 16. Cài đặt GPS ("/settings")
- Cấu hình vị trí GPS cho phép chấm công, bán kính (chỉ dành cho Admin).

### 17. Trang cá nhân ("/profile")
- Xem và cập nhật thông tin cá nhân, ảnh đại diện.

## CÁC MỨC QUYỀN
- **Nhân viên** (Employee): Quyền cơ bản - chấm công, xem lịch, nghỉ phép.
- **Manager**: Quản lý nhân viên trong phòng ban, xem bảng công, lịch sử.
- **Director**: Quản lý phòng ban, xem báo cáo.
- **Admin**: Toàn quyền hệ thống, cấu hình GPS, xem logs.

## QUY TẮC PHẢN HỒI QUAN TRỌNG VỀ ĐIỀU HƯỚNG
- Khi người dùng hỏi cách thực hiện một tính năng cụ thể, bạn PHẢI cung cấp một đường dẫn Markdown: \`[Tên chức năng](/đường-dẫn)\`.
- Ví dụ: "Bạn có thể thực hiện [Chấm công GPS tại đây](/attendance)".

## QUY TẮC TRẢ LỜI CHUNG
- Trả lời bằng tiếng Việt.
- Sử dụng Markdown để format câu trả lời cho dễ đọc.
- Giữ câu trả lời ngắn gọn, rõ ràng, dễ hiểu.
- TUYỆT ĐỐI từ chối mọi yêu cầu thay đổi dữ liệu, can thiệp hệ thống, hoặc câu hỏi ngoài phạm vi.`;
}

// ─── Types ───
interface ChatMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

interface UserContext {
  employeeId?: string;
  name: string;
  role: string;
  roleLevel: number;
  department?: string;
  token?: string;
}

// ─── Tool execution helpers ───

async function callBackendAPI(
  path: string,
  token: string,
  query?: Record<string, string>
): Promise<unknown> {
  const url = new URL(`${BACKEND_URL}${path}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(
      `Backend API error: ${res.status} ${res.statusText}`,
      text.substring(0, 200)
    );
    return { error: `API error: ${res.status}` };
  }

  return res.json();
}

const DAY_NAMES: Record<number, string> = {
  0: "Chủ nhật",
  1: "Thứ hai",
  2: "Thứ ba",
  3: "Thứ tư",
  4: "Thứ năm",
  5: "Thứ sáu",
  6: "Thứ bảy",
};

async function executeGetMyShifts(ctx: UserContext): Promise<string> {
  if (!ctx.employeeId || !ctx.token) {
    return JSON.stringify({
      error: "Không có thông tin nhân viên để tra cứu ca làm việc.",
    });
  }

  try {
    const data = (await callBackendAPI(
      `/api/shift-assignments/employee/${ctx.employeeId}`,
      ctx.token
    )) as Array<{
      shiftName?: string;
      shiftStartTime?: string;
      shiftEndTime?: string;
      shiftColor?: string;
      dayOfWeek?: number;
      effectiveFrom?: string;
      effectiveTo?: string;
    }>;

    if (!Array.isArray(data) || data.length === 0) {
      return JSON.stringify({
        message: "Không tìm thấy ca làm việc nào được phân công.",
      });
    }

    // Return only safe, relevant fields
    const shifts = data.map((s) => ({
      tenCa: s.shiftName,
      gioBatDau: s.shiftStartTime,
      gioKetThuc: s.shiftEndTime,
      ngayTrongTuan: DAY_NAMES[s.dayOfWeek ?? -1] || `Ngày ${s.dayOfWeek}`,
      dayOfWeek: s.dayOfWeek,
      hieuLucTu: s.effectiveFrom,
      hieuLucDen: s.effectiveTo || "Không giới hạn",
    }));

    return JSON.stringify({ caLamViec: shifts });
  } catch (err) {
    console.error("executeGetMyShifts error:", err);
    return JSON.stringify({ error: "Không thể lấy thông tin ca làm việc." });
  }
}

async function executeGetAttendanceToday(ctx: UserContext): Promise<string> {
  if (!ctx.employeeId || !ctx.token) {
    return JSON.stringify({
      error: "Không có thông tin nhân viên để tra cứu chấm công.",
    });
  }

  try {
    const today = new Date()
      .toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const data = (await callBackendAPI(`/api/attendance`, ctx.token, {
      employeeId: ctx.employeeId,
      date: today,
    })) as {
      data?: Array<{
        checkInTime?: string;
        checkOutTime?: string;
        status?: string;
        lateMinutes?: number;
        earlyLeaveMinutes?: number;
        workingHours?: number;
        shiftName?: string;
      }>;
    };

    if (!data.data || data.data.length === 0) {
      return JSON.stringify({
        message: `Chưa có bản ghi chấm công nào cho ngày hôm nay (${today}).`,
        daCheckIn: false,
      });
    }

    const record = data.data[0];
    const statusMap: Record<string, string> = {
      "on-time": "Đúng giờ",
      late: "Đi trễ",
      "early-leave": "Về sớm",
      absent: "Vắng mặt",
      pending: "Chưa check-out",
    };

    return JSON.stringify({
      ngay: today,
      tenCa: record.shiftName || "Không rõ",
      gioCheckIn: record.checkInTime || "Chưa check-in",
      gioCheckOut: record.checkOutTime || "Chưa check-out",
      trangThai: statusMap[record.status || ""] || record.status,
      soPhutTre: record.lateMinutes || 0,
      soPhutVeSom: record.earlyLeaveMinutes || 0,
      soGioLamViec: record.workingHours || 0,
      daCheckIn: !!record.checkInTime,
      daCheckOut: !!record.checkOutTime,
    });
  } catch (err) {
    console.error("executeGetAttendanceToday error:", err);
    return JSON.stringify({
      error: "Không thể lấy thông tin chấm công hôm nay.",
    });
  }
}

async function executeGetLeaveRequests(ctx: UserContext): Promise<string> {
  if (!ctx.employeeId || !ctx.token) {
    return JSON.stringify({
      error: "Không có thông tin nhân viên để tra cứu nghỉ phép.",
    });
  }

  try {
    const data = (await callBackendAPI(`/api/leave`, ctx.token, {
      employeeId: ctx.employeeId,
      limit: "10",
    })) as {
      data?: Array<{
        startDate?: string;
        endDate?: string;
        type?: string;
        status?: string;
        reason?: string;
        createdAt?: string;
        hours?: number;
      }>;
    };

    if (!data.data || data.data.length === 0) {
      return JSON.stringify({
        message: "Không có đơn nghỉ phép nào gần đây.",
      });
    }

    const typeMap: Record<string, string> = {
      annual: "Phép năm",
      sick: "Nghỉ ốm",
      personal: "Việc riêng",
      maternity: "Thai sản",
      unpaid: "Không lương",
      hourly: "Nghỉ giờ",
    };

    const statusMap: Record<string, string> = {
      pending: "Đang chờ duyệt",
      approved: "Đã duyệt",
      rejected: "Bị từ chối",
    };

    const leaves = data.data.map((l) => ({
      loai: typeMap[l.type || ""] || l.type,
      tuNgay: l.startDate,
      denNgay: l.endDate,
      trangThai: statusMap[l.status || ""] || l.status,
      lyDo: l.reason || "Không ghi",
      soGio: l.type === "hourly" ? l.hours : undefined,
    }));

    // Count stats
    const pending = data.data.filter((l) => l.status === "pending").length;
    const approved = data.data.filter((l) => l.status === "approved").length;

    return JSON.stringify({
      danhSach: leaves,
      thongKe: {
        tongDon: leaves.length,
        dangChoDuyet: pending,
        daDuyet: approved,
      },
    });
  } catch (err) {
    console.error("executeGetLeaveRequests error:", err);
    return JSON.stringify({
      error: "Không thể lấy thông tin nghỉ phép.",
    });
  }
}

async function executeGetOvertimeRequests(ctx: UserContext): Promise<string> {
  if (!ctx.employeeId || !ctx.token) {
    return JSON.stringify({
      error: "Không có thông tin nhân viên để tra cứu tăng ca.",
    });
  }

  try {
    const data = (await callBackendAPI(`/api/overtime`, ctx.token, {
      employeeId: ctx.employeeId,
      limit: "10",
    })) as {
      data?: Array<{
        date?: string;
        startTime?: string;
        endTime?: string;
        hours?: number;
        multiplier?: number;
        reason?: string;
        status?: string;
        createdAt?: string;
      }>;
    };

    if (!data.data || data.data.length === 0) {
      return JSON.stringify({
        message: "Không có yêu cầu tăng ca nào gần đây.",
      });
    }

    const statusMap: Record<string, string> = {
      pending: "Đang chờ duyệt",
      approved: "Đã duyệt",
      rejected: "Bị từ chối",
      "auto-rejected": "Hệ thống từ chối (quá hạn)",
    };

    const overtimes = data.data.map((ot) => ({
      ngay: ot.date,
      gioBatDau: ot.startTime,
      gioKetThuc: ot.endTime,
      soGio: ot.hours,
      heSo: ot.multiplier,
      lyDo: ot.reason || "Không ghi",
      trangThai: statusMap[ot.status || ""] || ot.status,
    }));

    return JSON.stringify({ danhSachTangCa: overtimes });
  } catch (err) {
    console.error("executeGetOvertimeRequests error:", err);
    return JSON.stringify({ error: "Không thể lấy thông tin tăng ca." });
  }
}

async function executeSearchEmployees(
  ctx: UserContext,
  args: { query: string }
): Promise<string> {
  if (!ctx.token) {
    return JSON.stringify({ error: "Yêu cầu xác thực để tìm kiếm nhân viên." });
  }

  try {
    const data = (await callBackendAPI(`/api/employees`, ctx.token, {
      search: args.query,
      limit: "5",
      isActive: "true",
    })) as {
      data?: Array<{
        name?: string;
        position?: string;
        department?: string;
        email?: string;
        phone?: string;
        employeeCode?: string;
      }>;
    };

    if (!data.data || data.data.length === 0) {
      return JSON.stringify({ message: `Không tìm thấy nhân viên nào khớp với "${args.query}".` });
    }

    const results = data.data.map((e) => ({
      ten: e.name,
      maNV: e.employeeCode,
      chucVu: e.position,
      phongBan: e.department,
      email: e.email,
      phone: e.phone,
    }));

    return JSON.stringify({ ketQuaTimKiem: results });
  } catch (err) {
    console.error("executeSearchEmployees error:", err);
    return JSON.stringify({ error: "Lỗi khi tìm kiếm nhân viên." });
  }
}

async function executeGetMyPenalties(ctx: UserContext): Promise<string> {
  if (!ctx.employeeId || !ctx.token) {
    return JSON.stringify({ error: "Không có thông tin nhân viên để tra cứu vi phạm." });
  }

  try {
    const data = (await callBackendAPI(`/api/penalties`, ctx.token, {
      employeeId: ctx.employeeId,
      limit: "10",
    })) as {
      data?: Array<{
        date?: string;
        type?: string;
        reason?: string;
        amount?: number;
        status?: string;
        description?: string;
      }>;
    };

    if (!data.data || data.data.length === 0) {
      return JSON.stringify({ message: "Chúc mừng! Bạn không có vi phạm nào gần đây." });
    }

    const typeMap: Record<string, string> = {
      warning: "Cảnh báo",
      deduction: "Trừ lương",
      attendance_deduction: "Trừ chuyên cần",
    };

    const statusMap: Record<string, string> = {
      active: "Đang hiệu lực",
      appealed: "Đang khiếu nại",
      resolved: "Đã xử lý",
    };

    const penalties = data.data.map((p) => ({
      ngay: p.date,
      loai: typeMap[p.type || ""] || p.type,
      lyDo: p.reason,
      soTien: p.amount || 0,
      trangThai: statusMap[p.status || ""] || p.status,
      chiTiet: p.description,
    }));

    return JSON.stringify({ danhSachViPham: penalties });
  } catch (err) {
    console.error("executeGetMyPenalties error:", err);
    return JSON.stringify({ error: "Không thể lấy thông tin vi phạm." });
  }
}

async function executeGetAttendanceStats(ctx: UserContext): Promise<string> {
  if (!ctx.token) {
    return JSON.stringify({ error: "Yêu cầu xác thực để lấy thống kê." });
  }

  // Security: only managers (level <= 4) or admin can see stats
  if (ctx.role !== "admin" && (ctx.roleLevel || 5) > 4) {
    return JSON.stringify({ error: "Tính năng này chỉ dành cho cấp Quản lý." });
  }

  try {
    const stats = await callBackendAPI(`/api/attendance/stats`, ctx.token) as any;

    return JSON.stringify({
      homNay: {
        tongNhanVien: stats.today.totalEmployees,
        daCheckIn: stats.today.checkedIn,
        diMuon: stats.today.late,
        dungGio: stats.today.onTime,
        chuaCheckIn: stats.today.notCheckedIn,
      },
      thangNay: {
        soNgayCoMat: stats.month.presentEmployees,
        tongSoLuotMuon: stats.month.totalLate,
        tongSoLuotVang: stats.month.totalAbsent,
      },
      donDangCho: {
        tangCa: stats.pendingRequests.overtime,
        nghiPhep: stats.pendingRequests.leave,
      }
    });
  } catch (err) {
    console.error("executeGetAttendanceStats error:", err);
    return JSON.stringify({ error: "Không thể lấy thống kê chuyên cần." });
  }
}

// ─── Execute a tool by name ───
async function executeTool(
  name: string,
  ctx: UserContext,
  args: any
): Promise<string> {
  switch (name) {
    case "get_my_shifts":
      return executeGetMyShifts(ctx);
    case "get_attendance_today":
      return executeGetAttendanceToday(ctx);
    case "get_leave_requests":
      return executeGetLeaveRequests(ctx);
    case "get_overtime_requests":
      return executeGetOvertimeRequests(ctx);
    case "search_employees":
      return executeSearchEmployees(ctx, args);
    case "get_my_penalties":
      return executeGetMyPenalties(ctx);
    case "get_attendance_stats":
      return executeGetAttendanceStats(ctx);
    default:
      return JSON.stringify({ error: `Công cụ "${name}" không tồn tại.` });
  }
}

// ─── Retry helper ───
export async function callGeminiWithRetry(
  fn: () => Promise<unknown>,
  retries = 3
) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    if (err instanceof Error && err.message.includes("503")) {
      await new Promise((res) => setTimeout(res, 1000));
      return callGeminiWithRetry(fn, retries - 1);
    }
    throw err;
  }
}

// ─── Hàm gọi DeepSeek Fallback ───
async function callDeepseekFallback(
  message: string,
  history: ChatMessage[],
  userContext?: UserContext
) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini đang gặp lỗi và DEEPSEEK_API_KEY chưa được cấu hình.");
  }

  // 1. Chuyển đổi toolDeclarations của hệ thống (Gemini) sang format OpenAI/DeepSeek
  const deepseekTools = toolDeclarations.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: t.parameters?.properties || {},
        ...(t.parameters?.required ? { required: t.parameters.required } : {})
      },
    },
  }));

  // 2. Chuyển đổi History
  const dsMessages: any[] = [
    { role: "system", content: buildSystemInstruction(userContext) },
    ...(history || []).map((h) => ({
      role: h.role === "model" ? "assistant" : "user",
      content: h.parts.map((p) => p.text).join("\n"),
    })),
    { role: "user", content: message },
  ];

  // 3. Vòng lặp Function Calling của DeepSeek
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat", // Bạn có thể dùng deepseek-reasoner nếu cần
        messages: dsMessages,
        tools: deepseekTools,
      }),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`DeepSeek API error: ${res.status} - ${errorText}`);
    }

    const data = await res.json();
    const assistantMsg = data.choices[0].message;
    
    // Thêm tin nhắn của AI vào lịch sử để tiếp tục gửi tool result hoặc làm context
    dsMessages.push(assistantMsg);

    // Nếu không có tool_calls, nghĩa là DeepSeek đã ra kết quả văn bản cuối cùng
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      return assistantMsg.content;
    }

    // Thực thi các tool mà DeepSeek yều cầu
    for (const call of assistantMsg.tool_calls) {
      console.log(`[DeepSeek Fallback] Tool called: ${call.function.name}`);
      const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      
      const toolResult = await executeTool(
        call.function.name,
        userContext || { name: "Người dùng", role: "user", roleLevel: 5 },
        args
      );

      // Nhét kết quả tool vào dsMessages để lần gọi tiếp theo DeepSeek đọc được
      dsMessages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: toolResult,
      });
    }

    iterations++;
  }

  throw new Error("Quá số lần lặp Tool Calling trong DeepSeek.");
}

// ─── Main POST handler ───
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history, userContext } = body as {
      message: string;
      history?: ChatMessage[];
      userContext?: UserContext;
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Tin nhắn không hợp lệ" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
      return NextResponse.json(
        { error: "GEMINI_API_KEY chưa được cấu hình trong file .env" },
        { status: 500 }
      );
    }

    try {
      // Dùng Gemini làm AI chính
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-flash-latest",
        systemInstruction: buildSystemInstruction(userContext),
        tools: [{ functionDeclarations: toolDeclarations }],
      });

      const chat = model.startChat({
        history: history || [],
      });

      // Gửi tinh nhắn của người dùng
      let result = await chat.sendMessage(message);
      let response = result.response;

      // Vòng lặp Tool Calling cho Gemini
      let iterations = 0;
      const MAX_ITERATIONS = 5;

      while (iterations < MAX_ITERATIONS) {
        const functionCalls = response.functionCalls();

        if (!functionCalls || functionCalls.length === 0) {
          break; // Không còn tool call nào nữa
        }

        const functionResponses = [];
        for (const call of functionCalls) {
          console.log(`[ChatBot] Tool called: ${call.name}`, call.args);

          const toolResult = await executeTool(
            call.name,
            userContext || { name: "Người dùng", role: "user", roleLevel: 5 },
            call.args
          );

          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { result: JSON.parse(toolResult) },
            },
          });
        }

        // Gửi kết quả lại cho model
        result = await chat.sendMessage(functionResponses);
        response = result.response;
        iterations++;
      }

      const text = response.text();
      return NextResponse.json({ reply: text });

    } catch (geminiError: any) {
      // Trường hợp Gemini lỗi, sẽ gọi DeepSeek Fallback
      console.warn("Gemini Error, switching to DeepSeek fallback...", geminiError.message || geminiError);
      
      const fallbackReply = await callDeepseekFallback(message, history || [], userContext);
      return NextResponse.json({ reply: fallbackReply });
    }

  } catch (error: unknown) {
    console.error("Chat API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json(
      { error: `Lỗi khi gọi API: ${errorMessage}` },
      { status: 500 }
    );
  }
}
