/**
 * One save step for the row page: validate the draft, diff it against the
 * accepted section, and submit the changed fields through the owner form's
 * `mutate` with the revision the editor read.
 * @module dsh-thin-search/client/save
 */
import { draftOps, validateDraft, type Draft, type DraftError } from './config'
import type { ConfigPageForm } from './types'

/** What one save attempt did. */
export interface SaveOutcome {
  readonly status: 'invalid' | 'unchanged' | 'saved' | 'rejected' | 'failed'
  readonly errors: readonly DraftError[]
}

/**
 * Submit the draft through the owner form. An invalid draft never reaches the
 * Host; an unchanged draft submits no operation; a transport failure is
 * reported without throwing into React's event handler.
 * @param form - the page's owner form handoff.
 * @param draft - the edited values.
 * @returns the outcome the page localizes.
 */
export async function saveDraft(form: ConfigPageForm, draft: Draft): Promise<SaveOutcome> {
  const errors = validateDraft(draft)
  if (errors.length > 0) return { status: 'invalid', errors }
  const ops = draftOps(draft, form.state.value)
  if (ops.length === 0) return { status: 'unchanged', errors: [] }
  try {
    const accepted = await form.mutate(ops, form.state.revision)
    return { status: accepted ? 'saved' : 'rejected', errors: [] }
  } catch {
    return { status: 'failed', errors: [] }
  }
}
