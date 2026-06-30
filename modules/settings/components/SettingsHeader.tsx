export function SettingsHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">{description}</p>
    </header>
  );
}
