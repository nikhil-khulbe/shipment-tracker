import { gql } from "@apollo/client";

export const SHIPMENT_QUERY = gql`
  query Shipment($trackingId: String!) {
    shipment(trackingId: $trackingId) {
      id
      trackingId
      origin
      destination
      receiverName
      currentStatus
      history {
        status
        location
        note
        timestamp
      }
    }
  }
`;

export const AUTH_REQUIRED_QUERY = gql`
  query AuthRequired {
    authRequired
  }
`;

export const ME_QUERY = gql`
  query Me {
    me {
      id
      email
    }
  }
`;

export const SHIPMENTS_QUERY = gql`
  query Shipments($status: ShipmentStatus, $search: String, $cursor: String, $limit: Int) {
    shipments(status: $status, search: $search, cursor: $cursor, limit: $limit) {
      items {
        id
        trackingId
        origin
        destination
        receiverName
        currentStatus
      }
      nextCursor
    }
  }
`;
