// ============================================================
//  src/shell/useSelectEvent.js — tell a host what the reader pinned (issue 152)
//
//  Every renderer keeps its own pinned id (the card the reader clicked open). In a mounted diagram the host
//  hears each change as a `select` event (core/items.js says which item of the JSON it is); on the viewer page
//  there is nobody to tell and nothing happens.
// ============================================================

import { useEffect, useRef } from 'react'
import { selectEvent } from '../core/items.js'
import { useEnv } from './env.js'

export function useSelectEvent(spec, pinnedId) {
  const { embedded, emit } = useEnv()
  // the first render pins nothing and is not news; after that, each change is told once
  const told = useRef(null)
  useEffect(() => {
    if (!embedded || told.current === pinnedId) return
    told.current = pinnedId
    emit(selectEvent(spec, pinnedId))
  }, [embedded, emit, spec, pinnedId])
}
