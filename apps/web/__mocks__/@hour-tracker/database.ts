// ---------------------------------------------------------------------------
// Mock for @hour-tracker/database
// ---------------------------------------------------------------------------

export const mockFindByTenant = jest.fn();
export const mockFindById = jest.fn();
export const mockCreate = jest.fn();
export const mockUpdate = jest.fn();
export const mockSoftDelete = jest.fn();
export const mockCount = jest.fn();
export const mockSearchByName = jest.fn();
export const mockFindByClient = jest.fn();
export const mockFindByProject = jest.fn();
export const mockFindFiltered = jest.fn();
export const mockCountFiltered = jest.fn();
export const mockFindByEmail = jest.fn();
export const mockFindByEmailGlobal = jest.fn();

export class ClientRepository {
  findByTenant = mockFindByTenant;
  findById = mockFindById;
  create = mockCreate;
  update = mockUpdate;
  softDelete = mockSoftDelete;
  count = mockCount;
  searchByName = mockSearchByName;
}

export class ProjectRepository {
  findByTenant = mockFindByTenant;
  findById = mockFindById;
  findByClient = mockFindByClient;
  create = mockCreate;
  count = mockCount;
}

export class TaskRepository {
  findByTenant = mockFindByTenant;
  findById = mockFindById;
  findByProject = mockFindByProject;
  create = mockCreate;
  count = mockCount;
}

export class TimeEntryRepository {
  findByTenant = mockFindByTenant;
  findFiltered = mockFindFiltered;
  countFiltered = mockCountFiltered;
  findById = mockFindById;
  create = mockCreate;
}

export class UserRepository {
  findByTenant = mockFindByTenant;
  findById = mockFindById;
  findByEmail = mockFindByEmail;
  findByEmailGlobal = mockFindByEmailGlobal;
  count = mockCount;
}

export const query = jest.fn();
export const getPool = jest.fn();
export const testConnection = jest.fn();
export const transaction = jest.fn();
export const getTenantById = jest.fn();
