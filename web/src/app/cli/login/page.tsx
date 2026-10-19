import { Suspense } from "react";

async function LoginInner({
  searchParams,
}: {
  searchParams: Promise<{ port?: string; state?: string }>;
}) {
  const { port, state } = await searchParams;
  if (!port || !/^\d{2,5}$/.test(port) || !state)
    return <p>Invalid login request.</p>;

  const href = `http://127.0.0.1:${port}/callback?code=dev-code&state=${encodeURIComponent(state)}`;
  return (
    <main style={{ padding: 40 }}>
      <h1>Authorize the ship CLI</h1>
      <p>This will connect the CLI on your machine to your account.</p>
      <a href={href}>Authorize</a>
    </main>
  );
}

export default function CliLogin(props: {
  searchParams: Promise<{ port?: string; state?: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <LoginInner searchParams={props.searchParams} />
    </Suspense>
  );
}
