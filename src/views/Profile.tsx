"use client";

import {
  Camera,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  Save,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { authApi } from "../services/api";
import { ROLE_LEVEL_LABELS } from "../types";

interface ProfileData {
  id: string;
  username: string;
  name: string;
  role: string;
  roleLevel: number;
  department?: string;
  avatar?: string;
  employeeId?: string;
  employeeCode?: string;
  email?: string;
  phone?: string;
  position?: string;
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Change password state
  const [pwForm, setPwForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPw, setShowPw] = useState({
    old: false,
    new: false,
    confirm: false,
  });
  const [pwMessage, setPwMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const data = (await authApi.profile()) as unknown as ProfileData;
      setProfile(data);
      setEmail(data.email || "");
      setPhone(data.phone || "");
      setAvatarPreview(data.avatar || null);
    } catch {
      setMessage({ type: "error", text: "Không thể tải thông tin cá nhân" });
    } finally {
      setLoading(false);
    }
  }

  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: "Ảnh quá lớn. Tối đa 2MB." });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const updates: { avatar?: string; email?: string; phone?: string } = {};
      if (avatarPreview !== (profile?.avatar || null))
        updates.avatar = avatarPreview || "";
      if (email !== (profile?.email || "")) updates.email = email;
      if (phone !== (profile?.phone || "")) updates.phone = phone;

      if (Object.keys(updates).length === 0) {
        setMessage({ type: "success", text: "Không có thay đổi nào." });
        setSaving(false);
        return;
      }

      const data = (await authApi.updateProfile(
        updates,
      )) as unknown as ProfileData;
      setProfile(data);
      // Update auth context so sidebar avatar updates instantly
      updateUser({ avatar: data.avatar });
      // If username changed (email prefix), notify user
      if (data.username !== profile?.username) {
        setMessage({
          type: "success",
          text: `Cập nhật thành công! Tên đăng nhập mới: ${data.username}`,
        });
      } else {
        setMessage({ type: "success", text: "Cập nhật thành công!" });
      }
    } catch {
      setMessage({
        type: "error",
        text: "Cập nhật thất bại. Vui lòng thử lại.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMessage(null);
    const { oldPassword, newPassword, confirmPassword } = pwForm;
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPwMessage({ type: "error", text: "Vui lòng nhập đầy đủ các trường." });
      return;
    }
    if (newPassword.length < 6) {
      setPwMessage({
        type: "error",
        text: "Mật khẩu mới phải có ít nhất 6 ký tự.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMessage({
        type: "error",
        text: "Mật khẩu mới và xác nhận không khớp.",
      });
      return;
    }
    setSavingPw(true);
    try {
      await authApi.changePassword({ oldPassword, newPassword });
      setPwMessage({ type: "success", text: "Đổi mật khẩu thành công!" });
      setPwForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
      setShowPw({ old: false, new: false, confirm: false });
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message || "Đổi mật khẩu thất bại.";
      setPwMessage({ type: "error", text: msg });
    } finally {
      setSavingPw(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center text-gray-500 mt-12">
        Không tìm thấy thông tin cá nhân
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Thông tin cá nhân</h1>

      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Header with avatar */}
          <div className="bg-gradient-to-r from-primary-500 to-primary-700 px-6 py-8">
            <div className="flex items-center gap-5">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-white/20 border-2 border-white overflow-hidden flex items-center justify-center">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-10 h-10 text-white/70" />
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-7 h-7 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition-colors"
                  title="Đổi ảnh đại diện"
                >
                  <Camera className="w-3.5 h-3.5 text-gray-600" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>
              <div className="text-white">
                <h2 className="text-lg font-bold">{profile.name}</h2>
                <p className="text-sm text-white/80">
                  {profile.position || "Nhân viên"}
                </p>
                <p className="text-xs text-white/60 mt-0.5">
                  {ROLE_LEVEL_LABELS[profile.roleLevel] || "Nhân viên"}
                </p>
              </div>
            </div>
          </div>

          {/* Info cards */}
          <div className="p-6 space-y-5">
            {/* Read-only info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoField
                label="Mã nhân viên"
                value={profile.employeeCode || "—"}
              />
              <InfoField label="Tên đăng nhập" value={profile.username} />
              <InfoField label="Phòng ban" value={profile.department || "—"} />
              <InfoField label="Chức vụ" value={profile.position || "—"} />
            </div>

            <hr className="border-gray-100" />

            {/* Editable fields */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">
                Thông tin liên hệ
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Số điện thoại
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0912 345 678"
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Message */}
            {message && (
              <div
                className={`text-sm px-4 py-2 rounded-lg ${
                  message.type === "success"
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {message.text}
              </div>
            )}

            {/* Save button */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>

        {/* Change password section */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <Lock className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700">
              Đổi mật khẩu
            </h3>
          </div>
          <form onSubmit={handleChangePassword} className="p-6 space-y-4">
            {/* Old password */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Mật khẩu cũ
              </label>
              <div className="relative">
                <input
                  type={showPw.old ? "text" : "password"}
                  value={pwForm.oldPassword}
                  onChange={(e) =>
                    setPwForm({ ...pwForm, oldPassword: e.target.value })
                  }
                  placeholder="Nhập mật khẩu cũ"
                  className="w-full pr-10 pl-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPw({ ...showPw, old: !showPw.old })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPw.old ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Mật khẩu mới
              </label>
              <div className="relative">
                <input
                  type={showPw.new ? "text" : "password"}
                  value={pwForm.newPassword}
                  onChange={(e) =>
                    setPwForm({ ...pwForm, newPassword: e.target.value })
                  }
                  placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
                  className="w-full pr-10 pl-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPw({ ...showPw, new: !showPw.new })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPw.new ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm new password */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Xác nhận mật khẩu mới
              </label>
              <div className="relative">
                <input
                  type={showPw.confirm ? "text" : "password"}
                  value={pwForm.confirmPassword}
                  onChange={(e) =>
                    setPwForm({ ...pwForm, confirmPassword: e.target.value })
                  }
                  placeholder="Nhập lại mật khẩu mới"
                  className={`w-full pr-10 pl-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                    pwForm.confirmPassword &&
                    pwForm.newPassword !== pwForm.confirmPassword
                      ? "border-red-300 bg-red-50"
                      : pwForm.confirmPassword &&
                          pwForm.newPassword === pwForm.confirmPassword
                        ? "border-green-300 bg-green-50"
                        : "border-gray-200"
                  }`}
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowPw({ ...showPw, confirm: !showPw.confirm })
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPw.confirm ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {pwForm.confirmPassword &&
                pwForm.newPassword !== pwForm.confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">
                    Mật khẩu không khớp
                  </p>
                )}
              {pwForm.confirmPassword &&
                pwForm.newPassword === pwForm.confirmPassword && (
                  <p className="text-xs text-green-600 mt-1">Mật khẩu khớp</p>
                )}
            </div>

            {/* Message */}
            {pwMessage && (
              <div
                className={`text-sm px-4 py-2 rounded-lg ${
                  pwMessage.type === "success"
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {pwMessage.text}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingPw}
                className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {savingPw ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                Đổi mật khẩu
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}
