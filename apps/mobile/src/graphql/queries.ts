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

export const ME_QUERY = gql`
  query Me {
    me {
      id
      email
    }
  }
`;
