import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "../lib/theme";
import type { User } from "@finlytix/shared";

interface HeaderProps {
  user: User | null;
  title?: string;
  subtitle?: string;
  showProfile?: boolean;
}

export default function Header({
  user,
  title = "Finlytix",
  subtitle,
  showProfile = true,
}: HeaderProps) {
  const router = useRouter();

  const userInitial = user?.name?.trim().charAt(0).toUpperCase() || "U";

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoText}>₹</Text>
        </View>
        <View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : user ? (
            <Text style={styles.subtitle}>
              Welcome back, {user.name.split(" ")[0]}
            </Text>
          ) : null}
        </View>
      </View>

      {showProfile && user && (
        <TouchableOpacity
          style={styles.avatarButton}
          onPress={() => router.push("/settings")}
          activeOpacity={0.7}
          accessibilityLabel="Open settings and profile"
        >
          <Text style={styles.avatarText}>{userInitial}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    color: colors.textWhite,
    fontSize: 18,
    fontWeight: "700",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  avatarButton: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.primaryDark,
  },
});
