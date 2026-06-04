/**
 * Fixture data for MySQL integration tests.
 * Used by testMysqlCrud to seed and verify CRUD operations on the `unit` table.
 */

export const units = [
    {unitName: 'Widget Alpha', unitDescription: 'First blong integration test widget'},
    {unitName: 'Widget Beta', unitDescription: 'Second blong integration test widget'},
    {unitName: 'Widget Gamma', unitDescription: 'Third blong integration test widget'},
] as const;

export const updatedUnit = {
    unitName: 'Widget Alpha Updated',
    unitDescription: 'Updated description for integration test',
} as const;

export const mergedUnit = {
    unitName: 'Widget Merged',
    unitDescription: 'Created via upsert in integration test',
} as const;
