export default function SettingsLoading() {
  return (
    <div className="animate-pulse space-y-5" aria-label="Loading settings">
      <div className="h-7 w-40 rounded bg-surface-sunken" />
      <div className="h-4 w-80 max-w-full rounded bg-surface-sunken" />
      <div className="h-80 rounded-(--neu-radius-lg) bg-surface-sunken" />
    </div>
  );
}
