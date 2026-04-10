/**
 * CascadedDropdowns story — blong-browser adaptation.
 *
 * Demonstrates three cascaded dropdowns where selecting a continent filters
 * the available countries, and selecting a country filters the available cities.
 * Uses `widget.parent` for cascade config and the `dropdowns` prop for static data.
 */
import type {Meta} from '@storybook/react-vite';
import {within} from '@testing-library/react';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {title: 'Editor/CascadedDropdowns', component: Editor};
export default meta;

const continents = [
    {value: 1, label: 'Africa'},
    {value: 2, label: 'Europe'},
    {value: 3, label: 'North America'},
    {value: 4, label: 'Oceania'},
];

const countries = [
    {value: 1, label: 'Kenya', continent: 1},
    {value: 2, label: 'Uganda', continent: 1},
    {value: 3, label: 'Tanzania', continent: 1},
    {value: 12, label: 'France', continent: 2},
    {value: 13, label: 'Germany', continent: 2},
    {value: 14, label: 'Italy', continent: 2},
    {value: 7, label: 'United States', continent: 3},
    {value: 9, label: 'Mexico', continent: 3},
    {value: 10, label: 'Australia', continent: 4},
    {value: 11, label: 'New Zealand', continent: 4},
];

const cities = [
    {value: 1, label: 'Nairobi', country: 1},
    {value: 2, label: 'Kampala', country: 2},
    {value: 3, label: 'Dar es Salaam', country: 3},
    {value: 8, label: 'Paris', country: 12},
    {value: 9, label: 'Berlin', country: 13},
    {value: 10, label: 'Rome', country: 14},
    {value: 4, label: 'New York', country: 7},
    {value: 5, label: 'Los Angeles', country: 7},
    {value: 6, label: 'Mexico City', country: 9},
    {value: 7, label: 'Canberra', country: 10},
];

export const CascadedDropdowns: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                continent: {title: 'Continent', widget: {type: 'dropdown', dropdown: 'continent'}},
                country: {
                    title: 'Country',
                    widget: {type: 'dropdown', dropdown: 'country', parent: 'continent'},
                },
                city: {
                    title: 'City',
                    widget: {type: 'dropdown', dropdown: 'city', parent: 'country'},
                },
            },
        }}
        cards={{
            edit: {
                label: undefined,
                className: 'xl:col-3',
                widgets: ['continent', 'country', 'city'],
            },
        }}
        dropdowns={{continent: continents, country: countries, city: cities}}
        editable
        editMode
        layout="edit"
        layouts={{edit: ['edit']}}
    />
);

CascadedDropdowns.play = async ({canvas, userEvent}) => {
    const body = within(document.body);

    // PrimeReact Dropdown renders a hidden accessible <input type="text" aria-haspopup="listbox">
    // inside p-hidden-accessible; the clickable trigger has role="button" within the .p-dropdown.
    // Locate each field by its visible label text then click the trigger button inside it.

    // Select continent: Europe
    const continentField = (await canvas.findByText('Continent')).closest(
        '.field.grid',
    ) as HTMLElement;
    await userEvent.click(within(continentField).getByRole('button'));
    const europeOption = body.queryByText('Europe');
    if (europeOption) await userEvent.click(europeOption);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Select country: France (only European countries visible)
    const countryField = canvas.getByText('Country').closest('.field.grid') as HTMLElement;
    await userEvent.click(within(countryField).getByRole('button'));
    const franceOption = body.queryByText('France');
    if (franceOption) await userEvent.click(franceOption);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Select city: Paris (only French cities visible)
    const cityField = canvas.getByText('City').closest('.field.grid') as HTMLElement;
    await userEvent.click(within(cityField).getByRole('button'));
    const parisOption = body.queryByText('Paris');
    if (parisOption) await userEvent.click(parisOption);
};
