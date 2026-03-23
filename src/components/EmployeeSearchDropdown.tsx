import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Employee } from "../types";

interface EmployeeSearchDropdownProps {
  employees: Employee[];
  value: string;
  onChange: (employeeId: string) => void;
  onSearch?: (query: string) => void;
  placeholder?: string;
  className?: string;
}

export default function EmployeeSearchDropdown({
  employees,
  value,
  onChange,
  onSearch,
  placeholder = "Tìm nhân viên (tên, mã NV)...",
  className = "",
}: EmployeeSearchDropdownProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Notify parent of search query changes (for server-side search)
  useEffect(() => {
    if (onSearch) {
      const t = setTimeout(() => onSearch(query), 300);
      return () => clearTimeout(t);
    }
  }, [query, onSearch]);

  // Client-side filter when no onSearch callback
  const filtered = onSearch
    ? employees
    : query.trim()
      ? employees.filter(
          (e) =>
            e.name.toLowerCase().includes(query.toLowerCase()) ||
            e.employeeCode.toLowerCase().includes(query.toLowerCase())
        )
      : employees;

  const selected = employees.find((e) => e.id === value);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={open ? query : selected ? `${selected.name} (${selected.employeeCode})` : query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            if (selected) setQuery("");
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm"
        />
        {(query || value) && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              onChange("");
              setOpen(false);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-100 text-gray-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">
              Không tìm thấy nhân viên
            </div>
          ) : (
            filtered.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  onChange(e.id);
                  setQuery("");
                  setOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-primary-50 transition-colors flex items-center justify-between ${
                  e.id === value
                    ? "bg-primary-50 text-primary-700 font-medium"
                    : "text-gray-700"
                }`}
              >
                <div>
                  <span className="font-medium">{e.name}</span>
                  <span className="text-gray-400 ml-2">{e.employeeCode}</span>
                </div>
                <span className="text-xs text-gray-400 truncate ml-2 max-w-[120px]">
                  {e.department}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
