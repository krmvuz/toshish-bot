import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env["DB_PATH"] || path.resolve(__dirname, "../../bot_data.db");

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    telegram_id INTEGER PRIMARY KEY NOT NULL,
    active_role TEXT CHECK(active_role IN ('employer', 'worker')),
    registered_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS employers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL REFERENCES profiles(telegram_id),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    company_name TEXT NOT NULL,
    registered_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS workers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL REFERENCES profiles(telegram_id),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    age INTEGER NOT NULL,
    categories TEXT NOT NULL,
    districts TEXT NOT NULL,
    registered_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employer_id INTEGER NOT NULL REFERENCES employers(id),
    category TEXT NOT NULL,
    district TEXT NOT NULL,
    salary TEXT NOT NULL,
    work_type TEXT NOT NULL,
    age_min INTEGER NOT NULL,
    age_max INTEGER NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'expired', 'rejected')),
    payment_file_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at INTEGER
  );
`);

export interface Profile {
  telegram_id: number;
  active_role: "employer" | "worker" | null;
  registered_at: number;
}

export interface Employer {
  id: number;
  telegram_id: number;
  name: string;
  phone: string;
  company_name: string;
  registered_at: number;
}

export interface Worker {
  id: number;
  telegram_id: number;
  name: string;
  phone: string;
  age: number;
  categories: string;
  districts: string;
  registered_at: number;
}

export interface Job {
  id: number;
  employer_id: number;
  category: string;
  district: string;
  salary: string;
  work_type: string;
  age_min: number;
  age_max: number;
  description: string;
  status: "pending" | "active" | "expired" | "rejected";
  payment_file_id: string | null;
  created_at: number;
  expires_at: number | null;
}

export const queries = {
  // ─── Profiles ──────────────────────────────────────────────────────────────
  getProfile: db.prepare<[number], Profile>(
    "SELECT * FROM profiles WHERE telegram_id = ?"
  ),
  upsertProfile: db.prepare<[number], void>(
    "INSERT INTO profiles (telegram_id) VALUES (?) ON CONFLICT(telegram_id) DO NOTHING"
  ),
  setActiveRole: db.prepare<[string, number], void>(
    "UPDATE profiles SET active_role = ? WHERE telegram_id = ?"
  ),

  // ─── Employers ─────────────────────────────────────────────────────────────
  getEmployerByTelegramId: db.prepare<[number], Employer>(
    "SELECT * FROM employers WHERE telegram_id = ?"
  ),
  createEmployer: db.prepare<[number, string, string, string], { lastInsertRowid: bigint }>(
    "INSERT INTO employers (telegram_id, name, phone, company_name) VALUES (?, ?, ?, ?)"
  ),

  // ─── Workers ───────────────────────────────────────────────────────────────
  getWorkerByTelegramId: db.prepare<[number], Worker>(
    "SELECT * FROM workers WHERE telegram_id = ?"
  ),
  createWorker: db.prepare<[number, string, string, number, string, string], { lastInsertRowid: bigint }>(
    "INSERT INTO workers (telegram_id, name, phone, age, categories, districts) VALUES (?, ?, ?, ?, ?, ?)"
  ),

  // ─── Jobs ──────────────────────────────────────────────────────────────────
  createJob: db.prepare<[number, string, string, string, string, number, number, string], { lastInsertRowid: bigint }>(
    `INSERT INTO jobs (employer_id, category, district, salary, work_type, age_min, age_max, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  setJobPaymentScreenshot: db.prepare<[string, number], void>(
    "UPDATE jobs SET payment_file_id = ? WHERE id = ?"
  ),
  activateJob: db.prepare<[number, number], void>(
    `UPDATE jobs SET status = 'active', expires_at = unixepoch() + (? * 86400) WHERE id = ?`
  ),
  rejectJob: db.prepare<[number], void>(
    "UPDATE jobs SET status = 'rejected' WHERE id = ?"
  ),
  deleteJob: db.prepare<[number], void>(
    "DELETE FROM jobs WHERE id = ?"
  ),
  expireOldJobs: db.prepare<[], void>(
    "UPDATE jobs SET status = 'expired' WHERE status = 'active' AND expires_at < unixepoch()"
  ),
  getJobById: db.prepare<[number], Job>(
    "SELECT * FROM jobs WHERE id = ?"
  ),
  getActiveJobs: db.prepare<[], Job>(
    "SELECT * FROM jobs WHERE status = 'active'"
  ),
  getJobsByEmployerId: db.prepare<[number], Job>(
    "SELECT * FROM jobs WHERE employer_id = ? ORDER BY created_at DESC"
  ),
  getPendingJobsByEmployerId: db.prepare<[number], Job>(
    "SELECT * FROM jobs WHERE employer_id = ? AND status = 'pending' ORDER BY created_at DESC"
  ),

  // ─── Notifications ─────────────────────────────────────────────────────────
  getAllWorkersForNotifications: db.prepare<[], { telegram_id: number; categories: string; districts: string }>(
    "SELECT telegram_id, categories, districts FROM workers"
  ),
  getEmployerByEmployerId: db.prepare<[number], Employer>(
    "SELECT * FROM employers WHERE id = ?"
  ),

  // ─── Admin stats ───────────────────────────────────────────────────────────
  countProfiles: db.prepare<[], { total: number }>(
    "SELECT COUNT(*) as total FROM profiles"
  ),
  countEmployers: db.prepare<[], { total: number }>(
    "SELECT COUNT(*) as total FROM employers"
  ),
  countWorkers: db.prepare<[], { total: number }>(
    "SELECT COUNT(*) as total FROM workers"
  ),
  countActiveJobs: db.prepare<[], { count: number }>(
    "SELECT COUNT(*) as count FROM jobs WHERE status = 'active'"
  ),
  getAllTelegramIds: db.prepare<[], { telegram_id: number }>(
    "SELECT telegram_id FROM profiles"
  ),
};

export default db;
