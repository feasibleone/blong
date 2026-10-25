/**
 * Sport / competition — the series, its editions, and the participation/result
 * chain that hangs off them.
 */
import {page} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {title: 'Sport/Competition', parameters: {layout: 'fullscreen'}};
export default meta;

export const CompetitionBrowse = page('sport.competition.browse');
export const CompetitionNew = page('sport.competition.new');
/** The competition page lists its editions in a read-only card. */
export const CompetitionOpen = page('sport.competition.open', {competitionId: 'cp1'});

export const EditionBrowse = page('sport.edition.browse');
export const EditionNew = page('sport.edition.new');
export const EditionOpen = page('sport.edition.open', {editionId: 'e1'});

export const ParticipationBrowse = page('sport.participation.browse');
export const ParticipationNew = page('sport.participation.new');
export const ParticipationOpen = page('sport.participation.open', {participationId: 'pa1'});

export const ResultBrowse = page('sport.result.browse');
export const ResultNew = page('sport.result.new');
export const ResultOpen = page('sport.result.open', {resultId: 'r1'});
