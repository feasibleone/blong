import {type IMeta, handler} from '@feasibleone/blong';

/**
 * `sport.competition.get` — the competition plus its editions.
 *
 * The generic get for a resource-backed table returns the row alone, so the
 * editions card on the competition page would stay empty. The result is
 * `{competition, editions}`: the editor reads the object root, and a detail list
 * is a sibling of it. @@D-597
 *
 * The row itself comes from the generic get rather than from a query of its own:
 * the base implementation is where `labels` is projected (`widget.body`), and a
 * hand-written `select` here would silently drop the joined names. @@D-614
 */
function wireRow(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        out[key] = Buffer.isBuffer(value) ? value.toString('base64') : value;
    }
    return out;
}

export default handler(() => ({
    async sportCompetitionGet(
        params: {competitionId?: string; labels?: string[]},
        $meta: IMeta,
    ): Promise<Record<string, unknown> | undefined> {
        const base = (await super.exec({...params}, $meta)) as
            | {competition?: Record<string, unknown>}
            | undefined;
        const competition = base?.competition;
        if (!competition) return undefined;
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('the db adapter is not attached');
        const id = Buffer.from(String(params.competitionId ?? ''), 'base64');
        const editions = (await qb('sport_edition')
            .where('competitionId', id)
            .orderBy('editionYear', 'desc')
            .limit(50)) as Array<Record<string, unknown>>;
        return {competition, editions: editions.map(wireRow)};
    },
}));
