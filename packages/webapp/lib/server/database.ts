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

  const createIndexes = [
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)',
    'CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)',
  ];

  try {
    db.exec(createUsersTable);
    createIndexes.forEach(index => db.exec(index));

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// ========== Interfaces ==========

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

// ========== Repository Classes ==========

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
