"use client";

import {
  AlertTriangle,
  BarChart3,
  Building2,
  Calendar,
  CalendarDays,
  ClipboardList,
  Clock,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Palmtree,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  Timer,
  UserCircle,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { ROLE_LEVELS, ROLE_LEVEL_LABELS } from "../types";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  userOnly?: boolean;
  maxLevel?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const iconSize = "w-4 h-4";

const allNavSections: NavSection[] = [
  {
    title: "Tổng quan",
    items: [
      {
        to: "/",
        label: "Dashboard",
        icon: <LayoutDashboard className={iconSize} />,
      },
    ],
  },
  {
    title: "Chấm công",
    items: [
      {
        to: "/attendance",
        label: "Chấm công GPS",
        icon: <MapPin className={iconSize} />,
      },
      {
        to: "/history",
        label: "Lịch sử chấm công",
        icon: <ScrollText className={iconSize} />,
        maxLevel: ROLE_LEVELS.MANAGER,
      },
      {
        to: "/timesheet",
        label: "Bảng công tháng",
        icon: <CalendarDays className={iconSize} />,
        maxLevel: ROLE_LEVELS.MANAGER,
      },
      {
        to: "/daily-timesheet",
        label: "Bảng công ngày",
        icon: <ClipboardList className={iconSize} />,
        maxLevel: ROLE_LEVELS.MANAGER,
      },
    ],
  },
  {
    title: "Quản lý",
    items: [
      {
        to: "/employees",
        label: "Nhân viên",
        icon: <Users className={iconSize} />,
        maxLevel: ROLE_LEVELS.MANAGER,
      },
      {
        to: "/shifts",
        label: "Ca làm việc",
        icon: <Clock className={iconSize} />,
        maxLevel: ROLE_LEVELS.MANAGER,
      },
      {
        to: "/departments",
        label: "Phòng ban",
        icon: <Building2 className={iconSize} />,
        maxLevel: ROLE_LEVELS.DIRECTOR,
      },
      {
        to: "/my-schedule",
        label: "Lịch làm việc",
        icon: <Calendar className={iconSize} />,
      },
      {
        to: "/salary",
        label: "Bảng quản lý lương",
        icon: <Wallet className={iconSize} />,
      },
    ],
  },
  {
    title: "Nâng cao",
    items: [
      {
        to: "/overtime",
        label: "Tăng ca (OT)",
        icon: <Timer className={iconSize} />,
      },
      {
        to: "/penalties",
        label: "Vi phạm & Cảnh báo",
        icon: <AlertTriangle className={iconSize} />,
        maxLevel: ROLE_LEVELS.MANAGER,
      },
      {
        to: "/leave",
        label: "Nghỉ phép & Ngày lễ",
        icon: <Palmtree className={iconSize} />,
      },
    ],
  },
  {
    title: "Hệ thống",
    items: [
      {
        to: "/logs",
        label: "Nhật ký hệ thống",
        icon: <FileText className={iconSize} />,
        maxLevel: ROLE_LEVELS.ADMIN,
      },
      {
        to: "/reports",
        label: "Báo cáo",
        icon: <BarChart3 className={iconSize} />,
        maxLevel: ROLE_LEVELS.DIRECTOR,
      },
      {
        to: "/settings",
        label: "Cài đặt GPS",
        icon: <Settings className={iconSize} />,
        maxLevel: ROLE_LEVELS.ADMIN,
      },
    ],
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout, isAdmin, hasAccess, roleLevel } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 768) setMobileOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const navSections = allNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.maxLevel && !hasAccess(item.maxLevel)) return false;
        if (item.adminOnly && !isAdmin) return false;
        if (item.userOnly && isAdmin) return false;
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);

  // Shared sidebar content
  const sidebarContent = (isMobileView: boolean) => (
    <>
      {/* Brand */}
      <div className="h-14 flex items-center justify-between px-3 border-b border-gray-100">
        {(!collapsed || isMobileView) && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white shadow-sm">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-bold text-gray-900 block leading-tight">
                TimeKeeper
              </span>
              <span className="text-[10px] text-gray-400 leading-tight">
                Workforce Management
              </span>
            </div>
          </div>
        )}
        {collapsed && !isMobileView && (
          <div className="w-full flex justify-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white shadow-sm">
              <Clock className="w-4 h-4" />
            </div>
          </div>
        )}
        {isMobileView ? (
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          !collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              title="Thu gọn"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )
        )}
      </div>

      {collapsed && !isMobileView && (
        <div className="flex justify-center py-2 border-b border-gray-100">
          <button
            onClick={() => setCollapsed(false)}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title="Mở rộng"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {navSections.map((section) => (
          <div key={section.title} className="mb-3">
            {(!collapsed || isMobileView) && (
              <div className="px-3 mb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                {section.title}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  item.to === "/"
                    ? pathname === "/" || pathname === ""
                    : (pathname ?? "").startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    href={item.to}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                      isActive
                        ? "bg-primary-50 text-primary-700 shadow-sm"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    } ${collapsed && !isMobileView ? "justify-center px-2" : ""}`}
                    title={item.label}
                  >
                    {item.icon}
                    {(!collapsed || isMobileView) && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User / Logout */}
      <div className="border-t border-gray-100 p-2">
        {!collapsed || isMobileView ? (
          <div className="flex items-center gap-2 px-2 py-2">
            <Link
              href="/profile"
              className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
              title="Thông tin cá nhân"
            >
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserCircle className="w-5 h-5 text-gray-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">
                  {user?.name}
                </p>
                {user?.department && (
                  <p className="text-[10px] text-gray-500 truncate">
                    {user.department}
                  </p>
                )}
                <p className="text-[10px] text-gray-400">
                  {ROLE_LEVEL_LABELS[roleLevel] || "Nhân viên"}
                </p>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Link
              href="/profile"
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden hover:opacity-80 transition-opacity"
              title="Thông tin cá nhân"
            >
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserCircle className="w-5 h-5 text-gray-500" />
              )}
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex justify-center p-2 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 h-14 flex items-center justify-between px-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white">
            <Clock className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm font-bold text-gray-900">TimeKeeper</span>
        </div>
        <Link href="/profile" className="p-2 rounded-lg hover:bg-gray-100">
          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <UserCircle className="w-4 h-4 text-gray-500" />
            )}
          </div>
        </Link>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white flex flex-col transition-transform duration-300 shadow-2xl ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent(true)}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex ${collapsed ? "w-[68px]" : "w-64"} bg-white border-r border-gray-200 flex-col transition-all duration-200`}
      >
        {sidebarContent(false)}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="p-4 md:p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
