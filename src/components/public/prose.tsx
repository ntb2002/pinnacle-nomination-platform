/** Long-form policy text: comfortable measure, spacing and heading rhythm. */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[68ch] text-[1.0625rem] leading-relaxed [&_a]:font-semibold [&_a]:underline [&_h2]:mt-12 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:mt-2 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6">
      {children}
    </div>
  );
}
