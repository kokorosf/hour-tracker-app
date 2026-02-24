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
export const mockFindWithClientName = jest.fn();
export const mockFindWithProjectName = jest.fn();
export const mockFindOverlapping = jest.fn();
export const mockSumMinutesForDay = jest.fn();

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
  findWithClientName = mockFindWithClientName;
  create = mockCreate;
  count = mockCount;
}

export class TaskRepository {
  findByTenant = mockFindByTenant;
  findById = mockFindById;
  findByProject = mockFindByProject;
  findWithProjectName = mockFindWithProjectName;
  create = mockCreate;
  count = mockCount;
}

export class TimeEntryRepository {
  findByTenant = mockFindByTenant;
  findFiltered = mockFindFiltered;
  countFiltered = mockCountFiltered;
  findById = mockFindById;
  findOverlapping = mockFindOverlapping;
  sumMinutesForDay = mockSumMinutesForDay;
  create = mockCreate;
}

export class UserRepository {
  findByTenant = mockFindByTenant;
  findById = mockFindById;
  findByEmail = mockFindByEmail;
  findByEmailGlobal = mockFindByEmailGlobal;
  count = mockCount;
}

export const mockFindBySender = jest.fn();
export const mockUpsert = jest.fn();
export const mockTryMarkProcessed = jest.fn();

export class ChatIdentityRepository {
  findBySender = mockFindBySender;
  upsert = mockUpsert;
  delete = jest.fn();
}

export class ProcessedMessageRepository {
  tryMarkProcessed = mockTryMarkProcessed;
  cleanupOlderThan = jest.fn();
}

export const query = jest.fn();
export const getPool = jest.fn();
export const testConnection = jest.fn();
export const transaction = jest.fn();
export const getTenantById = jest.fn();
<<<<<<< HEAD
export const getTenantByTelegramChatId = jest.fn();
=======
>>>>>>> 2d1390fd28fc2664ecdfb72e03eda1d6190595a7
export const writeAuditLog = jest.fn();
