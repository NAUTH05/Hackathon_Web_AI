const swaggerJSDoc = require('swagger-jsdoc');

const serverUrl = process.env.SWAGGER_SERVER_URL || 'https://api-hrm.fitlhu.com';

const options = {
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'HRM Attendance API',
            version: '1.0.0',
            description: 'Public API documentation for HRM attendance system.',
        },
        servers: [
            {
                url: serverUrl,
                description: 'Production API',
            },
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
        paths: {
            '/api/health': {
                get: {
                    tags: ['System'],
                    summary: 'Health check',
                    responses: {
                        200: {
                            description: 'Service healthy',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            status: { type: 'string', example: 'ok' },
                                            uptimeSeconds: { type: 'integer', example: 120 },
                                            timestamp: { type: 'string', format: 'date-time' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/auth/login': {
                post: {
                    tags: ['Auth'],
                    summary: 'Login and get JWT token',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/LoginRequest' },
                            },
                        },
                    },
                    responses: {
                        200: {
                            description: 'Login success',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            token: { type: 'string' },
                                            user: { type: 'object' },
                                        },
                                    },
                                },
                            },
                        },
                        401: {
                            description: 'Invalid credentials',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ErrorResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/api/auth/me': {
                get: {
                    tags: ['Auth'],
                    summary: 'Get current user by token',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: {
                            description: 'Current user profile',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        additionalProperties: true,
                                    },
                                },
                            },
                        },
                        401: {
                            description: 'Unauthorized',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ErrorResponse' },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    apis: [],
};

module.exports = swaggerJSDoc(options);
