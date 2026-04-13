module.exports = [
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/src/services/api.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "aiApi",
    ()=>aiApi,
    "attendanceApi",
    ()=>attendanceApi,
    "auditLogsApi",
    ()=>auditLogsApi,
    "authApi",
    ()=>authApi,
    "clearToken",
    ()=>clearToken,
    "departmentsApi",
    ()=>departmentsApi,
    "employeesApi",
    ()=>employeesApi,
    "holidaysApi",
    ()=>holidaysApi,
    "leaveApi",
    ()=>leaveApi,
    "locationsApi",
    ()=>locationsApi,
    "overtimeApi",
    ()=>overtimeApi,
    "penaltiesApi",
    ()=>penaltiesApi,
    "penaltyTemplatesApi",
    ()=>penaltyTemplatesApi,
    "salaryApi",
    ()=>salaryApi,
    "setToken",
    ()=>setToken,
    "shiftAssignmentsApi",
    ()=>shiftAssignmentsApi,
    "shiftSwapsApi",
    ()=>shiftSwapsApi,
    "shiftsApi",
    ()=>shiftsApi,
    "timeCorrectionsApi",
    ()=>timeCorrectionsApi,
    "timesheetsApi",
    ()=>timesheetsApi
]);
const API_BASE = '/api';
function getToken() {
    return localStorage.getItem('auth_token');
}
function setToken(token) {
    localStorage.setItem('auth_token', token);
}
function clearToken() {
    localStorage.removeItem('auth_token');
}
async function request(method, path, body, query) {
    const url = new URL(`${API_BASE}${path}`, window.location.origin);
    if (query) {
        Object.entries(query).forEach(([k, v])=>{
            if (v !== undefined && v !== '') url.searchParams.set(k, v);
        });
    }
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url.toString(), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) {
        clearToken();
        localStorage.removeItem('fa_current_user');
        window.location.href = '/chamcong/login';
        throw new Error('Unauthorized');
    }
    if (!res.ok) {
        const err = await res.json().catch(()=>({
                error: res.statusText
            }));
        throw new Error(err.error || res.statusText);
    }
    if (res.status === 204) return undefined;
    return res.json();
}
const authApi = {
    login: (username, password)=>request('POST', '/auth/login', {
            username,
            password
        }),
    me: ()=>request('GET', '/auth/me')
};
const employeesApi = {
    list: (params)=>request('GET', '/employees', undefined, params),
    get: (id)=>request('GET', `/employees/${encodeURIComponent(id)}`),
    create: (data)=>request('POST', '/employees', data),
    update: (id, data)=>request('PUT', `/employees/${encodeURIComponent(id)}`, data),
    delete: (id)=>request('DELETE', `/employees/${encodeURIComponent(id)}`),
    saveFace: (id, data)=>request('POST', `/employees/${encodeURIComponent(id)}/face`, data),
    getFaceDescriptors: ()=>request('GET', '/employees/face-descriptors')
};
const departmentsApi = {
    list: ()=>request('GET', '/departments'),
    create: (data)=>request('POST', '/departments', data),
    update: (id, data)=>request('PUT', `/departments/${encodeURIComponent(id)}`, data),
    delete: (id)=>request('DELETE', `/departments/${encodeURIComponent(id)}`)
};
const shiftsApi = {
    list: ()=>request('GET', '/shifts'),
    create: (data)=>request('POST', '/shifts', data),
    update: (id, data)=>request('PUT', `/shifts/${encodeURIComponent(id)}`, data),
    delete: (id)=>request('DELETE', `/shifts/${encodeURIComponent(id)}`)
};
const shiftAssignmentsApi = {
    list: (params)=>request('GET', '/shift-assignments', undefined, params),
    getByEmployee: (employeeId)=>request('GET', `/shift-assignments/employee/${encodeURIComponent(employeeId)}`),
    create: (data)=>request('POST', '/shift-assignments', data),
    delete: (id)=>request('DELETE', `/shift-assignments/${encodeURIComponent(id)}`)
};
const attendanceApi = {
    list: (params)=>request('GET', '/attendance', undefined, params),
    today: ()=>request('GET', '/attendance/today'),
    stats: ()=>request('GET', '/attendance/stats'),
    checkIn: (data)=>request('POST', '/attendance/check-in', data),
    checkOut: (data)=>request('POST', '/attendance/check-out', data)
};
const overtimeApi = {
    list: (params)=>request('GET', '/overtime', undefined, params),
    create: (data)=>request('POST', '/overtime', data),
    update: (id, data)=>request('PUT', `/overtime/${encodeURIComponent(id)}`, data)
};
const leaveApi = {
    list: (params)=>request('GET', '/leave', undefined, params),
    create: (data)=>request('POST', '/leave', data),
    update: (id, data)=>request('PUT', `/leave/${encodeURIComponent(id)}`, data)
};
const penaltiesApi = {
    list: (params)=>request('GET', '/penalties', undefined, params),
    create: (data)=>request('POST', '/penalties', data),
    update: (id, data)=>request('PUT', `/penalties/${encodeURIComponent(id)}`, data),
    delete: (id)=>request('DELETE', `/penalties/${encodeURIComponent(id)}`)
};
const penaltyTemplatesApi = {
    list: ()=>request('GET', '/penalty-templates'),
    create: (data)=>request('POST', '/penalty-templates', data),
    update: (id, data)=>request('PUT', `/penalty-templates/${encodeURIComponent(id)}`, data),
    delete: (id)=>request('DELETE', `/penalty-templates/${encodeURIComponent(id)}`)
};
const locationsApi = {
    list: ()=>request('GET', '/locations'),
    create: (data)=>request('POST', '/locations', data),
    update: (id, data)=>request('PUT', `/locations/${encodeURIComponent(id)}`, data),
    delete: (id)=>request('DELETE', `/locations/${encodeURIComponent(id)}`),
    checkRange: (data)=>request('POST', '/locations/check-range', data)
};
const salaryApi = {
    presets: ()=>request('GET', '/salary/presets'),
    createPreset: (data)=>request('POST', '/salary/presets', data),
    updatePreset: (id, data)=>request('PUT', `/salary/presets/${encodeURIComponent(id)}`, data),
    deletePreset: (id)=>request('DELETE', `/salary/presets/${encodeURIComponent(id)}`),
    assignments: ()=>request('GET', '/salary/assignments'),
    assign: (data)=>request('POST', '/salary/assignments', data),
    records: (params)=>request('GET', '/salary/records', undefined, params),
    calculate: (month)=>request('POST', '/salary/calculate', {
            month
        })
};
const holidaysApi = {
    list: ()=>request('GET', '/holidays'),
    create: (data)=>request('POST', '/holidays', data),
    delete: (id)=>request('DELETE', `/holidays/${encodeURIComponent(id)}`)
};
const timesheetsApi = {
    list: (params)=>request('GET', '/timesheets', undefined, params),
    generate: (month)=>request('POST', '/timesheets/generate', {
            month
        }),
    lock: (month)=>request('POST', '/timesheets/lock', {
            month
        })
};
const auditLogsApi = {
    list: (params)=>request('GET', '/audit-logs', undefined, params)
};
const timeCorrectionsApi = {
    list: (params)=>request('GET', '/time-corrections', undefined, params),
    create: (data)=>request('POST', '/time-corrections', data),
    update: (id, data)=>request('PUT', `/time-corrections/${encodeURIComponent(id)}`, data)
};
const shiftSwapsApi = {
    list: ()=>request('GET', '/shift-swaps'),
    create: (data)=>request('POST', '/shift-swaps', data),
    update: (id, data)=>request('PUT', `/shift-swaps/${encodeURIComponent(id)}`, data)
};
const aiApi = {
    chat: (message, history)=>request('POST', '/ai/chat', {
            message,
            history
        })
};
}),
"[project]/src/contexts/AuthContext.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AuthProvider",
    ()=>AuthProvider,
    "useAuth",
    ()=>useAuth
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/services/api.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
const AuthContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createContext"])({
    user: null,
    login: async ()=>false,
    logout: ()=>{},
    isAdmin: false,
    hydrated: false
});
const STORAGE_KEY = "fa_current_user";
function AuthProvider({ children }) {
    const [user, setUser] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [hydrated, setHydrated] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    // Read localStorage only on client after mount to avoid hydration mismatch
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) setUser(JSON.parse(data));
        } catch  {}
        setHydrated(true);
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!hydrated) return;
        if (user) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, [
        user,
        hydrated
    ]);
    async function login(username, password) {
        try {
            const { token, user: userData } = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["authApi"].login(username, password);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["setToken"])(token);
            const u = userData;
            setUser(u);
            return true;
        } catch  {
            return false;
        }
    }
    function logout() {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clearToken"])();
        setUser(null);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(AuthContext.Provider, {
        value: {
            user,
            login,
            logout,
            isAdmin: user?.role === "admin",
            hydrated
        },
        children: children
    }, void 0, false, {
        fileName: "[project]/src/contexts/AuthContext.tsx",
        lineNumber: 71,
        columnNumber: 5
    }, this);
}
function useAuth() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useContext"])(AuthContext);
}
}),
"[project]/src/app/layout.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>RootLayout
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$contexts$2f$AuthContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/contexts/AuthContext.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
function RootLayout({ children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("html", {
        lang: "vi",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("head", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("title", {
                        children: "TimeKeeper - Cham Cong"
                    }, void 0, false, {
                        fileName: "[project]/src/app/layout.tsx",
                        lineNumber: 14,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("meta", {
                        name: "description",
                        content: "He thong cham cong nhan vien"
                    }, void 0, false, {
                        fileName: "[project]/src/app/layout.tsx",
                        lineNumber: 15,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/layout.tsx",
                lineNumber: 13,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("body", {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$contexts$2f$AuthContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AuthProvider"], {
                    children: children
                }, void 0, false, {
                    fileName: "[project]/src/app/layout.tsx",
                    lineNumber: 18,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/layout.tsx",
                lineNumber: 17,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/layout.tsx",
        lineNumber: 12,
        columnNumber: 5
    }, this);
}
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/dynamic-access-async-storage.external.js [external] (next/dist/server/app-render/dynamic-access-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/dynamic-access-async-storage.external.js", () => require("next/dist/server/app-render/dynamic-access-async-storage.external.js"));

module.exports = mod;
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__e1be36c8._.js.map