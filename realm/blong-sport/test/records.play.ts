/**
 * Records — the document register, the attachments that file a document against
 * a person or organisation, and the awards with their conferrals.
 *
 * `sport.document` and `sport.attachment` are deliberately generic (a future
 * `blong-document` realm takes them over), and a conferral's recipient is picked
 * from `sport.recipient`, which merges the five profile objects with the kind in
 * the label. @@D-599 @@D-598
 *
 * Names are fixed and every created object is cleaned first, so a retry finds the
 * same rows its earlier attempt left behind.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, cleanupModel, createAndEditModel, quiet} from './sportPlay.js';

test.use({blongPermissions: true});

const athleteName = 'ENT-PLAY-RC Athlete';
const documentTitle = 'ENT-PLAY-RC Decision';
const awardName = 'ENT-PLAY-RC Award';

test.describe('Documents and awards', () => {
    // Dependents first: a conferral points at the athlete and the award, an
    // attachment at the document and the athlete, so the parent's delete would
    // be refused while they exist.
    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'conferral',
        search: 'ENT-PLAY-RC basis',
        removeMethod: 'sport.conferral.remove',
    });

    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'attachment',
        search: 'ENT-PLAY-RC attachment note',
        removeMethod: 'sport.attachment.remove',
    });

    cleanupModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'athlete',
        search: athleteName,
        removeMethod: 'sport.athlete.remove',
    });

    createAndEditModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'athlete',
        fields: {
            'athlete.personName': athleteName,
            'athlete.firstName': 'ENT-PLAY-RC',
            'athlete.lastName': 'Athlete',
            'athlete.athleteStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'athlete.nationality': 'BUL',
        },
        search: athleteName,
    });

    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'document',
        search: documentTitle,
        removeMethod: 'sport.document.remove',
    });

    browseModel(test, expect, {
        subject: 'sport',
        object: 'document',
        searchText: 'ENT-PLAY-RC',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'document',
        fields: {
            'document.documentTitle': documentTitle,
            'document.documentType': {widget: 'select', value: 'Decision'},
            'document.documentStatus': {widget: 'select', value: 'Valid'},
            'document.documentNumber': 'ENT-PLAY-RC-1',
        },
        editFields: {
            'document.issuerName': 'ENT-PLAY-RC issuer',
        },
        search: documentTitle,
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'attachment',
        fields: {
            'attachment.documentId': {widget: 'dropdown', value: documentTitle},
            'attachment.targetResourceId': {widget: 'dropdown', value: `${athleteName} (athlete)`},
            'attachment.attachmentRole': {widget: 'select', value: 'Proof'},
            'attachment.attachmentNote': 'ENT-PLAY-RC attachment note',
        },
        editFields: {
            'attachment.attachmentNote': 'ENT-PLAY-RC attachment note edited',
        },
        search: 'ENT-PLAY-RC attachment note',
    });

    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'award',
        search: awardName,
        removeMethod: 'sport.award.remove',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'award',
        fields: {
            'award.awardName': awardName,
            'award.awardCategory': {widget: 'select', value: 'State'},
            'award.awardStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'award.awardLevel': {widget: 'select', value: 'Class I'},
        },
        search: awardName,
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'conferral',
        fields: {
            'conferral.awardId': {widget: 'dropdown', value: awardName},
            'conferral.recipientResourceId': {
                widget: 'dropdown',
                value: `${athleteName} (athlete)`,
            },
            'conferral.conferralStatus': {widget: 'select', value: 'Nominated'},
            'conferral.basisNote': 'ENT-PLAY-RC basis',
        },
        editFields: {
            'conferral.basisNote': 'ENT-PLAY-RC basis edited',
        },
        search: 'ENT-PLAY-RC basis',
    });
});
