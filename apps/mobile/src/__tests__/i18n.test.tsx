import { act, render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { describeEta } from "../eta";
import { en } from "../i18n/en";
import { hi } from "../i18n/hi";
import { getLang, loadLang, setLang, translate } from "../i18n";
import { statusLabel } from "../theme/status";
import { StatusBadge } from "../components/StatusBadge";
import { ProgressBar } from "../components/ProgressBar";
import { SHIPMENT_STATUSES } from "../types";

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

afterEach(async () => {
  await act(async () => setLang("en"));
});

describe("translations", () => {
  test("Hindi has exactly the same keys as English", () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
  });

  test("every Hindi message keeps the same {placeholders} as the English one", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect({ key, found: placeholders(hi[key]) }).toEqual({ key, found: placeholders(en[key]) });
    }
  });

  test("no message is left empty", () => {
    for (const text of [...Object.values(en), ...Object.values(hi)]) expect(text.trim()).not.toBe("");
  });

  test("translate fills placeholders, and leaves unknown ones visible rather than hiding them", () => {
    expect(translate("track.updatedSeconds", { n: 42 }, "en")).toBe("Updated 42s ago");
    expect(translate("track.updatedSeconds", { n: 42 }, "hi")).toBe("42 सेकंड पहले अपडेट हुआ");
    expect(translate("track.updatedSeconds", {}, "en")).toBe("Updated {n}s ago");
  });

  test("every status has a label in both languages", () => {
    for (const status of SHIPMENT_STATUSES) {
      expect(statusLabel(status, "en")).not.toBe(`status.${status}`);
      expect(statusLabel(status, "hi")).not.toBe(`status.${status}`);
    }
  });
});

describe("language switching", () => {
  test("setLang changes what non-React code (ETA text) says, and remembers the choice", async () => {
    const shipment = { currentStatus: "DELAYED" as const, history: [], estimatedDelivery: null };
    expect(describeEta(shipment)?.text).toBe("Delayed");

    await act(async () => setLang("hi"));
    expect(getLang()).toBe("hi");
    expect(describeEta(shipment)?.text).toBe("देरी");
    expect(await AsyncStorage.getItem("shipment-tracker-lang-v1")).toBe("hi");
  });

  test("loadLang restores the saved language", async () => {
    await AsyncStorage.setItem("shipment-tracker-lang-v1", "hi");
    await loadLang();
    expect(getLang()).toBe("hi");
  });

  test("components re-render in the new language", async () => {
    await render(<StatusBadge status="IN_TRANSIT" />);
    expect(screen.getByText("In Transit")).toBeTruthy();
    await act(async () => setLang("hi"));
    expect(screen.getByText("रास्ते में")).toBeTruthy();
  });
});

describe("accessibility", () => {
  test("the progress bar is announced as a progress bar with a percentage", async () => {
    await render(<ProgressBar progress={0.5} color="#000" label="Delivery progress" />);
    const bar = screen.getByRole("progressbar");
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 50 });
    expect(bar.props.accessibilityLabel).toBe("Delivery progress");
  });
});
