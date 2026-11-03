import { shipmentQueries, shipmentMutations } from "./shipment.js";
import { authMutations } from "./auth.js";

export const resolvers = {
  Query: {
    ...shipmentQueries,
  },
  Mutation: {
    ...authMutations,
    ...shipmentMutations,
  },
};
