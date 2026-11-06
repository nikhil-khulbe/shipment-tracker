import { gql } from "@apollo/client";
import { SHIPMENT_FIELDS } from "./queries";

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
  ${SHIPMENT_FIELDS}
  mutation CreateShipment($input: CreateShipmentInput!) {
    createShipment(input: $input) {
      ...ShipmentFields
    }
  }
`;

export const UPDATE_STATUS_MUTATION = gql`
  ${SHIPMENT_FIELDS}
  mutation UpdateStatus($input: UpdateStatusInput!) {
    updateStatus(input: $input) {
      ...ShipmentFields
    }
  }
`;

export const EDIT_SHIPMENT_MUTATION = gql`
  ${SHIPMENT_FIELDS}
  mutation EditShipment($trackingId: String!, $input: EditShipmentInput!) {
    editShipment(trackingId: $trackingId, input: $input) {
      ...ShipmentFields
    }
  }
`;

export const BULK_UPDATE_MUTATION = gql`
  mutation BulkUpdateStatus($trackingIds: [String!]!, $status: ShipmentStatus!, $location: String!, $note: String) {
    bulkUpdateStatus(trackingIds: $trackingIds, status: $status, location: $location, note: $note) {
      trackingId
      ok
      error
      status
    }
  }
`;

export const IMPORT_SHIPMENTS_MUTATION = gql`
  mutation ImportShipments($inputs: [CreateShipmentInput!]!) {
    importShipments(inputs: $inputs) {
      row
      ok
      error
      trackingId
    }
  }
`;
