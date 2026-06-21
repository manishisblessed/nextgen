import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "ngp_session";

export type Session = {
  token: string;
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  walletBalance: number;
  loggedInAt: number;
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
