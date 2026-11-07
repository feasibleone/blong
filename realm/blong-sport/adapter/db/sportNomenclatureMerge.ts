/* eslint-disable @typescript-eslint/no-explicit-any -- the knex builder and the
   seed payload are untyped here, as in the rest of the adapter's db group. */
import {type IMeta, handler} from '@feasibleone/blong';

type KnexQb = any;

/** A seed row after parsing — short keys, a name, whatever the file stated. */
type SeedRow = Record<string, unknown>;

/**
 * `sport.nomenclature.merge` — the sport and discipline classifiers, in one
 * seed file, with the references between them resolved by name.
 *
 * The generic `merge` writes one table per asset and names a resource by its own
 * label, so it can seed a sport but cannot say which sport a discipline belongs
 * to. This handler closes that gap: the rows are still written by the generic
 * `merge` (`sport.sport.merge`, `sport.discipline.merge` — one file, two calls,
 * so the realm keeps a single implementation of the resource write), and each
 * discipline carries the id its sport's name resolved to. @@D-788
 *
 * Two shapes are accepted, and the file picks whichever reads better:
 *
 * ```yaml
 * sport: |
 *     | name      | code |
 *     | Athletics | ATH  |
 * discipline:
 *     Athletics: |
 *         Men 100 m
 *         Women 100 m
 * ```
 *
 * The grouped form above repeats nothing: the sport is the key, and a discipline
 * line is its name. A flat table with a `sport` column is accepted too, and so
 * is the explicit form — a list of maps carrying the real column names.
 *
 * What the file leaves out, the handler derives: a name becomes the resource
 * label and the international name, `kind` defaults to `olympic` on a sport and
 * `individual` on a discipline, the status defaults to `active`, and the sex of
 * a discipline is read from a `Men` or `Women` token in its name — no token is
 * the both-sexes event the column leaves empty. `sportSex` is derived the same
 * way and only when every event of the sport is one sex. An explicit column
 * always wins over the derived value. @@D-787
 *
 * Wire: `sport.nomenclature.merge`, dispatched from
 * `meta/db/1-sportNomenclatureMerge.yaml`. The `1-` prefix sorts it before the
 * translation seeds, which key a translation by the names this seed creates, and
 * before the register seed, which names the sports seeded here.
 */
export default handler(({lib: {seedRef, seedReference, seedRows, seedSex}}) => {
    /**
     * The disciplines a file states, whichever of the three shapes it uses: a
     * map of sport → block (the short one), a table or line list with a `sport`
     * column, or the explicit list of maps.
     */
    function disciplineRows(input: unknown): SeedRow[] {
        const parse = (block: unknown): SeedRow[] => seedRows(block) as SeedRow[];
        const grouped =
            input && typeof input === 'object' && !Array.isArray(input)
                ? (input as Record<string, unknown>)
                : undefined;
        if (grouped && !explicitRow(grouped)) {
            return Object.entries(grouped).flatMap(([sport, block]) =>
                parse(block).map(row => ({...row, sport})),
            );
        }
        return parse(input);
    }

    /** Whether a map is one explicit row rather than a map keyed by sport. */
    function explicitRow(map: Record<string, unknown>): boolean {
        return Object.keys(map).some(key => key === 'name' || key === 'sport' || /Name$/.test(key));
    }

    return {
        async sportNomenclatureMerge(
            params: {sport?: unknown; discipline?: unknown},
            $meta: IMeta,
        ): Promise<{sport: number; discipline: number}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const merge = (method: string, payload: Record<string, unknown>) =>
                super.exec(payload, {...$meta, method}) as Promise<unknown>;

            const sportRows: SeedRow[] = seedRows(params.sport);
            const disciplines = disciplineRows(params.discipline);

            const sexOf = (name: string) => seedSex(name) as string | undefined;

            // A sport has a sex only when every one of its events is that sex, and
            // the file does not repeat what the disciplines already state. An event
            // open to both, or one the two contest together, leaves the sport open.
            const sexesOf = new Map<string, {sexes: Set<string>; open: boolean}>();
            for (const row of disciplines) {
                const sex = String(row.disciplineSex ?? seedSex(String(row.name)) ?? '');
                const sport = String(row.sport);
                const entry = sexesOf.get(sport) ?? {sexes: new Set<string>(), open: false};
                if (sex === 'male' || sex === 'female') entry.sexes.add(sex);
                else entry.open = true;
                sexesOf.set(sport, entry);
            }

            const sports = sportRows.map(row => {
                const name = String(row.sportName ?? row.name ?? '');
                const entry = sexesOf.get(name);
                const derived =
                    entry && !entry.open && entry.sexes.size === 1
                        ? [...entry.sexes][0]
                        : undefined;
                const sex = (row.sportSex ?? row.sex ?? derived) as string | undefined;
                return {
                    name,
                    sportName: name,
                    sportIntlName: (row.sportIntlName ?? row.intl ?? name) as string,
                    sportCode: (row.sportCode ?? row.code) as string | undefined,
                    sportKind: (row.sportKind ?? row.kind ?? 'olympic') as string,
                    sportStatus: (row.sportStatus ?? row.status ?? 'active') as string,
                    inclusionDate: (row.inclusionDate ?? row.date) as string | undefined,
                    sourceName: (row.sourceName ?? row.source ?? 'LA28 programme') as string,
                    ...(sex ? {sportSex: sex} : {}),
                };
            });
            if (sports.length) {
                await merge('sport.sport.merge', {
                    resourceType: 'sport.sport',
                    key: 'sportId',
                    sport: sports,
                });
            }
            const sportIds = await seedReference(
                qb,
                'sport.sport',
                sports.map(row => row.name),
            );

            const rows = disciplines.map(row => {
                const name = String(row.disciplineName ?? row.name ?? '');
                const disciplineSex = (row.disciplineSex ?? row.sex ?? sexOf(name)) as
                    | string
                    | undefined;
                return {
                    name,
                    disciplineName: name,
                    disciplineIntlName: (row.disciplineIntlName ?? row.intl ?? name) as string,
                    disciplineCode: (row.disciplineCode ?? row.code) as string | undefined,
                    disciplineKind: (row.disciplineKind ?? row.kind ?? 'individual') as string,
                    disciplineStatus: (row.disciplineStatus ?? row.status ?? 'active') as string,
                    inclusionDate: (row.inclusionDate ?? row.date) as string | undefined,
                    sourceName: (row.sourceName ?? row.source ?? 'LA28 programme') as string,
                    sportId: seedRef(sportIds, 'sport.sport', String(row.sport)),
                    ...(disciplineSex ? {disciplineSex} : {}),
                };
            });
            if (rows.length) {
                await merge('sport.discipline.merge', {
                    resourceType: 'sport.discipline',
                    key: 'disciplineId',
                    discipline: rows,
                });
            }

            return {sport: sports.length, discipline: rows.length};
        },
    };
});
