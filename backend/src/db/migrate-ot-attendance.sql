-- Migration: Add OT check-in support to attendance_records
-- Run this once to add ot_request_id and overtime_hours columns

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS ot_request_id VARCHAR(50) NULL DEFAULT NULL AFTER note,
  ADD COLUMN IF NOT EXISTS overtime_hours DECIMAL(5,2) DEFAULT 0 AFTER working_hours;

-- Add 'ot' status to the ENUM
ALTER TABLE attendance_records
  MODIFY COLUMN status ENUM('on-time','late','early-leave','absent','pending','ot') NULL;

-- Index for looking up OT records by request
CREATE INDEX IF NOT EXISTS idx_attendance_ot_request ON attendance_records(ot_request_id);
