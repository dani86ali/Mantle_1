# Skill: Multi-Stage Classifier Fallback

How to add a low-confidence fallback to a multi-stage classifier when a
known class of inputs systematically can't be reached by any stage.

Captured from the BOMATIC E1 file-classifier fix (XLSX BoQ files arriving
with PO-numbered filenames matched no stage and ended as `unknown`).

---

## When to use

Your classifier runs through stages (filename rule → folder rule → content
keyword scan → …) and a real class of inputs slips through every stage and
ends in the catch-all `unknown` bucket. You can't widen the existing stage
rules without false positives on other inputs. You need a fallback that:

1. Triggers ONLY when all upstream stages failed.
2. Uses a different signal than the existing stages (extension, MIME, file
   size, presence of a token in metadata, etc.).
3. Carries a low confidence + `needsReview: true` so the UI lets the user
   override if the heuristic is wrong.

---

## Rules

1. **Fallback runs at the END, not as a parallel stage.** Insert it after
   `stage3` returns its result, not as `stage1.5`. Otherwise it short-circuits
   inputs that the next real stage would have caught.
2. **Gate on `stage3.type === "unknown"`.** Anything that any earlier stage
   classified — even at low confidence — should keep that classification.
   The fallback is for inputs that *no* stage matched.
3. **Use a signal the existing stages can't.** In our case: file extension.
   File-classifier's stage 3 reads content keywords, but Excel content
   isn't extracted by the upstream `enrichFileContent` (only PDF/DOCX are).
   So XLSX/CSV files have empty content → stage 3 always returns unknown.
   The fallback uses filename *extension* — a signal stage 1 ignores
   (stage 1 reads filename tokens, not extension).
4. **Confidence 0.3-0.5 + `needsReview: true`.** Higher than the upstream
   unknown (0.3 with `needsReview`) but lower than any real stage match
   (0.6+). Signals: "we picked something, but check it."
5. **Annotate in the comment WHY this fallback exists.** Future readers must
   understand which input class slipped through, otherwise they'll tighten
   the rules and re-introduce the bug. State the failure mode and the
   reasoning in 3–5 lines above the fallback block.
6. **Test the fallback against a real bad input.** Add a unit test using a
   filename pattern the production data actually used (e.g. `Aramco_4203079088.xlsx`)
   so the fallback doesn't quietly regress later.

---

## Anti-patterns

- ❌ Widening stage 1 regex to catch the missing class. The regex now
  matches inputs it shouldn't (false positives in *other* classes).
- ❌ Adding a stage 4 that's actually a full re-classifier with its own
  logic ladder. Fallbacks are simple defaults, not "classifier v2".
- ❌ High-confidence fallback (≥0.6). Tells the UI it's a real
  classification and hides the "we guessed" semantics from the user.
- ❌ Returning the wrong type+subtype with the right format. If the file
  is unclassifiable, picking a wrong type+subtype is worse than `unknown`
  for downstream pipeline stages that switch on type.
- ❌ Skipping `needsReview: true`. Without it the dropdown UI won't flag
  the row for the engineer to check.

---

## Reference files

- `src/engines/e1/file-classifier.ts` — `classifyFile` with the
  spreadsheet fallback at the bottom; `hasSpreadsheetExtension` helper.
- `tests/engines/e1/file-classifier.test.ts` — coverage including the
  Aramco PO-numbered filename case that the fallback rescues.
