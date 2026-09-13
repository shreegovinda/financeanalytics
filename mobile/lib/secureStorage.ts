import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "finlytix_auth_token";
const USER_KEY = "finlytix_user_data";
const BIOMETRICS_ENABLED_KEY = "finlytix_biometrics_enabled";

// In-memory fallback for environments where SecureStore isn't available
const memoryStorage: Record<string, string> = {};

export async function saveAuthToken(token: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    }
  } catch {
    memoryStorage[TOKEN_KEY] = token;
  }
}

export async function getAuthToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return localStorage.getItem(TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return memoryStorage[TOKEN_KEY] || null;
  }
}

export async function removeAuthToken(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.removeItem(TOKEN_KEY);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch {
    delete memoryStorage[TOKEN_KEY];
  }
}

export async function saveUserData(userData: object): Promise<void> {
  const json = JSON.stringify(userData);
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(USER_KEY, json);
    } else {
      await SecureStore.setItemAsync(USER_KEY, json);
    }
  } catch {
    memoryStorage[USER_KEY] = json;
  }
}

export async function getUserData<T>(): Promise<T | null> {
  try {
    const raw =
      Platform.OS === "web"
        ? localStorage.getItem(USER_KEY)
        : await SecureStore.getItemAsync(USER_KEY);
    if (!raw)
      return (
        memoryStorage[USER_KEY] ? JSON.parse(memoryStorage[USER_KEY]) : null
      ) as T | null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function removeUserData(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.removeItem(USER_KEY);
    } else {
      await SecureStore.deleteItemAsync(USER_KEY);
    }
  } catch {
    delete memoryStorage[USER_KEY];
  }
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  const val = enabled ? "true" : "false";
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(BIOMETRICS_ENABLED_KEY, val);
    } else {
      await SecureStore.setItemAsync(BIOMETRICS_ENABLED_KEY, val);
    }
  } catch {
    memoryStorage[BIOMETRICS_ENABLED_KEY] = val;
  }
}

export async function isBiometricsEnabled(): Promise<boolean> {
  try {
    const raw =
      Platform.OS === "web"
        ? localStorage.getItem(BIOMETRICS_ENABLED_KEY)
        : await SecureStore.getItemAsync(BIOMETRICS_ENABLED_KEY);
    return raw === "true";
  } catch {
    return memoryStorage[BIOMETRICS_ENABLED_KEY] === "true";
  }
}

export async function clearAllSession(): Promise<void> {
  await removeAuthToken();
  await removeUserData();
}
