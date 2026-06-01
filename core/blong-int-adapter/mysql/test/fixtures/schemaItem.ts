export {schemaItemSchema} from '../../adapter/sql/schemaItemSchema.ts';

export type SchemaItem = {
    schemaItemId?: number;
    schemaItemName?: string;
    schemaItemDescription?: string;
    schemaItemActive?: boolean;
};

export const schemaItems = [
    {schemaItemName: 'Schema Item Alpha', schemaItemDescription: 'First schema test item'},
    {schemaItemName: 'Schema Item Beta', schemaItemDescription: 'Second schema test item'},
] as const;
