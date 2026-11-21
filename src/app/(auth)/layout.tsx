export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-sidebar text-lg font-semibold text-sidebar-accent-foreground dark:bg-sidebar-primary dark:text-sidebar-primary-foreground">
            M
          </div>
          <h1 className="text-xl font-semibold">Medicine Agent</h1>
          <p className="text-sm text-muted-foreground">Vexora Labs</p>
        </div>
        {children}
      </div>
    </div>
  );
}
