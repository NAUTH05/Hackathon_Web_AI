import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  captureSnapshot,
  detectFace,
  isModelsLoaded,
  loadModels,
} from "../services/faceRecognition";
import {
  addEmployee,
  deleteFaceDescriptor,
  getDepartments,
  getEmployeeById,
  getFaceDescriptors,
  saveFaceDescriptor,
  updateEmployee,
} from "../store/storage";
import type { Department } from "../types";
import { ROLE_LEVEL_LABELS } from "../types";

export default function EmployeeForm() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const router = useRouter();
  const isEdit = !!id;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [form, setForm] = useState({
    name: "",
    employeeCode: "",
    department: "",
    position: "",
    roleLevel: 5,
    email: "",
    phone: "",
    isActive: true,
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [faceDescriptor, setFaceDescriptor] = useState<Float32Array | null>(
    null,
  );
  const [hasFace, setHasFace] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [modelsReady, setModelsReady] = useState(isModelsLoaded());
  const [loadingModels, setLoadingModels] = useState(false);
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
            department: emp.department,
            position: emp.position,
            roleLevel: emp.roleLevel ?? 5,
            email: emp.email,
            phone: emp.phone,
            isActive: emp.isActive,
          });
          if (emp.avatar) setAvatarPreview(emp.avatar);
          if (emp.faceImage) setFaceImage(emp.faceImage);
          const descriptors = await getFaceDescriptors();
          if (descriptors.has(emp.id)) setHasFace(true);
        }
      }
    }
    init();
    return () => stopCamera();
  }, [id]);

  async function initModels() {
    setLoadingModels(true);
    try {
      await loadModels();
      setModelsReady(true);
    } catch {
      setSaveMessage("Không thể tải mô hình nhận diện khuôn mặt.");
    } finally {
      setLoadingModels(false);
    }
  }

  async function startCamera() {
    try {
      if (!modelsReady) await initModels();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 360, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setSaveMessage("Không thể truy cập camera.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }

  async function captureFace() {
    if (!videoRef.current) return;
    setCapturing(true);
    setSaveMessage("");
    try {
      const detection = await detectFace(videoRef.current);
      if (!detection) {
        setSaveMessage("Không phát hiện khuôn mặt. Hãy nhìn thẳng vào camera.");
        setCapturing(false);
        return;
      }
      const snapshot = captureSnapshot(videoRef.current);
      setFaceImage(snapshot);
      setFaceDescriptor(detection.descriptor);
      setHasFace(true);
      setSaveMessage("✅ Đã chụp khuôn mặt thành công!");
      stopCamera();
    } catch {
      setSaveMessage("Lỗi khi chụp khuôn mặt. Vui lòng thử lại.");
    } finally {
      setCapturing(false);
    }
  }

  async function removeFace() {
    setFaceImage(null);
    setFaceDescriptor(null);
    setHasFace(false);
    if (isEdit && id) await deleteFaceDescriptor(id);
    setSaveMessage("Đã xóa dữ liệu khuôn mặt.");
  }

  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setSaveMessage("Ảnh quá lớn. Tối đa 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.employeeCode.trim()) {
      setSaveMessage("Vui lòng nhập đầy đủ Họ tên và Mã nhân viên.");
      return;
    }

    try {
      let employeeId: string;
      if (isEdit) {
        const updated = await updateEmployee(id!, {
          ...form,
          avatar: avatarPreview || undefined,
          faceImage: faceImage || undefined,
        });
        employeeId = updated.id;
      } else {
        const created = await addEmployee({
          ...form,
          avatar: avatarPreview || undefined,
          faceImage: faceImage || undefined,
        });
        employeeId = created.id;
      }

      if (faceDescriptor)
        await saveFaceDescriptor(
          employeeId,
          faceDescriptor,
          faceImage || undefined,
        );
      router.push("/employees");
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Lỗi khi lưu");
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
                value={form.department}
                onChange={(e) =>
                  setForm({ ...form, department: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Chọn phòng ban</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>
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
                  src={avatarPreview}
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
                  onClick={() => setAvatarPreview(null)}
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

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Đăng ký khuôn mặt
          </h3>
          <div className="flex flex-col items-center">
            {faceImage && !cameraActive ? (
              <div className="relative mb-4">
                <img
                  src={faceImage}
                  alt="Face"
                  className="w-48 h-48 rounded-xl object-cover border-2 border-green-400"
                />
                <div className="absolute -top-2 -right-2 bg-green-500 rounded-full px-1.5 py-0.5 text-[10px] text-white font-bold">
                  ✓
                </div>
              </div>
            ) : cameraActive ? (
              <div className="camera-container relative mb-4">
                <video
                  ref={videoRef}
                  className="w-80 h-60 rounded-xl object-cover bg-gray-900"
                  muted
                  playsInline
                />
              </div>
            ) : (
              <div className="w-48 h-48 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center mb-4">
                <p className="text-3xl text-gray-300 mb-2">👤</p>
                <p className="text-xs text-gray-400">Chưa có ảnh khuôn mặt</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              {!cameraActive ? (
                <>
                  <button
                    type="button"
                    onClick={startCamera}
                    disabled={loadingModels}
                    className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                  >
                    {loadingModels
                      ? "Đang tải..."
                      : faceImage
                        ? "Chụp lại"
                        : "Bật camera"}
                  </button>
                  {faceImage && (
                    <button
                      type="button"
                      onClick={removeFace}
                      className="px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 transition-colors"
                    >
                      Xóa ảnh
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={captureFace}
                    disabled={capturing}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {capturing ? "Đang chụp..." : "Chụp khuôn mặt"}
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Hủy
                  </button>
                </>
              )}
            </div>

            {saveMessage && (
              <p
                className={`mt-3 text-sm ${
                  saveMessage.includes("✅") ||
                  saveMessage.includes("thành công")
                    ? "text-green-600"
                    : saveMessage.includes("Đã xóa")
                      ? "text-yellow-600"
                      : "text-red-600"
                }`}
              >
                {saveMessage}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-3 text-center max-w-sm">
              Nhìn thẳng vào camera, đảm bảo ánh sáng đủ. Khuôn mặt sẽ được dùng
              để nhận diện khi chấm công.
            </p>
          </div>
        </div>

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
      </form>
    </div>
  );
}
