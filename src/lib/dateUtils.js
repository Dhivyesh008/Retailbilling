/**
 * src/lib/dateUtils.js
 *
 * Robust date parsing and comparison utilities for local time.
 */

/**
 * Parse any timestamp (ISO string, UTC string from Supabase without Z, number, or Date)
 * into a proper JavaScript Date in local time.
 *
 * Supabase returns UTC timestamps without a timezone suffix (e.g. '2026-09-22T21:29:42.025411').
 * Without 'Z', standard JS parses this as local time, shifting UTC times into the past!
 * Appending 'Z' ensures it is correctly interpreted as UTC and converted to the user's local time.
 *
 * @param {string|number|Date} ts
 * @returns {Date}
 */
export function parseTimestamp(ts) {
  if (!ts) return new Date();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'number') return new Date(ts);
  let str = String(ts).trim();
  if (!str) return new Date();

  // If string has date & time but no 'Z' or timezone offset (+HH:MM / -HH:MM),
  // Supabase UTC timestamp without timezone needs 'Z' appended to be parsed as UTC
  if (str.includes('T') && !str.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(str)) {
    str += 'Z';
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Returns true if the timestamp falls on the same calendar day (in local time) as today.
 *
 * @param {string|number|Date} ts
 * @returns {boolean}
 */
export function isToday(ts) {
  const d = parseTimestamp(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Start of today in local time (00:00:00.000)
 *
 * @returns {Date}
 */
export function getTodayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
