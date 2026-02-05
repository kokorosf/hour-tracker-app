// ---------------------------------------------------------------------------
// Entity interfaces – mirror the database schema
// ---------------------------------------------------------------------------

/** Organisation / workspace that owns all data. */
export interface Tenant {
  /** UUID primary key. */
  id: string;
  /** Display name of the tenant. */
  name: string;
  /** Subscription plan – defaults to `'free'`. */
  plan: string;
  /** Row creation timestamp. */
  createdAt: Date;
  /** Row last-update timestamp. */
  updatedAt: Date;
}

/** A user that belongs to exactly one tenant. */
export interface User {
  /** UUID primary key. */
  id: string;
  /** Owning tenant. */
  tenantId: string;
  /** Email address – unique within a tenant. */
  email: string;
  /** `'admin'` or `'user'`. */
  role: 'admin' | 'user';
  /** Row creation timestamp. */
  createdAt: Date;
  /** Row last-update timestamp. */
  updatedAt: Date;
}

/** User record that includes the password hash (for auth internals only). */
export interface UserWithPassword extends User {
  /** Hashed password – never expose to the client. */
  passwordHash: string;
}

/** A client that work is performed for. Supports soft-delete. */
export interface Client {
  /** UUID primary key. */
  id: string;
  /** Owning tenant. */
  tenantId: string;
  /** Client name. */
  name: string;
  /** Soft-delete timestamp – `null` when active. */
  deletedAt: Date | null;
  /** Row creation timestamp. */
  createdAt: Date;
  /** Row last-update timestamp. */
  updatedAt: Date;
}

/** A project that belongs to a client. Supports soft-delete. */
export interface Project {
  /** UUID primary key. */
  id: string;
  /** Owning tenant. */
  tenantId: string;
  /** Parent client. */
  clientId: string;
  /** Project name. */
  name: string;
  /** Whether time logged to this project is billable. */
  isBillable: boolean;
  /** Soft-delete timestamp – `null` when active. */
  deletedAt: Date | null;
  /** Row creation timestamp. */
  createdAt: Date;
  /** Row last-update timestamp. */
  updatedAt: Date;
}

/** A task that belongs to a project. Supports soft-delete. */
export interface Task {
  /** UUID primary key. */
  id: string;
  /** Owning tenant. */
  tenantId: string;
  /** Parent project. */
  projectId: string;
  /** Task name. */
  name: string;
  /** Soft-delete timestamp – `null` when active. */
  deletedAt: Date | null;
  /** Row creation timestamp. */
  createdAt: Date;
  /** Row last-update timestamp. */
  updatedAt: Date;
}

/** A block of time logged by a user. Supports soft-delete. */
export interface TimeEntry {
  /** UUID primary key. */
  id: string;
  /** Owning tenant. */
  tenantId: string;
  /** User who logged the time. */
  userId: string;
  /** Project the time was logged against. */
  projectId: string;
  /** Task the time was logged against. */
  taskId: string;
  /** When the work started. */
  startTime: Date;
  /** When the work ended – must be after `startTime`. */
  endTime: Date;
  /** Duration in minutes. */
  duration: number;
  /** Optional description of the work performed. */
  description: string | null;
  /** Soft-delete timestamp – `null` when active. */
  deletedAt: Date | null;
  /** Row creation timestamp. */
  createdAt: Date;
  /** Row last-update timestamp. */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// DTOs – Data Transfer Objects for create / update operations
// ---------------------------------------------------------------------------

/** Fields required to create a new tenant. */
export interface CreateTenantDto {
  /** Display name of the tenant. */
  name: string;
  /** Subscription plan – defaults to `'free'` if omitted. */
  plan?: string;
}

/** Fields that may be updated on an existing tenant. */
export interface UpdateTenantDto {
  /** Display name. */
  name?: string;
  /** Subscription plan. */
  plan?: string;
}

/** Fields required to create a new user (includes plain-text password). */
export interface CreateUserDto {
  /** Email address. */
  email: string;
  /** Plain-text password – will be hashed before storage. */
  password: string;
  /** `'admin'` or `'user'`. */
  role: 'admin' | 'user';
}

/** Fields that may be updated on an existing user. */
export interface UpdateUserDto {
  /** New email address. */
  email?: string;
  /** New plain-text password – will be hashed before storage. */
  password?: string;
  /** New role. */
  role?: 'admin' | 'user';
}

/** Fields required to create a new client. */
export interface CreateClientDto {
  /** Client name. */
  name: string;
}

/** Fields that may be updated on an existing client. */
export interface UpdateClientDto {
  /** Client name. */
  name?: string;
}

/** Fields required to create a new project. */
export interface CreateProjectDto {
  /** Parent client UUID. */
  clientId: string;
  /** Project name. */
  name: string;
  /** Whether time is billable – defaults to `true` if omitted. */
  isBillable?: boolean;
}

/** Fields that may be updated on an existing project. */
export interface UpdateProjectDto {
  /** Parent client UUID. */
  clientId?: string;
  /** Project name. */
  name?: string;
  /** Whether time is billable. */
  isBillable?: boolean;
}

/** Fields required to create a new task. */
export interface CreateTaskDto {
  /** Parent project UUID. */
  projectId: string;
  /** Task name. */
  name: string;
}

/** Fields that may be updated on an existing task. */
export interface UpdateTaskDto {
  /** Parent project UUID. */
  projectId?: string;
  /** Task name. */
  name?: string;
}

/** Fields required to create a new time entry. */
export interface CreateTimeEntryDto {
  /** Project UUID. */
  projectId: string;
  /** Task UUID. */
  taskId: string;
  /** When the work started. */
  startTime: Date;
  /** When the work ended. */
  endTime: Date;
  /** Duration in minutes. */
  duration: number;
  /** Optional description. */
  description?: string | null;
}

/** Fields that may be updated on an existing time entry. */
export interface UpdateTimeEntryDto {
  /** Project UUID. */
  projectId?: string;
  /** Task UUID. */
  taskId?: string;
  /** When the work started. */
  startTime?: Date;
  /** When the work ended. */
  endTime?: Date;
  /** Duration in minutes. */
  duration?: number;
  /** Optional description. */
  description?: string | null;
}
