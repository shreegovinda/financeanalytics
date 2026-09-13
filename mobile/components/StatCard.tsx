import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radius, spacing } from "../lib/theme";
import { formatCurrency } from "@finlytix/shared";

interface StatCardProps {
  label: string;
  amount: number;
  type?: "neutral" | "income" | "expense";
  currency?: string;
  subtitle?: string;
  badge?: string;
}

export default function StatCard({
  label,
  amount,
  type = "neutral",
  currency = "INR",
  subtitle,
  badge,
}: StatCardProps) {
  const isIncome = type === "income" || (type === "neutral" && amount >= 0);
  const isExpense = type === "expense" || (type === "neutral" && amount < 0);

  let amountColor = colors.textPrimary;
  let bgBadgeColor = colors.surfaceSubtle;
  let badgeTextColor = colors.textSecondary;

  if (type === "income") {
    amountColor = colors.income;
    bgBadgeColor = colors.incomeSoft;
    badgeTextColor = colors.income;
  } else if (type === "expense") {
    amountColor = colors.expense;
    bgBadgeColor = colors.expenseSoft;
    badgeTextColor = colors.expense;
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: bgBadgeColor }]}>
            <Text style={[styles.badgeText, { color: badgeTextColor }]}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
        {formatCurrency(amount, currency)}
      </Text>

      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  amount: {
    fontSize: 22,
    fontWeight: "800",
    marginVertical: spacing.xs,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
});
