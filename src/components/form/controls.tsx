import type { SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

interface Described {
  id: string;
  label: string;
  hint?: string;
  errors?: string[];
}

/** ids for hint/error text, wired into aria-describedby. */
function describe({ id, hint, errors }: Described) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors?.length ? `${id}-error` : undefined;
  return { hintId, errorId, describedBy: [hintId, errorId].filter(Boolean).join(" ") || undefined };
}

function HintAndError({ id, hint, errors }: Described) {
  const { hintId, errorId } = describe({ id, label: "", hint, errors });
  return (
    <>
      {hint && (
        <p id={hintId} className="text-sm text-slate">
          {hint}
        </p>
      )}
      {errorId && (
        <p id={errorId} className="text-sm font-semibold text-danger">
          {errors!.join(" ")}
        </p>
      )}
    </>
  );
}

const control = (invalid: boolean) =>
  `w-full rounded border-2 bg-surface px-3 py-2 text-base text-ink ${invalid ? "border-danger" : "border-control"}`;

export function TextArea({
  id,
  label,
  hint,
  errors,
  ...rest
}: Described & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { errorId, describedBy } = describe({ id, label, hint, errors });
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <HintAndError id={id} label={label} hint={hint} errors={errors} />
      <textarea
        id={id}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={describedBy}
        className={control(!!errorId)}
        {...rest}
      />
    </div>
  );
}

export function Select({
  id,
  label,
  hint,
  errors,
  options,
  ...rest
}: Described &
  SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  const { errorId, describedBy } = describe({ id, label, hint, errors });
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <HintAndError id={id} label={label} hint={hint} errors={errors} />
      <select
        id={id}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={describedBy}
        className={control(!!errorId)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Checkbox({
  id,
  label,
  hint,
  ...rest
}: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        aria-describedby={hintId}
        className="mt-1 h-5 w-5 accent-ink"
        {...rest}
      />
      <div>
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        {hint && (
          <p id={hintId} className="text-sm text-slate">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
