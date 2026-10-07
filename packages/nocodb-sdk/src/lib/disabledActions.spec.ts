import { DisabledActionsType } from './enums';
import { isActionDisabled } from './helperFunctions';

describe('isActionDisabled', () => {
  it('disables nothing when the CSV is absent or empty', () => {
    expect(isActionDisabled(undefined, DisabledActionsType.INSERT)).toBe(false);
    expect(isActionDisabled(null, DisabledActionsType.INSERT)).toBe(false);
    expect(isActionDisabled('', DisabledActionsType.INSERT)).toBe(false);
  });

  it('matches a single action', () => {
    expect(isActionDisabled('DELETE', DisabledActionsType.DELETE)).toBe(true);
    expect(isActionDisabled('DELETE', DisabledActionsType.INSERT)).toBe(false);
  });

  it('matches any entry in a multi-action CSV', () => {
    const csv = 'INSERT,UPDATE,DELETE';

    expect(isActionDisabled(csv, DisabledActionsType.INSERT)).toBe(true);
    expect(isActionDisabled(csv, DisabledActionsType.UPDATE)).toBe(true);
    expect(isActionDisabled(csv, DisabledActionsType.DELETE)).toBe(true);
  });

  it('tolerates whitespace and casing, as hand-written SQL tends to produce', () => {
    expect(
      isActionDisabled(' insert , delete ', DisabledActionsType.DELETE)
    ).toBe(true);
    expect(
      isActionDisabled(' insert , delete ', DisabledActionsType.UPDATE)
    ).toBe(false);
  });

  it('does not match on substrings', () => {
    // "INSERTED" must not satisfy "INSERT"
    expect(isActionDisabled('INSERTED', DisabledActionsType.INSERT)).toBe(
      false
    );
  });

  it('returns false when no action is given', () => {
    expect(isActionDisabled('INSERT,UPDATE,DELETE', undefined)).toBe(false);
  });
});
