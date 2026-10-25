/**
 * Sport / documents and awards — the generic document register, the attachments
 * that file a document against a person, and the awards with their conferrals.
 *
 * `sport.document` and `sport.attachment` are deliberately generic: a future
 * `blong-document` realm takes them over. @@D-599
 */
import {page} from '@feasibleone/blong-browser/storyHelper';
import type {Meta} from '@storybook/react-vite';

const meta: Meta = {title: 'Sport/Records', parameters: {layout: 'fullscreen'}};
export default meta;

export const DocumentBrowse = page('sport.document.browse');
export const DocumentNew = page('sport.document.new');
export const DocumentOpen = page('sport.document.open', {documentId: 'doc1'});

export const AttachmentBrowse = page('sport.attachment.browse');
export const AttachmentNew = page('sport.attachment.new');
export const AttachmentOpen = page('sport.attachment.open', {attachmentId: 'at1'});

export const AwardBrowse = page('sport.award.browse');
export const AwardNew = page('sport.award.new');
export const AwardOpen = page('sport.award.open', {awardId: 'aw1'});

/** The recipient kind is derived by the handler, so the form shows it read-only. */
export const ConferralBrowse = page('sport.conferral.browse');
export const ConferralNew = page('sport.conferral.new');
export const ConferralOpen = page('sport.conferral.open', {conferralId: 'cf1'});
