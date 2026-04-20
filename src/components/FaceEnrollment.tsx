"use client";

import { AlertTriangle, Camera, CheckCircle2, Loader2, RefreshCw, ScanFace, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { employeesApi } from "../services/api";
import { captureSnapshot, detectFace, loadModels } from "../services/faceRecognition";

interface FaceEnrollmentProps {
  employeeId: string;
  onSuccess?: () => void;
}

export function FaceEnrollment({ employeeId, onSuccess }: FaceEnrollmentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<{
    status: "idle" | "capturing" | "success" | "error";
    message: string;
    snapshot?: string;
  }>({ status: "idle", message: "" });
  const [hasExistingDescriptor, setHasExistingDescriptor] = useState(false);

  useEffect(() => {
    async function checkExisting() {
      try {
        const emp = await employeesApi.get(employeeId) as { faceDescriptor?: number[] };
        if (emp.faceDescriptor) {
          setHasExistingDescriptor(true);
        }
      } catch (e) {
        console.error("Failed to fetch employee", e);
      }
    }
    if (employeeId) checkExisting();
  }, [employeeId]);

  useEffect(() => {
    loadModels().then(() => setLoadingModels(false)).catch(e => {
        setResult({status: "error", message: "Lỗi tải mô hình AI. Vui lòng tải lại trang."});
    });
    return () => {
      stopCamera();
    };
  }, []);

  function startCamera() {
    setResult({ status: "idle", message: "" });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then((s) => {
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
        setCameraActive(true);
      })
      .catch((err) => {
        setResult({
          status: "error",
          message:
            "Không thể truy cập camera. Vui lòng cấp quyền trong trình duyệt.",
        });
      });
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  }

  async function handleScanFace() {
    if (!videoRef.current || !cameraActive) return;
    setDetecting(true);
    setResult({ status: "capturing", message: "Đang phân tích khuôn mặt. Giữ nguyên vị trí..." });

    try {
      const detection = await detectFace(videoRef.current);
      if (!detection) {
        setResult({
          status: "error",
          message: "Không tìm thấy khuôn mặt rõ nét. Vui lòng đảm bảo đủ sáng và nhìn thẳng.",
        });
        setDetecting(false);
        return;
      }
      
      const snapshot = captureSnapshot(videoRef.current);
      const faceDescriptor = Array.from(detection.descriptor) as number[];

      await employeesApi.saveFace(employeeId, {
        faceDescriptor,
        faceImage: snapshot,
      });

      setResult({
        status: "success",
        message: "Đăng ký khuôn mặt thành công! Bạn đã có thể dùng khuôn mặt này để chấm công.",
        snapshot,
      });
      setHasExistingDescriptor(true);
      stopCamera();
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      setResult({
        status: "error",
        message: (err as any).message || "Lỗi không xác định khi lưu khuôn mặt.",
      });
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-6 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-r from-gray-50 to-white">
        <ScanFace className="w-5 h-5 text-primary-600" />
        <h3 className="text-sm font-semibold text-gray-800">
          Xác thực khuôn mặt (Face ID)
        </h3>
        {hasExistingDescriptor && (
          <span className="ml-auto text-[11px] bg-green-100 text-green-700 px-2.5 py-1 rounded-full flex items-center gap-1 font-bold border border-green-200">
             <CheckCircle2 className="w-3.5 h-3.5"/> Đã đăng ký
          </span>
        )}
      </div>

      <div className="p-6">
        {loadingModels ? (
          <div className="flex flex-col items-center justify-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-3" />
            <p className="text-sm text-gray-500 font-medium">Đang tải mô hình AI...</p>
          </div>
        ) : (
          <div className="space-y-5">
            {!result.snapshot && (
              <div className="relative aspect-video sm:aspect-square md:aspect-video bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center max-w-md mx-auto shadow-inner border-2 border-gray-800">
                {!cameraActive ? (
                  <div className="text-center p-6 text-gray-300">
                    <VideoOff className="w-14 h-14 mx-auto mb-3 opacity-60" />
                    <p className="text-sm mb-4">Camera đang tắt. Cần bật camera để quét khuôn mặt.</p>
                    <button
                      onClick={startCamera}
                      className="px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-500 transition-all shadow-md active:scale-95 flex items-center gap-2 mx-auto"
                    >
                      <Camera className="w-4 h-4"/> Bật Camera
                    </button>
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${detecting ? "opacity-30 grayscale" : "opacity-100"}`}
                  />
                )}
                
                {cameraActive && !detecting && (
                   <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                     <div className="w-48 h-64 border-2 border-dashed border-white/60 rounded-[100px] shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] transition-all"></div>
                   </div>
                )}
                
                {detecting && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                    <Loader2 className="w-12 h-12 animate-spin text-primary-400 mb-3 drop-shadow-lg" />
                    <span className="text-white font-bold text-sm bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">Đang phân tích...</span>
                  </div>
                )}
              </div>
            )}

            {result.snapshot && (
              <div className="relative max-w-sm mx-auto text-center space-y-4">
                <div className="p-1.5 bg-white border border-gray-200 shadow-md rounded-2xl">
                    <img src={result.snapshot} alt="Scanned Face" className="w-full rounded-xl object-cover" />
                </div>
                <button
                  onClick={() => {
                    setResult({status: "idle", message: ""});
                    startCamera();
                  }}
                  className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors inline-flex items-center gap-2 shadow-sm border border-gray-200"
                >
                  <RefreshCw className="w-4 h-4"/> Chụp lại ảnh khác
                </button>
              </div>
            )}

            {result.message && (
               <div
               className={`text-sm px-4 py-3 rounded-xl flex items-start gap-2.5 max-w-md mx-auto shadow-sm ${
                 result.status === "success"
                   ? "bg-green-50 text-green-700 border border-green-200"
                   : result.status === "error"
                   ? "bg-red-50 text-red-700 border border-red-200"
                   : "bg-blue-50 text-blue-700 border border-blue-200"
               }`}
             >
               {result.status === "success" && <CheckCircle2 className="w-4.5 h-4.5 shrink-0 mt-0.5"/>}
               {result.status === "error" && <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />}
               <span className="font-medium leading-relaxed">{result.message}</span>
             </div>
            )}

            {cameraActive && !result.snapshot && (
              <div className="flex justify-center gap-3 pt-2">
                <button
                  onClick={stopCamera}
                  disabled={detecting}
                  className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={handleScanFace}
                  disabled={detecting}
                  className="flex items-center gap-2.5 px-6 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg text-sm font-bold hover:from-primary-700 hover:to-primary-800 transition-all shadow-md active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
                >
                  <ScanFace className="w-4 h-4" />
                  Xác nhận & Lưu
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
