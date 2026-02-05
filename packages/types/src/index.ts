export type Tenant = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type User = {
  id: string;
  email: string;
  displayName: string;
  tenantId: string;
};
