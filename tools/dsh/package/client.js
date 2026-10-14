// Client half of @zh-xx/antu-dsh (scaffold).
//
// P2 will register tool.call.toolview for wire name `antu_render` (and optionally
// `mcp__antu__antu_render` while a stopgap MCP row still exists), lazy-load the
// repackaged @zh-xx/antu/embed chunk, and call mount(el, spec, { ui: { …cardUi }, … }).
// Spec comes from the tool-call argsRaw, not from the tool result.
//
// This file must stay a tiny ModuleLoader entry; the embed bundle is not inlined here.

window.__ModuleLoader__.load({
  id: '@zh-xx/antu-dsh',
  factory(require) {
    return {
      inject: ['slots'],
      apply(_ctx) {
        // no-op until P2 — registering an empty toolview would replace the generic card
      },
    }
  },
})
