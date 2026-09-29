import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-semibold">PRISM CSS Dashboard</h1>
        <p className="mt-1 text-sm text-ink-2">Sign in with your registered email address.</p>
        {error === "link" && (
          <p className="mt-4 rounded-md bg-surface-2 p-3 text-sm text-critical">
            That sign-in link is invalid or has expired. Request a new one below.
          </p>
        )}
        <LoginForm />
      </div>
    </main>
  );
}
