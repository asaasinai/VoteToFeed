import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "VoteToFeed share image";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(135deg, #fff8f6 0%, #ffffff 48%, #fff1ee 100%)",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 420,
            height: 420,
            borderRadius: 999,
            background: "rgba(232, 69, 60, 0.10)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -160,
            left: -80,
            width: 360,
            height: 360,
            borderRadius: 999,
            background: "rgba(46, 196, 182, 0.12)",
          }}
        />

        <div
          style={{
            width: "56%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "64px 56px 64px 72px",
            zIndex: 2,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 28 }}>
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: 24,
                background: "#ffffff",
                border: "3px solid rgba(232,69,60,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 12px 32px rgba(18, 18, 23, 0.10)",
              }}
            >
              <div style={{ position: "relative", width: 48, height: 48, display: "flex" }}>
                <svg width="48" height="48" viewBox="0 0 36 36" fill="none">
                  <path d="M6 20 Q6 29 18 29 Q30 29 30 20" stroke="#2EC4B6" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                  <line x1="18" y1="29" x2="18" y2="32" stroke="#2EC4B6" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="12" y1="32" x2="24" y2="32" stroke="#2EC4B6" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="5" y1="20" x2="31" y2="20" stroke="#2EC4B6" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M18 16 C18 16 14 12.5 14 10.5 C14 9 15.2 8 16.5 8 C17.2 8 17.8 8.4 18 8.9 C18.2 8.4 18.8 8 19.5 8 C20.8 8 22 9 22 10.5 C22 12.5 18 16 18 16Z" fill="#E8453C"/>
                </svg>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 42, fontWeight: 900, color: "#121217", letterSpacing: -1.5 }}>VoteToFeed</div>
              <div style={{ fontSize: 18, color: "#6b7280" }}>Every vote helps shelter pets</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 560 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                alignSelf: "flex-start",
                gap: 10,
                padding: "10px 16px",
                borderRadius: 999,
                background: "rgba(46, 196, 182, 0.12)",
                color: "#0f766e",
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 999, background: "#2EC4B6" }} />
              Every vote helps shelter pets
            </div>
            <div style={{ fontSize: 72, lineHeight: 0.96, fontWeight: 900, color: "#121217", letterSpacing: -3 }}>
              Vote for adorable pets.
            </div>
            <div style={{ fontSize: 72, lineHeight: 0.96, fontWeight: 900, color: "#E8453C", letterSpacing: -3 }}>
              Feed shelter pets.
            </div>
            <div style={{ marginTop: 10, fontSize: 28, lineHeight: 1.3, color: "#4b5563", maxWidth: 520 }}>
              Free photo contests, weekly winners, and prize packs worth up to $2,000.
            </div>
          </div>

          <div style={{ display: "flex", gap: 18, marginTop: 34 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "18px 28px",
                borderRadius: 18,
                background: "#E8453C",
                color: "#ffffff",
                fontSize: 24,
                fontWeight: 800,
                boxShadow: "0 18px 40px rgba(232, 69, 60, 0.22)",
              }}
            >
              Add your pet — free
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "18px 28px",
                borderRadius: 18,
                background: "#ffffff",
                border: "2px solid #e5e7eb",
                color: "#111827",
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              View contests
            </div>
          </div>
        </div>

        <div
          style={{
            width: "44%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingRight: 54,
            zIndex: 2,
          }}
        >
          <div
            style={{
              width: 420,
              height: 470,
              borderRadius: 28,
              background: "linear-gradient(180deg, #ffffff 0%, #fff7f5 100%)",
              border: "1px solid rgba(17,24,39,0.06)",
              boxShadow: "0 25px 60px rgba(18, 18, 23, 0.16)",
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", gap: 14, height: 250 }}>
              <div
                style={{
                  flex: 1,
                  borderRadius: 22,
                  background: "linear-gradient(135deg, #9ec5ff 0%, #72a9ff 100%)",
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                }}
              >
                <div style={{ position: "absolute", top: 16, left: 16, width: 26, height: 26, borderRadius: 999, background: "#E8453C", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>❤</div>
                <div style={{ position: "absolute", bottom: 18, left: 18, width: 104, height: 78, borderRadius: 18, background: "#fff4ef", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 46 }}>🐶</div>
                <div style={{ position: "absolute", bottom: 18, right: 18, width: 72, height: 32, borderRadius: 999, background: "rgba(255,255,255,0.94)", color: "#111827", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800 }}>64</div>
              </div>
              <div style={{ width: 110, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ flex: 1, borderRadius: 20, background: "linear-gradient(135deg, #ffd0c8 0%, #ffb4a6 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 46 }}>🐕</div>
                <div style={{ flex: 1, borderRadius: 20, background: "linear-gradient(135deg, #b8f0e8 0%, #8fe2d6 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 46 }}>🐱</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              {[
                { label: "Pets entered", value: "64" },
                { label: "Votes this week", value: "42" },
                { label: "Prize packs", value: "$2K" },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    flex: 1,
                    borderRadius: 18,
                    background: "#ffffff",
                    border: "1px solid #eceef2",
                    padding: "16px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 13, color: "#6b7280" }}>{item.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: "#111827", letterSpacing: -1 }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: "auto",
                borderRadius: 22,
                background: "linear-gradient(90deg, #121217 0%, #2a2a32 100%)",
                color: "#ffffff",
                padding: "18px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 16, color: "#cbd5e1" }}>VotesForShelters</div>
                <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1 }}>Every vote makes an impact</div>
              </div>
              <div style={{ width: 54, height: 54, borderRadius: 18, background: "#ffffff", color: "#111827", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>❤</div>
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
