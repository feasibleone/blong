/**
 * Sport / Olympic — an athlete's campaign in a cycle and the qualification that
 * justifies it. The quota card carries a `(TBD)` label until the owner rules on
 * the qualification/quota split. @@D-606
 */
import {page} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {title: 'Sport/Olympic', parameters: {layout: 'fullscreen'}};
export default meta;

export const CampaignBrowse = page('sport.campaign.browse');
export const CampaignNew = page('sport.campaign.new');
export const CampaignOpen = page('sport.campaign.open', {campaignId: 'ca1'});

export const QualificationBrowse = page('sport.qualification.browse');
export const QualificationNew = page('sport.qualification.new');
export const QualificationOpen = page('sport.qualification.open', {qualificationId: 'q1'});
