export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-16">
      <header className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Hour Tracker
        </p>
        <h1 className="text-4xl font-semibold text-slate-900 sm:text-5xl">
          Multitenant time tracking that keeps every client aligned.
        </h1>
        <p className="max-w-2xl text-lg text-slate-600">
          Configure workspaces, invite your team, and report billable hours in one
          secure place.
        </p>
      </header>
      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">Getting started</h2>
          <p className="text-slate-600">
            Connect your database, configure authentication, and deploy the app
            for each tenant.
          </p>
        </div>
        <ul className="grid gap-2 text-slate-600 sm:grid-cols-2">
          <li className="rounded-lg bg-slate-50 p-4">PostgreSQL 16 repositories</li>
          <li className="rounded-lg bg-slate-50 p-4">NextAuth.js tenant auth</li>
          <li className="rounded-lg bg-slate-50 p-4">Shared UI components</li>
          <li className="rounded-lg bg-slate-50 p-4">Type-safe domain models</li>
        </ul>
      </section>
    </main>
  );
}
