# Tài liệu Kỹ thuật: Hệ thống Trợ lý AI (AI Chatbot) - HRM

Hệ thống AI Chatbot được xây dựng nhằm cung cấp một giải pháp hỗ trợ người dùng thông minh, bảo mật và dễ bảo trì ngay trên giao diện web HRM.

## 1. Luồng hoạt động của hệ thống (System Workflow)

Hệ thống hoạt động theo một quy trình khép kín từ Frontend đến AI Cloud:

1.  **Gửi yêu cầu (Frontend)**: Khi người dùng nhập tin nhắn trong `GuideBotUI.tsx`, dữ liệu được gửi qua service `chatApi.send()` thuộc `src/services/api.ts`.
2.  **Xác thực & Bảo mật (Backend Proxy)**:
    *   Yêu cầu đi qua API Gateway của Backend tới route `/api/chat`.
    *   **Middleware `authenticate`**: Kiểm tra tính hợp lệ của người dùng (Token) trước khi cho phép giao tiếp với AI.
3.  **Bơm ngữ cảnh (Prompt Injection)**:
    *   Backend đọc nội dung file "kiến thức" tại `backend/prompt/guide_prompt.md`.
    *   Nội dung này được ghép với tin nhắn của người dùng để tạo thành một **System Instruction** (Chỉ dẫn hệ thống), giúp AI chỉ trả lời trong phạm vi cho phép.
4.  **Giao tiếp AI (AI Interaction)**:
    *   Backend dùng `@google/generative-ai` SDK gửi dữ liệu tới Google Gemini.
    *   Model được sử dụng: `gemini-flash-latest` 
5.  **Phản hồi & Hiển thị**:
    *   Dữ liệu trả về Frontend được lưu vào state của `GuideBotUI`.
    *   **Message Formatter**: React sẽ xử lý các ký tự Markdown (như `**` cho in đậm, `\n` cho xuống dòng) để hiển thị thông tin dễ đọc nhất.

## 2. Chi tiết các thay đổi trong mã nguồn (Code Changes)

### Cơ sở dữ liệu (Database)
- **Bảng mới `system_settings`**: Lưu trữ các cấu hình toàn cục.
    - Cột: `setting_key` (Khóa), `setting_value` (Giá trị).
    - **Lý do**: Để Admin có thể Bật/Tắt Chatbot mà không cần chỉnh sửa code hay khởi động lại server. Dữ liệu này được đọc mỗi khi người dùng truy cập trang web.

### Backend (Node.js/Express)
- **`backend/src/routes/chat.js`**: Trái tim của hệ thống AI.
    - Sử dụng `fs.readFileSync` để nạp file `guide_prompt.md`.
    - Tích hợp Google Gemini SDK với cấu hình bảo mật (tách biệt API Key trong `.env`).
- **`backend/src/routes/settings.js`**: Cung cấp API để Admin điều chỉnh trạng thái Chatbot.

### Frontend (React/Next.js)
- **`src/contexts/ChatbotContext.tsx`**: Quản lý trạng thái Bật/Tắt của chatbot trên toàn ứng dụng.
    - **Lý do**: Đảm bảo rằng Chatbot chỉ xuất hiện khi được Admin cho phép và người dùng đã đăng nhập thành công.
- **`src/components/GuideBotUI.tsx`**: Thành phần giao diện.
    - Sử dụng `backdrop-blur-xl` (Glassmorphism) để tạo vẻ ngoài cao cấp.
    - Tích hợp logic xử lý Markdown thô bằng Regex để hiển thị văn bản in đậm và xuống dòng.

## 3. Lý do của các quyết định kỹ thuật (Technical Rationale)

- **Tại sao dùng Proxy thay vì gọi API AI trực tiếp từ Browser?**
    - **Bảo mật**: Giữ API Key của Google an toàn trên Server, không để lộ ra ngoài.
    - **Kiểm soát**: Dễ dàng giới hạn số lượng yêu cầu (Rate Limiting) và lọc nội dung trước khi gửi đi.
- **Tại sao dùng Prompt Injection qua file `.md`?**
    - **Linh hoạt**: Admin có thể cập nhật hướng dẫn sử dụng công ty chỉ bằng cách sửa file văn bản đơn giản mà không cần kiến thức lập trình.

## 4. Hướng dẫn Vận hành & Bảo trì

### Cập nhật kiến thức cho AI
Để AI "thông minh" hơn về các quy định mới của HRM, bạn chỉ cần chỉnh sửa file:
`backend/prompt/guide_prompt.md`
Mọi thay đổi trong file này sẽ có hiệu lực ngay lập tức với các câu hỏi tiếp theo của người dùng.

### Kiểm tra lỗi
Nếu Chatbot không phản hồi (Lỗi 500):
1. Kiểm tra API Key trong `backend/.env`.
2. Kiểm tra log của Backend terminal để xem lỗi cụ thể từ Google API (ví dụ: hết hạn mức hoặc model không khả dụng).

---
*Tài liệu này là một phần của hệ thống HRM - AI Chatbot Module.*
