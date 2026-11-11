import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useApolloClient, useQuery } from "@apollo/client/react";
import { auditFileName, deliverCsv } from "../../exportAudit";
import { feedback } from "../../feedback";
import { AUDIT_EXPORT_QUERY, DASHBOARD_QUERY } from "../../graphql/queries";
import { STATUS_LABELS } from "../../theme/status";
import { useTheme, type Theme } from "../../theme/theme";
import type { ShipmentStatus } from "../../types";
import { StatusBadge } from "../StatusBadge";
import { Text } from "../ui";
import { makeAdminStyles } from "./adminStyles";

type Stats = {
  total: number;
  overdueCount: number;
  byStatus: { status: ShipmentStatus; count: number }[];
  createdPerDay: { date: string; count: number }[];
  stuck: { id: string; trackingId: string; origin: string; destination: string; currentStatus: ShipmentStatus; updatedAt: string }[];
};

const STUCK_AFTER_HOURS = 72;
const CHART_HEIGHT = 90;

/** "3d" / "5h" since an ISO timestamp. */
export function sinceLabel(iso: string, now: number = Date.now()): string {
  const hours = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 3_600_000));
  return hours >= 48 ? `${Math.floor(hours / 24)}d` : `${hours}h`;
}

export function DashboardPanel({ onOpen }: { onOpen: (trackingId: string) => void }) {
  const t = useTheme();
  const shared = useMemo(() => makeAdminStyles(t), [t]);
  const styles = useMemo(() => makeStyles(t), [t]);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const client = useApolloClient();

  const { data, loading, error, refetch } = useQuery<{ dashboardStats: Stats }>(DASHBOARD_QUERY, {
    variables: { stuckAfterHours: STUCK_AFTER_HOURS },
    fetchPolicy: "cache-and-network",
  });
  const stats = data?.dashboardStats;

  async function handleExport() {
    setExporting(true);
    try {
      // no-cache: the file can be large and holds staff names, so it must not enter the persisted Apollo cache.
      const result = await client.query<{ auditExport: { csv: string; rows: number; truncated: boolean } }>({
        query: AUDIT_EXPORT_QUERY,
        fetchPolicy: "no-cache",
      });
      const exported = result.data?.auditExport;
      if (!exported) throw new Error(result.error?.message ?? "The export returned no data.");
      await deliverCsv(auditFileName(), exported.csv);
      feedback.success(
        exported.truncated
          ? `Exported ${exported.rows} rows (limit reached: older activity may be missing).`
          : `Exported ${exported.rows} rows.`,
      );
    } catch (err) {
      feedback.error((err as Error).message || "Could not export the audit log.");
    } finally {
      setExporting(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await refetch().catch(() => {});
    setRefreshing(false);
  }

  if (!stats) {
    return (
      <View style={styles.center}>
        {loading ? <ActivityIndicator color={t.text} /> : <Text style={shared.error}>{error?.message ?? "No data."}</Text>}
      </View>
    );
  }

  const maxPerDay = Math.max(1, ...stats.createdPerDay.map((d) => d.count));
  const maxStatus = Math.max(1, ...stats.byStatus.map((s) => s.count));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View style={styles.statRow}>
        <View style={[shared.card, styles.stat]}>
          <Text style={styles.statNumber}>{stats.total}</Text>
          <Text style={shared.hint}>Total shipments</Text>
        </View>
        <View style={[shared.card, styles.stat]}>
          <Text style={[styles.statNumber, stats.overdueCount > 0 && { color: t.danger }]}>{stats.overdueCount}</Text>
          <Text style={shared.hint}>Past their delivery date</Text>
        </View>
      </View>

      <Text style={styles.heading}>New shipments, last 7 days</Text>
      <View style={[shared.card, styles.chart]} accessibilityLabel={`New shipments per day: ${stats.createdPerDay.map((d) => d.count).join(", ")}`}>
        {stats.createdPerDay.map((day) => (
          <View key={day.date} style={styles.barColumn}>
            <Text style={styles.barValue}>{day.count}</Text>
            <View
              style={[
                styles.bar,
                { height: Math.max(3, Math.round((day.count / maxPerDay) * CHART_HEIGHT)), backgroundColor: t.status.PICKED_UP },
              ]}
            />
            <Text style={styles.barLabel}>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" })}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.heading}>By status</Text>
      <View style={[shared.card, { gap: 10 }]}>
        {stats.byStatus
          .filter((row) => row.count > 0)
          .map((row) => (
            <View key={row.status} style={styles.statusRow} accessible accessibilityLabel={`${STATUS_LABELS[row.status]}: ${row.count}`}>
              <View style={styles.statusName}>
                <StatusBadge status={row.status} />
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(row.count / maxStatus) * 100}%`, backgroundColor: t.status[row.status] }]} />
              </View>
              <Text style={styles.count}>{row.count}</Text>
            </View>
          ))}
        {stats.total === 0 && <Text style={shared.hint}>No shipments yet.</Text>}
      </View>

      <Text style={styles.heading}>Needs attention</Text>
      <Text style={shared.hint}>Unfinished and not updated for {STUCK_AFTER_HOURS / 24} days or more.</Text>
      <View style={{ gap: 8, marginTop: 8 }}>
        {stats.stuck.length === 0 && (
          <View style={shared.card}>
            <Text style={shared.hint}>Nothing is stuck.</Text>
          </View>
        )}
        {stats.stuck.map((item) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [shared.card, pressed && { opacity: 0.7 }]}
            onPress={() => onOpen(item.trackingId)}
            accessibilityRole="button"
            accessibilityLabel={`${item.trackingId}, ${STATUS_LABELS[item.currentStatus]}, untouched for ${sinceLabel(item.updatedAt)}. Open to update.`}
          >
            <View style={styles.stuckTop}>
              <Text style={styles.stuckId}>{item.trackingId}</Text>
              <Text style={[styles.stuckAge, { color: t.danger }]}>{sinceLabel(item.updatedAt)} untouched</Text>
            </View>
            <Text style={shared.hint} numberOfLines={1}>
              {item.origin} → {item.destination}
            </Text>
            <View style={{ marginTop: 6, alignItems: "flex-start" }}>
              <StatusBadge status={item.currentStatus} />
            </View>
          </Pressable>
        ))}
      </View>

      <Text style={styles.heading}>Audit trail</Text>
      <View style={shared.card}>
        <Text style={shared.hint}>
          Every status change and detail edit, with who made it and when, as a CSV you can open in Excel or Sheets.
        </Text>
        <Pressable
          style={({ pressed }) => [shared.secondaryButton, (exporting || pressed) && { opacity: 0.6 }]}
          onPress={handleExport}
          disabled={exporting}
          accessibilityRole="button"
          accessibilityLabel="Download audit log as CSV"
          accessibilityState={{ disabled: exporting, busy: exporting }}
        >
          {exporting ? <ActivityIndicator color={t.text} /> : <Text style={shared.secondaryButtonText}>Download audit log (CSV)</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    content: { paddingHorizontal: 20, paddingBottom: 120, gap: 6 },
    statRow: { flexDirection: "row", gap: 12 },
    stat: { flex: 1 },
    statNumber: { fontSize: 30, fontWeight: "700" },
    heading: { fontSize: 15, fontWeight: "700", marginTop: 18, marginBottom: 6 },
    chart: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 10 },
    barColumn: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 4 },
    bar: { width: 22, borderRadius: 4 },
    barValue: { fontSize: 11, color: t.textMuted },
    barLabel: { fontSize: 11, color: t.textFaint },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    statusName: { width: 150 },
    track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: t.surfaceAlt, overflow: "hidden" },
    fill: { height: 8, borderRadius: 4 },
    count: { width: 28, textAlign: "right", fontWeight: "600" },
    stuckTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    stuckId: { fontSize: 15, fontWeight: "700", letterSpacing: 0.4 },
    stuckAge: { fontSize: 12, fontWeight: "600" },
  });
