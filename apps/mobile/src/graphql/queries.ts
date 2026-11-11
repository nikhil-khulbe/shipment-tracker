import { gql } from "@apollo/client";

/** Everything the app shows about one shipment. Shared so queries and mutations agree. */
export const SHIPMENT_FIELDS = gql`
  fragment ShipmentFields on Shipment {
    id
    trackingId
    origin
    destination
    receiverName
    senderName
    receiverPhone
    packageType
    weightKg
    description
    estimatedDelivery
    deliveredTo
    deliveryOtp
    createdBy
    edits {
      at
      by
      changes {
        field
        from
        to
      }
    }
    currentStatus
    allowedNextStatuses
    history {
      status
      location
      note
      timestamp
      updatedBy
    }
  }
`;

export const SHIPMENT_QUERY = gql`
  ${SHIPMENT_FIELDS}
  query Shipment($trackingId: String!) {
    shipment(trackingId: $trackingId) {
      ...ShipmentFields
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
      role
    }
  }
`;

export const DASHBOARD_QUERY = gql`
  query Dashboard($stuckAfterHours: Int) {
    dashboardStats(stuckAfterHours: $stuckAfterHours) {
      total
      overdueCount
      byStatus {
        status
        count
      }
      createdPerDay {
        date
        count
      }
      stuck {
        id
        trackingId
        origin
        destination
        currentStatus
        updatedAt
      }
    }
  }
`;

export const AUDIT_EXPORT_QUERY = gql`
  query AuditExport($from: String, $to: String) {
    auditExport(from: $from, to: $to) {
      csv
      rows
      truncated
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
        allowedNextStatuses
      }
      nextCursor
    }
  }
`;
