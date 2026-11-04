import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0e0d0b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            border: "17px solid #c9a45c",
            display: "flex",
            marginRight: 14,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 38,
            bottom: 46,
            width: 24,
            height: 24,
            borderRadius: 12,
            background: "#c9a45c",
            display: "flex",
          }}
        />
      </div>
    ),
    size,
  );
}
