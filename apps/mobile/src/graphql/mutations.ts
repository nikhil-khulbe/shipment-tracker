import { gql } from "@apollo/client";

export const LOGIN_MUTATION = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      email
      expiresIn
    }
  }
`;

export const CREATE_SHIPMENT_MUTATION = gql`
  mutation CreateShipment($input: CreateShipmentInput!) {
    createShipment(input: $input) {
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

export const UPDATE_STATUS_MUTATION = gql`
  mutation UpdateStatus($input: UpdateStatusInput!) {
    updateStatus(input: $input) {
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
