import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

export interface BiometricStatus {
  hasHardware: boolean;
  isEnrolled: boolean;
  biometricTypes: string[];
  supportedTypeLabel: string;
}

export async function checkBiometricSupport(): Promise<BiometricStatus> {
  if (Platform.OS === "web") {
    return {
      hasHardware: false,
      isEnrolled: false,
      biometricTypes: [],
      supportedTypeLabel: "None",
    };
  }

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes =
      await LocalAuthentication.supportedAuthenticationTypesAsync();

    const types: string[] = [];
    let label = "Biometrics";

    if (
      supportedTypes.includes(
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      )
    ) {
      types.push("FACIAL_RECOGNITION");
      label = Platform.OS === "ios" ? "Face ID" : "Face Unlock";
    }
    if (
      supportedTypes.includes(
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      )
    ) {
      types.push("FINGERPRINT");
      label = Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
    }
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      types.push("IRIS");
      label = "Iris Scan";
    }

    return {
      hasHardware,
      isEnrolled,
      biometricTypes: types,
      supportedTypeLabel: label,
    };
  } catch {
    return {
      hasHardware: false,
      isEnrolled: false,
      biometricTypes: [],
      supportedTypeLabel: "None",
    };
  }
}

export async function authenticateWithBiometrics(
  promptMessage = "Unlock Finlytix to view your financial data",
): Promise<boolean> {
  if (Platform.OS === "web") return true;

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Cancel",
      fallbackLabel: "Use Password",
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
