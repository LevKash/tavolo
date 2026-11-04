import { ImageResponse } from "next/og";

export const alt = "Ordavo — QR ordering for bars and beach bars";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0e0d0b",
          backgroundImage: "radial-gradient(circle at 20% 0%, rgba(201,164,92,0.22), rgba(14,13,11,0) 55%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 90px",
        }}
      >
        <div style={{ display: "flex", fontSize: 110, fontWeight: 700, color: "#c9a45c", letterSpacing: -2 }}>
          Ordavo.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 54,
            lineHeight: 1.18,
            color: "#f3ead7",
            maxWidth: 980,
          }}
        >
          Guests order from their seat. Your staff keep working the way they do now.
        </div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 28, color: "#a89c82" }}>
          QR ordering for bars, beach bars and tavernas · Free 3-week pilot
        </div>
      </div>
    ),
    size,
  );
}
