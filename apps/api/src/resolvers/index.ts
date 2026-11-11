import { shipmentQueries, shipmentMutations, shipmentSubscriptions, shipmentFields, statusEventFields } from "./shipment.js";
import { authMutations } from "./auth.js";

export const resolvers = {
  Query: {
    ...shipmentQueries,
  },
  Subscription: shipmentSubscriptions,
  Shipment: shipmentFields,
  StatusEvent: statusEventFields,
  Mutation: {
    ...authMutations,
    ...shipmentMutations,
  },
};
