const swaggerJSDoc = require('swagger-jsdoc');

const serverUrl = process.env.SWAGGER_SERVER_URL || 'https://api-hrm.fitlhu.com';

/* ------------------------------------------------------------------ */
/*  Reusable response helpers                                         */
/* ------------------------------------------------------------------ */
const err401 = {
    description: 'Unauthorized',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
};
const err403 = {
    description: 'Forbidden – insufficient permissions',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
};
const err404 = {
    description: 'Not found',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
};
const err500 = {
    description: 'Internal server error',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
};
const jsonBody = (schema, required = true) => ({
    required,
    content: { 'application/json': { schema } },
});
const jsonRes = (desc, schema) => ({
    description: desc,
    content: { 'application/json': { schema } },
});
const sec = [{ bearerAuth: [] }];

const pageParams = [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
];

/* ------------------------------------------------------------------ */
/*  Paths                                                              */
/* ------------------------------------------------------------------ */
const paths = {
    /* ============ System ============ */
    '/api/health': {
        get: {
            tags: ['System'],
            summary: 'Health check',
            responses: {
                200: jsonRes('Service healthy', {
                    type: 'object',
                    properties: {
                        status: { type: 'string', example: 'ok' },
                        uptimeSeconds: { type: 'integer', example: 120 },
                        timestamp: { type: 'string', format: 'date-time' },
                    },
                }),
            },
        },
    },

    /* ============ Auth ============ */
    '/api/auth/login': {
        post: {
            tags: ['Auth'],
            summary: 'Login and get JWT token',
            requestBody: jsonBody({ $ref: '#/components/schemas/LoginRequest' }),
            responses: {
                200: jsonRes('Login success', {
                    type: 'object',
                    properties: { token: { type: 'string' }, user: { type: 'object' } },
                }),
                401: err401,
            },
        },
    },
    '/api/auth/register': {
        post: {
            tags: ['Auth'],
            summary: 'Register a new user',
            requestBody: jsonBody({
                type: 'object',
                required: ['username', 'password', 'name'],
                properties: {
                    username: { type: 'string' },
                    password: { type: 'string' },
                    name: { type: 'string' },
                    department: { type: 'string' },
                },
            }),
            responses: {
                201: jsonRes('Registration success', { type: 'object', properties: { token: { type: 'string' }, user: { type: 'object' } } }),
                400: { description: 'Username already exists' },
                500: err500,
            },
        },
    },
    '/api/auth/me': {
        get: {
            tags: ['Auth'],
            summary: 'Get current user by token',
            security: sec,
            responses: { 200: jsonRes('Current user profile', { type: 'object', additionalProperties: true }), 401: err401 },
        },
    },
    '/api/auth/profile': {
        get: {
            tags: ['Auth'],
            summary: 'Get full user profile (user + employee + department)',
            security: sec,
            responses: { 200: jsonRes('Full profile info', { type: 'object', additionalProperties: true }), 401: err401 },
        },
    },

    /* ============ Employees ============ */
    '/api/employees': {
        get: {
            tags: ['Employees'],
            summary: 'List employees with pagination & filters',
            description: 'Managers see only their department; admins see all.',
            security: sec,
            parameters: [
                ...pageParams,
                { name: 'department', in: 'query', schema: { type: 'integer' }, description: 'Filter by department ID' },
                { name: 'isActive', in: 'query', schema: { type: 'integer', enum: [0, 1] } },
                { name: 'roleLevel', in: 'query', schema: { type: 'integer' } },
                { name: 'position', in: 'query', schema: { type: 'string' } },
                { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by name or code' },
                { name: 'sortBy', in: 'query', schema: { type: 'string' } },
                { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
            ],
            responses: { 200: jsonRes('Paginated employee list', { type: 'object' }), 401: err401, 500: err500 },
        },
        post: {
            tags: ['Employees'],
            summary: 'Create new employee (auto-generates login account)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['name', 'employeeCode', 'departmentId'],
                properties: {
                    name: { type: 'string' },
                    employeeCode: { type: 'string' },
                    departmentId: { type: 'integer' },
                    position: { type: 'string' },
                    roleLevel: { type: 'integer' },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    avatar: { type: 'string' },
                    username: { type: 'string' },
                    password: { type: 'string' },
                },
            }),
            responses: { 201: jsonRes('Employee created', { type: 'object' }), 400: { description: 'Validation error' }, 401: err401, 403: err403, 500: err500 },
        },
    },
    '/api/employees/face-descriptors': {
        get: {
            tags: ['Employees'],
            summary: 'Get all face descriptors for face recognition',
            security: sec,
            responses: { 200: jsonRes('Face descriptors', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
    },
    '/api/employees/{id}': {
        get: {
            tags: ['Employees'],
            summary: 'Get single employee details',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Employee details', { type: 'object' }), 401: err401, 404: err404 },
        },
        put: {
            tags: ['Employees'],
            summary: 'Update employee details (admin only)',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    employeeCode: { type: 'string' },
                    departmentId: { type: 'integer' },
                    position: { type: 'string' },
                    roleLevel: { type: 'integer' },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    avatar: { type: 'string' },
                    isActive: { type: 'integer', enum: [0, 1] },
                },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 500: err500 },
        },
    },

    /* ============ Departments ============ */
    '/api/departments': {
        get: {
            tags: ['Departments'],
            summary: 'List all departments with member counts',
            security: sec,
            responses: { 200: jsonRes('Department list', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
        post: {
            tags: ['Departments'],
            summary: 'Create department (managers/admins)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    managerId: { type: 'integer' },
                    parentId: { type: 'integer' },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 403: err403, 500: err500 },
        },
    },
    '/api/departments/{id}': {
        put: {
            tags: ['Departments'],
            summary: 'Update department',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                properties: { name: { type: 'string' }, description: { type: 'string' }, managerId: { type: 'integer' }, parentId: { type: 'integer' } },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
        delete: {
            tags: ['Departments'],
            summary: 'Delete department (no children/active employees)',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Deleted', { type: 'object' }), 400: { description: 'Has children or active employees' }, 401: err401, 403: err403 },
        },
    },
    '/api/departments/{id}/members': {
        get: {
            tags: ['Departments'],
            summary: 'List employees in a department (paginated)',
            security: sec,
            parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                ...pageParams,
            ],
            responses: { 200: jsonRes('Paginated members', { type: 'object' }), 401: err401, 404: err404 },
        },
    },

    /* ============ Shifts ============ */
    '/api/shifts': {
        get: {
            tags: ['Shifts'],
            summary: 'List all work shifts',
            security: sec,
            responses: { 200: jsonRes('Shift list', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
        post: {
            tags: ['Shifts'],
            summary: 'Create shift template (manager+)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['name', 'startTime', 'endTime'],
                properties: {
                    name: { type: 'string', example: 'Ca sáng' },
                    startTime: { type: 'string', example: '08:00' },
                    endTime: { type: 'string', example: '17:00' },
                    color: { type: 'string', example: '#3B82F6' },
                    allowLateMinutes: { type: 'integer', example: 15 },
                    allowEarlyLeaveMinutes: { type: 'integer', example: 15 },
                    breakStartTime: { type: 'string', example: '12:00' },
                    breakEndTime: { type: 'string', example: '13:00' },
                    isOvernight: { type: 'integer', enum: [0, 1] },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 403: err403, 500: err500 },
        },
    },
    '/api/shifts/{id}': {
        put: {
            tags: ['Shifts'],
            summary: 'Update shift',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                properties: {
                    name: { type: 'string' }, startTime: { type: 'string' }, endTime: { type: 'string' },
                    color: { type: 'string' }, allowLateMinutes: { type: 'integer' }, allowEarlyLeaveMinutes: { type: 'integer' },
                    breakStartTime: { type: 'string' }, breakEndTime: { type: 'string' }, isOvernight: { type: 'integer', enum: [0, 1] },
                },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
        delete: {
            tags: ['Shifts'],
            summary: 'Delete shift',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Deleted', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },

    /* ============ Shift Assignments ============ */
    '/api/shift-assignments': {
        get: {
            tags: ['Shift Assignments'],
            summary: 'List shift assignments (managers see own dept)',
            security: sec,
            parameters: [{ name: 'employeeId', in: 'query', schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Assignments', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
        post: {
            tags: ['Shift Assignments'],
            summary: 'Assign shift to employee',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['employeeId', 'shiftId', 'dayOfWeek'],
                properties: {
                    employeeId: { type: 'integer' },
                    shiftId: { type: 'integer' },
                    dayOfWeek: { type: 'integer', description: '0=Sunday … 6=Saturday' },
                    effectiveFrom: { type: 'string', format: 'date' },
                    effectiveTo: { type: 'string', format: 'date' },
                },
            }),
            responses: { 201: jsonRes('Assigned', { type: 'object' }), 401: err401, 403: err403, 500: err500 },
        },
    },
    '/api/shift-assignments/employee/{employeeId}': {
        get: {
            tags: ['Shift Assignments'],
            summary: 'Get shift schedule for a specific employee',
            security: sec,
            parameters: [{ name: 'employeeId', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Employee schedule by day-of-week', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
    },
    '/api/shift-assignments/{id}': {
        delete: {
            tags: ['Shift Assignments'],
            summary: 'Delete shift assignment',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Deleted', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },

    /* ============ Shift Swaps ============ */
    '/api/shift-swaps': {
        get: {
            tags: ['Shift Swaps'],
            summary: 'List shift swap requests',
            description: 'Employees see own; admins see all.',
            security: sec,
            responses: { 200: jsonRes('Swap list', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
        post: {
            tags: ['Shift Swaps'],
            summary: 'Create shift swap request',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['requesterId', 'targetId', 'date', 'requesterShiftId', 'targetShiftId'],
                properties: {
                    requesterId: { type: 'integer' },
                    requesterName: { type: 'string' },
                    targetId: { type: 'integer' },
                    targetName: { type: 'string' },
                    date: { type: 'string', format: 'date' },
                    requesterShiftId: { type: 'integer' },
                    targetShiftId: { type: 'integer' },
                    reason: { type: 'string' },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 500: err500 },
        },
    },
    '/api/shift-swaps/{id}': {
        put: {
            tags: ['Shift Swaps'],
            summary: 'Accept or reject shift swap',
            description: 'Target employee or admin only. If accepted, shift_assignments are swapped.',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                required: ['status'],
                properties: { status: { type: 'string', enum: ['accepted', 'rejected'] } },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },

    /* ============ Attendance ============ */
    '/api/attendance': {
        get: {
            tags: ['Attendance'],
            summary: 'List attendance records',
            description: 'Employees see own; managers see dept; admins see all.',
            security: sec,
            parameters: [
                ...pageParams,
                { name: 'employeeId', in: 'query', schema: { type: 'integer' } },
                { name: 'employeeCode', in: 'query', schema: { type: 'string' } },
                { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
                { name: 'month', in: 'query', schema: { type: 'string', example: '2025-01' } },
                { name: 'status', in: 'query', schema: { type: 'string' } },
            ],
            responses: { 200: jsonRes('Paginated attendance', { type: 'object' }), 401: err401, 500: err500 },
        },
    },
    '/api/attendance/export': {
        get: {
            tags: ['Attendance'],
            summary: 'Export attendance to Excel (managers+)',
            security: sec,
            parameters: [
                { name: 'employeeCode', in: 'query', schema: { type: 'string' } },
                { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
                { name: 'month', in: 'query', schema: { type: 'string', example: '2025-01' } },
            ],
            responses: {
                200: { description: 'Excel file download', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } } },
                401: err401, 403: err403,
            },
        },
    },
    '/api/attendance/today': {
        get: {
            tags: ['Attendance'],
            summary: 'Get today\'s attendance records',
            security: sec,
            parameters: [...pageParams],
            responses: { 200: jsonRes('Today records', { type: 'object' }), 401: err401 },
        },
    },
    '/api/attendance/stats': {
        get: {
            tags: ['Attendance'],
            summary: 'Dashboard stats (today check-ins, monthly summary, pending)',
            security: sec,
            responses: { 200: jsonRes('Attendance stats', { type: 'object' }), 401: err401 },
        },
    },
    '/api/attendance/check-in': {
        post: {
            tags: ['Attendance'],
            summary: 'Employee check-in (mobile only)',
            description: 'Validates GPS location. Auto-generates late penalty if applicable. Blocked for desktop browsers.',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['employeeId'],
                properties: {
                    employeeId: { type: 'integer' },
                    checkInImage: { type: 'string', description: 'Base64 image' },
                    latitude: { type: 'number' },
                    longitude: { type: 'number' },
                    shiftId: { type: 'integer' },
                    checkInTime: { type: 'string', description: 'Admin override (HH:mm)' },
                },
            }),
            responses: { 200: jsonRes('Check-in success', { type: 'object' }), 400: { description: 'Validation / GPS error' }, 401: err401 },
        },
    },
    '/api/attendance/check-out': {
        post: {
            tags: ['Attendance'],
            summary: 'Employee check-out (mobile only)',
            description: 'Calculates working hours. Blocked for desktop browsers.',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['employeeId'],
                properties: {
                    employeeId: { type: 'integer' },
                    checkOutImage: { type: 'string', description: 'Base64 image' },
                    checkOutTime: { type: 'string', description: 'Admin override (HH:mm)' },
                },
            }),
            responses: { 200: jsonRes('Check-out success', { type: 'object' }), 400: { description: 'Not checked in / validation error' }, 401: err401 },
        },
    },

    /* ============ Overtime ============ */
    '/api/overtime': {
        get: {
            tags: ['Overtime'],
            summary: 'List overtime requests',
            description: 'Employees see own; managers see dept; admins see all.',
            security: sec,
            parameters: [
                ...pageParams,
                { name: 'employeeId', in: 'query', schema: { type: 'integer' } },
                { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] } },
            ],
            responses: { 200: jsonRes('OT list', { type: 'object' }), 401: err401 },
        },
        post: {
            tags: ['Overtime'],
            summary: 'Create overtime request',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['employeeId', 'date', 'hours'],
                properties: {
                    employeeId: { type: 'integer' },
                    employeeName: { type: 'string' },
                    date: { type: 'string', format: 'date' },
                    shiftId: { type: 'integer' },
                    startTime: { type: 'string' },
                    endTime: { type: 'string' },
                    hours: { type: 'number' },
                    multiplier: { type: 'number', example: 1.5 },
                    reason: { type: 'string' },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 500: err500 },
        },
    },
    '/api/overtime/{id}': {
        put: {
            tags: ['Overtime'],
            summary: 'Approve/reject overtime request (managers+)',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                required: ['status'],
                properties: { status: { type: 'string', enum: ['approved', 'rejected'] } },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },
    '/api/overtime/check-auto-reject': {
        post: {
            tags: ['Overtime'],
            summary: 'Auto-reject pending OT requests older than 24h (admin)',
            security: sec,
            responses: { 200: jsonRes('Result', { type: 'object' }), 401: err401, 403: err403 },
        },
    },

    /* ============ Leave ============ */
    '/api/leave': {
        get: {
            tags: ['Leave'],
            summary: 'List leave requests',
            description: 'Employees see own; managers see dept; admins see all.',
            security: sec,
            parameters: [
                ...pageParams,
                { name: 'employeeId', in: 'query', schema: { type: 'integer' } },
                { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] } },
            ],
            responses: { 200: jsonRes('Leave list', { type: 'object' }), 401: err401 },
        },
        post: {
            tags: ['Leave'],
            summary: 'Create leave request',
            description: 'Maternity type auto-locks end_date to 6 months.',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['employeeId', 'startDate', 'endDate', 'type'],
                properties: {
                    employeeId: { type: 'integer' },
                    employeeName: { type: 'string' },
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' },
                    type: { type: 'string', example: 'annual' },
                    reason: { type: 'string' },
                    hours: { type: 'number' },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 500: err500 },
        },
    },
    '/api/leave/{id}': {
        put: {
            tags: ['Leave'],
            summary: 'Approve/reject leave request (managers+)',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                required: ['status'],
                properties: { status: { type: 'string', enum: ['approved', 'rejected'] } },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },
    '/api/leave/check-auto-reject': {
        post: {
            tags: ['Leave'],
            summary: 'Auto-reject pending leave requests older than 24h (admin)',
            security: sec,
            responses: { 200: jsonRes('Result', { type: 'object' }), 401: err401, 403: err403 },
        },
    },

    /* ============ Penalties ============ */
    '/api/penalties': {
        get: {
            tags: ['Penalties'],
            summary: 'List penalties with filters',
            description: 'Employees see own; managers see dept; admins see all.',
            security: sec,
            parameters: [
                ...pageParams,
                { name: 'employeeId', in: 'query', schema: { type: 'integer' } },
                { name: 'status', in: 'query', schema: { type: 'string' } },
                { name: 'type', in: 'query', schema: { type: 'string' } },
                { name: 'employeeSearch', in: 'query', schema: { type: 'string' } },
            ],
            responses: { 200: jsonRes('Penalty list', { type: 'object' }), 401: err401 },
        },
        post: {
            tags: ['Penalties'],
            summary: 'Create penalty record (managers+)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['employeeId', 'date', 'type'],
                properties: {
                    employeeId: { type: 'integer' },
                    employeeName: { type: 'string' },
                    date: { type: 'string', format: 'date' },
                    type: { type: 'string' },
                    reason: { type: 'string' },
                    amount: { type: 'number' },
                    description: { type: 'string' },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/penalties/{id}': {
        put: {
            tags: ['Penalties'],
            summary: 'Update penalty (appeal/resolve)',
            description: 'Employees can appeal own; managers can resolve dept penalties.',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                properties: { status: { type: 'string' }, appealReason: { type: 'string' } },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },
    '/api/penalties/resolve-all': {
        put: {
            tags: ['Penalties'],
            summary: 'Bulk resolve penalties (managers+)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                properties: { status: { type: 'string' }, type: { type: 'string' } },
            }),
            responses: { 200: jsonRes('Bulk result', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/penalties/cleanup': {
        delete: {
            tags: ['Penalties'],
            summary: 'Delete resolved penalties older than N days (admin)',
            security: sec,
            parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', default: 365 } }],
            responses: { 200: jsonRes('Cleanup result', { type: 'object' }), 401: err401, 403: err403 },
        },
    },

    /* ============ Penalty Templates ============ */
    '/api/penalty-templates': {
        get: {
            tags: ['Penalty Templates'],
            summary: 'List penalty templates (admin)',
            security: sec,
            responses: { 200: jsonRes('Template list', { type: 'array', items: { type: 'object' } }), 401: err401, 403: err403 },
        },
        post: {
            tags: ['Penalty Templates'],
            summary: 'Create penalty template (admin)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['name', 'type'],
                properties: {
                    name: { type: 'string' },
                    type: { type: 'string' },
                    reason: { type: 'string' },
                    description: { type: 'string' },
                    amount: { type: 'number' },
                    isActive: { type: 'integer', enum: [0, 1] },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/penalty-templates/{id}': {
        put: {
            tags: ['Penalty Templates'],
            summary: 'Update penalty template (admin)',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                properties: { name: { type: 'string' }, type: { type: 'string' }, reason: { type: 'string' }, description: { type: 'string' }, amount: { type: 'number' }, isActive: { type: 'integer', enum: [0, 1] } },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
        delete: {
            tags: ['Penalty Templates'],
            summary: 'Delete penalty template (admin)',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Deleted', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },

    /* ============ Timesheets ============ */
    '/api/timesheets/daily': {
        get: {
            tags: ['Timesheets'],
            summary: 'Get daily timesheet with attendance',
            description: 'Employees see own; admins see all. Returns lock status.',
            security: sec,
            parameters: [
                { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
                ...pageParams,
                { name: 'search', in: 'query', schema: { type: 'string' } },
            ],
            responses: { 200: jsonRes('Daily timesheet', { type: 'object' }), 401: err401 },
        },
    },
    '/api/timesheets': {
        get: {
            tags: ['Timesheets'],
            summary: 'List monthly timesheets',
            security: sec,
            parameters: [
                { name: 'month', in: 'query', schema: { type: 'string', example: '2025-01' } },
                ...pageParams,
            ],
            responses: { 200: jsonRes('Monthly timesheets', { type: 'object' }), 401: err401 },
        },
    },
    '/api/timesheets/generate': {
        post: {
            tags: ['Timesheets'],
            summary: 'Generate/recalculate monthly timesheets (admin)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['month'],
                properties: { month: { type: 'string', example: '2025-01' } },
            }),
            responses: { 200: jsonRes('Generation result', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/timesheets/lock-day': {
        post: {
            tags: ['Timesheets'],
            summary: 'Lock daily timesheet (admin)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['date'],
                properties: { date: { type: 'string', format: 'date' } },
            }),
            responses: { 200: jsonRes('Locked', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/timesheets/unlock-day': {
        post: {
            tags: ['Timesheets'],
            summary: 'Unlock daily timesheet (admin)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['date'],
                properties: { date: { type: 'string', format: 'date' } },
            }),
            responses: { 200: jsonRes('Unlocked', { type: 'object' }), 401: err401, 403: err403 },
        },
    },

    /* ============ Salary – Rules ============ */
    '/api/salary/rules': {
        get: {
            tags: ['Salary – Rules'],
            summary: 'List all payroll rules',
            security: sec,
            responses: { 200: jsonRes('Rules', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
        post: {
            tags: ['Salary – Rules'],
            summary: 'Create payroll rule (salary role)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['rule_type', 'name', 'config'],
                properties: {
                    rule_type: { type: 'string', enum: ['late_policy', 'min_hours_policy', 'repeat_late_policy'] },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    config: { type: 'object', description: 'Rule-type-specific configuration' },
                    priority: { type: 'integer' },
                    is_active: { type: 'integer', enum: [0, 1] },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/salary/rules/{id}': {
        put: {
            tags: ['Salary – Rules'],
            summary: 'Update payroll rule',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                properties: { name: { type: 'string' }, description: { type: 'string' }, config: { type: 'object' }, priority: { type: 'integer' }, is_active: { type: 'integer', enum: [0, 1] } },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
        delete: {
            tags: ['Salary – Rules'],
            summary: 'Delete payroll rule',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Deleted', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },

    /* ============ Salary – Deduction Items ============ */
    '/api/salary/deduction-items': {
        get: {
            tags: ['Salary – Deductions'],
            summary: 'List all deduction items (tax, insurance, etc.)',
            security: sec,
            responses: { 200: jsonRes('Deduction items', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
        post: {
            tags: ['Salary – Deductions'],
            summary: 'Create deduction item (salary role)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['name', 'type', 'calc_type'],
                properties: {
                    name: { type: 'string', example: 'BHXH' },
                    type: { type: 'string', enum: ['tax', 'insurance', 'union', 'other'] },
                    calc_type: { type: 'string', enum: ['fixed', 'percent_gross', 'percent_base'] },
                    amount: { type: 'number' },
                    rate: { type: 'number', description: 'Percentage (0-100)' },
                    description: { type: 'string' },
                    priority: { type: 'integer' },
                    is_active: { type: 'integer', enum: [0, 1] },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/salary/deduction-items/{id}': {
        put: {
            tags: ['Salary – Deductions'],
            summary: 'Update deduction item',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                properties: { name: { type: 'string' }, type: { type: 'string' }, calc_type: { type: 'string' }, amount: { type: 'number' }, rate: { type: 'number' }, description: { type: 'string' }, priority: { type: 'integer' }, is_active: { type: 'integer', enum: [0, 1] } },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
        delete: {
            tags: ['Salary – Deductions'],
            summary: 'Delete deduction item',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Deleted', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },

    /* ============ Salary – Variables ============ */
    '/api/salary/variables': {
        get: {
            tags: ['Salary – Variables'],
            summary: 'List custom formula variables',
            security: sec,
            responses: { 200: jsonRes('Variables', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
        post: {
            tags: ['Salary – Variables'],
            summary: 'Create custom variable (id must start with custom_)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['id', 'label', 'value'],
                properties: {
                    id: { type: 'string', example: 'custom_bonus' },
                    label: { type: 'string' },
                    value: { type: 'number' },
                    description: { type: 'string' },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/salary/variables/{id}': {
        put: {
            tags: ['Salary – Variables'],
            summary: 'Update custom variable',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            requestBody: jsonBody({
                type: 'object',
                properties: { label: { type: 'string' }, value: { type: 'number' }, description: { type: 'string' } },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
        delete: {
            tags: ['Salary – Variables'],
            summary: 'Delete custom variable',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { 200: jsonRes('Deleted', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },

    /* ============ Salary – Presets ============ */
    '/api/salary/presets': {
        get: {
            tags: ['Salary – Presets'],
            summary: 'List salary presets with employee usage counts',
            security: sec,
            responses: { 200: jsonRes('Presets', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
        post: {
            tags: ['Salary – Presets'],
            summary: 'Create salary preset template (salary role)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['name', 'baseSalary'],
                properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    baseSalary: { type: 'number' },
                    formulaType: { type: 'string', enum: ['standard', 'custom'] },
                    customFormula: { type: 'string' },
                    allowances: { type: 'object' },
                    isDefault: { type: 'integer', enum: [0, 1] },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/salary/presets/{id}': {
        put: {
            tags: ['Salary – Presets'],
            summary: 'Update salary preset',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                properties: { name: { type: 'string' }, description: { type: 'string' }, baseSalary: { type: 'number' }, formulaType: { type: 'string' }, customFormula: { type: 'string' }, allowances: { type: 'object' }, isDefault: { type: 'integer', enum: [0, 1] } },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
        delete: {
            tags: ['Salary – Presets'],
            summary: 'Delete salary preset',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Deleted', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },

    /* ============ Salary – Assignments ============ */
    '/api/salary/assignments': {
        get: {
            tags: ['Salary – Assignments'],
            summary: 'List employee-to-preset assignments',
            security: sec,
            responses: { 200: jsonRes('Assignments', { type: 'array', items: { type: 'object' } }), 401: err401, 403: err403 },
        },
        post: {
            tags: ['Salary – Assignments'],
            summary: 'Assign or reassign employee to salary preset',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['employeeId', 'presetId'],
                properties: {
                    employeeId: { type: 'integer' },
                    presetId: { type: 'integer' },
                },
            }),
            responses: { 200: jsonRes('Assigned', { type: 'object' }), 401: err401, 403: err403 },
        },
    },

    /* ============ Salary – Permissions ============ */
    '/api/salary/search-users': {
        get: {
            tags: ['Salary – Permissions'],
            summary: 'Search users for salary role assignment (admin)',
            security: sec,
            parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
            responses: { 200: jsonRes('User list', { type: 'array', items: { type: 'object' } }), 401: err401, 403: err403 },
        },
    },
    '/api/salary/permissions': {
        get: {
            tags: ['Salary – Permissions'],
            summary: 'List users with salary_manager role (admin)',
            security: sec,
            responses: { 200: jsonRes('Permission list', { type: 'array', items: { type: 'object' } }), 401: err401, 403: err403 },
        },
        post: {
            tags: ['Salary – Permissions'],
            summary: 'Grant salary_manager role (admin)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['userId'],
                properties: { userId: { type: 'integer' } },
            }),
            responses: { 200: jsonRes('Granted', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/salary/permissions/{userId}': {
        delete: {
            tags: ['Salary – Permissions'],
            summary: 'Revoke salary_manager role (admin)',
            security: sec,
            parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Revoked', { type: 'object' }), 401: err401, 403: err403 },
        },
    },

    /* ============ Salary – Coefficients ============ */
    '/api/salary/coefficients': {
        get: {
            tags: ['Salary – Coefficients'],
            summary: 'Get salary multipliers (OT, night, weekend, holiday, dedication)',
            security: sec,
            responses: { 200: jsonRes('Coefficients', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
    },
    '/api/salary/coefficients/{type}': {
        put: {
            tags: ['Salary – Coefficients'],
            summary: 'Update coefficient multiplier (salary role)',
            security: sec,
            parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string', enum: ['overtime', 'night_shift', 'weekend', 'holiday', 'dedication'] } }],
            requestBody: jsonBody({
                type: 'object',
                properties: { multiplier: { type: 'number' }, description: { type: 'string' } },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403 },
        },
        delete: {
            tags: ['Salary – Coefficients'],
            summary: 'Remove coefficient type (salary role)',
            security: sec,
            parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { 200: jsonRes('Deleted', { type: 'object' }), 401: err401, 403: err403 },
        },
    },

    /* ============ Salary – Records & Calculate ============ */
    '/api/salary/records': {
        get: {
            tags: ['Salary – Records'],
            summary: 'List salary records with summary stats',
            description: 'Employees see own; salary roles see filtered data.',
            security: sec,
            parameters: [
                ...pageParams,
                { name: 'month', in: 'query', schema: { type: 'string', example: '2025-01' } },
                { name: 'search', in: 'query', schema: { type: 'string' } },
                { name: 'department', in: 'query', schema: { type: 'integer' } },
                { name: 'preset', in: 'query', schema: { type: 'integer' } },
                { name: 'sortBy', in: 'query', schema: { type: 'string' } },
                { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
            ],
            responses: { 200: jsonRes('Paginated salary records', { type: 'object' }), 401: err401 },
        },
    },
    '/api/salary/calculate': {
        post: {
            tags: ['Salary – Records'],
            summary: 'Calculate/recalculate salary for all employees (salary role)',
            description: 'Uses 4-phase engine: Earnings → Rules → Deductions → Net. Batch-optimised.',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['month'],
                properties: { month: { type: 'string', example: '2025-01' } },
            }),
            responses: { 200: jsonRes('Calculation result with summary', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/salary/records/{id}': {
        put: {
            tags: ['Salary – Records'],
            summary: 'Update manual salary adjustments (salary role)',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                properties: {
                    insuranceAmount: { type: 'number' },
                    healthInsuranceAmount: { type: 'number' },
                    allowancesDetail: { type: 'object' },
                    deductionsDetail: { type: 'object' },
                    dedicationAmount: { type: 'number' },
                },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },
    '/api/salary/records/{id}/adjust-ot': {
        put: {
            tags: ['Salary – Records'],
            summary: 'Adjust OT/holiday hours for salary record',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                properties: {
                    otHoursOverride: { type: 'number' },
                    holidayHoursOverride: { type: 'number' },
                    otBonusDesc: { type: 'string' },
                    note: { type: 'string' },
                },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },
    '/api/salary/lock-month': {
        post: {
            tags: ['Salary – Records'],
            summary: 'Lock salary records for a month (salary role)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['month'],
                properties: { month: { type: 'string', example: '2025-01' } },
            }),
            responses: { 200: jsonRes('Locked', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/salary/unlock-month': {
        post: {
            tags: ['Salary – Records'],
            summary: 'Unlock salary records for a month (salary role)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['month'],
                properties: { month: { type: 'string', example: '2025-01' } },
            }),
            responses: { 200: jsonRes('Unlocked', { type: 'object' }), 401: err401, 403: err403 },
        },
    },

    /* ============ Salary – Attendance Scores ============ */
    '/api/salary/attendance-scores': {
        get: {
            tags: ['Salary – Attendance Scores'],
            summary: 'Monthly attendance scores with ranking (S-D)',
            security: sec,
            parameters: [
                { name: 'month', in: 'query', schema: { type: 'string', example: '2025-01' } },
                ...pageParams,
                { name: 'search', in: 'query', schema: { type: 'string' } },
                { name: 'dept', in: 'query', schema: { type: 'integer' } },
                { name: 'rank', in: 'query', schema: { type: 'string', enum: ['S', 'A', 'B', 'C', 'D'] } },
                { name: 'sortBy', in: 'query', schema: { type: 'string' } },
                { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
            ],
            responses: { 200: jsonRes('Attendance scores', { type: 'object' }), 401: err401, 403: err403 },
        },
    },

    /* ============ Salary – Table Config ============ */
    '/api/salary/table-config': {
        get: {
            tags: ['Salary – Table Config'],
            summary: 'Get user\'s saved table column configuration',
            security: sec,
            responses: { 200: jsonRes('Column config', { type: 'object' }), 401: err401 },
        },
        put: {
            tags: ['Salary – Table Config'],
            summary: 'Save table column configuration',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['columns'],
                properties: { columns: { type: 'array', items: { type: 'object' } } },
            }),
            responses: { 200: jsonRes('Saved', { type: 'object' }), 401: err401 },
        },
    },

    /* ============ Holidays ============ */
    '/api/holidays': {
        get: {
            tags: ['Holidays'],
            summary: 'List all holidays',
            security: sec,
            responses: { 200: jsonRes('Holiday list', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
        post: {
            tags: ['Holidays'],
            summary: 'Create holiday (admin)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['name', 'date'],
                properties: {
                    name: { type: 'string' },
                    date: { type: 'string', format: 'date' },
                    type: { type: 'string' },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/holidays/{id}': {
        delete: {
            tags: ['Holidays'],
            summary: 'Delete holiday (admin)',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Deleted', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },

    /* ============ Locations (GPS) ============ */
    '/api/locations': {
        get: {
            tags: ['Locations'],
            summary: 'List company locations (GPS check-in fences)',
            security: sec,
            responses: { 200: jsonRes('Location list', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
        post: {
            tags: ['Locations'],
            summary: 'Create location / GPS fence (admin)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['name', 'latitude', 'longitude', 'radius'],
                properties: {
                    name: { type: 'string' },
                    address: { type: 'string' },
                    latitude: { type: 'number', example: 10.762622 },
                    longitude: { type: 'number', example: 106.660172 },
                    radius: { type: 'number', description: 'Radius in meters', example: 200 },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/locations/{id}': {
        put: {
            tags: ['Locations'],
            summary: 'Update location (admin)',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                properties: { name: { type: 'string' }, address: { type: 'string' }, latitude: { type: 'number' }, longitude: { type: 'number' }, radius: { type: 'number' } },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
        delete: {
            tags: ['Locations'],
            summary: 'Delete location (admin)',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Deleted', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },
    '/api/locations/check-range': {
        post: {
            tags: ['Locations'],
            summary: 'Check if GPS coordinates are within range of any location',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['latitude', 'longitude'],
                properties: {
                    latitude: { type: 'number' },
                    longitude: { type: 'number' },
                },
            }),
            responses: { 200: jsonRes('Range check result', { type: 'object', properties: { inRange: { type: 'boolean' }, location: { type: 'object' } } }), 401: err401 },
        },
    },

    /* ============ Audit Logs ============ */
    '/api/audit-logs': {
        get: {
            tags: ['Audit Logs'],
            summary: 'List system audit logs (admin)',
            security: sec,
            parameters: [
                ...pageParams,
                { name: 'action', in: 'query', schema: { type: 'string' } },
                { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
                { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
                { name: 'performedBy', in: 'query', schema: { type: 'string' } },
            ],
            responses: { 200: jsonRes('Audit log list', { type: 'object' }), 401: err401, 403: err403 },
        },
    },

    /* ============ Time Corrections ============ */
    '/api/time-corrections': {
        get: {
            tags: ['Time Corrections'],
            summary: 'List time correction requests',
            description: 'Employees see own; admins see all.',
            security: sec,
            parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] } }],
            responses: { 200: jsonRes('Correction list', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
        post: {
            tags: ['Time Corrections'],
            summary: 'Request time correction for check-in/check-out',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['attendanceId', 'employeeId', 'date', 'field', 'newValue', 'reason'],
                properties: {
                    attendanceId: { type: 'integer' },
                    employeeId: { type: 'integer' },
                    employeeName: { type: 'string' },
                    date: { type: 'string', format: 'date' },
                    field: { type: 'string', enum: ['checkIn', 'checkOut'] },
                    oldValue: { type: 'string' },
                    newValue: { type: 'string' },
                    reason: { type: 'string' },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 500: err500 },
        },
    },
    '/api/time-corrections/{id}': {
        put: {
            tags: ['Time Corrections'],
            summary: 'Approve/reject time correction (admin)',
            description: 'If approved, updates attendance record automatically.',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                required: ['status'],
                properties: { status: { type: 'string', enum: ['approved', 'rejected'] } },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },

    /* ============ Export Payroll ============ */
    '/api/export-payroll': {
        get: {
            tags: ['Export'],
            summary: 'Export salary data to Excel',
            description: 'Uses template if templateId provided.',
            security: sec,
            parameters: [
                { name: 'month', in: 'query', required: true, schema: { type: 'string', example: '2025-01' } },
                { name: 'templateId', in: 'query', schema: { type: 'integer' } },
            ],
            responses: {
                200: { description: 'Excel file download', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } } },
                401: err401, 403: err403,
            },
        },
    },
    '/api/export-payroll/fields': {
        get: {
            tags: ['Export'],
            summary: 'List available fields for export template builder',
            security: sec,
            responses: { 200: jsonRes('Field list', { type: 'array', items: { type: 'object' } }), 401: err401, 403: err403 },
        },
    },

    /* ============ Export Templates ============ */
    '/api/export-templates': {
        get: {
            tags: ['Export Templates'],
            summary: 'List all export templates',
            security: sec,
            responses: { 200: jsonRes('Template list', { type: 'array', items: { type: 'object' } }), 401: err401 },
        },
        post: {
            tags: ['Export Templates'],
            summary: 'Create export template (admin/salary role)',
            security: sec,
            requestBody: jsonBody({
                type: 'object',
                required: ['name', 'columnConfig'],
                properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    columnConfig: { type: 'array', items: { type: 'object' } },
                },
            }),
            responses: { 201: jsonRes('Created', { type: 'object' }), 401: err401, 403: err403 },
        },
    },
    '/api/export-templates/{id}': {
        get: {
            tags: ['Export Templates'],
            summary: 'Get single export template details',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Template details', { type: 'object' }), 401: err401, 404: err404 },
        },
        put: {
            tags: ['Export Templates'],
            summary: 'Update export template',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: jsonBody({
                type: 'object',
                properties: { name: { type: 'string' }, description: { type: 'string' }, columnConfig: { type: 'array', items: { type: 'object' } } },
            }),
            responses: { 200: jsonRes('Updated', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
        delete: {
            tags: ['Export Templates'],
            summary: 'Delete export template (cannot delete default)',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Deleted', { type: 'object' }), 400: { description: 'Cannot delete default template' }, 401: err401, 403: err403, 404: err404 },
        },
    },
    '/api/export-templates/{id}/set-default': {
        put: {
            tags: ['Export Templates'],
            summary: 'Set template as default for payroll exports',
            security: sec,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: jsonRes('Set as default', { type: 'object' }), 401: err401, 403: err403, 404: err404 },
        },
    },
};

/* ------------------------------------------------------------------ */
/*  OpenAPI spec                                                      */
/* ------------------------------------------------------------------ */
const options = {
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'HRM Attendance API',
            version: '1.0.0',
            description: 'Full API documentation for HRM attendance & payroll system.',
        },
        servers: [
            { url: serverUrl, description: 'Production API' },
        ],
        tags: [
            { name: 'System', description: 'Health & system endpoints' },
            { name: 'Auth', description: 'Authentication & user profile' },
            { name: 'Employees', description: 'Employee CRUD & face recognition' },
            { name: 'Departments', description: 'Department management' },
            { name: 'Shifts', description: 'Shift templates' },
            { name: 'Shift Assignments', description: 'Assign shifts to employees' },
            { name: 'Shift Swaps', description: 'Shift swap requests' },
            { name: 'Attendance', description: 'Check-in / check-out & attendance records' },
            { name: 'Overtime', description: 'Overtime requests & approval' },
            { name: 'Leave', description: 'Leave requests & approval' },
            { name: 'Penalties', description: 'Penalty management' },
            { name: 'Penalty Templates', description: 'Penalty template configuration' },
            { name: 'Timesheets', description: 'Daily & monthly timesheets' },
            { name: 'Salary – Rules', description: 'Payroll rules (late, min hours, repeat late)' },
            { name: 'Salary – Deductions', description: 'Tax, insurance & other deduction items' },
            { name: 'Salary – Variables', description: 'Custom formula variables' },
            { name: 'Salary – Presets', description: 'Salary preset templates' },
            { name: 'Salary – Assignments', description: 'Employee-to-preset assignment' },
            { name: 'Salary – Permissions', description: 'Salary manager role management' },
            { name: 'Salary – Coefficients', description: 'Salary multiplier coefficients' },
            { name: 'Salary – Records', description: 'Salary records, calculation & lock' },
            { name: 'Salary – Attendance Scores', description: 'Monthly attendance score ranking' },
            { name: 'Salary – Table Config', description: 'Salary table column config per user' },
            { name: 'Holidays', description: 'Holiday calendar management' },
            { name: 'Locations', description: 'GPS location fences for check-in' },
            { name: 'Audit Logs', description: 'System audit trail' },
            { name: 'Time Corrections', description: 'Time correction requests' },
            { name: 'Export', description: 'Payroll export to Excel' },
            { name: 'Export Templates', description: 'Export column templates' },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        error: { type: 'string', example: 'Loi server' },
                    },
                },
                LoginRequest: {
                    type: 'object',
                    required: ['username', 'password'],
                    properties: {
                        username: { type: 'string', example: 'admin' },
                        password: { type: 'string', example: 'your_password' },
                    },
                },
            },
        },
        paths,
    },
    apis: [],
};

module.exports = swaggerJSDoc(options);
