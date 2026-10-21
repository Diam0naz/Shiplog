import { Suspense } from "react";
import FarcasterConnectClient from "./FarcasterConnectClient";

function Loading() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
      <div style={{ maxWidth: "420px", width: "100%", textAlign: "center" }}>
        <p>Loading...</p>
      </div>
    </div>
  );
}

export default function FarcasterConnectPage() {
  return (
    <Suspense fallback={<Loading />}>
      <FarcasterConnectClient />
    </Suspense>
  );
}