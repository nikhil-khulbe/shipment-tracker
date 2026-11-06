import { shipmentQueries, shipmentMutations, shipmentFields } from "./shipment.js";
import { authMutations } from "./auth.js";

export const resolvers = {
  Query: {
    ...shipmentQueries,
  },
  Shipment: shipmentFields,
  Mutation: {
    ...authMutations,
    ...shipmentMutations,
  },
};
