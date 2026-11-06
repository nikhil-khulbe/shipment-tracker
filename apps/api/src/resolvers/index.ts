import { shipmentQueries, shipmentMutations, shipmentFields, statusEventFields } from "./shipment.js";
import { authMutations } from "./auth.js";

export const resolvers = {
  Query: {
    ...shipmentQueries,
  },
  Shipment: shipmentFields,
  StatusEvent: statusEventFields,
  Mutation: {
    ...authMutations,
    ...shipmentMutations,
  },
};
