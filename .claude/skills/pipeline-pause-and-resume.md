# Skill: Pipeline Pause-and-Resume

How to add a "pause after each engine, resume on approval" pattern to a
multi-engine pipeline without breaking the end-to-end test path.

Captured from the BOMATIC Option B work (RFP / Quick BoM checkpoint flow).

---

## When to use

Pipeline currently runs all engines synchronously and reports done. You need
each engine's output to be reviewable before the next engine fires — and the
checkpoint approval API to trigger the next engine in the background.

---

## Architecture

Three orchestration entry points share one inner helper:

```
runPipeline(input)       — creates state, runs first engine, pauses, returns
resumePipeline(state,    — runs the next engine in sequence, pauses or completes
                input, artifacts)

runOneEngineAndPause(state, input, engine, out)
  - state.status = 'running'; save               ← hub sees "processing"
  - runEngine(...)                               ← does the actual work
  - on failure: state.status = undefined; save; return
  - append engine's checkpoint defs as 'pending' (no decidedAt)
  - state.status = 'paused_at_checkpoint'; save  ← hub sees "needs review"
```

State machine on `state.status`:

| Value | Meaning |
|---|---|
| `undefined` | Just created OR engine errored — no in-flight work, nothing pending |
| `'running'` | An engine is in flight inside `runOneEngineAndPause` |
| `'paused_at_checkpoint'` | One or more checkpoints await human approval |
| `'completed'` | All engines done and all their checkpoints approved |

---

## Rules

1. **Lift identity onto state up-front.** If the pipeline is keyed by intake
   id (`opportunityId="intake:<uuid>"`), parse and assign `state.intakeId`
   *before* the first `savePipelineState` call. Otherwise the hub's first
   poll (which looks up by intake id) returns null and renders "Not started"
   for several seconds while the engine runs.
2. **`decidedAt` means a human decided.** Don't stamp `decidedAt` on `pending`
   checkpoints — let it stay undefined so the UI can render "awaiting review"
   honestly. See `pipeline-state.ts:runCheckpoint`.
3. **Resume runs ONE engine, not all remaining.** Each approval = at most one
   new engine. Keep the loop in the caller (the checkpoint approval API),
   not inside `resumePipeline`.
4. **Hydrate `out` from saved artifacts before resuming.** Downstream engines
   read `out.e1Output` etc.; on resume that field is empty unless you load
   from the artifact store. Pattern: `resumePipeline(state, input, artifacts)`
   takes artifacts as a parameter, not a side channel.
5. **Atomic-ish status transition for the resume trigger.** In the approval
   API: check `state.status === 'paused_at_checkpoint' && allEngineCpsApproved`,
   flip to `'running'`, save, *then* fire `void resumeAndPersistPipeline(...)`.
   That makes the saved state the mutex — a concurrent approval sees `'running'`
   and bails. Best-effort, not transactional; OK for human-driven UI clicks.
6. **Preserve the end-to-end path for tests.** Many existing unit tests
   construct a pipeline with an `onCheckpoint` callback and assert all engines
   ran. Branch in `runPipeline`: if `onCheckpoint` is supplied (or mode is RFI),
   use the old end-to-end loop; otherwise the new pause path. Tests pass
   `onCheckpoint: autoApproveCheckpoint` to opt into end-to-end.
7. **Build a shared input rehydrator.** Initial run + resume + re-run flows
   all need to reconstruct `PipelineInput` from the persisted intake row.
   One helper: `buildPipelineInputForIntake(tenantId, intakeId, reqOverride?)`.

---

## Anti-patterns

- ❌ Saving state only at pipeline end. Hub polls every 5s; intermediate
  state is what shows "processing" → "needs review" → "approved" transitions.
- ❌ `runCheckpoint` defaulting to `'approved'` when no callback is supplied.
  Auto-approve in production is invisible-by-design and the worst kind of bug
  (tests pass, demo fails silently). Default to `'pending'`.
- ❌ Race-free resume via in-memory mutex without persistence. State must be
  the source of truth across processes; in-memory locks die with the process.
- ❌ Persisting raw engine outputs INTO the JSON `state` blob. Use separate
  `e1Artifacts`/`e2Artifacts`/`e3Artifacts` columns; the state JSON should
  stay small enough to upsert on every save without blowing row size.

---

## Reference files

- `src/coordinator/pipeline.ts` — `runPipeline` dispatch, `resumePipeline`,
  `runOneEngineAndPause`, `runEndToEnd` (the legacy/cb path).
- `src/coordinator/pipeline-engine-dispatcher.ts` — per-engine runner switched
  out of pipeline.ts so the orchestrator doesn't carry every engine's import.
- `src/coordinator/pipeline-types.ts` — `PipelineInput`, `PipelineResult`.
- `src/coordinator/pipeline-state.ts` — `runCheckpoint` with `'pending'`
  default and `decidedAt` semantics.
- `src/coordinator/run-and-persist.ts` — `runAndPersistPipeline` (initial)
  and `resumeAndPersistPipeline` (resume) both wrap the orchestrator with
  artifact persistence.
- `src/coordinator/intake-to-pipeline-input.ts` — the shared rehydrator.
- `src/app/api/pipeline/[id]/checkpoint/route.ts` — approval handler that
  computes "all engine CPs approved?" and fires the resume.
- `src/coordinator/types.ts` — `PipelineState.status` union.
