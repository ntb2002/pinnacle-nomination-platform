export function SiteFooter() {
  const year = new Date().getUTCFullYear();
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="container-page flex flex-col gap-2 py-8 text-sm text-slate sm:flex-row sm:justify-between">
        <p>
          The Pinnacle Awards are presented by the Center for the Creator Economy at Syracuse
          University.
        </p>
        <p>© {year} Syracuse University</p>
      </div>
    </footer>
  );
}
