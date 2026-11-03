/** Typed route params for React Navigation (used by useRoute / setParams / linking). */
export type RootTabParamList = {
  Track: { trackingId?: string } | undefined;
  Admin: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootTabParamList {}
  }
}
