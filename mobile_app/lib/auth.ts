import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "pp_session";

export type Session = {
  name: string;
  email: string;
  phone: string;
  walletBalance: number;
  loggedInAt: number;
};

export const demoSession: Session = {
  name: "Aman Sharma",
  email: "retailer@payprismindia.com",
  phone: "+91 82850 82121",
  walletBalance: 28450,
  loggedInAt: Date.now()
};

export async function saveSession(session: Session) {
  const json = JSON.stringify(session);
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, json);
    return;
  }
  await SecureStore.setItemAsync(KEY, json);
}

export async function getSession(): Promise<Session | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    }
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export async function clearSession() {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}
