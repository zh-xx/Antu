# The trial: what level of drawing the engine lets a model reach

Antu is made so that models of every strength, in every agent, can reach a high level of drawing. The trial measures it: a model is given the skill and a request about a case, works with the skill's command line, and its result is read and judged. What is found says what to change in the skill, the guides or the engine, and the same case is run again.

## What it is, and is not

- `tools/trial/` is a small agent: a model, four tools (list a folder, read a file, write a file in its own folder, run the skill's command line) and a loop (`agent.mjs`). Any model with an OpenAI-compatible chat/completions interface and tool calls can be put in `models.json`.
- It tests the model **with the skill and the engine**. It is not a real agent product (those have their own prompts, tools and ways of loading a skill) and does not test installation or whether an agent chooses the skill; those are tried in the real clients.
- The cases (`cases.json`) are the fictional judgments and contracts of `examples/raw/`; each has a reference diagram written by hand in `examples/`. No real case is used.

## Running it

```
node tools/trial/run.mjs --case fact-corridor                   # the default model, `deepseek-flash` (the weaker, cheaper one: the one that shows what the engine does for a model that needs help)
node tools/trial/run.mjs --model deepseek-v4-pro --case fact-corridor
node tools/trial/run.mjs --model fake --case fact-corridor      # a stand-in model: the whole flow without a model
```

A run is kept in `runs/<time>-<model>-<case>/` (not committed): `transcript.json`, `work/` (`spec.json`, `diagram.html`), `final-*.txt` (the command line run once more by the script), `preview.png`, `summary.txt` (the model's last message) and `report.json` (the checks below).

## Keys and safety

- A model's key is stored in the cloud environment as an *API credential*: the agent proxy adds it to requests for the listed host, after they leave the session, so the key never reaches the process, the tools or the environment. A model with `"keyEnv": null` is called without a key header. For a model reached another way, `keyEnv` names the variable that holds its key; the key is used only in `callModel` and is taken out of what is saved.
- The model reaches only the four tools. It reads the case material, the skill folder and its working folder, writes only in its working folder, and the command line runs with a clean environment.
- Node's own `fetch` does not read the proxy variables: `run.mjs` starts itself again with `NODE_USE_ENV_PROXY=1` when a proxy is set.

A run ends `done` (the model stopped asking for tools), `turns` (the turn limit, 24) or `length` (its output ran out while it was still thinking: it did not finish).

## What is checked by the script (`score.mjs`)

Not a matter of opinion: whether the diagram passes `validate`; the dates, article numbers and case numbers written in the diagram that the material does not have; how much of the reference it has (the names of the parties, the length of each list); turns and tokens.

## What is judged by reading the run

Each case, each model, the same table, so that rounds can be compared. A mark of 0, 1 or 2 for:

| Mark for | 0 | 1 | 2 |
| --- | --- | --- | --- |
| It works | does not pass `validate` | passes after three or more rounds | passes at once or in one or two rounds |
| Nothing invented | dates, article numbers, case numbers or names not in the material | doubtful, and marked as an inference | all from the material |
| Left out what is not known | a date written that the material does not give | one or two | none |
| Faithful | key facts missing or turned round | minor ones missing | key facts and their links right |
| The right diagram | a diagram that does not suit | suits, but a feature that was needed (groups) not used | suits and is used well |
| Looks right | crowded, text too small to read, a line through a card | small flaws | clean, can be given to a reader |
| Tells the user | does not say what is left out or doubtful | partly | says what is missing and how to add it |

Every mark below 2 gets a cause: **A** the model's ability; **B** the skill or a guide is not clear; **C** the checker could have stopped it and did not; **D** it passes but looks poor (the defaults or the advice of the engine); **E** other. B, C and D are what is changed, then the case is run again.

## Not yet

- A tool for the model to look at the picture (the models listed accept images), to try the step of looking at the result and correcting it.
- A run without tools (one call), as the lowest level.
- Real agent command lines with these models.
