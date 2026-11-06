export const typeDefs = /* GraphQL */ `
  enum ShipmentStatus {
    CREATED
    PICKED_UP
    IN_TRANSIT
    OUT_FOR_DELIVERY
    DELIVERED
  }

  type StatusEvent {
    status: ShipmentStatus!
    location: String!
    note: String
    timestamp: String!
  }

  type Shipment {
    id: ID!
    trackingId: String!
    origin: String!
    destination: String!
    receiverName: String!
    currentStatus: ShipmentStatus!
    history: [StatusEvent!]!
    createdAt: String!
    updatedAt: String!
  }

  type AuthPayload {
    token: String!
    email: String!
    expiresIn: Int!
  }

  type AdminProfile {
    id: ID!
    email: String!
  }

  type ShipmentPage {
    items: [Shipment!]!
    "Opaque cursor for the next page; null when this is the last page."
    nextCursor: String
  }

  input CreateShipmentInput {
    origin: String!
    destination: String!
    receiverName: String!
    originLocation: String
  }

  input UpdateStatusInput {
    trackingId: String!
    status: ShipmentStatus!
    location: String!
    note: String
  }

  type Query {
    "Public. Whether admin operations need a login; the app uses it to decide whether to show the login form."
    authRequired: Boolean!

    "Public. Returns null when no shipment matches the given tracking ID."
    shipment(trackingId: String!): Shipment

    "Admin only. Newest-first, cursor-paginated list; optionally filtered by status and/or a tracking-ID prefix."
    shipments(status: ShipmentStatus, search: String, cursor: String, limit: Int = 20): ShipmentPage!

    "Admin only. Confirms the bearer token is still valid."
    me: AdminProfile
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    createShipment(input: CreateShipmentInput!): Shipment!
    updateStatus(input: UpdateStatusInput!): Shipment!
  }
`;
