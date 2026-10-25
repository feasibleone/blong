/**
 * Sport / organisations — the two profiles that extend `party.organization`.
 *
 * The federation and club names are invented and marine-themed on purpose: a
 * screenshot must never look like a real organisation's record.
 */
import {page} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {title: 'Sport/Organisations', parameters: {layout: 'fullscreen'}};
export default meta;

export const FederationBrowse = page('sport.federation.browse');
export const FederationNew = page('sport.federation.new');
export const FederationOpen = page('sport.federation.open', {federationId: 'f1'});

export const ClubBrowse = page('sport.club.browse');
export const ClubNew = page('sport.club.new');
export const ClubOpen = page('sport.club.open', {clubId: 'k1'});
