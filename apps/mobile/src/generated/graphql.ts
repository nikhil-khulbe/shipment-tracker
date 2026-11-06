export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export type AdminProfile = {
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  role: Role;
};

export type AuthPayload = {
  email: Scalars['String']['output'];
  expiresIn: Scalars['Int']['output'];
  token: Scalars['String']['output'];
};

export type BulkStatusResult = {
  error?: Maybe<Scalars['String']['output']>;
  ok: Scalars['Boolean']['output'];
  status?: Maybe<ShipmentStatus>;
  trackingId: Scalars['String']['output'];
};

export type CreateShipmentInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  destination: Scalars['String']['input'];
  /** ISO date or date-time; must not be more than a day in the past. */
  estimatedDelivery?: InputMaybe<Scalars['String']['input']>;
  origin: Scalars['String']['input'];
  originLocation?: InputMaybe<Scalars['String']['input']>;
  packageType?: InputMaybe<PackageType>;
  receiverName: Scalars['String']['input'];
  receiverPhone?: InputMaybe<Scalars['String']['input']>;
  senderName?: InputMaybe<Scalars['String']['input']>;
  weightKg?: InputMaybe<Scalars['Float']['input']>;
};

export type DashboardStats = {
  byStatus: Array<StatusCount>;
  createdPerDay: Array<DayCount>;
  /** Unfinished shipments past their estimated delivery date. */
  overdueCount: Scalars['Int']['output'];
  /** Unfinished shipments not touched for a while, oldest first. */
  stuck: Array<Shipment>;
  total: Scalars['Int']['output'];
};

export type DayCount = {
  count: Scalars['Int']['output'];
  /** UTC calendar day, YYYY-MM-DD. */
  date: Scalars['String']['output'];
};

/** Fields left out are unchanged; null or an empty string clears an optional field. */
export type EditShipmentInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  destination?: InputMaybe<Scalars['String']['input']>;
  estimatedDelivery?: InputMaybe<Scalars['String']['input']>;
  origin?: InputMaybe<Scalars['String']['input']>;
  packageType?: InputMaybe<PackageType>;
  receiverName?: InputMaybe<Scalars['String']['input']>;
  receiverPhone?: InputMaybe<Scalars['String']['input']>;
  senderName?: InputMaybe<Scalars['String']['input']>;
  weightKg?: InputMaybe<Scalars['Float']['input']>;
};

export type ImportResult = {
  error?: Maybe<Scalars['String']['output']>;
  ok: Scalars['Boolean']['output'];
  /** 1-based position of the row in the submitted list. */
  row: Scalars['Int']['output'];
  trackingId?: Maybe<Scalars['String']['output']>;
};

export type Mutation = {
  /** Move up to 50 shipments to the same status. Not available for DELIVERED. */
  bulkUpdateStatus: Array<BulkStatusResult>;
  createShipment: Shipment;
  /** ADMIN only. Edit a shipment's details; every change is logged. */
  editShipment: Shipment;
  /** ADMIN only. Create up to 200 shipments at once (e.g. from a CSV). */
  importShipments: Array<ImportResult>;
  login: AuthPayload;
  updateStatus: Shipment;
};


export type MutationBulkUpdateStatusArgs = {
  location: Scalars['String']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
  status: ShipmentStatus;
  trackingIds: Array<Scalars['String']['input']>;
};


export type MutationCreateShipmentArgs = {
  input: CreateShipmentInput;
};


export type MutationEditShipmentArgs = {
  input: EditShipmentInput;
  trackingId: Scalars['String']['input'];
};


export type MutationImportShipmentsArgs = {
  inputs: Array<CreateShipmentInput>;
};


export type MutationLoginArgs = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};


export type MutationUpdateStatusArgs = {
  input: UpdateStatusInput;
};

export type PackageType =
  | 'DOCUMENT'
  | 'ELECTRONICS'
  | 'FRAGILE'
  | 'OTHER'
  | 'PARCEL';

export type Query = {
  /** Public. Whether admin operations need a login; the app uses it to decide whether to show the login form. */
  authRequired: Scalars['Boolean']['output'];
  /** ADMIN only. Counts, a 7-day creation chart and the shipments that look stuck. */
  dashboardStats: DashboardStats;
  /** Admin only. Confirms the bearer token is still valid. */
  me?: Maybe<AdminProfile>;
  /** Public. Returns null when no shipment matches the given tracking ID. */
  shipment?: Maybe<Shipment>;
  /** Admin only. Newest-first, cursor-paginated list; optionally filtered by status and/or a tracking-ID prefix. */
  shipments: ShipmentPage;
};


export type QueryDashboardStatsArgs = {
  stuckAfterHours?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryShipmentArgs = {
  trackingId: Scalars['String']['input'];
};


export type QueryShipmentsArgs = {
  cursor?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<ShipmentStatus>;
};

export type Role =
  | 'ADMIN'
  | 'DRIVER';

export type Shipment = {
  /** The statuses this shipment may move to next. Empty once it is DELIVERED, RETURNED or CANCELLED. */
  allowedNextStatuses: Array<ShipmentStatus>;
  createdAt: Scalars['String']['output'];
  /** Visible to logged-in staff only. */
  createdBy?: Maybe<Scalars['String']['output']>;
  currentStatus: ShipmentStatus;
  /** Who received the parcel. Set when it is marked DELIVERED. */
  deliveredTo?: Maybe<Scalars['String']['output']>;
  /** The 4-digit code the receiver gives the courier. Visible to ADMIN accounts only. */
  deliveryOtp?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  destination: Scalars['String']['output'];
  /** Log of edits to the shipment's details. Empty unless the caller is logged-in staff. */
  edits: Array<ShipmentEdit>;
  /** ISO date-time. Null when no estimate was given. */
  estimatedDelivery?: Maybe<Scalars['String']['output']>;
  history: Array<StatusEvent>;
  id: Scalars['ID']['output'];
  origin: Scalars['String']['output'];
  packageType?: Maybe<PackageType>;
  receiverName: Scalars['String']['output'];
  /** Masked (last 4 digits only) unless the caller is a logged-in admin. */
  receiverPhone?: Maybe<Scalars['String']['output']>;
  senderName?: Maybe<Scalars['String']['output']>;
  trackingId: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
  weightKg?: Maybe<Scalars['Float']['output']>;
};

export type ShipmentChange = {
  field: Scalars['String']['output'];
  from?: Maybe<Scalars['String']['output']>;
  to?: Maybe<Scalars['String']['output']>;
};

export type ShipmentEdit = {
  at: Scalars['String']['output'];
  by?: Maybe<Scalars['String']['output']>;
  changes: Array<ShipmentChange>;
};

export type ShipmentPage = {
  items: Array<Shipment>;
  /** Opaque cursor for the next page; null when this is the last page. */
  nextCursor?: Maybe<Scalars['String']['output']>;
};

export type ShipmentStatus =
  | 'CANCELLED'
  | 'CREATED'
  | 'DELAYED'
  | 'DELIVERED'
  | 'DELIVERY_ATTEMPT_FAILED'
  | 'IN_TRANSIT'
  | 'ON_HOLD'
  | 'OUT_FOR_DELIVERY'
  | 'PICKED_UP'
  | 'RETURNED';

export type StatusCount = {
  count: Scalars['Int']['output'];
  status: ShipmentStatus;
};

export type StatusEvent = {
  location: Scalars['String']['output'];
  note?: Maybe<Scalars['String']['output']>;
  status: ShipmentStatus;
  timestamp: Scalars['String']['output'];
  /** Who made this change. Visible to logged-in staff only. */
  updatedBy?: Maybe<Scalars['String']['output']>;
};

export type UpdateStatusInput = {
  /** Required when the status is DELIVERED. */
  deliveredTo?: InputMaybe<Scalars['String']['input']>;
  location: Scalars['String']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
  /** The receiver's delivery code; checked for DELIVERED when admin login is required. */
  otp?: InputMaybe<Scalars['String']['input']>;
  status: ShipmentStatus;
  trackingId: Scalars['String']['input'];
};
