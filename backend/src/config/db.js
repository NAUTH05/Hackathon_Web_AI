const mysql = require('mysql2/promise');

const dbPort = parseInt(process.env.DB_PORT || '3306', 10);
const connectionLimit = parseInt(process.env.DB_POOL_CONNECTION_LIMIT || '50', 10);
const queueLimit = parseInt(process.env.DB_POOL_QUEUE_LIMIT || '0', 10);

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number.isNaN(dbPort) ? 3306 : dbPort,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number.isNaN(connectionLimit) ? 50 : connectionLimit,
  queueLimit: Number.isNaN(queueLimit) ? 0 : queueLimit,
  dateStrings: true,
  decimalNumbers: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

module.exports = pool;
