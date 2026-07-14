/** Minimal shapes for the Mews Connector API responses we consume. */

export interface MewsEnterprise {
  Id: string;
  Name?: string;
  TimeZoneIdentifier?: string;
  Currencies?: Array<{ Currency: string; IsDefault?: boolean }>;
  Address?: {
    Line1?: string | null;
    Line2?: string | null;
    City?: string | null;
    PostalCode?: string | null;
    CountryCode?: string | null;
    CountrySubdivisionCode?: string | null;
  } | null;
}

export interface MewsConfigurationResponse {
  Enterprise?: MewsEnterprise;
  NowUtc?: string;
}

export interface MewsPersonCount {
  AgeCategoryId?: string;
  Count?: number;
}

export interface MewsReservation {
  Id: string;
  Number?: string;
  State?: string;
  StartUtc?: string;
  EndUtc?: string;
  AccountId?: string | null;
  RequestedResourceCategoryId?: string | null;
  AssignedResourceId?: string | null;
  RateId?: string | null;
  GroupId?: string | null;
  Origin?: string | null;
  PersonCounts?: MewsPersonCount[];
  CreatedUtc?: string;
}

export interface MewsReservationsResponse {
  Reservations?: MewsReservation[];
  Cursor?: string;
}

export interface MewsCustomer {
  Id: string;
  FirstName?: string | null;
  LastName?: string | null;
  Email?: string | null;
  Phone?: string | null;
  NationalityCode?: string | null;
}

export interface MewsCustomersResponse {
  Customers?: MewsCustomer[];
  Cursor?: string;
}

export interface MewsResource {
  Id: string;
  Name?: string;
  State?: string;
  IsActive?: boolean;
  ParentResourceId?: string | null;
}

export interface MewsResourceCategory {
  Id: string;
  Type?: string;
  Names?: Record<string, string> | null;
}

export interface MewsResourcesResponse {
  Resources?: MewsResource[] | null;
  ResourceCategories?: MewsResourceCategory[] | null;
  Cursor?: string;
}
