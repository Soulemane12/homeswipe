import { Logo } from "@/components/navigation/logo";

/** Shown instead of the app when MongoDB Atlas isn't configured yet. */
export function SetupRequired({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <Logo />
      <h1 className="font-display text-4xl">Connect MongoDB Atlas to start</h1>
      <p className="text-muted-foreground">{message}</p>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          Copy <code className="rounded bg-muted px-1">.env.example</code> to <code className="rounded bg-muted px-1">.env.local</code> and set <code className="rounded bg-muted px-1">MONGODB_URI</code>.
        </li>
        <li>
          Run <code className="rounded bg-muted px-1">pnpm setup</code> to seed listings, create indexes (including Vector Search) and the demo user.
        </li>
        <li>Restart the dev server.</li>
      </ol>
    </main>
  );
}
