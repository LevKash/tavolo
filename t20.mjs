import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const B = "https://ordavo.vercel.app";
const j = async (u, o) => (await fetch(u, o)).text();

// 1. new order
const o = await j(`${B}/api/order`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    slug: "ambrosia",
    tableId: "5e729114-7091-4e0f-b565-b300f8d1e2ba",
    guestId: "9a7f3c21-4b8e-4d6a-9f2c-7e5b1a0d3c44",
    items: [{ menuItemId: "ee7722c1-702a-4892-9358-0b375dd26b7b", qty: 1 }],
  }),
});
console.log("ORDER:", o.slice(0, 200));

// 2. two immediate taps on Pay (double-click simulation)
const pay = () => j(`${B}/api/pay/session`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slug: "ambrosia", tableId: "5e729114-7091-4e0f-b565-b300f8d1e2ba", lang: "en" }),
});
const [a, b] = await Promise.all([pay(), pay()]);
console.log("PAY1:", a.slice(0, 300));
console.log("PAY2:", b.slice(0, 300));
