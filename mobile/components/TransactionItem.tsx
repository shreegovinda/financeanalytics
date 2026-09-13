import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, radius, spacing } from "../lib/theme";
import { formatCurrency, formatCustomDate } from "@finlytix/shared";
import type { Transaction, Category } from "@finlytix/shared";

interface TransactionItemProps {
  transaction: Transaction;
  category?: Category;
  currency?: string;
  dateFormat?: string;
  onPress?: () => void;
}

export default function TransactionItem({
  transaction,
  category,
  currency = "INR",
  dateFormat = "DD/MM/YYYY",
  onPress,
}: TransactionItemProps) {
  const isCredit = transaction.type?.toLowerCase() === "credit";
  const amountNum =
    typeof transaction.amount === "string"
      ? parseFloat(transaction.amount)
      : transaction.amount;

  const categoryName =
    category?.name || transaction.ai_suggested_category || "Uncategorized";
  const categoryColor = category?.color || "#64748b";

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.leftContent}>
        <View
          style={[
            styles.categoryPill,
            {
              borderColor: categoryColor + "40",
              backgroundColor: categoryColor + "15",
            },
          ]}
        >
          <View
            style={[styles.categoryDot, { backgroundColor: categoryColor }]}
          />
          <Text
            style={[styles.categoryText, { color: categoryColor }]}
            numberOfLines={1}
          >
            {categoryName}
          </Text>
        </View>

        <Text style={styles.description} numberOfLines={1}>
          {transaction.description || "Transaction"}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.dateText}>
            {formatCustomDate(transaction.date, dateFormat)}
          </Text>
          {transaction.bank_name ? (
            <>
              <Text style={styles.dotSeparator}>•</Text>
              <Text style={styles.bankText} numberOfLines={1}>
                {transaction.bank_name}
              </Text>
            </>
          ) : null}
          {transaction.has_bill ? (
            <>
              <Text style={styles.dotSeparator}>•</Text>
              <Text style={styles.billBadge}>🧾 Bill</Text>
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.rightContent}>
        <Text
          style={[
            styles.amount,
            { color: isCredit ? colors.income : colors.expense },
          ]}
          numberOfLines={1}
        >
          {isCredit ? "+" : "-"} {formatCurrency(Math.abs(amountNum), currency)}
        </Text>
        <Text style={styles.typeLabel}>{isCredit ? "Credit" : "Debit"}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  leftContent: {
    flex: 1,
    paddingRight: spacing.md,
  },
  categoryPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    marginBottom: 4,
    gap: 4,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: "600",
  },
  description: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dateText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  dotSeparator: {
    fontSize: 12,
    color: colors.textMuted,
    marginHorizontal: 4,
  },
  bankText: {
    fontSize: 12,
    color: colors.textSecondary,
    maxWidth: 110,
  },
  billBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.indigo,
  },
  rightContent: {
    alignItems: "flex-end",
  },
  amount: {
    fontSize: 15,
    fontWeight: "700",
  },
  typeLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
