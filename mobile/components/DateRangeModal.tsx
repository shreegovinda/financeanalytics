import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  TouchableWithoutFeedback,
} from "react-native";
import { colors, radius, spacing } from "../lib/theme";
import { formatCustomDate } from "@finlytix/shared";

interface DateRangeModalProps {
  visible: boolean;
  startDate: string;
  endDate: string;
  dateFormat?: string;
  onClose: () => void;
  onApply: (start: string, end: string) => void;
}

function toIsoString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DateRangeModal({
  visible,
  startDate,
  endDate,
  dateFormat = "DD/MM/YYYY",
  onClose,
  onApply,
}: DateRangeModalProps) {
  const [stagedStart, setStagedStart] = useState(startDate);
  const [stagedEnd, setStagedEnd] = useState(endDate);

  const applyPreset = (presetKey: string) => {
    const now = new Date();
    const todayIso = toIsoString(now);

    switch (presetKey) {
      case "today":
        setStagedStart(todayIso);
        setStagedEnd(todayIso);
        break;
      case "7days": {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        setStagedStart(toIsoString(d));
        setStagedEnd(todayIso);
        break;
      }
      case "30days": {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        setStagedStart(toIsoString(d));
        setStagedEnd(todayIso);
        break;
      }
      case "thisMonth": {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        setStagedStart(toIsoString(start));
        setStagedEnd(toIsoString(end));
        break;
      }
      case "lastMonth": {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        setStagedStart(toIsoString(start));
        setStagedEnd(toIsoString(end));
        break;
      }
      case "thisYear": {
        const start = new Date(now.getFullYear(), 0, 1);
        setStagedStart(toIsoString(start));
        setStagedEnd(todayIso);
        break;
      }
    }
  };

  const handleApply = () => {
    onApply(stagedStart, stagedEnd);
    onClose();
  };

  const handleClear = () => {
    setStagedStart("");
    setStagedEnd("");
    onApply("", "");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <View style={styles.dragHandle} />
              <Text style={styles.title}>Filter by Date Range</Text>

              {/* Quick Presets */}
              <Text style={styles.sectionLabel}>Quick Presets</Text>
              <View style={styles.presetGrid}>
                {[
                  { key: "today", label: "Today" },
                  { key: "7days", label: "Last 7 Days" },
                  { key: "30days", label: "Last 30 Days" },
                  { key: "thisMonth", label: "This Month" },
                  { key: "lastMonth", label: "Last Month" },
                  { key: "thisYear", label: "This Year" },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.presetChip}
                    onPress={() => applyPreset(item.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.presetText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Date Inputs */}
              <Text style={styles.sectionLabel}>Range (YYYY-MM-DD)</Text>
              <View style={styles.inputRow}>
                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Start Date</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="2026-01-01"
                    value={stagedStart}
                    onChangeText={setStagedStart}
                    placeholderTextColor={colors.textMuted}
                  />
                  {stagedStart ? (
                    <Text style={styles.previewText}>
                      {formatCustomDate(stagedStart, dateFormat)}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>End Date</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="2026-01-31"
                    value={stagedEnd}
                    onChangeText={setStagedEnd}
                    placeholderTextColor={colors.textMuted}
                  />
                  {stagedEnd ? (
                    <Text style={styles.previewText}>
                      {formatCustomDate(stagedEnd, dateFormat)}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={handleClear}
                  activeOpacity={0.7}
                >
                  <Text style={styles.clearText}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.applyButton}
                  onPress={handleApply}
                  activeOpacity={0.7}
                >
                  <Text style={styles.applyText}>Apply Range</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  presetChip: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  inputRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  inputBox: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  previewText: {
    fontSize: 11,
    color: colors.primary,
    marginTop: 2,
    fontWeight: "500",
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
  clearButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  applyButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  applyText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textWhite,
  },
});
