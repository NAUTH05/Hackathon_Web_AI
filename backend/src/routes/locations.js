const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, adminOnly } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, haversineDistance } = require('../helpers');

// GET /api/locations
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM company_locations ORDER BY name');
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get locations error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/locations
router.post('/', authenticate, adminOnly, async (req, res) => {
  try {
    const { name, address, latitude, longitude, radius } = req.body;
    const id = req.body.id || uuidv4();

    await pool.execute(
      `INSERT INTO company_locations (id, name, address, latitude, longitude, radius)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, address || null, latitude, longitude, radius || 200]
    );
    const [rows] = await pool.execute('SELECT * FROM company_locations WHERE id = ?', [id]);

    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Create location error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/locations/:id
router.put('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { name, address, latitude, longitude, radius } = req.body;

    await pool.execute(
      `UPDATE company_locations SET
        name = COALESCE(?, name),
        address = COALESCE(?, address),
        latitude = COALESCE(?, latitude),
        longitude = COALESCE(?, longitude),
        radius = COALESCE(?, radius)
       WHERE id = ?`,
      [name, address, latitude, longitude, radius, req.params.id]
    );
    const [rows] = await pool.execute('SELECT * FROM company_locations WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy vị trí' });
    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Update location error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/locations/:id
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM company_locations WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy vị trí' });
    await pool.execute('DELETE FROM company_locations WHERE id = ?', [req.params.id]);
    res.json({ message: 'Đã xóa vị trí' });
  } catch (err) {
    console.error('Delete location error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/locations/check-range — check if GPS coordinates are within range
router.post('/check-range', authenticate, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Thiếu toạ độ GPS' });
    }

    const [rows] = await pool.execute('SELECT * FROM company_locations');
    const results = rows.map(loc => {
      const distance = haversineDistance(latitude, longitude, parseFloat(loc.latitude), parseFloat(loc.longitude));
      return {
        ...toCamelCase(loc),
        distance: Math.round(distance),
        inRange: distance <= loc.radius,
      };
    });

    const match = results.find(r => r.inRange);
    if (match) {
      res.json({ inRange: true, location: match, distance: match.distance, locations: results });
    } else {
      res.json({ inRange: false, locations: results });
    }
  } catch (err) {
    console.error('Check range error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
