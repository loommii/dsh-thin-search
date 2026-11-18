/**
 * dsh-context v0.85.1-style settings controls: grouped rows with a label on
 * the left, a pill select (custom accessible menu) or switch on the right, and
 * text/textarea rows that commit on blur or Enter and clear on Escape.
 *
 * Every control is native and keyboard operable; a popup menu is a sibling of
 * its trigger, never a child, so no interactive element nests another.
 * @module dsh-thin-search/client/components
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

/** One group of settings rows, titled like dsh-context's settings card. */
export function Group({ title, children }: {
  readonly title: string
  readonly children: ReactNode
}): ReactNode {
  return (
    <div className="dsts-settings-group" role="group" aria-label={title}>
      <div className="dsts-settings-group-title">{title}</div>
      {children}
    </div>
  )
}

/** One label-left/control-right row. */
export function Row({ label, htmlFor, labelId, textRow, children }: {
  readonly label: string
  readonly htmlFor?: string | undefined
  readonly labelId?: string | undefined
  readonly textRow?: boolean | undefined
  readonly children: ReactNode
}): ReactNode {
  return (
    <div className={textRow === true ? 'dsts-settings-row dsts-settings-textrow' : 'dsts-settings-row'}>
      {htmlFor === undefined
        ? <span className="dsts-settings-label" id={labelId}>{label}</span>
        : <label className="dsts-settings-label" id={labelId} htmlFor={htmlFor}>{label}</label>}
      {children}
    </div>
  )
}

/** A note under a row or group. */
export function Note({ children, role, error, id }: {
  readonly children: ReactNode
  readonly role?: 'status' | 'alert' | undefined
  readonly error?: boolean | undefined
  readonly id?: string | undefined
}): ReactNode {
  return (
    <p className={error === true ? 'dsts-settings-note dsts-settings-note-error' : 'dsts-settings-note'} id={id} role={role}>
      {children}
    </p>
  )
}

/** Focus an element when the host renderer supplies a focusable node. */
function focusNode(node: { focus?: () => void } | null | undefined): void {
  if (typeof node?.focus === 'function') node.focus()
}

/** One option in a pill select. */
export interface PillOption {
  readonly id: string
  readonly label: string
}

/** A 36px-high, 18px-radius pill with an accessible menu. */
export function PillSelect({ id, control, label, value, options, disabled, placeholder, describedBy, onChange }: {
  readonly id: string
  readonly control: string
  readonly label: string
  readonly value: string
  readonly options: readonly PillOption[]
  readonly disabled?: boolean | undefined
  readonly placeholder?: string | undefined
  readonly describedBy?: string | undefined
  readonly onChange: (id: string) => void
}): ReactNode {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const selected = options.find((option) => option.id === value)
  const selectedLabel = selected?.label ?? (value === '' ? placeholder ?? '' : value)

  useEffect(() => {
    if (disabled === true) setOpen(false)
  }, [disabled])

  useEffect(() => {
    if (!open) return
    const selectedIndex = options.findIndex((option) => option.id === value)
    focusNode(optionRefs.current[selectedIndex >= 0 ? selectedIndex : 0])
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return
    const dismiss = (event: MouseEvent): void => {
      if (wrapRef.current?.contains(event.target as Node) === true) return
      setOpen(false)
    }
    document.addEventListener('mousedown', dismiss)
    return () => { document.removeEventListener('mousedown', dismiss) }
  }, [open, options, value])

  const close = (): void => {
    setOpen(false)
    focusNode(buttonRef.current)
  }

  const move = (current: number, step: number): void => {
    if (options.length === 0) return
    const next = (current + step + options.length) % options.length
    focusNode(optionRefs.current[next])
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      focusNode(optionRefs.current[event.key === 'Home' ? 0 : options.length - 1])
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const active = typeof document === 'undefined' ? -1 : optionRefs.current.findIndex((node) => node === document.activeElement)
      move(active, event.key === 'ArrowDown' ? 1 : -1)
    }
  }

  return (
    <span
      className="dsts-settings-pillwrap"
      data-control={`${control}-wrap`}
      ref={wrapRef}
      onBlur={(event) => {
        const next = event.relatedTarget
        const wrap = wrapRef.current
        if (next !== null && wrap !== null && typeof wrap.contains === 'function' && wrap.contains(next as Node)) return
        setOpen(false)
      }}
    >
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className="dsts-settings-select"
        data-control={control}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy}
        disabled={disabled === true}
        onClick={() => { setOpen(!open) }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          } else if (event.key === 'Escape' && open) {
            event.preventDefault()
            setOpen(false)
          }
        }}
      >
        <span className="dsts-settings-select-label">{selectedLabel}</span>
        <span className="dsts-settings-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div className="dsts-settings-menu" role="menu" aria-label={label} onKeyDown={onMenuKeyDown}>
          {options.map((option, index) => (
            <button
              key={option.id}
              ref={(node) => { optionRefs.current[index] = node }}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === value}
              className={option.id === value ? 'dsts-settings-menu-item dsts-settings-menu-item-on' : 'dsts-settings-menu-item'}
              data-control={`${control}-option`}
              data-value={option.id}
              onClick={() => {
                setOpen(false)
                focusNode(buttonRef.current)
                onChange(option.id)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  )
}

/** A switch row; the toggle writes immediately. */
export function SwitchRow({ id, control, label, checked, disabled, onChange }: {
  readonly id: string
  readonly control: string
  readonly label: string
  readonly checked: boolean
  readonly disabled: boolean
  readonly onChange: (next: boolean) => void
}): ReactNode {
  return (
    <Row label={label} labelId={`${id}-label`}>
      <button
        id={id}
        type="button"
        role="switch"
        data-control={control}
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        className={checked ? 'dsts-settings-switch dsts-settings-switch-on' : 'dsts-settings-switch'}
        disabled={disabled}
        onClick={() => { onChange(!checked) }}
      >
        <span className="dsts-settings-switch-thumb" aria-hidden="true" />
      </button>
    </Row>
  )
}

/** Text/textarea row with dsh-context commit and clear semantics. */
export function TextControl({ id, control, label, value, disabled, multiline, rows, placeholder, hint, error, clearLabel, inputMode, commit }: {
  readonly id: string
  readonly control: string
  readonly label: string
  readonly value: string
  readonly disabled: boolean
  readonly multiline?: boolean | undefined
  readonly rows?: number | undefined
  readonly placeholder?: string | undefined
  readonly hint?: string | undefined
  readonly error?: string | undefined
  readonly clearLabel: string
  readonly inputMode?: 'numeric' | 'decimal' | 'text' | undefined
  readonly commit: (value: string) => void
}): ReactNode {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const latest = useRef({ draft, value, commit })
  latest.current = { draft, value, commit }

  // Adopt an accepted Host value while the user is not editing.
  if (!focused && draft !== value && error === undefined) setDraft(value)

  useEffect(() => () => {
    const current = latest.current
    if (current.draft !== current.value) current.commit(current.draft)
  }, [])

  const describedBy = [hint === undefined ? undefined : `${id}-hint`, error === undefined ? undefined : `${id}-error`]
    .filter((part): part is string => part !== undefined)
    .join(' ')

  const focus = (): void => {
    focusNode(multiline === true ? areaRef.current : inputRef.current)
  }

  const doCommit = (): void => {
    if (draft !== value) commit(draft)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    const native = event.nativeEvent as { isComposing?: boolean } | undefined
    if (native?.isComposing === true) return
    if (event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if (draft === '') return
      event.preventDefault()
      event.stopPropagation()
      setDraft('')
      focus()
      return
    }
    if (event.key === 'Enter') {
      if (multiline === true && event.shiftKey) return
      event.preventDefault()
      doCommit()
    }
  }

  const clear = (): void => {
    setDraft('')
    focus()
  }

  const aria = {
    'aria-describedby': describedBy === '' ? undefined : describedBy,
    'aria-invalid': error === undefined ? undefined : true,
    onFocus: () => { setFocused(true) },
    onBlur: () => { setFocused(false); doCommit() },
    onKeyDown,
  }

  return (
    <div className="dsts-settings-field">
      <Row label={label} htmlFor={id} labelId={`${id}-label`} textRow={multiline === true}>
        {multiline === true ? (
          <span className="dsts-settings-textwrap">
            <textarea
              {...aria}
              ref={areaRef}
              id={id}
              data-control={control}
              className="dsts-settings-textarea"
              rows={rows ?? 3}
              value={draft}
              placeholder={placeholder}
              disabled={disabled}
              onChange={(event) => { setDraft(event.currentTarget.value) }}
            />
            {!disabled && draft !== '' ? (
              <button
                type="button"
                className="dsts-settings-textx"
                data-control={`clear-${control}`}
                aria-label={clearLabel}
                title={clearLabel}
                onMouseDown={(event) => { event.preventDefault() }}
                onClick={clear}
              >
                ×
              </button>
            ) : null}
          </span>
        ) : (
          <input
            {...aria}
            ref={inputRef}
            id={id}
            data-control={control}
            className="dsts-settings-input"
            type="text"
            inputMode={inputMode}
            value={draft}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(event) => { setDraft(event.currentTarget.value) }}
          />
        )}
      </Row>
      {hint === undefined ? null : <Note id={`${id}-hint`}>{hint}</Note>}
      {error === undefined ? null : <Note id={`${id}-error`} role="alert" error>{error}</Note>}
    </div>
  )
}
