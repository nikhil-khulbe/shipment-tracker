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
