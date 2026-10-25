/**
 * Sport / relationships — the coaching and support periods and the affiliation of
 * a person with a club or federation. Each is a row with two ends and a period.
 * @@D-600
 */
import {page} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {title: 'Sport/Relationships', parameters: {layout: 'fullscreen'}};
export default meta;

export const CoachingBrowse = page('sport.coaching.browse');
export const CoachingNew = page('sport.coaching.new');
export const CoachingOpen = page('sport.coaching.open', {coachingId: 'co1'});

export const SupportBrowse = page('sport.support.browse');
export const SupportNew = page('sport.support.new');
export const SupportOpen = page('sport.support.open', {supportId: 'su1'});

export const AffiliationBrowse = page('sport.affiliation.browse');
export const AffiliationNew = page('sport.affiliation.new');
export const AffiliationOpen = page('sport.affiliation.open', {affiliationId: 'af1'});
