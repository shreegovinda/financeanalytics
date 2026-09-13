import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useAuth } from "./_layout";
import { mobileAPI } from "../lib/api";
import {
  isBiometricsEnabled,
  setBiometricsEnabled,
} from "../lib/secureStorage";
import {
  checkBiometricSupport,
  authenticateWithBiometrics,
} from "../lib/biometrics";
import { colors, radius, spacing } from "../lib/theme";
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_TIMEZONES,
  SUPPORTED_DATE_FORMATS,
  SUPPORTED_TIME_FORMATS,
  formatCustomDate,
  formatCustomDateTime,
  formatCurrency,
} from "@finlytix/shared";
import type {
  UserProfile,
  Bank,
  BankChoice,
  CostTransparency,
} from "@finlytix/shared";

type TabKey = "profile" | "regional" | "ai" | "banks";

export default function SettingsScreen() {
  const { user, logout, refreshProfile } = useAuth();
  const profile = user as UserProfile | null;

  const [activeTab, setActiveTab] = useState<TabKey>("profile");

  // Profile Form state
  const [name, setName] = useState(profile?.name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [savingProfile, setSavingProfile] = useState(false);

  // Security / Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Biometrics
  const [biometricsOn, setBiometricsOn] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Face ID / Fingerprint");
  const [hasBiometricHardware, setHasBiometricHardware] = useState(false);

  // Regional & Formats
  const [currency, setCurrency] = useState(profile?.currency || "INR");
  const [timezone, setTimezone] = useState(profile?.timezone || "Asia/Kolkata");
  const [dateFormat, setDateFormat] = useState(
    profile?.date_format || "DD/MM/YYYY",
  );
  const [timeFormat, setTimeFormat] = useState(profile?.time_format || "12h");
  const [savingPreferences, setSavingPreferences] = useState(false);

  // AI & BYOK
  const [aiProvider, setAiProvider] = useState(
    profile?.selected_ai_provider || "gemini",
  );
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingAiKey, setSavingAiKey] = useState(false);

  // Banks
  const [banks, setBanks] = useState<Bank[]>([]);
  const [catalogue, setCatalogue] = useState<BankChoice[]>([]);
  const [bankSearch, setBankSearch] = useState("");
  const [loadingBanks, setLoadingBanks] = useState(false);

  // Cost Transparency & Platform Footprint
  const [costTransparency, setCostTransparency] =
    useState<CostTransparency | null>(null);
  const [loadingCost, setLoadingCost] = useState(false);

  useEffect(() => {
    async function loadBio() {
      const support = await checkBiometricSupport();
      setHasBiometricHardware(support.hasHardware && support.isEnrolled);
      setBiometricLabel(support.supportedTypeLabel);
      const enabled = await isBiometricsEnabled();
      setBiometricsOn(enabled);
    }
    void loadBio();
  }, []);

  const loadCostData = async () => {
    setLoadingCost(true);
    try {
      const res = await mobileAPI.getCostTransparency();
      if (res?.transparency) {
        setCostTransparency(res.transparency);
      }
    } catch (err) {
      console.error("Failed to load cost transparency:", err);
    } finally {
      setLoadingCost(false);
    }
  };

  useEffect(() => {
    if (activeTab === "profile") {
      void loadCostData();
    } else if (activeTab === "banks") {
      void loadBanksData();
    }
  }, [activeTab]);

  const loadBanksData = async () => {
    setLoadingBanks(true);
    try {
      const [bList, cList] = await Promise.all([
        mobileAPI.getBanks(),
        mobileAPI.getBankCatalogue(),
      ]);
      setBanks(bList);
      setCatalogue(cList);
    } catch (err) {
      console.error("Failed to load banks:", err);
    } finally {
      setLoadingBanks(false);
    }
  };

  const handleToggleBiometrics = async (val: boolean) => {
    if (val) {
      const authed = await authenticateWithBiometrics(
        "Confirm your biometrics to enable fast unlock",
      );
      if (authed) {
        await setBiometricsEnabled(true);
        setBiometricsOn(true);
      }
    } else {
      await setBiometricsEnabled(false);
      setBiometricsOn(false);
    }
  };

  const handleSaveProfile = async () => {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      Alert.alert("Validation Error", "Name cannot be empty.");
      return;
    }
    if (!trimmedPhone || !/^\+[1-9]\d{7,14}$/.test(trimmedPhone)) {
      Alert.alert(
        "Validation Error",
        "A mobile number with country code is required (e.g. +919876543210).",
      );
      return;
    }

    setSavingProfile(true);
    try {
      await mobileAPI.updateProfile({ name: trimmedName, phone: trimmedPhone });
      await refreshProfile();
      Alert.alert("Success", "Profile updated successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Update failed.";
      Alert.alert("Error", msg);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert("Error", "Please enter your current and new password.");
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert("Error", "New password must be at least 8 characters long.");
      return;
    }

    setSavingPassword(true);
    try {
      await mobileAPI.updatePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      Alert.alert("Success", "Password updated successfully.");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Password update failed.";
      Alert.alert("Error", msg);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSavePreferences = async () => {
    setSavingPreferences(true);
    try {
      await mobileAPI.updateProfile({
        currency,
        timezone,
        date_format: dateFormat,
        time_format: timeFormat,
      });
      await refreshProfile();
      Alert.alert("Success", "Preferences saved.");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to save preferences.";
      Alert.alert("Error", msg);
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleSaveAiKey = async () => {
    if (!apiKeyInput.trim()) {
      Alert.alert("Error", "Please enter a valid API key.");
      return;
    }

    setSavingAiKey(true);
    try {
      await mobileAPI.saveAiKey(aiProvider, apiKeyInput.trim());
      setApiKeyInput("");
      await refreshProfile();
      Alert.alert(
        "Key Encrypted & Saved",
        "Personal AI key saved securely with AES-256-GCM.",
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save key.";
      Alert.alert("Error", msg);
    } finally {
      setSavingAiKey(false);
    }
  };

  const handleAddBank = async (catalogueId: string) => {
    try {
      await mobileAPI.addBank(catalogueId);
      await loadBanksData();
      Alert.alert("Bank Added", "New bank account linked successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add bank.";
      Alert.alert("Error", msg);
    }
  };

  const handleDeleteBank = async (id: string, bankName: string) => {
    Alert.alert("Remove Bank", `Are you sure you want to remove ${bankName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await mobileAPI.deleteBank(id);
            await loadBanksData();
          } catch (err) {
            Alert.alert("Error", "Failed to remove bank.");
          }
        },
      },
    ]);
  };

  const filteredCatalogue = catalogue.filter((b) =>
    b.name.toLowerCase().includes(bankSearch.trim().toLowerCase()),
  );

  return (
    <View style={styles.container}>
      {/* Top Segmented Tab Navigation */}
      <View style={styles.tabsRow}>
        {[
          { key: "profile", label: "Profile" },
          { key: "regional", label: "Formats" },
          { key: "ai", label: "AI & Keys" },
          { key: "banks", label: "Banks" },
        ].map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, activeTab === t.key && styles.tabBtnActive]}
            onPress={() => setActiveTab(t.key as TabKey)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === t.key && styles.tabTextActive,
              ]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* TAB 1: PROFILE & SECURITY */}
        {activeTab === "profile" && (
          <View>
            <View style={styles.sectionCard}>
              <Text style={styles.cardTitle}>Personal Details</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your Name"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Mobile Number (Required)</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+919876543210"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email (Verified)</Text>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={profile?.email || ""}
                  editable={false}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  savingProfile && styles.btnDisabled,
                ]}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator color={colors.textWhite} />
                ) : (
                  <Text style={styles.primaryButtonText}>Save Details</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Biometrics */}
            {hasBiometricHardware && (
              <View style={styles.sectionCard}>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchTitle}>
                      Unlock with {biometricLabel}
                    </Text>
                    <Text style={styles.switchDesc}>
                      Fast, secure login without typing your password each time.
                    </Text>
                  </View>
                  <Switch
                    value={biometricsOn}
                    onValueChange={handleToggleBiometrics}
                    trackColor={{ true: colors.primary, false: colors.border }}
                  />
                </View>
              </View>
            )}

            {/* Security / Password */}
            <View style={styles.sectionCard}>
              <Text style={styles.cardTitle}>Change Password</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Current Password</Text>
                <TextInput
                  style={styles.input}
                  secureTextEntry
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="••••••••"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  New Password (min 8 chars)
                </Text>
                <TextInput
                  style={styles.input}
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="••••••••"
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  savingPassword && styles.btnDisabled,
                ]}
                onPress={handleUpdatePassword}
                disabled={savingPassword}
              >
                {savingPassword ? (
                  <ActivityIndicator color={colors.textPrimary} />
                ) : (
                  <Text style={styles.secondaryButtonText}>
                    Update Password
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Cost Transparency & Platform Footprint */}
            <View style={styles.sectionCard}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1, paddingRight: spacing.xs }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.cardTitle}>Cost Transparency</Text>
                    <View style={styles.transparencyBadge}>
                      <Text style={styles.transparencyBadgeText}>
                        Open Footprint
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardSubtitle}>
                    Committed to user information rights. Itemized cloud
                    compute, encrypted vault storage, and AI processing Finlytix
                    expends on your account.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.refreshBtn}
                  onPress={loadCostData}
                  disabled={loadingCost}
                >
                  <Text style={styles.refreshBtnText}>
                    {loadingCost ? "..." : "↻ Refresh"}
                  </Text>
                </TouchableOpacity>
              </View>

              {costTransparency ? (
                <View style={{ marginTop: spacing.md }}>
                  {/* Highlight Cards Grid */}
                  <View style={styles.metricsGrid}>
                    <View
                      style={[
                        styles.metricCard,
                        { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" },
                      ]}
                    >
                      <Text style={[styles.metricLabel, { color: "#1d4ed8" }]}>
                        TOTAL SERVE COST
                      </Text>
                      <Text style={styles.metricValue}>
                        {formatCurrency(
                          costTransparency.costs.total_platform_cost,
                          costTransparency.currency,
                        )}
                      </Text>
                      <Text style={styles.metricSub}>Cumulative spent</Text>
                    </View>

                    <View
                      style={[
                        styles.metricCard,
                        { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" },
                      ]}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={[styles.metricLabel, { color: "#047857" }]}
                        >
                          AI INTELLIGENCE
                        </Text>
                        {costTransparency.is_byok && (
                          <View style={styles.byokPill}>
                            <Text style={styles.byokPillText}>BYOK $0</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.metricValue}>
                        {formatCurrency(
                          costTransparency.costs.total_ai_cost,
                          costTransparency.currency,
                        )}
                      </Text>
                      <Text
                        style={[styles.metricSub, { color: "#059669" }]}
                        numberOfLines={1}
                      >
                        {costTransparency.is_byok
                          ? "Personal key active"
                          : `${costTransparency.ai_provider} (${costTransparency.ai_model})`}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.metricCard,
                        { backgroundColor: "#faf5ff", borderColor: "#e9d5ff" },
                      ]}
                    >
                      <Text style={[styles.metricLabel, { color: "#7e22ce" }]}>
                        ENCRYPTED VAULT
                      </Text>
                      <Text style={styles.metricValue}>
                        {costTransparency.usage.storage_formatted}
                      </Text>
                      <Text style={[styles.metricSub, { color: "#9333ea" }]}>
                        {formatCurrency(
                          costTransparency.costs.storage_cost,
                          costTransparency.currency,
                        )}{" "}
                        cost
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.metricCard,
                        { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
                      ]}
                    >
                      <Text style={[styles.metricLabel, { color: "#b45309" }]}>
                        LEDGER COMPUTE
                      </Text>
                      <Text style={styles.metricValue}>
                        {formatCurrency(
                          costTransparency.costs.compute_cost,
                          costTransparency.currency,
                        )}
                      </Text>
                      <Text style={[styles.metricSub, { color: "#d97706" }]}>
                        {costTransparency.usage.transactions_count} records
                      </Text>
                    </View>
                  </View>

                  {/* Breakdown rows */}
                  <View style={styles.breakdownBox}>
                    <Text style={styles.breakdownHeader}>
                      WORKLOAD BREAKDOWN
                    </Text>

                    <View style={styles.breakdownRow}>
                      <View style={{ flex: 1, paddingRight: spacing.sm }}>
                        <Text style={styles.breakdownItemTitle}>
                          AI Statement Extraction
                        </Text>
                        <Text style={styles.breakdownItemDesc}>
                          {costTransparency.usage.statements_processed}{" "}
                          statements processed
                        </Text>
                      </View>
                      <Text style={styles.breakdownItemCost}>
                        {formatCurrency(
                          costTransparency.costs.ai_parsing_cost,
                          costTransparency.currency,
                        )}
                      </Text>
                    </View>

                    <View style={styles.breakdownRow}>
                      <View style={{ flex: 1, paddingRight: spacing.sm }}>
                        <Text style={styles.breakdownItemTitle}>
                          AI Intelligent Categorization
                        </Text>
                        <Text style={styles.breakdownItemDesc}>
                          {costTransparency.usage.transactions_count}{" "}
                          transactions
                        </Text>
                      </View>
                      <Text style={styles.breakdownItemCost}>
                        {formatCurrency(
                          costTransparency.costs.ai_categorization_cost,
                          costTransparency.currency,
                        )}
                      </Text>
                    </View>

                    <View style={styles.breakdownRow}>
                      <View style={{ flex: 1, paddingRight: spacing.sm }}>
                        <Text style={styles.breakdownItemTitle}>
                          Finlytix AI Assistant
                        </Text>
                        <Text style={styles.breakdownItemDesc}>
                          {costTransparency.usage.chat_messages_count} assistant
                          queries
                        </Text>
                      </View>
                      <Text style={styles.breakdownItemCost}>
                        {formatCurrency(
                          costTransparency.costs.ai_chat_cost,
                          costTransparency.currency,
                        )}
                      </Text>
                    </View>

                    <View style={styles.breakdownRow}>
                      <View style={{ flex: 1, paddingRight: spacing.sm }}>
                        <Text style={styles.breakdownItemTitle}>
                          Encrypted Vault Storage
                        </Text>
                        <Text style={styles.breakdownItemDesc}>
                          {costTransparency.usage.storage_formatted} (
                          {costTransparency.usage.statements_total} files)
                        </Text>
                      </View>
                      <Text style={styles.breakdownItemCost}>
                        {formatCurrency(
                          costTransparency.costs.storage_cost,
                          costTransparency.currency,
                        )}
                      </Text>
                    </View>

                    <View
                      style={[styles.breakdownRow, { borderBottomWidth: 0 }]}
                    >
                      <View style={{ flex: 1, paddingRight: spacing.sm }}>
                        <Text style={styles.breakdownItemTitle}>
                          PostgreSQL Ledger Compute
                        </Text>
                        <Text style={styles.breakdownItemDesc}>
                          ACID transactions & audit logs
                        </Text>
                      </View>
                      <Text style={styles.breakdownItemCost}>
                        {formatCurrency(
                          costTransparency.costs.compute_cost,
                          costTransparency.currency,
                        )}
                      </Text>
                    </View>
                  </View>

                  {/* Disclosures banner */}
                  <View style={styles.disclosureBanner}>
                    <Text style={styles.disclosureTitle}>
                      🛡️ {costTransparency.disclosures.transparency_commitment}
                    </Text>
                    <Text style={styles.disclosureText}>
                      {costTransparency.disclosures.byok_notice}
                    </Text>
                    <Text
                      style={[
                        styles.disclosureText,
                        { marginTop: 4, fontStyle: "italic" },
                      ]}
                    >
                      {costTransparency.disclosures.rates_notice}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.loadingText}>
                    Loading cost footprint...
                  </Text>
                </View>
              )}
            </View>

            {/* Sign Out */}
            <TouchableOpacity style={styles.logoutButton} onPress={logout}>
              <Text style={styles.logoutButtonText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TAB 2: REGIONAL & FORMATS */}
        {activeTab === "regional" && (
          <View>
            {/* Live Preview Card */}
            <View style={styles.previewCard}>
              <Text style={styles.previewBadge}>FORMATTING PREVIEW</Text>
              <Text style={styles.previewDate}>
                {formatCustomDateTime(new Date(), dateFormat, timeFormat)}
              </Text>
              <Text style={styles.previewCurrency}>
                Selected Currency: {currency}
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.cardTitle}>Currency</Text>
              <View style={styles.chipRow}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[
                      styles.chip,
                      currency === c.code && styles.chipActive,
                    ]}
                    onPress={() => setCurrency(c.code)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        currency === c.code && styles.chipTextActive,
                      ]}
                    >
                      {c.code} ({c.symbol})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.cardTitle, { marginTop: spacing.lg }]}>
                Date Format
              </Text>
              <View style={styles.chipRow}>
                {SUPPORTED_DATE_FORMATS.map((f) => (
                  <TouchableOpacity
                    key={f.code}
                    style={[
                      styles.chip,
                      dateFormat === f.code && styles.chipActive,
                    ]}
                    onPress={() => setDateFormat(f.code)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        dateFormat === f.code && styles.chipTextActive,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.cardTitle, { marginTop: spacing.lg }]}>
                Time Format
              </Text>
              <View style={styles.chipRow}>
                {SUPPORTED_TIME_FORMATS.map((t) => (
                  <TouchableOpacity
                    key={t.code}
                    style={[
                      styles.chip,
                      timeFormat === t.code && styles.chipActive,
                    ]}
                    onPress={() => setTimeFormat(t.code)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        timeFormat === t.code && styles.chipTextActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: spacing.xl }]}
                onPress={handleSavePreferences}
                disabled={savingPreferences}
              >
                {savingPreferences ? (
                  <ActivityIndicator color={colors.textWhite} />
                ) : (
                  <Text style={styles.primaryButtonText}>Save Formats</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* TAB 3: AI & BYOK KEYS */}
        {activeTab === "ai" && (
          <View>
            <View style={styles.sectionCard}>
              <Text style={styles.cardTitle}>Active AI Provider</Text>
              <View style={styles.chipRow}>
                {[
                  { id: "gemini", label: "Google Gemini (2.5 Flash)" },
                  { id: "anthropic", label: "Claude (Sonnet 3.5)" },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.chip,
                      aiProvider === item.id && styles.chipActive,
                    ]}
                    onPress={() => setAiProvider(item.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        aiProvider === item.id && styles.chipTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.cardTitle, { marginTop: spacing.lg }]}>
                Personal Encrypted API Key (BYOK)
              </Text>
              <Text style={styles.helperText}>
                Encrypted on server with AES-256-GCM. Used exclusively for your
                statement parsing and chat.
              </Text>

              <TextInput
                style={[styles.input, { marginTop: spacing.sm }]}
                placeholder="Paste API Key (AIza... or sk-ant-...)"
                secureTextEntry
                value={apiKeyInput}
                onChangeText={setApiKeyInput}
              />

              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: spacing.md }]}
                onPress={handleSaveAiKey}
                disabled={savingAiKey}
              >
                {savingAiKey ? (
                  <ActivityIndicator color={colors.textWhite} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Save Encrypted Key
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* TAB 4: BANKS */}
        {activeTab === "banks" && (
          <View>
            <View style={styles.sectionCard}>
              <Text style={styles.cardTitle}>Linked Banks</Text>
              {loadingBanks ? (
                <ActivityIndicator color={colors.primary} />
              ) : banks.length === 0 ? (
                <Text style={styles.helperText}>No banks added yet.</Text>
              ) : (
                banks.map((b) => (
                  <View key={b.id} style={styles.bankRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bankName}>{b.name}</Text>
                      <Text style={styles.bankStatus}>
                        {b.active ? "Active" : "Inactive"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteBank(b.id, b.name)}
                      style={styles.deleteBankBtn}
                    >
                      <Text style={styles.deleteBankText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.cardTitle}>Add Indian Bank</Text>
              <TextInput
                style={styles.input}
                placeholder="Search SBI, HDFC, ICICI..."
                value={bankSearch}
                onChangeText={setBankSearch}
              />

              <View style={styles.catalogueList}>
                {filteredCatalogue.slice(0, 8).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.catalogueItem}
                    onPress={() => handleAddBank(item.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.catalogueName}>{item.name}</Text>
                    <Text style={styles.addBankBadge}>+ Add</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabsRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderRadius: radius.md,
  },
  tabBtnActive: {
    backgroundColor: colors.primarySoft,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
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
  inputDisabled: {
    backgroundColor: colors.surfaceSubtle,
    color: colors.textMuted,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.textWhite,
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  switchDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    paddingRight: spacing.sm,
  },
  logoutButton: {
    backgroundColor: colors.expenseSoft,
    borderWidth: 1,
    borderColor: "#fca5a5",
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginVertical: spacing.md,
  },
  logoutButtonText: {
    color: colors.expense,
    fontSize: 14,
    fontWeight: "700",
  },
  previewCard: {
    backgroundColor: "#0f172a",
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  previewBadge: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#93c5fd",
    marginBottom: spacing.xs,
  },
  previewDate: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textWhite,
  },
  previewCurrency: {
    fontSize: 13,
    color: "#cbd5e1",
    marginTop: 4,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  helperText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: spacing.sm,
  },
  bankRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
  },
  bankName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  bankStatus: {
    fontSize: 11,
    color: colors.income,
    marginTop: 2,
  },
  deleteBankBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  deleteBankText: {
    fontSize: 12,
    color: colors.expense,
    fontWeight: "600",
  },
  catalogueList: {
    marginTop: spacing.md,
  },
  catalogueItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
  },
  catalogueName: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  addBankBadge: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "700",
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  transparencyBadge: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  transparencyBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#166534",
    textTransform: "uppercase",
  },
  refreshBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refreshBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metricCard: {
    flex: 1,
    minWidth: "47%",
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
    marginVertical: 2,
  },
  metricSub: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  byokPill: {
    backgroundColor: "#059669",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  byokPillText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
  },
  breakdownBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  breakdownHeader: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 11,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
  },
  breakdownItemTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  breakdownItemDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  breakdownItemCost: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  disclosureBanner: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  disclosureTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  disclosureText: {
    fontSize: 11,
    color: "#475569",
    lineHeight: 15,
  },
  loadingBox: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  loadingText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
