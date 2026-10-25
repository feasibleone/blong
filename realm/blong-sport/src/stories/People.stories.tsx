/**
 * Sport / people — the athlete page is the layout reference.
 *
 * `edit` is the tabbed layout, so both `AthleteNew` and `AthleteOpen` show the six
 * tabs, and `AthleteOpenGrid` shows the grid variant the model also declares.
 * @@D-611 @@D-608
 */
import {page} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {title: 'Sport/People', parameters: {layout: 'fullscreen'}};
export default meta;

export const AthleteBrowse = page('sport.athlete.browse');
export const AthleteNew = page('sport.athlete.new');
/**
 * The six tabs of the athlete editor.
 *
 * The child lists (results, Olympic status, awards, documents) render empty here:
 * the real `get` attaches them as siblings of the record, and the mock answers
 * `get` from the fixture row alone.
 */
export const AthleteOpen = page('sport.athlete.open', {athleteId: 'p1'});
export const AthleteOpenGrid = page(
    'sport.athlete.open',
    {athleteId: 'p1'},
    {
        layout: 'editSplit',
    },
);

export const CoachBrowse = page('sport.coach.browse');
export const CoachNew = page('sport.coach.new');
export const CoachOpen = page('sport.coach.open', {coachId: 'p5'});

export const SpecialistBrowse = page('sport.specialist.browse');
export const SpecialistNew = page('sport.specialist.new');
export const SpecialistOpen = page('sport.specialist.open', {specialistId: 'p7'});
