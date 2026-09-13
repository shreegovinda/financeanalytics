import React, { createContext, useContext, useState, useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  getAuthToken,
  getUserData,
  saveAuthToken,
  saveUserData,
  clearAllSession,
  isBiometricsEnabled,
} from "../lib/secureStorage";
import {
  authenticateWithBiometrics,
  checkBiometricSupport,
} from "../lib/biometrics";
import { mobileAPI } from "../lib/api";
import { colors } from "../lib/theme";
import type { User, UserProfile } from "@finlytix/shared";

interface AuthContextType {
  user: UserProfile | User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export default function RootLayout() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    async function initSession() {
      try {
        const storedToken = await getAuthToken();
        const storedUser = await getUserData<User>();

        if (storedToken && storedUser) {
          // Check if biometrics are enabled
          const bioEnabled = await isBiometricsEnabled();
          const bioSupport = await checkBiometricSupport();

          if (bioEnabled && bioSupport.hasHardware && bioSupport.isEnrolled) {
            const unlocked = await authenticateWithBiometrics();
            if (!unlocked) {
              await clearAllSession();
              setIsLoading(false);
              return;
            }
          }

          setToken(storedToken);
          setUser(storedUser);

          // Fetch fresh profile in background
          try {
            const profileRes = await mobileAPI.getMe();
            if (profileRes?.user) {
              setUser(profileRes.user);
              await saveUserData(profileRes.user);
            }
          } catch {
            // Continue with cached user session
          }
        }
      } catch (err) {
        console.error("Session init error:", err);
      } finally {
        setIsLoading(false);
      }
    }

    void initSession();
  }, []);

  // Route protection
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!token && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (token && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [token, segments, isLoading, router]);

  const login = async (newToken: string, newUser: User) => {
    await saveAuthToken(newToken);
    await saveUserData(newUser);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    await clearAllSession();
    setToken(null);
    setUser(null);
    router.replace("/(auth)/login");
  };

  const refreshProfile = async () => {
    try {
      const profileRes = await mobileAPI.getMe();
      if (profileRes?.user) {
        setUser(profileRes.user);
        await saveUserData(profileRes.user);
      }
    } catch {
      // Ignored
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthContext.Provider
        value={{
          user,
          token,
          isLoading,
          login,
          logout,
          refreshProfile,
        }}
      >
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: { fontWeight: "700" },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="settings"
            options={{
              title: "Settings & Profile",
              presentation: "modal",
            }}
          />
        </Stack>
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
