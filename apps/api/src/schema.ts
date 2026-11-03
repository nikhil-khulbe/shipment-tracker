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
    "Public. Returns null when no shipment matches the given tracking ID."
    shipment(trackingId: String!): Shipment

    "Admin only. Confirms the bearer token is still valid."
    me: AdminProfile
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    createShipment(input: CreateShipmentInput!): Shipment!
    updateStatus(input: UpdateStatusInput!): Shipment!
  }
`;
