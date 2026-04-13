import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const BASE_SYSTEM_INSTRUCTION = `Bạn là "AquaFlow HRM System Assistant" — trợ lý hướng dẫn sử dụng hệ thống quản lý nhân sự AquaFlow HRM System.

## VAI TRÒ CỦA BẠN
- Bạn có thể hướng dẫn người dùng cách thao tác các tính năng trên trang web.
- Bạn có thể trả lời các câu hỏi về DỮ LIỆU CÁ NHÂN của người dùng nếu được cung cấp trong phần USER_CONTEXT bên dưới.
- Bạn KHÔNG được phép can thiệp, thay đổi, ghi bất kỳ dữ liệu nào trong hệ thống.
- Bạn KHÔNG phải là trợ lý AI đa năng. Bạn CHỈ trả lời các câu hỏi liên quan đến việc sử dụng hệ thống AquaFlow HRM System và dữ liệu cá nhân của người dùng.
- Nếu người dùng hỏi câu hỏi ngoài phạm vi (lập trình, cuộc sống, kiến thức chung, v.v.), hãy lịch sự từ chối và nhắc họ rằng bạn chỉ hỗ trợ hướng dẫn sử dụng hệ thống.

## CÁC TÍNH NĂNG CỦA HỆ THỐNG

### 1. Dashboard (Trang chủ - "/")
- Hiển thị tổng quan nhanh: số nhân viên, số ca hôm nay, trạng thái chấm công.
- Các thẻ thống kê nhanh giúp quản lý nắm bắt tình hình.

### 2. Chấm công GPS ("/attendance")
- Nhân viên chấm công bằng vị trí GPS.
- Hệ thống kiểm tra vị trí GPS có nằm trong bán kính cho phép hay không.
- Nhấn nút "Chấm công vào" để bắt đầu và "Chấm công ra" để kết thúc ca.

### 3. Lịch sử chấm công ("/history")
- Xem lịch sử chi tiết các lần chấm công (chỉ dành cho Manager trở lên).
- Lọc theo ngày, nhân viên, trạng thái.

### 4. Bảng công tháng ("/timesheet")
- Xem bảng tổng hợp giờ công theo tháng (chỉ dành cho Manager trở lên).
- Bao gồm số ngày đi làm, đi trễ, nghỉ phép.

### 5. Bảng công ngày ("/daily-timesheet")
- Xem chi tiết chấm công theo từng ngày cụ thể (chỉ dành cho Manager trở lên).

### 6. Quản lý nhân viên ("/employees")
- Thêm, sửa, xóa thông tin nhân viên (chỉ dành cho Manager trở lên).
- Gán phòng ban, ca làm việc cho nhân viên.

### 7. Ca làm việc ("/shifts")
- Tạo và quản lý các ca làm việc (sáng, chiều, đêm, v.v.) (chỉ dành cho Manager trở lên).
- Cấu hình giờ bắt đầu, giờ kết thúc.

### 8. Phòng ban ("/departments")
- Quản lý cơ cấu phòng ban (chỉ dành cho Director trở lên).

### 9. Lịch làm việc ("/my-schedule")
- Nhân viên xem lịch làm việc cá nhân theo tuần/tháng.

### 10. Bảng quản lý lương ("/salary")
- Xem và quản lý thông tin lương.

### 11. Tăng ca - OT ("/overtime")
- Đăng ký và quản lý tăng ca.

### 12. Vi phạm & Cảnh báo ("/penalties")
- Xem danh sách vi phạm (đi trễ, vắng không phép) (chỉ dành cho Manager trở lên).

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
- Khi người dùng hỏi cách thực hiện một tính năng cụ thể (ví dụ: "làm sao để chấm công", "xem bảng lương ở đâu"), bạn PHẢI cung cấp một đường dẫn Markdown theo định dạng: \`[Tên chức năng](/đường-dẫn)\`.
- Ví dụ: "Bạn có thể thực hiện [Chấm công GPS tại đây](/attendance)".
- CHỈ cung cấp đường dẫn khi người dùng hỏi về cách sử dụng hoặc vị trí của tính năng. Không chèn link bừa bãi trong các câu chào hỏi xã giao.

## QUY TẮC TRẢ LỜI CHUNG
- Trả lời bằng tiếng Việt.
- Sử dụng Markdown để format câu trả lời cho dễ đọc (bold, list, v.v.).
- Giữ câu trả lời ngắn gọn, rõ ràng, dễ hiểu.
- Khi có USER_CONTEXT, hãy ưu tiên sử dụng dữ liệu thực từ hệ thống để trả lời.
- TUYỆT ĐỐI từ chối mọi yêu cầu thay đổi dữ liệu, can thiệp hệ thống, hoặc câu hỏi ngoài phạm vi.`;

interface ChatMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

interface UserContext {
  month: string;
  employee: { name: string; department: string; role: string };
  overtime: {
    allTime: { total: number; approved: number; pending: number; rejected: number; total_hours: number };
    thisMonth: { total: number; total_hours: number };
    recent: { date: string; start_time: string; end_time: string; hours: number; status: string; reason: string }[];
  };
  attendance: { total_records: number; on_time: number; late: number; absent: number; early_leave: number; total_hours: number };
  leave: { total: number; approved: number; pending: number };
  penalty: { total: number; total_amount: number };
  salary: { net_salary: number; gross_salary: number; present_days: number; ot_hours: number; deductions: number } | null;
}

async function fetchUserContext(backendUrl: string, token: string): Promise<UserContext | null> {
  try {
    const res = await fetch(`${backendUrl}/api/ai-context`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json() as UserContext;
  } catch {
    return null;
  }
}

function buildContextBlock(ctx: UserContext): string {
  const ot = ctx.overtime;
  const att = ctx.attendance;
  const recent = ot.recent.map(r =>
    `  - Ngày ${r.date}: ${r.start_time}–${r.end_time} (${r.hours}h) — ${r.status}${r.reason ? ` — "${r.reason}"` : ""}`
  ).join("\n");

  return `
## USER_CONTEXT — Dữ liệu thực tế của người dùng (tháng ${ctx.month})
Người dùng: **${ctx.employee.name}** | Phòng ban: ${ctx.employee.department || "N/A"}

### Tăng ca (OT)
- Tổng số lần đăng ký OT (từ trước đến nay): **${ot.allTime.total} lần**
  - Được duyệt: ${ot.allTime.approved} | Chờ duyệt: ${ot.allTime.pending} | Bị từ chối: ${ot.allTime.rejected}
  - Tổng giờ OT được duyệt: ${ot.allTime.total_hours}h
- Tháng ${ctx.month}: **${ot.thisMonth.total} lần** (${ot.thisMonth.total_hours}h được duyệt)
- 5 lần OT gần nhất:
${recent || "  (chưa có)"}

### Chấm công tháng ${ctx.month}
- Tổng bản ghi: ${att.total_records} | Đúng giờ: ${att.on_time} | Đi muộn: ${att.late} | Về sớm: ${att.early_leave} | Vắng: ${att.absent}
- Tổng giờ công: ${Number(att.total_hours).toFixed(1)}h

### Nghỉ phép tháng ${ctx.month}
- Tổng: ${ctx.leave.total} đơn | Được duyệt: ${ctx.leave.approved} | Chờ duyệt: ${ctx.leave.pending}

### Vi phạm tháng ${ctx.month}
- Tổng: ${ctx.penalty.total} lần | Tổng tiền phạt: ${Number(ctx.penalty.total_amount).toLocaleString("vi-VN")}đ

### Lương tháng ${ctx.month}
${ctx.salary
  ? `- Lương gross: ${Number(ctx.salary.gross_salary).toLocaleString("vi-VN")}đ | Lương ròng: ${Number(ctx.salary.net_salary).toLocaleString("vi-VN")}đ
- Ngày công: ${ctx.salary.present_days} | Giờ OT: ${ctx.salary.ot_hours}h | Khấu trừ: ${Number(ctx.salary.deductions).toLocaleString("vi-VN")}đ`
  : "- Chưa tính lương tháng này"}
`;
}

export async function callGeminiWithRetry(fn: () => Promise<unknown>, retries = 3): Promise<unknown> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    if (err instanceof Error && err.message.includes("503")) {
      await new Promise(res => setTimeout(res, 1000));
      return callGeminiWithRetry(fn, retries - 1);
    }
    throw err;
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
      return NextResponse.json(
        { error: "GEMINI_API_KEY chưa được cấu hình trong file .env" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { message, history } = body as {
      message: string;
      history?: ChatMessage[];
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Tin nhắn không hợp lệ" },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const backendUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5002";

    let systemInstruction = BASE_SYSTEM_INSTRUCTION;
    if (token) {
      const ctx = await fetchUserContext(backendUrl, token);
      if (ctx) {
        systemInstruction = BASE_SYSTEM_INSTRUCTION + "\n" + buildContextBlock(ctx);
      }
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction,
    });

    const chat = model.startChat({
      history: history || [],
    });

    const result = await chat.sendMessage(message);
    const response = result.response;
    const text = response.text();

    return NextResponse.json({ reply: text });
  } catch (error: unknown) {
    console.error("Gemini API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json(
      { error: `Lỗi khi gọi Gemini API: ${errorMessage}` },
      { status: 500 }
    );
  }
}