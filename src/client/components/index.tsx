/**
 * Accessible, theme-token controls shared by the Thin Search page. These are
 * plain native elements: labels are associated with `htmlFor`, switches are
 * buttons with `role="switch"`, and no interactive element nests another.
 * @module dsh-thin-search/client/components
 */
import type { ReactNode } from 'react'

/** Props shared by the page's labelled controls. */
export interface FieldProps {
  /** Element id of the control the label points at. */
  readonly id: string
  /** Visible label text. */
  readonly label: string
  /** Optional hint rendered under the control and referenced by `aria-describedby`. */
  readonly hint?: string | undefined
  /** Optional error rendered under the control and referenced by `aria-describedby`. */
  readonly error?: string | undefined
  /** The control itself. */
  readonly children: ReactNode
}

/** Build the `aria-describedby` value for one control. */
export function describedBy(id: string, hint: string | undefined, error: string | undefined): string | undefined {
  const ids = [hint === undefined ? undefined : `${id}-hint`, error === undefined ? undefined : `${id}-error`]
    .filter((value): value is string => value !== undefined)
  return ids.length === 0 ? undefined : ids.join(' ')
}

/** One labelled field row. */
export function Field({ id, label, hint, error, children }: FieldProps): ReactNode {
  return (
    <div className="dsts-field">
      <label className="dsts-label" htmlFor={id}>{label}</label>
      {children}
      {hint === undefined ? null : <p className="dsts-hint" id={`${id}-hint`}>{hint}</p>}
      {error === undefined ? null : <p className="dsts-error" id={`${id}-error`} role="alert">{error}</p>}
    </div>
  )
}

/** One page card. */
export function Section({ title, description, children }: {
  readonly title: string
  readonly description?: string | undefined
  readonly children: ReactNode
}): ReactNode {
  return (
    <section className="dsts-card">
      <h3 className="dsts-cardTitle">{title}</h3>
      {description === undefined ? null : <p className="dsts-cardDesc">{description}</p>}
      <div className="dsts-cardBody">{children}</div>
    </section>
  )
}

/** A labelled switch that never nests a second interactive element. */
export function Switch({ id, control, label, hint, checked, disabled, onToggle }: {
  readonly id: string
  /** `data-control` marker the tests and styling hooks read. */
  readonly control: string
  readonly label: string
  readonly hint?: string | undefined
  readonly checked: boolean
  readonly disabled: boolean
  readonly onToggle: (next: boolean) => void
}): ReactNode {
  return (
    <div className="dsts-field dsts-fieldRow">
      <div className="dsts-fieldText">
        <span className="dsts-label" id={`${id}-label`}>{label}</span>
        {hint === undefined ? null : <p className="dsts-hint" id={`${id}-hint`}>{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        data-control={control}
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        className={checked ? 'dsts-switch dsts-switchOn' : 'dsts-switch'}
        disabled={disabled}
        onClick={() => { onToggle(!checked) }}
      >
        <span className="dsts-switchThumb" aria-hidden="true" />
      </button>
    </div>
  )
}
