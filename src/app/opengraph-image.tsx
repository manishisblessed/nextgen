import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Payprism — Banking, Bills & Travel for Bharat";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background:
            "radial-gradient(60% 80% at 20% 20%, rgba(47,123,255,0.55) 0%, rgba(20,72,220,0) 60%), radial-gradient(50% 60% at 100% 100%, rgba(249,118,6,0.35) 0%, rgba(249,118,6,0) 60%), linear-gradient(135deg, #0e1626 0%, #173db1 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif"
        }}
      >
        {/* Top: logo lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: 22,
              background: "linear-gradient(135deg, #2f7bff 0%, #1448dc 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 20px 60px -10px rgba(47,123,255,0.55)"
            }}
          >
            <svg width="62" height="62" viewBox="0 0 64 64">
              <path
                d="M40 26 L60 20 L60 30 L40 36 Z"
                fill="#ffd388"
                opacity="0.85"
              />
              <path
                d="M 13 13 L 36 13 C 43 13, 47.5 17.6, 47.5 24 C 47.5 30.4, 43 35, 36 35 L 22 35 L 22 51 L 13 51 Z"
                fill="#ffffff"
              />
              <path
                d="M 22 20 L 39 20 L 22 33 Z"
                fill="#185df5"
              />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>
              Payprism
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: 6,
                color: "rgba(255,255,255,0.65)",
                textTransform: "uppercase"
              }}
            >
              Banking · Bills · Travel
            </div>
          </div>
        </div>

        {/* Middle headline */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 920 }}>
          <div
            style={{
              fontSize: 80,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2
            }}
          >
            Smart Banking for a{" "}
            <span
              style={{
                background:
                  "linear-gradient(90deg, #7fe1ff 0%, #ffd388 100%)",
                backgroundClip: "text",
                color: "transparent"
              }}
            >
              Smarter Bharat
            </span>
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 26,
              color: "rgba(255,255,255,0.78)",
              maxWidth: 880,
              lineHeight: 1.4
            }}
          >
            60+ digital services in one dashboard — AePS, money transfer,
            recharges, bill payments and travel bookings.
          </div>
        </div>

        {/* Bottom strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 28,
            borderTop: "1px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.7)",
            fontSize: 20
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontWeight: 600 }}>payprismindia.com</span>
            <span>·</span>
            <span>+91 8285082121</span>
          </div>
          <div style={{ display: "flex", gap: 18 }}>
            {["AePS", "DMT", "BBPS", "UPI", "Travel"].map((tag) => (
              <span
                key={tag}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  fontSize: 18,
                  fontWeight: 600
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
