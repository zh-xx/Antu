// Smoke consumer for public host API declarations (issue 227 step 0–1).
// Proves a wrong `mount` option / theme / lang fails under `tsc` before tests run.
import type { AntuHandle, MountOptions } from '@zh-xx/antu/embed'
import type { ValidateResult } from '@zh-xx/antu/validate'

const okMount: MountOptions = {
  theme: 'modern',
  lang: 'zh',
  ui: { header: false },
  initial: { theme: 'legal', shell: { dockFolded: true } },
}
void okMount

declare const handle: AntuHandle
void handle.fitView

declare const validated: ValidateResult
void validated.ok

// @ts-expect-error theme must be a known AntuTheme
const badTheme: MountOptions = { theme: 'neon' }
// @ts-expect-error lang must be zh | en
const badLang: MountOptions = { lang: 'fr' }
// @ts-expect-error unknown mount option
const badKey: MountOptions = { them: 'modern' }
// @ts-expect-error persist name must be a known AntuPersistName
const badPersist: MountOptions = { persist: ['nope'] }

void badTheme
void badLang
void badKey
void badPersist
