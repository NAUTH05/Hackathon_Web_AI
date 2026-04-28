import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FaceEnrollment } from "../components/FaceEnrollment";
import { showToast } from "../components/Toast";
import { resolveAvatarUrl, uploadAvatar } from "../services/api";
import {
  addEmployee,
  getDepartments,
  getEmployeeById,
  updateEmployee,
} from "../store/storage";
import type { Department, Employee } from "../types";
import { ROLE_LEVEL_LABELS } from "../types";

export default function EmployeeForm() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const router = useRouter();
  const isEdit = !!id;

  const [form, setForm] = useState({
    name: "",
    employeeCode: "",
    departmentId: "",
    position: "",
    roleLevel: 5,
    email: "",
    phone: "",
    isActive: true,
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarDeleted, setAvatarDeleted] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    async function init() {
      const depts = await getDepartments();
      setDepartments(depts);
      if (isEdit) {
        const emp = await getEmployeeById(id!);
        if (emp) {
          setForm({
            name: emp.name,
            employeeCode: emp.employeeCode,
            departmentId: emp.departmentId || "",
            position: emp.position,
            roleLevel: emp.roleLevel ?? 5,
            email: emp.email,
            phone: emp.phone,
            isActive: emp.isActive,
          });
          if (emp.avatar) setAvatarPreview(emp.avatar);
        }
      }
    }
    init();
  }, [id]);

  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("warning", "Ảnh quá lớn", "Kích thước tối đa là 2MB.");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarDeleted(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.employeeCode.trim()) {
      showToast("warning", "Thiếu thông tin", "Vui lòng nhập đầy đủ Họ tên và Mã nhân viên.");
      return;
    }

    try {
      // Upload avatar file first if a new one was selected
      // avatarUrl: string = new URL, null = explicitly deleted, undefined = unchanged
      let avatarUrl: string | null | undefined;
      if (avatarFile) {
        avatarUrl = await uploadAvatar(avatarFile);
      } else if (avatarDeleted) {
        avatarUrl = null; // tell backend to clear avatar
      } else {
        avatarUrl = avatarPreview ?? undefined; // keep existing
      }
      if (isEdit) {
        const updated = await updateEmployee(id!, {
          ...form,
          avatar: avatarUrl,
        });
        // Cập nhật lại preview và trạng thái sau khi lưu thành công
        setAvatarFile(null);
        setAvatarDeleted(false);
        setAvatarPreview((updated.avatar as string) || null);
        showToast("success", "Cập nhật thành công", "Thông tin nhân viên đã được lưu.");
        return;
      } else {
        const created = (await addEmployee({
          ...form,
          avatar: avatarUrl,
        })) as Employee & { defaultUsername?: string };
        const loginUsername =
          (created as { defaultUsername?: string }).defaultUsername ||
          form.employeeCode;
        setSaveMessage(
          `✅ Đã tạo nhân viên thành công!\n🔑 Tài khoản đăng nhập:\n   Username: ${loginUsername}\n   Mật khẩu mặc định: 123456\n(Nhân viên nên đổi mật khẩu sau khi đăng nhập lần đầu)`,
        );
        showToast("success", "Tạo nhân viên thành công", `Tài khoản: ${loginUsername} / 123456`);
        setTimeout(() => router.push("/employees"), 5000);
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi khi lưu";
      showToast("error", "Lưu thất bại", msg);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/employees")}
          className="px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-sm text-gray-600"
        >
          ← Quay lại
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? "Sửa thông tin nhân viên" : "Thêm nhân viên mới"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isEdit
              ? "Cập nhật thông tin và khuôn mặt"
              : "Nhập thông tin và đăng ký khuôn mặt"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Thông tin cơ bản
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Họ và tên <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nguyễn Văn A"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Mã nhân viên <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.employeeCode}
                onChange={(e) =>
                  setForm({ ...form, employeeCode: e.target.value })
                }
                placeholder="NV001"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Phòng ban
              </label>
              <select
                value={form.departmentId}
                onChange={(e) =>
                  setForm({ ...form, departmentId: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Chọn phòng ban</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Chức vụ
              </label>
              <input
                type="text"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="Nhân viên"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Cấp bậc
              </label>
              <select
                value={form.roleLevel}
                onChange={(e) =>
                  setForm({ ...form, roleLevel: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {Object.entries(ROLE_LEVEL_LABELS).map(([level, label]) => (
                  <option key={level} value={level}>
                    Cấp {level} - {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@company.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Số điện thoại
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="0901234567"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked })
                }
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-600">Đang hoạt động</span>
            </label>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Ảnh đại diện
          </h3>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden flex-shrink-0">
              {avatarPreview ? (
                <img
                  src={resolveAvatarUrl(avatarPreview) ?? ""}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-3xl text-gray-300">👤</span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 cursor-pointer transition-colors">
                📷 Chọn ảnh
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </label>
              {avatarPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setAvatarPreview(null);
                    setAvatarFile(null);
                    setAvatarDeleted(true);
                  }}
                  className="ml-2 px-3 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 transition-colors"
                >
                  Xóa ảnh
                </button>
              )}
              <p className="text-xs text-gray-400">
                PNG, JPG tối đa 2MB. Nhân viên tự chọn ảnh đại diện.
              </p>
            </div>
          </div>
        </div>

        {/* Face Enrollment — only shown when editing an existing employee */}
        {isEdit && id && <FaceEnrollment employeeId={id} />}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/employees")}
            className="px-6 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            className="px-6 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            {isEdit ? "Cập nhật" : "Thêm nhân viên"}
          </button>
        </div>
        {!isEdit && saveMessage.includes("Tài khoản đăng nhập") && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 whitespace-pre-line">
            {saveMessage}
            <p className="mt-2 text-xs text-green-600">
              Tự động chuyển trang sau 5 giây...
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
