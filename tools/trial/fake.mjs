// A stand-in for a model: it writes the reference JSON, checks it, makes the page and says so. It lets the whole
// trial (tools, saving, the final run of the command line, the scoring) be tried without a model and without cost.

const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })

export function makeFake({ referenceText }) {
  return async (messages) => {
    const step = messages.filter((m) => m.role === 'assistant').length
    const plan = [
      { content: '', tool_calls: [call('c1', 'write_file', { path: 'spec.json', content: referenceText })] },
      { content: '', tool_calls: [call('c2', 'antu', { args: ['validate', 'spec.json'] })] },
      { content: '', tool_calls: [call('c3', 'antu', { args: ['render', 'spec.json', '-o', 'diagram.html'] })] },
      { content: '图已做好：spec.json 和 diagram.html。（这是假模型的回答）' },
    ]
    const msg = { role: 'assistant', ...plan[Math.min(step, plan.length - 1)] }
    return { choices: [{ message: msg }], usage: { prompt_tokens: 0, completion_tokens: 0 } }
  }
}
