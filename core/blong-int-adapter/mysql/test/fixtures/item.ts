/**
 * Fixture data for MySQL integration tests.
 * Used by testMysqlCrud to seed and verify CRUD operations on the `item` table.
 */

export const items = [
    {itemName: 'Widget Alpha', itemDescription: 'First blong integration test widget'},
    {itemName: 'Widget Beta', itemDescription: 'Second blong integration test widget'},
    {itemName: 'Widget Gamma', itemDescription: 'Third blong integration test widget'},
] as const;

export const updatedItem = {
    itemName: 'Widget Alpha Updated',
    itemDescription: 'Updated description for integration test',
} as const;

export const mergedItem = {
    itemName: 'Widget Merged',
    itemDescription: 'Created via upsert in integration test',
} as const;
