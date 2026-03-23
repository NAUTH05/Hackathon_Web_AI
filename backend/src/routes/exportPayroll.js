const router = require('express').Router();
const pool = require('../config/db');
const { authenticate, adminOrSalaryRole } = require('../middleware/auth');

// All available fields for export
const AVAILABLE_FIELDS = {
  stt:               { dbField: null, label: 'STT', format: 'number' },
  employee_code:     { dbField: 'e.employee_code', label: 'Mã NV', format: 'text' },
  employee_name:     { dbField: 'sr.employee_name', label: 'Họ tên', format: 'text' },
  department:        { dbField: 'd.name', label: 'Phòng ban', format: 'text' },
  position:          { dbField: 'e.position', label: 'Chức vụ', format: 'text' },
  base_salary:       { dbField: 'sr.base_salary', label: 'Lương CB', format: 'currency' },
  total_work_days:   { dbField: 'sr.total_work_days', label: 'Tổng ngày công', format: 'number' },
  present_days:      { dbField: 'sr.present_days', label: 'Ngày đi làm', format: 'number' },
  ot_hours:          { dbField: 'sr.ot_hours', label: 'Giờ OT', format: 'number' },
  ot_pay:            { dbField: 'sr.ot_pay', label: 'Tiền OT', format: 'currency' },
  night_shift_pay:   { dbField: 'sr.night_shift_pay', label: 'Tiền ca đêm', format: 'currency' },
  holiday_pay:       { dbField: 'sr.holiday_pay', label: 'Tiền lễ', format: 'currency' },
  allowances:        { dbField: 'sr.allowances', label: 'Phụ cấp', format: 'currency' },
  insurance:         { dbField: 'sr.insurance', label: 'BHXH', format: 'currency' },
  health_insurance:  { dbField: 'sr.health_insurance', label: 'BHYT', format: 'currency' },
  deductions:        { dbField: 'sr.deductions', label: 'Khấu trừ', format: 'currency' },
  dedication:        { dbField: 'sr.dedication', label: 'Chuyên cần', format: 'currency' },
  late_penalty:      { dbField: 'sr.late_penalty', label: 'Phạt trễ', format: 'currency' },
  gross_salary:      { dbField: 'sr.gross_salary', label: 'Lương gross', format: 'currency' },
  net_salary:        { dbField: 'sr.net_salary', label: 'Lương ròng', format: 'currency' },
  preset_name:       { dbField: 'sr.preset_name', label: 'Mẫu lương', format: 'text' },
};

// Default columns when no template is specified
const DEFAULT_COLUMNS = [
  { field: 'stt', header: 'STT', width: 6, format: 'number' },
  { field: 'employee_code', header: 'Mã NV', width: 14, format: 'text' },
  { field: 'employee_name', header: 'Họ tên', width: 28, format: 'text' },
  { field: 'department', header: 'Phòng ban', width: 20, format: 'text' },
  { field: 'position', header: 'Chức vụ', width: 18, format: 'text' },
  { field: 'base_salary', header: 'Lương CB', width: 16, format: 'currency' },
  { field: 'present_days', header: 'Ngày công', width: 12, format: 'number' },
  { field: 'total_work_days', header: 'Tổng ngày', width: 12, format: 'number' },
  { field: 'ot_hours', header: 'OT (giờ)', width: 12, format: 'number' },
  { field: 'allowances', header: 'Phụ cấp', width: 16, format: 'currency' },
  { field: 'deductions', header: 'Khấu trừ', width: 16, format: 'currency' },
  { field: 'net_salary', header: 'Lương ròng', width: 18, format: 'currency' },
];

// GET /api/export-payroll?month=YYYY-MM&templateId=xxx
router.get('/', authenticate, adminOrSalaryRole, async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const month = req.query.month;
    if (!month) return res.status(400).json({ error: 'Thiếu tháng (month)' });

    // Load template columns
    let columns = DEFAULT_COLUMNS;
    if (req.query.templateId) {
      const [tplRows] = await pool.execute('SELECT column_config FROM export_templates WHERE id = ?', [req.query.templateId]);
      if (tplRows.length > 0) {
        try {
          const config = typeof tplRows[0].column_config === 'string'
            ? JSON.parse(tplRows[0].column_config)
            : tplRows[0].column_config;
          if (config.columns && config.columns.length > 0) {
            columns = config.columns;
          }
        } catch (e) {
          console.warn('Invalid template config, using default');
        }
      }
    }

    // Query all salary records for the month
    const [rows] = await pool.execute(
      `SELECT sr.*, e.employee_code, d.name AS department, e.position
       FROM salary_records sr
       JOIN employees e ON sr.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE sr.month = ?
       ORDER BY e.name`,
      [month]
    );

    // Use streaming workbook for 100K+ support
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=bang-luong-${month}.xlsx`);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    workbook.creator = 'Hệ thống chấm công';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Bảng lương');

    // Set column widths
    worksheet.columns = columns.map(col => ({ width: col.width || 15 }));

    // Title row
    const titleRow = worksheet.addRow([`BẢNG LƯƠNG THÁNG ${month}`]);
    titleRow.getCell(1).font = { size: 16, bold: true, color: { argb: 'FF1a56db' } };
    titleRow.getCell(1).alignment = { horizontal: 'center' };

    // Subtitle row
    const subRow = worksheet.addRow([`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`]);
    subRow.getCell(1).font = { size: 10, italic: true, color: { argb: 'FF666666' } };
    subRow.getCell(1).alignment = { horizontal: 'center' };

    // Header row
    const headerValues = columns.map(col => col.header);
    const headerRow = worksheet.addRow(headerValues);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a56db' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
    });

    // Data rows
    const totals = {};
    columns.forEach(col => {
      if (col.format === 'currency') totals[col.field] = 0;
    });

    rows.forEach((row, index) => {
      const values = columns.map(col => {
        if (col.field === 'stt') return index + 1;
        const val = row[col.field] !== undefined ? row[col.field] : '';
        const numVal = Number(val) || 0;
        if (col.format === 'currency') {
          totals[col.field] = (totals[col.field] || 0) + numVal;
          return numVal;
        }
        if (col.format === 'number') return numVal;
        return val || '';
      });

      const dataRow = worksheet.addRow(values);
      dataRow.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        };
        const colFmt = columns[colNumber - 1]?.format;
        if (colFmt === 'currency')      cell.numFmt = '#,##0';
        else if (colFmt === 'number')    cell.numFmt = '0';
        else if (colFmt === 'decimal')   cell.numFmt = '#,##0.00';
        else if (colFmt === 'percent')   cell.numFmt = '0.00%';
        else if (colFmt === 'date')      cell.numFmt = 'dd/mm/yyyy';
        // 'text' and 'General' → no numFmt (default)
        if (index % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        }
      });
    });

    // Total row
    const totalValues = columns.map(col => {
      if (col.field === 'employee_name') return `TỔNG CỘNG (${rows.length} NV)`;
      if (col.format === 'currency') return totals[col.field] || 0;
      return '';
    });
    const totalRow = worksheet.addRow(totalValues);
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
      cell.border = {
        top: { style: 'medium' }, bottom: { style: 'medium' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
      if (columns[colNumber - 1] && columns[colNumber - 1].format === 'currency') {
        cell.numFmt = '#,##0';
        cell.font = { bold: true, size: 12, color: { argb: 'FF1B5E20' } };
      }
    });

    // Commit streaming workbook
    await workbook.commit();
  } catch (err) {
    console.error('Export payroll error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Lỗi xuất file' });
    }
  }
});

// GET /api/export-payroll/fields — list available fields for template builder
router.get('/fields', authenticate, (req, res) => {
  const fields = Object.entries(AVAILABLE_FIELDS).map(([key, val]) => ({
    field: key,
    label: val.label,
    format: val.format,
  }));
  res.json(fields);
});

module.exports = router;
