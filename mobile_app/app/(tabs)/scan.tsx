import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function ScanRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/services/upi");
  }, [router]);
  return null;
}
