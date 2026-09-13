import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../_layout";
import Header from "../../components/Header";
import DateRangeModal from "../../components/DateRangeModal";
import { mobileAPI } from "../../lib/api";
import { colors, radius, spacing } from "../../lib/theme";
import { formatCurrency, formatCustomDate } from "@finlytix/shared";
import type { CategoryData, SummaryStats, UserProfile } from "@finlytix/shared";

export default function AnalyticsScreen() {
  const { user } = useAuth();
  const [stats, setStats] = useState<SummaryStats>({
    total_income: 0,
    total_expenses: 0,
    transaction_count: 0,
  });
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isDateModalVisible, setIsDateModalVisible] = useState(false);

  const currency = (user as UserProfile)?.currency || "INR";
  const dateFormat = (user as UserProfile)?.date_format || "DD/MM/YYYY";

  const loadAnalytics = useCallback(async () => {
    try {
      const [statsRes, pieRes] = await Promise.allSettled([
        mobileAPI.getSummaryStats(),
        mobileAPI.getCategoryBreakdown(),
      ]);

      if (statsRes.status === "fulfilled") setStats(statsRes.value);
      if (pieRes.status === "fulfilled") setCategories(pieRes.value);
    } catch (err) {
      console.error("Analytics fetch failed:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadAnalytics();
  };

  const totalSpent = useMemo(() => {
    return categories.reduce((sum, c) => sum + (c.value || 0), 0);
  }, [categories]);

  const netBalance = stats.total_income - stats.total_expenses;
  const savingsRate =
    stats.total_income > 0
      ? Math.max(0, Math.round((netBalance / stats.total_income) * 100))
      : 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <Header
        user={user}
        title="Analytics Studio"
        subtitle="Spending insights and movement"
      />

      {/* Date Range Selector Header */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={styles.dateFilterBtn}
          onPress={() => setIsDateModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.dateFilterIcon}>📅</Text>
          <Text style={styles.dateFilterText}>
            {startDate && endDate
              ? `${formatCustomDate(startDate, dateFormat)} - ${formatCustomDate(endDate, dateFormat)}`
              : "All Time Range"}
          </Text>
          <Text style={styles.chevron}>▼</Text>
        </TouchableOpacity>
      </View>

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
        {loading ? (
          <ActivityIndicator
            color={colors.primary}
            style={{ marginTop: spacing.xl }}
          />
        ) : (
          <>
            {/* Overview Summary Card */}
            <View style={styles.summaryCard}>
              <Text style={styles.cardHeaderTitle}>CASH FLOW OVERVIEW</Text>
              <View style={styles.summaryStatsRow}>
                <View style={styles.summaryStatItem}>
                  <Text style={styles.statLabel}>Total Income</Text>
                  <Text style={[styles.statValue, { color: colors.income }]}>
                    {formatCurrency(stats.total_income, currency)}
                  </Text>
                </View>
                <View style={styles.summaryStatDivider} />
                <View style={styles.summaryStatItem}>
                  <Text style={styles.statLabel}>Total Expenses</Text>
                  <Text style={[styles.statValue, { color: colors.expense }]}>
                    {formatCurrency(stats.total_expenses, currency)}
                  </Text>
                </View>
              </View>

              <View style={styles.netCashRow}>
                <View>
                  <Text style={styles.netCashLabel}>Net Cash Flow</Text>
                  <Text
                    style={[
                      styles.netCashAmount,
                      {
                        color: netBalance >= 0 ? colors.income : colors.expense,
                      },
                    ]}
                  >
                    {formatCurrency(netBalance, currency)}
                  </Text>
                </View>
                <View style={styles.savingsRateBadge}>
                  <Text style={styles.savingsRateText}>
                    {savingsRate}% Savings
                  </Text>
                </View>
              </View>
            </View>

            {/* Category Breakdown Section */}
            <Text style={styles.sectionTitle}>Category Spending Breakdown</Text>

            {categories.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>📊</Text>
                <Text style={styles.emptyText}>
                  No spending categories available.
                </Text>
              </View>
            ) : (
              <View style={styles.categoryCard}>
                {categories.map((c, index) => {
                  const percent =
                    totalSpent > 0
                      ? Math.round((c.value / totalSpent) * 100)
                      : 0;
                  const palette = [
                    "#2563eb",
                    "#16a34a",
                    "#f59e0b",
                    "#8b5cf6",
                    "#ec4899",
                    "#06b6d4",
                    "#64748b",
                  ];
                  const barColor = palette[index % palette.length];

                  return (
                    <View key={c.name} style={styles.catRow}>
                      <View style={styles.catInfoRow}>
                        <View style={styles.catNameCol}>
                          <View
                            style={[
                              styles.catColorDot,
                              { backgroundColor: barColor },
                            ]}
                          />
                          <Text style={styles.catName} numberOfLines={1}>
                            {c.name}
                          </Text>
                        </View>
                        <View style={styles.catAmountCol}>
                          <Text style={styles.catAmount}>
                            {formatCurrency(c.value, currency)}
                          </Text>
                          <Text style={styles.catPercent}>{percent}%</Text>
                        </View>
                      </View>

                      {/* Visual progress bar */}
                      <View style={styles.progressBarBackground}>
                        <View
                          style={[
                            styles.progressBarFill,
                            {
                              width: `${Math.min(100, Math.max(4, percent))}%`,
                              backgroundColor: barColor,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Date Range Modal */}
      <DateRangeModal
        visible={isDateModalVisible}
        startDate={startDate}
        endDate={endDate}
        dateFormat={dateFormat}
        onClose={() => setIsDateModalVisible(false)}
        onApply={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  filterBar: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateFilterIcon: {
    fontSize: 14,
    marginRight: spacing.sm,
  },
  dateFilterText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  chevron: {
    fontSize: 10,
    color: colors.textMuted,
  },
  scrollContent: {
    padding: spacing.md,
    backgroundColor: colors.background,
    paddingBottom: spacing.xxl,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeaderTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  summaryStatsRow: {
    flexDirection: "row",
    marginBottom: spacing.md,
  },
  summaryStatItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  summaryStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  netCashRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  netCashLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  netCashAmount: {
    fontSize: 22,
    fontWeight: "800",
    marginTop: 2,
  },
  savingsRateBadge: {
    backgroundColor: colors.incomeSoft,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  savingsRateText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.income,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  categoryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
  },
  catInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  catNameCol: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  catColorDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    marginRight: spacing.sm,
  },
  catName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  catAmountCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  catAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  catPercent: {
    fontSize: 12,
    color: colors.textMuted,
    width: 32,
    textAlign: "right",
  },
  progressBarBackground: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: radius.full,
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
    fontSize: 32,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
