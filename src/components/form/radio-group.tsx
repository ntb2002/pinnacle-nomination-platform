interface Option {
  value: string;
  label: string;
  description?: string;
}

/** A labelled group of radio buttons with an optional error, as one fieldset. */
export function RadioGroup({
  name,
  legend,
  options,
  errors,
  defaultValue,
}: {
  name: string;
  legend: string;
  options: Option[];
  errors?: string[];
  defaultValue?: string;
}) {
  const errorId = errors?.length ? `${name}-error` : undefined;
  return (
    <fieldset id={name} tabIndex={-1} aria-describedby={errorId} className="flex flex-col gap-3">
      <legend className="mb-2 text-lg font-semibold">{legend}</legend>
      {errorId && (
        <p id={errorId} className="text-sm font-semibold text-danger">
          {errors!.join(" ")}
        </p>
      )}
      {options.map((o) => {
        const id = `${name}-${o.value}`;
        return (
          <div
            key={o.value}
            className="flex items-start gap-3 rounded border border-line bg-surface p-4"
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={o.value === defaultValue}
              aria-describedby={o.description ? `${id}-desc` : undefined}
              className="mt-1 h-5 w-5 accent-ink"
            />
            <div>
              <label htmlFor={id} className="font-semibold">
                {o.label}
              </label>
              {o.description && (
                <p id={`${id}-desc`} className="text-sm text-slate">
                  {o.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
