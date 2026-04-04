# Case Stage Engine

The Case Stage Engine assigns **exactly one deterministic stage** to each case.

## Supported stage IDs

- `intake`
- `organizing`
- `pre_hearing`
- `hearing_imminent`
- `awaiting_outcome`
- `order_entered`
- `follow_up`

## Deterministic rule priority

When more than one rule matches, the first match in this order wins:

1. `hearing_imminent`
2. `awaiting_outcome`
3. `pre_hearing`
4. `order_entered`
5. `follow_up`
6. `organizing`
7. `intake`

## Rule summary

- Hearing within 7 days → `hearing_imminent`
- Hearing passed within 14 days and no later detected order → `awaiting_outcome`
- Future hearing beyond 7 days → `pre_hearing`
- Order detected with no stronger active event → `order_entered`
- No stronger stage, but deadline within 30 days → `follow_up`
- Enough case data, no urgent milestone → `organizing`
- Minimal data footprint → `intake`

## Example outputs

- Hearing in 4 days:
  - `id`: `hearing_imminent`
  - `label`: `Hearing preparation is active`
- Hearing 5 days ago, no subsequent order:
  - `id`: `awaiting_outcome`
  - `label`: `Reviewing a recent court event`
- Hearing in 21 days:
  - `id`: `pre_hearing`
  - `label`: `Preparing for an upcoming court event`
- Order detected, no near hearing:
  - `id`: `order_entered`
  - `label`: `Order entered — follow-up may be needed`
- Deadline in 12 days, no hearing/order priority:
  - `id`: `follow_up`
  - `label`: `Monitoring next steps and ongoing obligations`
- Mature timeline + documents, no urgent triggers:
  - `id`: `organizing`
  - `label`: `Case organization in progress`
- Minimal records:
  - `id`: `intake`
  - `label`: `Early case setup`

## API response shape

`GET /api/cases/:caseId/dashboard` now includes:

```json
{
  "caseStage": {
    "id": "pre_hearing",
    "label": "Preparing for an upcoming court event",
    "reason": "The next hearing is in 15 days."
  }
}
```
