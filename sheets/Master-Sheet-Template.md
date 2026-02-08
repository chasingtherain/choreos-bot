# Master Sheet Template

## Sheet Structure

### Column Layout

| Column | Name | Type | Description |
|--------|------|------|-------------|
| A | Chore Name | Text | Name of the chore (e.g., "Bathroom") |
| B | Freq (Days) | Number | How often the chore should be done |
| C | Last Done | Date/Time | Last completion timestamp (formula) |
| D | Next Due | Date | When chore is next due (formula) |
| E | Status | Text | Current status (formula) |

## Formulas

### Column C: Last Done
```
=IFERROR(MAX(FILTER(Log!A:A,Log!B:B=A2)),"")
```

**What it does:**
- Looks at Log sheet
- Finds all entries where Chore Name matches this row
- Returns the most recent timestamp
- Shows blank if chore never done

**Copy this formula down for all chore rows.**

### Column D: Next Due
```
=IF(C2="","Never",C2+B2)
```

**What it does:**
- If never done, shows "Never"
- Otherwise, adds frequency to last done date
- Automatically calculates next due date

### Column E: Status
```
=IF(C2="","❌ Never",IF(D2<TODAY(),"⚠️ OVERDUE","✅ OK"))
```

**What it does:**
- If never done: "❌ Never"
- If next due date passed: "⚠️ OVERDUE"
- Otherwise: "✅ OK"

## Example Data

| Chore Name | Freq (Days) | Last Done | Next Due | Status |
|------------|-------------|-----------|----------|--------|
| Bathroom | 7 | 2/8/2026 1:58 PM | 2/15/2026 | ✅ OK |
| Kitchen | 3 | 2/6/2026 10:30 AM | 2/9/2026 | ⚠️ OVERDUE |
| Laundry | 7 | | Never | ❌ Never |

## Formatting

### Column C (Last Done)

1. Select entire column C
2. Format → Number → Date time
3. Choose format: `M/d/yyyy h:mm AM/PM`

### Column D (Next Due)

1. Select entire column D
2. Format → Number → Date
3. Choose format: `M/d/yyyy`

### Column E (Status)

- No special formatting needed
- Emojis display automatically

## Adding New Chores

1. Add new row with chore name and frequency
2. Copy formulas from row above (drag down)
3. That's it! Bot will automatically see the new chore

## Removing Chores

1. Delete the row
2. Bot will no longer show it in /log menu
3. Historical logs remain in Log sheet

## Tips

- Keep chore names short (better for buttons)
- Use consistent capitalization
- Don't use special characters that might break formulas
- Frequency should be in days (not weeks/months)

## Troubleshooting

**Formula shows #REF! error:**
- Check that Log sheet exists
- Verify column references (Log!A:A, Log!B:B)

**Last Done shows a number like 46061:**
- Column needs date/time formatting (see above)

**Status doesn't update:**
- Check that formulas are present in columns C, D, E
- Verify formulas reference correct cells