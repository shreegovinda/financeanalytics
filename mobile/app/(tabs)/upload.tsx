import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../_layout";
import Header from "../../components/Header";
import { mobileAPI } from "../../lib/api";
import { colors, radius, spacing } from "../../lib/theme";
import { formatCustomDate, formatCurrency } from "@finlytix/shared";
import type { Statement, StatementDraft, UserProfile } from "@finlytix/shared";

export default function UploadScreen() {
  const { user } = useAuth();
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loadingStatements, setLoadingStatements] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Draft review
  const [pendingDraft, setPendingDraft] = useState<StatementDraft | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const currency = (user as UserProfile)?.currency || "INR";
  const dateFormat = (user as UserProfile)?.date_format || "DD/MM/YYYY";

  const loadStatements = useCallback(async () => {
    try {
      const list = await mobileAPI.getStatements();
      setStatements(list);
    } catch (err) {
      console.error("Failed to load statements:", err);
    } finally {
      setLoadingStatements(false);
    }
  }, []);

  useEffect(() => {
    void loadStatements();
  }, [loadStatements]);

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0)
        return;

      const file = result.assets[0];
      await performUpload(
        file.uri,
        file.name,
        file.mimeType || "application/pdf",
      );
    } catch (err) {
      Alert.alert("Error", "Failed to pick file from device.");
    }
  };

  const handleScanReceipt = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Camera access is required to scan bills and receipts.",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0)
        return;

      const photo = result.assets[0];
      const filename = `receipt-${Date.now()}.jpg`;
      await performUpload(photo.uri, filename, "image/jpeg");
    } catch (err) {
      Alert.alert("Error", "Camera capture failed.");
    }
  };

  const performUpload = async (
    uri: string,
    filename: string,
    mimeType: string,
  ) => {
    setUploading(true);
    setUploadProgress("Uploading statement to server...");

    try {
      const res = await mobileAPI.uploadStatement(uri, filename, mimeType);
      setUploadProgress("Extracting transactions with AI...");

      // Check if a draft was generated
      if (res.statementId) {
        try {
          const draftRes = await mobileAPI.getStatementDraft(res.statementId);
          if (draftRes?.draft) {
            setPendingDraft(draftRes.draft);
          }
        } catch {
          // Normal async pipeline or background parsing
        }
      }

      await loadStatements();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Statement upload failed.";
      Alert.alert("Upload Failed", msg);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleConfirmDraft = async () => {
    if (!pendingDraft) return;
    setActionBusy(true);
    try {
      const res = await mobileAPI.confirmStatementDraft(
        pendingDraft.statement_id,
      );
      Alert.alert(
        "Success",
        `Imported ${res.importedCount || 0} transactions successfully!`,
      );
      setPendingDraft(null);
      await loadStatements();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to confirm statement.";
      Alert.alert("Confirmation Error", msg);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDiscardDraft = async () => {
    if (!pendingDraft) return;
    setActionBusy(true);
    try {
      await mobileAPI.discardStatementDraft(pendingDraft.statement_id);
      setPendingDraft(null);
      await loadStatements();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to discard draft.";
      Alert.alert("Error", msg);
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <Header
        user={user}
        title="Upload Statement"
        subtitle="PDF, Excel or Receipt scanning"
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Upload Action Cards */}
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.uploadCard}
            onPress={handlePickDocument}
            disabled={uploading}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: colors.primarySoft },
              ]}
            >
              <Text style={styles.iconEmoji}>📄</Text>
            </View>
            <Text style={styles.uploadCardTitle}>Select Statement</Text>
            <Text style={styles.uploadCardDesc}>
              PDF or XLSX bank files (up to 10MB)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.uploadCard}
            onPress={handleScanReceipt}
            disabled={uploading}
            activeOpacity={0.8}
          >
            <View
              style={[styles.iconBadge, { backgroundColor: colors.indigoSoft }]}
            >
              <Text style={styles.iconEmoji}>📷</Text>
            </View>
            <Text style={styles.uploadCardTitle}>Scan Receipt</Text>
            <Text style={styles.uploadCardDesc}>
              Capture receipt or invoice image
            </Text>
          </TouchableOpacity>
        </View>

        {/* Uploading progress indicator */}
        {uploading && (
          <View style={styles.progressCard}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.progressText}>{uploadProgress}</Text>
          </View>
        )}

        {/* Pending Draft Review Card */}
        {pendingDraft && (
          <View style={styles.draftCard}>
            <View style={styles.draftHeader}>
              <Text style={styles.draftBadge}>DRAFT PENDING REVIEW</Text>
              <Text style={styles.draftBank}>{pendingDraft.detected_bank}</Text>
              <Text style={styles.draftMonth}>
                Month: {pendingDraft.detected_month}
              </Text>
            </View>

            <View style={styles.draftStatsRow}>
              <View style={styles.draftStat}>
                <Text style={styles.draftStatLabel}>Credits</Text>
                <Text style={[styles.draftStatValue, { color: colors.income }]}>
                  {formatCurrency(pendingDraft.total_credits || 0, currency)}
                </Text>
              </View>
              <View style={styles.draftStat}>
                <Text style={styles.draftStatLabel}>Debits</Text>
                <Text
                  style={[styles.draftStatValue, { color: colors.expense }]}
                >
                  {formatCurrency(pendingDraft.total_debits || 0, currency)}
                </Text>
              </View>
              <View style={styles.draftStat}>
                <Text style={styles.draftStatLabel}>Entries</Text>
                <Text style={styles.draftStatValue}>
                  {pendingDraft.transactions_count}
                </Text>
              </View>
            </View>

            <View style={styles.draftActionsRow}>
              <TouchableOpacity
                style={styles.discardBtn}
                onPress={handleDiscardDraft}
                disabled={actionBusy}
              >
                <Text style={styles.discardBtnText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleConfirmDraft}
                disabled={actionBusy}
              >
                {actionBusy ? (
                  <ActivityIndicator color={colors.textWhite} size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Confirm Import</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Statements History */}
        <Text style={styles.sectionHeader}>Import History</Text>

        {loadingStatements ? (
          <ActivityIndicator
            color={colors.primary}
            style={{ marginTop: spacing.lg }}
          />
        ) : statements.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={styles.emptyTitle}>No statements uploaded yet</Text>
            <Text style={styles.emptyDesc}>
              Choose a statement above to begin automatic AI extraction.
            </Text>
          </View>
        ) : (
          statements.map((stmt) => {
            const isDone = stmt.status === "completed";
            const isFailed = stmt.status === "failed";
            const isProc = !isDone && !isFailed;

            return (
              <View key={stmt.id} style={styles.historyCard}>
                <View style={styles.historyLeft}>
                  <Text style={styles.historyBank}>
                    {stmt.bank_name || "Bank Statement"}
                  </Text>
                  <Text style={styles.historyFile} numberOfLines={1}>
                    {stmt.file_name}
                  </Text>
                  <Text style={styles.historyDate}>
                    Uploaded {formatCustomDate(stmt.uploaded_at, dateFormat)}
                  </Text>
                </View>

                <View style={styles.historyRight}>
                  <View
                    style={[
                      styles.statusPill,
                      isDone && styles.statusPillDone,
                      isFailed && styles.statusPillFailed,
                      isProc && styles.statusPillProc,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        isDone && styles.statusTextDone,
                        isFailed && styles.statusTextFailed,
                        isProc && styles.statusTextProc,
                      ]}
                    >
                      {stmt.status.toUpperCase()}
                    </Text>
                  </View>
                  {stmt.statement_month ? (
                    <Text style={styles.monthBadge}>
                      {stmt.statement_month}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    padding: spacing.md,
    backgroundColor: colors.background,
    paddingBottom: spacing.xxl,
  },
  actionGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  uploadCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  iconEmoji: {
    fontSize: 22,
  },
  uploadCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
    textAlign: "center",
  },
  uploadCardDesc: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
  },
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  progressText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primaryDark,
  },
  draftCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  draftHeader: {
    marginBottom: spacing.md,
  },
  draftBadge: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.primary,
    marginBottom: 4,
  },
  draftBank: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  draftMonth: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  draftStatsRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  draftStat: {
    flex: 1,
    alignItems: "center",
  },
  draftStatLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  draftStatValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  draftActionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  discardBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  discardBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  confirmBtn: {
    flex: 2,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textWhite,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginVertical: spacing.md,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
  },
  historyCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  historyLeft: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  historyBank: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  historyFile: {
    fontSize: 12,
    color: colors.textSecondary,
    marginVertical: 2,
  },
  historyDate: {
    fontSize: 11,
    color: colors.textMuted,
  },
  historyRight: {
    alignItems: "flex-end",
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusPillDone: {
    backgroundColor: colors.incomeSoft,
    borderColor: "#86efac",
  },
  statusPillFailed: {
    backgroundColor: colors.expenseSoft,
    borderColor: "#fca5a5",
  },
  statusPillProc: {
    backgroundColor: colors.warningSoft,
    borderColor: "#fde68a",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusTextDone: {
    color: colors.income,
  },
  statusTextFailed: {
    color: colors.expense,
  },
  statusTextProc: {
    color: colors.warning,
  },
  monthBadge: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    fontWeight: "500",
  },
});
