import { useEffect, useRef } from "react";
import { useApolloClient, useSubscription } from "@apollo/client/react";
import { SHIPMENT_FEED_SUBSCRIPTION } from "./graphql/queries";

const REFRESH_DELAY_MS = 400;

type FeedShipment = { createdAt: string; updatedAt: string };

/** A shipment that was just created has not been touched since, so the two timestamps match. */
export function isNewShipment(shipment: FeedShipment): boolean {
  return shipment.createdAt === shipment.updatedAt;
}

/**
 * Staff screens: keep the shipment list and dashboard current without polling.
 *
 * A changed shipment is already updated in place (Apollo's cache is keyed by id,
 * and the pushed event carries the new fields), so the list needs a refetch only
 * when a NEW shipment appears. The dashboard's counts always change, so it is
 * refetched. Both are debounced so a bulk update of 50 parcels refreshes once.
 */
export function useLiveShipmentFeed(): void {
  const client = useApolloClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listStale = useRef(false);

  useSubscription<{ shipmentFeed: FeedShipment }>(SHIPMENT_FEED_SUBSCRIPTION, {
    onData: ({ data }) => {
      const shipment = data.data?.shipmentFeed;
      if (!shipment) return;
      if (isNewShipment(shipment)) listStale.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const include = listStale.current ? ["Shipments", "Dashboard"] : ["Dashboard"];
        listStale.current = false;
        client.refetchQueries({ include }).catch(() => {});
      }, REFRESH_DELAY_MS);
    },
    onError: () => {}, // a dropped socket is not user-facing; the screens still work and pull-to-refresh remains
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}
