import { MapPin, MessageSquare, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import { showToast } from "../components/Toast";
import {
  addCompanyLocation,
  deleteCompanyLocation,
  getCompanyLocations,
  getSystemSettings,
  updateSystemSettings,
} from "../store/storage";
import type { CompanyLocation } from "../types";

export default function GPSSettings() {
  const [locations, setLocations] = useState<CompanyLocation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [chatbotEnabled, setChatbotEnabled] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    latitude: "",
    longitude: "",
    radius: "200",
  });

  useEffect(() => {
    async function init() {
      setLocations(await getCompanyLocations());
      const settings = await getSystemSettings();
      setChatbotEnabled(!!settings.chatbot_enabled);
    }
    init();
  }, []);

  async function handleToggleChatbot(enabled: boolean) {
    try {
      await updateSystemSettings({ chatbot_enabled: enabled });
      setChatbotEnabled(enabled);
      showToast('success', 'Cập nhật thành công', `Đã ${enabled ? 'bật' : 'tắt'} Chatbot hỗ trợ`);
    } catch (err) {
      showToast('error', 'Lỗi', 'Không thể cập nhật cài đặt Chatbot');
    }
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.latitude || !form.longitude) return;
    await addCompanyLocation({
      name: form.name,
      address: form.address,
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      radius: parseInt(form.radius) || 200,
    });
    setLocations(await getCompanyLocations());
    setShowForm(false);
    setForm({
      name: "",
      address: "",
      latitude: "",
      longitude: "",
      radius: "200",
    });
  }

  async function handleDelete(id: string) {
    await deleteCompanyLocation(id);
    setLocations(await getCompanyLocations());
    setConfirmDelete(null);
  }

  function handleGetCurrentLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm({
          ...form,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        });
      },
      () => showToast('error', 'Lỗi GPS', 'Không thể lấy vị trí hiện tại'),
      { enableHighAccuracy: true },
    );
  }

  return (
    <div>
      {/* General Settings */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary-600" />
          Cài đặt chung
        </h2>
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Chatbot hỗ trợ</h3>
            <p className="text-xs text-gray-500 mt-0.5">Hiển thị khung chat hỗ trợ người dùng ở góc màn hình</p>
          </div>
          <button
            onClick={() => handleToggleChatbot(!chatbotEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              chatbotEnabled ? 'bg-primary-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                chatbotEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-primary-600" />
            Cài đặt GPS
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Quản lý các địa điểm cho phép chấm công
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {showForm ? "Đóng" : "Thêm địa điểm"}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Thêm địa điểm mới
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Tên địa điểm
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Trụ sở chính"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Địa chỉ
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="123 Nguyễn Huệ, Q.1"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Vĩ độ (Latitude)
              </label>
              <input
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                placeholder="10.7769"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Kinh độ (Longitude)
              </label>
              <input
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) =>
                  setForm({ ...form, longitude: e.target.value })
                }
                placeholder="106.7009"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Bán kính (m)
              </label>
              <input
                type="number"
                value={form.radius}
                onChange={(e) => setForm({ ...form, radius: e.target.value })}
                placeholder="200"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleGetCurrentLocation}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                <MapPin className="w-4 h-4" />
                Dùng vị trí hiện tại
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors"
            >
              Lưu
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {locations.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
            <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Chưa có địa điểm nào</p>
            <p className="text-xs mt-1">
              Thêm địa điểm để nhân viên có thể chấm công bằng GPS
            </p>
          </div>
        ) : (
          locations.map((loc) => (
            <div
              key={loc.id}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-center justify-between hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">
                    {loc.name}
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">{loc.address}</p>
                  <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-gray-400">
                    <span>
                      {Number(loc.latitude).toFixed(6)},{" "}
                      {Number(loc.longitude).toFixed(6)}
                    </span>
                    <span className="px-1.5 py-0.5 bg-primary-50 text-primary-600 rounded font-sans font-medium">
                      {loc.radius}m
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setConfirmDelete(loc.id)}
                className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
      <ConfirmDialog
        open={!!confirmDelete}
        title="Xóa địa điểm"
        message="Bạn có chắc muốn xóa địa điểm này?"
        confirmLabel="Xóa"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
