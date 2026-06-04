import 'server-only';

// @ts-expect-error - better-sqlite3 types will be available after proper installation
import Database from 'better-sqlite3';
import { join } from 'path';
import bcrypt from 'bcryptjs';

// Database file path
const dbPath = join(process.cwd(), 'database.sqlite');

// Initialize database connection
let db: Database.Database;

export function getDatabase() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initializeDatabase();
  }
  return db;
}

// Database version for migrations (v16 = Fiber simplified schema)
const DATABASE_VERSION = 16;

// Initialize database tables
function initializeDatabase() {
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      public_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT 1
    )
  `;

  const createSessionsTable = `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `;

  const createPaymentChannelsTable = `
    CREATE TABLE IF NOT EXISTS payment_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT UNIQUE NOT NULL,
      user_address TEXT NOT NULL,
      funding_amount TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME
    )
  `;

  const createChunkPaymentsTable = `
    CREATE TABLE IF NOT EXISTS chunk_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      channel_id TEXT,
      invoice TEXT,
      payment_hash TEXT,
      amount TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const createScheduledTaskLogsTable = `
    CREATE TABLE IF NOT EXISTS scheduled_task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_name TEXT NOT NULL,
      task_type TEXT NOT NULL,
      execution_status TEXT NOT NULL,
      started_at DATETIME NOT NULL,
      completed_at DATETIME,
      duration_ms INTEGER,
      result_data TEXT,
      error_message TEXT,
      settled_count INTEGER DEFAULT 0,
      checked_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const createIndexes = [
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)',
    'CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at)',
    'CREATE INDEX IF NOT EXISTS idx_payment_channels_channel_id ON payment_channels (channel_id)',
    'CREATE INDEX IF NOT EXISTS idx_payment_channels_user_address ON payment_channels (user_address)',
    'CREATE INDEX IF NOT EXISTS idx_payment_channels_status ON payment_channels (status)',
    'CREATE INDEX IF NOT EXISTS idx_chunk_payments_session_id ON chunk_payments (session_id)',
    'CREATE INDEX IF NOT EXISTS idx_chunk_payments_payment_hash ON chunk_payments (payment_hash)',
    'CREATE INDEX IF NOT EXISTS idx_chunk_payments_status ON chunk_payments (status)',
    'CREATE INDEX IF NOT EXISTS idx_scheduled_task_logs_task_name ON scheduled_task_logs (task_name)',
    'CREATE INDEX IF NOT EXISTS idx_scheduled_task_logs_task_type ON scheduled_task_logs (task_type)',
    'CREATE INDEX IF NOT EXISTS idx_scheduled_task_logs_status ON scheduled_task_logs (execution_status)',
    'CREATE INDEX IF NOT EXISTS idx_scheduled_task_logs_started_at ON scheduled_task_logs (started_at)',
    'CREATE INDEX IF NOT EXISTS idx_scheduled_task_logs_created_at ON scheduled_task_logs (created_at)',
  ];

  try {
    db.exec(createUsersTable);
    db.exec(createSessionsTable);
    db.exec(createPaymentChannelsTable);
    db.exec(createChunkPaymentsTable);
    db.exec(createScheduledTaskLogsTable);
    createIndexes.forEach(index => db.exec(index));

    // Run migrations
    runMigrations();

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Database migrations
function runMigrations() {
  // Create database_info table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS database_info (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Get current database version
  const versionStmt = db.prepare('SELECT value FROM database_info WHERE key = ?');
  const versionRow = versionStmt.get('version') as { value: string } | undefined;
  const currentVersion = versionRow ? parseInt(versionRow.value) : 0;

  console.log(`Current database version: ${currentVersion}, target version: ${DATABASE_VERSION}`);

  // Run migration to version 16 (drop and recreate simplified tables for Fiber)
  if (currentVersion < 16) {
    migrateToVersion16();
  }

  // Update database version
  const updateVersionStmt = db.prepare('INSERT OR REPLACE INTO database_info (key, value) VALUES (?, ?)');
  updateVersionStmt.run('version', DATABASE_VERSION.toString());
}

// Migration to version 16: Simplify payment_channels and chunk_payments for Fiber
// Drops Spilman-specific fields and recreates with Fiber-compatible schemas
// (Development stage: data loss is acceptable)
function migrateToVersion16() {
  console.log('Running migration to version 16: simplifying tables for Fiber');

  try {
    db.exec('BEGIN TRANSACTION');

    // Drop old payment_channels table (all Spilman data removed)
    db.exec('DROP TABLE IF EXISTS payment_channels');

    // Recreate payment_channels with simplified Fiber schema
    db.exec(`
      CREATE TABLE payment_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT UNIQUE NOT NULL,
        user_address TEXT NOT NULL,
        funding_amount TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME
      )
    `);

    // Drop old chunk_payments table
    db.exec('DROP TABLE IF EXISTS chunk_payments');

    // Recreate chunk_payments with simplified Fiber schema
    db.exec(`
      CREATE TABLE chunk_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        channel_id TEXT,
        invoice TEXT,
        payment_hash TEXT,
        amount TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for new schemas
    db.exec('CREATE INDEX IF NOT EXISTS idx_payment_channels_channel_id ON payment_channels (channel_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_payment_channels_user_address ON payment_channels (user_address)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_payment_channels_status ON payment_channels (status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_chunk_payments_session_id ON chunk_payments (session_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_chunk_payments_payment_hash ON chunk_payments (payment_hash)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_chunk_payments_status ON chunk_payments (status)');

    db.exec('COMMIT');

    console.log('Successfully migrated to version 16 - simplified tables for Fiber');
  } catch (error) {
    console.error('Error during migration to version 16:', error);
    db.exec('ROLLBACK');
    throw error;
  }
}

// ========== Interfaces ==========

// User interface (unchanged)
export interface User {
  id: number;
  email?: string | null;
  username: string;
  password_hash?: string | null;
  public_key?: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

/** @deprecated Session-based auth removed. */
export interface Session {
  id: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

// User creation interfaces (unchanged)
export interface CreateUserData {
  email?: string;
  username: string;
  password?: string;
  public_key?: string;
}

export interface CreateUserFromPublicKey {
  username: string;
  public_key: string;
}

// Payment Channel status (string-based for Fiber)
export const PAYMENT_CHANNEL_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  CLOSED: 'closed',
} as const;

export type PaymentChannelStatus = typeof PAYMENT_CHANNEL_STATUS[keyof typeof PAYMENT_CHANNEL_STATUS];

// Payment Channel interface (simplified for Fiber)
export interface PaymentChannel {
  id: number;
  channel_id: string;
  user_address: string;
  funding_amount: string;
  status: PaymentChannelStatus;
  created_at: string;
  closed_at: string | null;
}

// Payment Channel creation interface
export interface CreatePaymentChannelData {
  channel_id: string;
  user_address: string;
  funding_amount: string;
  status?: PaymentChannelStatus;
}

// Chunk Payment status (string-based for Fiber)
export const CHUNK_PAYMENT_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
} as const;

export type ChunkPaymentStatus = typeof CHUNK_PAYMENT_STATUS[keyof typeof CHUNK_PAYMENT_STATUS];

// Chunk Payment interface (simplified for Fiber)
export interface ChunkPayment {
  id: number;
  session_id: string;
  channel_id: string | null;
  invoice: string | null;
  payment_hash: string | null;
  amount: string;
  status: ChunkPaymentStatus;
  created_at: string;
}

// Chunk Payment creation interface
export interface CreateChunkPaymentData {
  session_id: string;
  channel_id?: string;
  invoice?: string;
  payment_hash?: string;
  amount: string;
  status?: ChunkPaymentStatus;
}

// Scheduled Task Log interface (unchanged)
export interface ScheduledTaskLog {
  id: number;
  task_name: string;
  task_type: string;
  execution_status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  result_data: string | null;
  error_message: string | null;
  settled_count: number;
  checked_count: number;
  created_at: string;
}

export interface CreateScheduledTaskLogData {
  task_name: string;
  task_type: string;
  execution_status: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  result_data?: string;
  error_message?: string;
  settled_count?: number;
  checked_count?: number;
}

// ========== Repository Classes ==========

// UserRepository (unchanged)
export class UserRepository {
  private db: Database.Database;

  constructor() {
    this.db = getDatabase();
  }

  async createUser(userData: CreateUserData): Promise<User> {
    const { email, username, password, public_key } = userData;

    if (public_key) {
      const stmt = this.db.prepare(`
        INSERT INTO users (username, public_key, is_active)
        VALUES (?, ?, 1)
      `);

      try {
        const result = stmt.run(username, public_key);
        return this.getUserById(result.lastInsertRowid as number)!;
      } catch (error: unknown) {
        if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new Error('Username or public key already exists');
        }
        throw error;
      }
    } else if (email && password) {
      const saltRounds = 12;
      const password_hash = await bcrypt.hash(password, saltRounds);

      const stmt = this.db.prepare(`
        INSERT INTO users (email, username, password_hash)
        VALUES (?, ?, ?)
      `);

      try {
        const result = stmt.run(email, username, password_hash);
        return this.getUserById(result.lastInsertRowid as number)!;
      } catch (error: unknown) {
        if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new Error('Email or username already exists');
        }
        throw error;
      }
    } else {
      throw new Error('Either public_key or email/password must be provided');
    }
  }

  async createUserFromPublicKey(userData: CreateUserFromPublicKey): Promise<User> {
    const { username, public_key } = userData;

    const existingUser = this.getUserByPublicKey(public_key);
    if (existingUser) {
      throw new Error('Public key already exists');
    }

    const stmt = this.db.prepare(`
      INSERT INTO users (username, public_key, is_active)
      VALUES (?, ?, 1)
    `);

    try {
      const result = stmt.run(username, public_key);
      return this.getUserById(result.lastInsertRowid as number)!;
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Username already exists');
      }
      throw error;
    }
  }

  getUserById(id: number): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as User | null;
  }

  getUserByEmail(email: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email) as User | null;
  }

  getUserByPublicKey(publicKey: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE public_key = ?');
    return stmt.get(publicKey) as User | null;
  }

  getUserByUsername(username: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username) as User | null;
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    if (!user.password_hash) {
      return false;
    }
    return await bcrypt.compare(password, user.password_hash);
  }

  updateLastLogin(userId: number): void {
    const stmt = this.db.prepare('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(userId);
  }

  getAllUsers(): User[] {
    const stmt = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC');
    return stmt.all() as User[];
  }

  updateUserStatus(userId: number, is_active: boolean): void {
    const stmt = this.db.prepare('UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(is_active ? 1 : 0, userId);
  }
}

/** @deprecated Session-based auth removed – auth is now via X-CKB-Address header. Kept for data migration only. */
export class SessionRepository {
  private db: Database.Database;

  constructor() {
    this.db = getDatabase();
  }

  createSession(userId: number, sessionId: string, expiresAt: Date): Session {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(sessionId, userId, expiresAt.toISOString());
    return this.getSession(sessionId)!;
  }

  getSession(sessionId: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(sessionId) as Session | null;
  }

  deleteSession(sessionId: string): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.run(sessionId);
  }

  deleteExpiredSessions(): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE expires_at < datetime("now")');
    stmt.run();
  }

  deleteUserSessions(userId: number): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE user_id = ?');
    stmt.run(userId);
  }
}

// PaymentChannelRepository (simplified for Fiber)
export class PaymentChannelRepository {
  private db: Database.Database;

  constructor() {
    this.db = getDatabase();
  }

  createPaymentChannel(channelData: CreatePaymentChannelData): PaymentChannel {
    const { channel_id, user_address, funding_amount, status } = channelData;

    const stmt = this.db.prepare(`
      INSERT INTO payment_channels (channel_id, user_address, funding_amount, status)
      VALUES (?, ?, ?, ?)
    `);

    try {
      const channelStatus = status || PAYMENT_CHANNEL_STATUS.PENDING;
      const result = stmt.run(channel_id, user_address, funding_amount, channelStatus);
      return this.getPaymentChannelById(result.lastInsertRowid as number)!;
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Payment channel with this ID already exists');
      }
      throw error;
    }
  }

  getPaymentChannelById(id: number): PaymentChannel | null {
    const stmt = this.db.prepare('SELECT * FROM payment_channels WHERE id = ?');
    return stmt.get(id) as PaymentChannel | null;
  }

  getPaymentChannelByChannelId(channelId: string): PaymentChannel | null {
    const stmt = this.db.prepare('SELECT * FROM payment_channels WHERE channel_id = ?');
    return stmt.get(channelId) as PaymentChannel | null;
  }

  getPaymentChannelsByUserAddress(userAddress: string): PaymentChannel[] {
    const stmt = this.db.prepare('SELECT * FROM payment_channels WHERE user_address = ? ORDER BY created_at DESC');
    return stmt.all(userAddress) as PaymentChannel[];
  }

  updatePaymentChannelStatus(channelId: string, status: PaymentChannelStatus): PaymentChannel | null {
    if (status === PAYMENT_CHANNEL_STATUS.CLOSED) {
      const stmt = this.db.prepare(`
        UPDATE payment_channels
        SET status = ?, closed_at = CURRENT_TIMESTAMP
        WHERE channel_id = ?
      `);
      stmt.run(status, channelId);
    } else {
      const stmt = this.db.prepare(`
        UPDATE payment_channels
        SET status = ?
        WHERE channel_id = ?
      `);
      stmt.run(status, channelId);
    }
    return this.getPaymentChannelByChannelId(channelId);
  }

  // Get active channels for a user address
  getActiveChannelsByUserAddress(userAddress: string): PaymentChannel[] {
    const stmt = this.db.prepare(
      'SELECT * FROM payment_channels WHERE user_address = ? AND status = ? ORDER BY created_at DESC'
    );
    return stmt.all(userAddress, PAYMENT_CHANNEL_STATUS.ACTIVE) as PaymentChannel[];
  }

  // Get the latest active channel for a user (serves as "default" in Fiber model)
  getLatestActiveChannelByUserAddress(userAddress: string): PaymentChannel | null {
    const stmt = this.db.prepare(
      'SELECT * FROM payment_channels WHERE user_address = ? AND status = ? ORDER BY created_at DESC LIMIT 1'
    );
    return stmt.get(userAddress, PAYMENT_CHANNEL_STATUS.ACTIVE) as PaymentChannel | null;
  }

  // Admin methods
  getAllPaymentChannels(): PaymentChannel[] {
    const stmt = this.db.prepare('SELECT * FROM payment_channels ORDER BY created_at DESC');
    return stmt.all() as PaymentChannel[];
  }

  updatePaymentChannelStatusById(id: number, status: PaymentChannelStatus): PaymentChannel | null {
    if (status === PAYMENT_CHANNEL_STATUS.CLOSED) {
      const stmt = this.db.prepare(`
        UPDATE payment_channels
        SET status = ?, closed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(status, id);
    } else {
      const stmt = this.db.prepare(`
        UPDATE payment_channels
        SET status = ?
        WHERE id = ?
      `);
      stmt.run(status, id);
    }
    return this.getPaymentChannelById(id);
  }
}

// ChunkPaymentRepository (simplified for Fiber)
export class ChunkPaymentRepository {
  private db: Database.Database;

  constructor() {
    this.db = getDatabase();
  }

  createChunkPayment(chunkData: CreateChunkPaymentData): ChunkPayment {
    const { session_id, channel_id, invoice, payment_hash, amount, status } = chunkData;

    const stmt = this.db.prepare(`
      INSERT INTO chunk_payments (session_id, channel_id, invoice, payment_hash, amount, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    try {
      const chunkStatus = status || CHUNK_PAYMENT_STATUS.PENDING;
      const result = stmt.run(
        session_id,
        channel_id || null,
        invoice || null,
        payment_hash || null,
        amount,
        chunkStatus
      );
      return this.getChunkPaymentById(result.lastInsertRowid as number)!;
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Chunk payment already exists');
      }
      throw error;
    }
  }

  getChunkPaymentById(id: number): ChunkPayment | null {
    const stmt = this.db.prepare('SELECT * FROM chunk_payments WHERE id = ?');
    return stmt.get(id) as ChunkPayment | null;
  }

  getChunkPaymentByPaymentHash(paymentHash: string): ChunkPayment | null {
    const stmt = this.db.prepare('SELECT * FROM chunk_payments WHERE payment_hash = ?');
    return stmt.get(paymentHash) as ChunkPayment | null;
  }

  getChunkPaymentsBySession(sessionId: string): ChunkPayment[] {
    const stmt = this.db.prepare('SELECT * FROM chunk_payments WHERE session_id = ? ORDER BY created_at ASC');
    return stmt.all(sessionId) as ChunkPayment[];
  }

  updateChunkPaymentStatus(paymentHash: string, status: ChunkPaymentStatus): ChunkPayment | null {
    const stmt = this.db.prepare(`
      UPDATE chunk_payments
      SET status = ?
      WHERE payment_hash = ?
    `);

    stmt.run(status, paymentHash);
    return this.getChunkPaymentByPaymentHash(paymentHash);
  }

  // Alias used by invoice confirm route
  updateChunkPaymentByHash(paymentHash: string, status: ChunkPaymentStatus): ChunkPayment | null {
    return this.updateChunkPaymentStatus(paymentHash, status);
  }

  getLatestSessionForAddress(userAddress: string): string | null {
    const stmt = this.db.prepare(`
      SELECT cp.session_id FROM chunk_payments cp
      JOIN payment_channels pc ON cp.channel_id = pc.channel_id
      WHERE pc.user_address = ?
      ORDER BY cp.created_at DESC LIMIT 1
    `);
    const result = stmt.get(userAddress) as { session_id: string } | null;
    return result?.session_id || null;
  }
}

// ScheduledTaskLogRepository (unchanged)
export class ScheduledTaskLogRepository {
  private db: Database.Database;

  constructor() {
    this.db = getDatabase();
  }

  createTaskLog(logData: CreateScheduledTaskLogData): ScheduledTaskLog {
    const {
      task_name,
      task_type,
      execution_status,
      started_at,
      completed_at,
      duration_ms,
      result_data,
      error_message,
      settled_count,
      checked_count,
    } = logData;

    const stmt = this.db.prepare(`
      INSERT INTO scheduled_task_logs (
        task_name, task_type, execution_status, started_at, completed_at,
        duration_ms, result_data, error_message, settled_count, checked_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      const result = stmt.run(
        task_name,
        task_type,
        execution_status,
        started_at,
        completed_at || null,
        duration_ms || null,
        result_data || null,
        error_message || null,
        settled_count || 0,
        checked_count || 0
      );
      return this.getTaskLogById(result.lastInsertRowid as number)!;
    } catch (error) {
      console.error('Error creating task log:', error);
      throw error;
    }
  }

  getTaskLogById(id: number): ScheduledTaskLog | null {
    const stmt = this.db.prepare('SELECT * FROM scheduled_task_logs WHERE id = ?');
    return stmt.get(id) as ScheduledTaskLog | null;
  }

  getTaskLogsByName(taskName: string, limit: number = 100): ScheduledTaskLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scheduled_task_logs
      WHERE task_name = ?
      ORDER BY started_at DESC
      LIMIT ?
    `);
    return stmt.all(taskName, limit) as ScheduledTaskLog[];
  }

  getTaskLogsByNamePaginated(taskName: string, page: number = 1, pageSize: number = 20): {
    logs: ScheduledTaskLog[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } {
    const offset = (page - 1) * pageSize;

    const countStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM scheduled_task_logs
      WHERE task_name = ?
    `);
    const { count: total } = countStmt.get(taskName) as { count: number };

    const stmt = this.db.prepare(`
      SELECT * FROM scheduled_task_logs
      WHERE task_name = ?
      ORDER BY started_at DESC
      LIMIT ? OFFSET ?
    `);
    const logs = stmt.all(taskName, pageSize, offset) as ScheduledTaskLog[];

    return {
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  getTaskLogsByType(taskType: string, limit: number = 100): ScheduledTaskLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scheduled_task_logs
      WHERE task_type = ?
      ORDER BY started_at DESC
      LIMIT ?
    `);
    return stmt.all(taskType, limit) as ScheduledTaskLog[];
  }

  getTaskLogsByStatus(status: string, limit: number = 100): ScheduledTaskLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scheduled_task_logs
      WHERE execution_status = ?
      ORDER BY started_at DESC
      LIMIT ?
    `);
    return stmt.all(status, limit) as ScheduledTaskLog[];
  }

  getAllTaskLogs(limit: number = 100): ScheduledTaskLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scheduled_task_logs
      ORDER BY started_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as ScheduledTaskLog[];
  }

  updateTaskLog(id: number, updateData: Partial<CreateScheduledTaskLogData>): ScheduledTaskLog | null {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updateData)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      return this.getTaskLogById(id);
    }

    values.push(id);
    const stmt = this.db.prepare(`
      UPDATE scheduled_task_logs
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
    return this.getTaskLogById(id);
  }

  deleteOldTaskLogs(daysOld: number = 30): number {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    const stmt = this.db.prepare('DELETE FROM scheduled_task_logs WHERE created_at < ?');
    const result = stmt.run(cutoffDate);
    return result.changes;
  }

  getTaskExecutionStats(taskName?: string): {
    total: number;
    success: number;
    failed: number;
    running: number;
    avgDuration: number | null;
  } {
    let whereClause = '';
    const params: (string | number)[] = [];

    if (taskName) {
      whereClause = 'WHERE task_name = ?';
      params.push(taskName);
    }

    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN execution_status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN execution_status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN execution_status = 'running' THEN 1 ELSE 0 END) as running,
        AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms ELSE NULL END) as avgDuration
      FROM scheduled_task_logs
      ${whereClause}
    `);

    return stmt.get(...params) as {
      total: number;
      success: number;
      failed: number;
      running: number;
      avgDuration: number | null;
    };
  }
}