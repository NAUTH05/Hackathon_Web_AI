================================================================

&nbsp;    BÁO CÁO THUYẾT TRÌNH DỰ ÁN

&nbsp;    HỆ THỐNG QUẢN LÝ NHÂN SỰ \& CHẤM CÔNG THÔNG MINH

&nbsp;    AquaFlow HRM System

================================================================



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

I. TỔNG QUAN DỰ ÁN

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



AquaFlow HRM là hệ thống quản lý nhân sự và chấm công toàn diện,

được xây dựng trong khuôn khổ cuộc thi Hackathon Web AI. Hệ thống

hướng đến việc số hóa hoàn toàn quy trình quản lý nhân viên — từ

chấm công bằng nhận diện khuôn mặt, định vị GPS, quản lý ca làm

việc, xử lý vi phạm, tính lương tự động, cho đến tích hợp trợ lý

AI hỗ trợ người dùng trực tiếp trên giao diện.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

II. KIẾN TRÚC HỆ THỐNG

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



\[ Client Browser ]

&nbsp;      │

&nbsp;      ▼

\[ Nginx Reverse Proxy ]  ←── SSL/TLS termination, domain routing,

&nbsp;      │                       load balancing, bảo vệ upstream

&nbsp;      ├──────────────────────────────────────┐

&nbsp;      ▼                                      ▼

\[ Frontend: Next.js :3000 ]        \[ Backend API: Express.js :5002 ]

&nbsp;      │                                      │

&nbsp;      │                                      ▼

&nbsp;      │                              \[ MySQL Database ]

&nbsp;      │

&nbsp;      ▼

\[ face-api.js (Client-side AI) ]

\[ Google Gemini AI (Chatbox) ]



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

III. CÔNG NGHỆ SỬ DỤNG

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



▌ FRONTEND

&nbsp; ┌─────────────────────────────────────────────────────────┐

&nbsp; │ • Next.js 16 (App Router)  — Framework React hiệu suất  │

&nbsp; │   cao, SSR/SSG, file-based routing                      │

&nbsp; │ • React 19                 — UI component library       │

&nbsp; │ • TypeScript               — Type-safe development      │

&nbsp; │ • Tailwind CSS v4          — Utility-first styling      │

&nbsp; │ • face-api.js              — Nhận diện khuôn mặt ngay   │

&nbsp; │                              trên trình duyệt (WebGL)   │

&nbsp; │   · SSD MobileNet v1       — Phát hiện khuôn mặt        │

&nbsp; │   · Face Landmark 68       — Xác định 68 điểm mốc       │

&nbsp; │   · Face Recognition       — So khớp đặc trưng          │

&nbsp; │ • Google Gemini AI         — Chatbot trợ lý tích hợp    │

&nbsp; │ • Lucide React             — Icon system                │

&nbsp; │ • date-fns                 — Xử lý ngày giờ             │

&nbsp; └─────────────────────────────────────────────────────────┘



▌ BACKEND

&nbsp; ┌─────────────────────────────────────────────────────────┐

&nbsp; │ • Node.js + Express.js     — RESTful API server         │

&nbsp; │ • MySQL 8                  — Cơ sở dữ liệu quan hệ      │

&nbsp; │ • mysql2                   — MySQL driver hiệu năng cao │

&nbsp; │ • JWT (jsonwebtoken)       — Xác thực stateless         │

&nbsp; │ • bcrypt                   — Mã hóa mật khẩu            │

&nbsp; │ • Multer                   — Upload file/ảnh            │

&nbsp; │ • ExcelJS                  — Xuất báo cáo Excel         │

&nbsp; │ • Swagger UI               — API documentation          │

&nbsp; │ • uuid                     — Sinh ID định danh duy nhất │

&nbsp; └─────────────────────────────────────────────────────────┘



▌ HẠ TẦNG \& TRIỂN KHAI (DevOps)

&nbsp; ┌─────────────────────────────────────────────────────────┐

&nbsp; │ • Nginx        — Reverse proxy, SSL termination,        │

&nbsp; │                  virtual host, quản lý domain và        │

&nbsp; │                  điều hướng traffic toàn bộ hệ thống    │

&nbsp; │ • PM2          — Process manager cho Node.js:           │

&nbsp; │                  · Auto-restart khi crash               │

&nbsp; │                  · Zero-downtime reload                 │

&nbsp; │                  · Log management tập trung             │

&nbsp; │                  · Cluster mode tận dụng đa nhân CPU    │

&nbsp; │ • VPS Linux    — Máy chủ cloud đặt tại datacenter       │

&nbsp; │ • Let's Encrypt— SSL certificate miễn phí, tự gia hạn   │

&nbsp; └─────────────────────────────────────────────────────────┘



▌ TESTING \& LOAD TEST

&nbsp; ┌─────────────────────────────────────────────────────────┐

&nbsp; │ • k6           — Load testing framework:                │

&nbsp; │                  · Smoke test (kiểm tra sức khỏe)       │

&nbsp; │                  · Bulk checkin/checkout simulation     │

&nbsp; │                  · Mô phỏng 80-10-10 traffic pattern    │

&nbsp; │                  · Login stress test                    │

&nbsp; └─────────────────────────────────────────────────────────┘



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IV. TÍNH NĂNG NỔI BẬT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



1\. CHẤM CÔNG THÔNG MINH

&nbsp;  • Nhận diện khuôn mặt real-time bằng camera trình duyệt

&nbsp;  • Xác thực GPS — chỉ cho phép chấm công trong bán kính

&nbsp;    được cấu hình (chống gian lận địa điểm)

&nbsp;  • Lưu ảnh khuôn mặt tại thời điểm chấm công

&nbsp;  • Hỗ trợ check-in / check-out với đầy đủ timestamp



2\. QUẢN LÝ CA LÀM VIỆC

&nbsp;  • Tạo ca làm việc linh hoạt (giờ vào, giờ ra, múi giờ)

&nbsp;  • Phân công ca theo nhân viên / phòng ban

&nbsp;  • Hỗ trợ hoán đổi ca (shift swap request)

&nbsp;  • Lịch làm việc cá nhân (My Schedule)



3\. QUẢN LÝ VI PHẠM \& PHẠT

&nbsp;  • Mẫu hình phạt tái sử dụng

&nbsp;  • Phân loại: cảnh cáo, khấu trừ lương, vi phạm nội quy

&nbsp;  • Tự động tạo vi phạm từ hành vi chấm công

&nbsp;  • Giải quyết hàng loạt, dọn dẹp dữ liệu cũ



4\. TÍNH LƯƠNG TỰ ĐỘNG

&nbsp;  • Engine tính lương dựa trên luật cấu hình (Salary Rule Engine)

&nbsp;  • Tích hợp phụ cấp, khấu trừ, thưởng phạt

&nbsp;  • Xuất bảng lương sang Excel

&nbsp;  • Template xuất lương tùy chỉnh



5\. TRỢ LÝ AI (CHATBOX)

&nbsp;  • Tích hợp Google Gemini AI

&nbsp;  • Hiểu ngữ cảnh người dùng trong hệ thống HRM

&nbsp;  • Hỗ trợ giải đáp quy trình, tra cứu thông tin nhanh



6\. BÁO CÁO \& THỐNG KÊ

&nbsp;  • Dashboard tổng quan với số liệu real-time

&nbsp;  • Bảng chấm công ngày / tháng

&nbsp;  • Báo cáo vi phạm, nghỉ phép, tăng ca

&nbsp;  • Audit log toàn bộ thao tác trong hệ thống



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

V. PHÂN CÔNG NHÓM \& QUY TRÌNH TRIỂN KHAI

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



Nhóm gồm 3 thành viên với phân công rõ ràng:

| Vai trò|Nhiệm vụ|Thành Viên|
|-|-|-|
|Frontend Dev|Next.js, UI/UX, face-api.js,<br />tích hợp AI chatbox, responsive|Nguyễn Đoàn Gia Thuận<br />Bùi Hoài Nam|
|Backend Dev|Express API, MySQL schema,<br />JWT auth, salary engine, Swagger|Nguyễn Đoàn Gia Thuận|
|DevOps / Deploy|Quản lý VPS, cấu hình Nginx<br />reverse proxy \& domain, PM2<br />process management, SSL, load test|Nguyễn Văn Hoàng|



Nginx xử lý:

&nbsp; • Định tuyến domain → frontend (port 3000)

&nbsp; • /api/\* → proxy pass tới backend (port 5002)

&nbsp; • Gzip compression, cache static assets

&nbsp; • Rate limiting bảo vệ API endpoint



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VI. KẾT QUẢ KIỂM THỬ HIỆU NĂNG (Load Test với k6)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



• Mô phỏng kịch bản 80% check-in / 10% check-out / 10% xem lịch

• Bulk chấm công không GPS: hệ thống xử lý ổn định

• API login và /me endpoint: response time < 200ms

• Hệ thống không crash dưới tải concurrent users



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VII. ĐIỂM KHÓ \& GIẢI PHÁP

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



Thách thức                        Giải pháp

─────────────────────────────────────────────────────────────

Nhận diện khuôn mặt chạy          Dùng face-api.js chạy hoàn

hoàn toàn client-side             toàn trên WebGL, không gửi

(Chức năng đang được              ảnh lên server → bảo mật cao
phát triển)



Model AI nặng (~6MB)              Lazy load model khi cần,

&nbsp;                                 cache trên service worker



Dữ liệu vi phạm lớn               Pagination server-side,

(200k+ bản ghi)                   chỉ fetch trang hiện tại



Quản lý nhiều ca/ngày             Ca lồng nhau được xử lý

phức tạp                          bằng rule engine linh hoạt

