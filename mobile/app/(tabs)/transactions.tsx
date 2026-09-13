import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../_layout";
import Header from "../../components/Header";
import TransactionItem from "../../components/TransactionItem";
import DateRangeModal from "../../components/DateRangeModal";
import EmptyState from "../../components/EmptyState";
import { mobileAPI } from "../../lib/api";
import { colors, radius, spacing } from "../../lib/theme";
import { formatCustomDate } from "@finlytix/shared";
import type { Transaction, Category, UserProfile } from "@finlytix/shared";

export default function TransactionsScreen() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "debit" | "credit">(
    "all",
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isDateModalVisible, setIsDateModalVisible] = useState(false);

  // Category Editor Modal
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [updatingCategory, setUpdatingCategory] = useState(false);

  const currency = (user as UserProfile)?.currency || "INR";
  const dateFormat = (user as UserProfile)?.date_format || "DD/MM/YYYY";

  const loadData = useCallback(async () => {
    try {
      const [txns, cats] = await Promise.all([
        mobileAPI.getTransactions(startDate, endDate),
        mobileAPI.getCategories(),
      ]);
      setTransactions(txns);
      setCategories(cats);
    } catch (err) {
      console.error("Failed to load transactions:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    setLoading(true);
    void loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  const handleUpdateCategory = async (categoryId: string) => {
    if (!selectedTxn) return;
    setUpdatingCategory(true);
    try {
      const updated = await mobileAPI.updateTransactionCategory(
        selectedTxn.id,
        categoryId,
      );
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === updated.id ? { ...t, category_id: categoryId } : t,
        ),
      );
      setSelectedTxn(null);
    } catch (err) {
      console.error("Category update failed:", err);
    } finally {
      setUpdatingCategory(false);
    }
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // Type filter
      if (typeFilter !== "all" && t.type?.toLowerCase() !== typeFilter) {
        return false;
      }
      // Search query
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const descMatch = t.description?.toLowerCase().includes(q);
        const amtMatch = String(t.amount).includes(q);
        const bankMatch = t.bank_name?.toLowerCase().includes(q);
        if (!descMatch && !amtMatch && !bankMatch) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, search]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <Header
        user={user}
        title="Transactions"
        subtitle="Review and categorize movements"
      />

      <View style={styles.filterSection}>
        {/* Search Input */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by description or amount..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={colors.textMuted}
          />
          {search ? (
            <TouchableOpacity
              onPress={() => setSearch("")}
              style={styles.clearSearchBtn}
            >
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filters Row: Type Segment + Date Range Picker */}
        <View style={styles.subFilterRow}>
          <View style={styles.segmentedControl}>
            {(["all", "debit", "credit"] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.segmentBtn,
                  typeFilter === mode && styles.segmentBtnActive,
                ]}
                onPress={() => setTypeFilter(mode)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    typeFilter === mode && styles.segmentTextActive,
                  ]}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[
              styles.dateFilterBtn,
              (startDate || endDate) && styles.dateFilterBtnActive,
            ]}
            onPress={() => setIsDateModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.dateFilterIcon}>📅</Text>
            <Text
              style={[
                styles.dateFilterLabel,
                (startDate || endDate) && styles.dateFilterLabelActive,
              ]}
              numberOfLines={1}
            >
              {startDate && endDate
                ? `${formatCustomDate(startDate, dateFormat)} - ${formatCustomDate(endDate, dateFormat)}`
                : "Date Range"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TransactionItem
              transaction={item}
              category={
                item.category_id ? categoryMap.get(item.category_id) : undefined
              }
              currency={currency}
              dateFormat={dateFormat}
              onPress={() => setSelectedTxn(item)}
            />
          )}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={
            filteredTransactions.length === 0
              ? styles.emptyContainer
              : undefined
          }
          ListEmptyComponent={
            <EmptyState
              icon="📋"
              title="No transactions found"
              description={
                search || typeFilter !== "all" || startDate
                  ? "Try clearing your search or date filters to view all entries."
                  : "Upload your first bank statement to begin tracking transactions."
              }
            />
          }
        />
      )}

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

      {/* Category Selection Sheet */}
      <Modal
        visible={Boolean(selectedTxn)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedTxn(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.dragHandle} />
            <Text style={styles.modalTitle}>Change Category</Text>
            {selectedTxn ? (
              <Text style={styles.modalSubtitle} numberOfLines={1}>
                {selectedTxn.description}
              </Text>
            ) : null}

            {updatingCategory ? (
              <ActivityIndicator
                style={{ marginVertical: spacing.xl }}
                color={colors.primary}
              />
            ) : (
              <ScrollView style={styles.categoryList}>
                {categories.map((c) => {
                  const isCurrent = selectedTxn?.category_id === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.categoryOption,
                        isCurrent && styles.categoryOptionCurrent,
                      ]}
                      onPress={() => handleUpdateCategory(c.id)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.categoryDot,
                          { backgroundColor: c.color },
                        ]}
                      />
                      <Text style={styles.categoryOptionText}>{c.name}</Text>
                      {isCurrent ? (
                        <Text style={styles.checkIcon}>✓</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setSelectedTxn(null)}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  filterSection: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  subFilterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: 2,
  },
  segmentBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  segmentBtnActive: {
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.primary,
  },
  dateFilterBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    gap: 6,
  },
  dateFilterBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  dateFilterIcon: {
    fontSize: 13,
  },
  dateFilterLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    flex: 1,
  },
  dateFilterLabelActive: {
    color: colors.primary,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    padding: spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: "75%",
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  categoryList: {
    marginVertical: spacing.sm,
  },
  categoryOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryOptionCurrent: {
    backgroundColor: colors.primarySoft,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    marginRight: spacing.md,
  },
  categoryOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  checkIcon: {
    color: colors.primary,
    fontWeight: "800",
  },
  cancelBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
});
