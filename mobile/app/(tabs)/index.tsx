import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../_layout";
import Header from "../../components/Header";
import StatCard from "../../components/StatCard";
import { mobileAPI } from "../../lib/api";
import { colors, radius, spacing } from "../../lib/theme";
import { formatCurrency } from "@finlytix/shared";
import type { SummaryStats, CategoryData, UserProfile } from "@finlytix/shared";

export default function HomeScreen() {
  const { user, refreshProfile } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<SummaryStats>({
    total_income: 0,
    total_expenses: 0,
    transaction_count: 0,
  });
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboardData = useCallback(async () => {
    try {
      const [statsRes, pieRes] = await Promise.allSettled([
        mobileAPI.getSummaryStats(),
        mobileAPI.getCategoryBreakdown(),
      ]);

      if (statsRes.status === "fulfilled") setStats(statsRes.value);
      if (pieRes.status === "fulfilled") setCategories(pieRes.value);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    }
  }, []);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadDashboardData(), refreshProfile()]);
    setRefreshing(false);
  };

  const netBalance = stats.total_income - stats.total_expenses;
  const totalIncome = stats.total_income || 0;
  const totalExpenses = stats.total_expenses || 0;
  const savingsRate =
    totalIncome > 0
      ? Math.max(0, Math.round((netBalance / totalIncome) * 100))
      : 0;
  const topCategory = categories[0]?.name || "None tracked yet";
  const currency = (user as UserProfile)?.currency || "INR";

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <Header user={user} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Missing Phone Notice */}
        {user && (!user.phone || user.needsPhone) && (
          <TouchableOpacity
            style={styles.alertBanner}
            onPress={() => router.push("/settings")}
            activeOpacity={0.8}
          >
            <Text style={styles.alertIcon}>⚠️</Text>
            <View style={styles.alertTextContainer}>
              <Text style={styles.alertTitle}>Complete your profile</Text>
              <Text style={styles.alertSubtitle}>
                Add your mobile number to ensure account recovery and updates.
              </Text>
            </View>
            <Text style={styles.alertAction}>Update</Text>
          </TouchableOpacity>
        )}

        {/* Hero Money Command Center Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroBadge}>MONEY COMMAND CENTER</Text>
          <Text style={styles.heroLabel}>Net Balance</Text>
          <Text
            style={[
              styles.heroAmount,
              { color: netBalance >= 0 ? "#6ee7b7" : "#fca5a5" },
            ]}
          >
            {formatCurrency(netBalance, currency)}
          </Text>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>Savings Rate</Text>
              <Text style={styles.heroStatValue}>{savingsRate}%</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>Transactions</Text>
              <Text style={styles.heroStatValue}>
                {stats.transaction_count}
              </Text>
            </View>
          </View>
        </View>

        {/* Cashflow Metrics Grid */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricItem}>
            <StatCard
              label="Income"
              amount={totalIncome}
              type="income"
              currency={currency}
              badge="Credit"
              subtitle="All imported credits"
            />
          </View>
          <View style={styles.metricItem}>
            <StatCard
              label="Expenses"
              amount={totalExpenses}
              type="expense"
              currency={currency}
              badge="Debit"
              subtitle="Tracked spend"
            />
          </View>
        </View>

        {/* Top Category Card */}
        <View style={styles.categoryCard}>
          <View style={styles.categoryCardHeader}>
            <Text style={styles.categoryCardLabel}>Top Expense Category</Text>
            <Text style={styles.categoryCardIcon}>🏷️</Text>
          </View>
          <Text style={styles.categoryCardName}>{topCategory}</Text>
          {categories[0] ? (
            <Text style={styles.categoryCardValue}>
              {formatCurrency(categories[0].value, currency)} spent
            </Text>
          ) : null}
        </View>

        {/* Action Shortcuts */}
        <Text style={styles.sectionHeader}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/(tabs)/upload")}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.actionIconBadge,
                { backgroundColor: colors.indigoSoft },
              ]}
            >
              <Text style={styles.actionEmoji}>📤</Text>
            </View>
            <Text style={styles.actionTitle}>Upload Statement</Text>
            <Text style={styles.actionDesc}>Import PDF or XLSX files</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/(tabs)/transactions")}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.actionIconBadge,
                { backgroundColor: colors.primarySoft },
              ]}
            >
              <Text style={styles.actionEmoji}>📋</Text>
            </View>
            <Text style={styles.actionTitle}>Transactions</Text>
            <Text style={styles.actionDesc}>Review & categorize</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/(tabs)/analytics")}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.actionIconBadge,
                { backgroundColor: colors.incomeSoft },
              ]}
            >
              <Text style={styles.actionEmoji}>📊</Text>
            </View>
            <Text style={styles.actionTitle}>Analytics</Text>
            <Text style={styles.actionDesc}>Trends & monthly flow</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/(tabs)/assistant")}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.actionIconBadge,
                { backgroundColor: colors.warningSoft },
              ]}
            >
              <Text style={styles.actionEmoji}>🤖</Text>
            </View>
            <Text style={styles.actionTitle}>Ask AI</Text>
            <Text style={styles.actionDesc}>Chat with Finlytix</Text>
          </TouchableOpacity>
        </View>
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
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  alertIcon: {
    fontSize: 20,
  },
  alertTextContainer: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.warning,
  },
  alertSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  alertAction: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.warning,
  },
  heroCard: {
    backgroundColor: "#0f172a",
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  heroBadge: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#93c5fd",
    marginBottom: spacing.sm,
  },
  heroLabel: {
    fontSize: 13,
    color: "#cbd5e1",
  },
  heroAmount: {
    fontSize: 34,
    fontWeight: "800",
    marginVertical: spacing.xs,
  },
  heroStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  heroStatItem: {
    flex: 1,
  },
  heroStatLabel: {
    fontSize: 11,
    color: "#94a3b8",
  },
  heroStatValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textWhite,
    marginTop: 2,
  },
  heroStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    marginHorizontal: spacing.md,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metricItem: {
    flex: 1,
  },
  categoryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  categoryCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryCardLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    textTransform: "uppercase",
  },
  categoryCardIcon: {
    fontSize: 16,
  },
  categoryCardName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 6,
  },
  categoryCardValue: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionCard: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  actionEmoji: {
    fontSize: 18,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  actionDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
