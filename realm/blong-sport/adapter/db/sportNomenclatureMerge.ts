/* eslint-disable @typescript-eslint/no-explicit-any -- the knex builder and the
   seed payload are untyped here, as in the rest of the adapter's db group. */
import {type IMeta, handler} from '@feasibleone/blong';
import {decide} from '@feasibleone/lukaot';

import vocabulary from '../../lukaot/signal.ts';

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
 * `individual` on a discipline, the status defaults to `active`, and the gender of
 * a discipline is read from a `Men` or `Women` token in its name — no token is
 * the both-genders event the column leaves empty. `sportGender` is derived the same
 * way and only when every event of the sport is one gender. An explicit column
 * always wins over the derived value. @@D-787
 *
 * Wire: `sport.nomenclature.merge`, dispatched from
 * `meta/db/1-sportNomenclatureMerge.yaml`. The `1-` prefix sorts it before the
 * translation seeds, which key a translation by the names this seed creates, and
 * before the register seed, which names the sports seeded here.
 */
export default handler(({lib: {seedRef, seedReference, seedRows, seedGender}}) => {
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

            const genderOf = (name: string) => seedGender(name) as string | undefined;

            // A sport has a gender only when every one of its events is that gender, and
            // the file does not repeat what the disciplines already state. An event
            // open to both, or one the two contest together, leaves the sport open.
            const gendersOf = new Map<string, {genders: Set<string>; open: boolean}>();
            for (const row of disciplines) {
                const gender = String(row.disciplineGender ?? seedGender(String(row.name)) ?? '');
                const sport = String(row.sport);
                const entry = gendersOf.get(sport) ?? {genders: new Set<string>(), open: false};
                if (gender === 'male' || gender === 'female') entry.genders.add(gender);
                else entry.open = true;
                gendersOf.set(sport, entry);
            }

            /**
             * The gender a sport is drawn as, when the file does not state one.
             *
             * Derived only when every event of the sport is the same gender and none is open to both: a
             * sport that contests one gender is that gender, and a sport with both — or with an event open to
             * anyone — stays open, which is the empty column the model leaves for it. The three
             * outcomes are named as branches rather than written as a ternary so the choice is
             * recorded with the candidates it chose between (`@@D-931`), and the record that follows
             * this handler carries the rationale.
             */
            const derivedGender = (
                entry: {genders: Set<string>; open: boolean} | undefined,
                stated: unknown,
            ): string | undefined => {
                if (stated !== undefined && stated !== null && stated !== '') return String(stated);
                const values = {
                    open: entry?.open === true,
                    genders: entry === undefined ? 0 : entry.genders.size,
                };
                return decide(vocabulary.decision.sportGenderDerived, values, [
                    {
                        name: 'absent',
                        when: v => v.open !== false && v.genders === 0,
                        run: () => undefined,
                    },
                    {name: 'open', when: v => v.open === true, run: () => undefined},
                    {
                        name: 'oneGender',
                        when: v => v.genders === 1,
                        run: () => [...(entry?.genders ?? [])][0],
                    },
                    {name: 'mixed', when: () => true, run: () => undefined},
                ]);
            };

            const sports = sportRows.map(row => {
                const name = String(row.sportName ?? row.name ?? '');
                const entry = gendersOf.get(name);
                const gender = derivedGender(entry, row.sportGender ?? row.gender) as string | undefined;
                return {
                    name,
                    sportName: name,
                    sportIntlName: (row.sportIntlName ?? row.intl ?? name) as string,
                    sportCode: (row.sportCode ?? row.code) as string | undefined,
                    sportKind: (row.sportKind ?? row.kind ?? 'olympic') as string,
                    sportStatus: (row.sportStatus ?? row.status ?? 'active') as string,
                    inclusionDate: (row.inclusionDate ?? row.date) as string | undefined,
                    sourceName: (row.sourceName ?? row.source ?? 'LA28 programme') as string,
                    ...(gender ? {sportGender: gender} : {}),
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
                const disciplineGender = (row.disciplineGender ?? row.gender ?? genderOf(name)) as
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
                    ...(disciplineGender ? {disciplineGender} : {}),
                };
            });
            if (rows.length) {
                await merge('sport.discipline.merge', {
                    resourceType: 'sport.discipline',
                    key: 'disciplineId',
                    discipline: rows,
                });
            }

            // The decision above explains the *next* record, so this line is also what carries it: a
            // seed that derived a classification is a fact worth a line, and a bare counts line would
            // have taken the rationale from whatever the framework happened to write afterwards.
            const log = (this as {log?: Record<string, (...args: unknown[]) => void>}).log;
            const derived = sports.filter(row => (row as {sportGender?: string}).sportGender !== undefined);
            for (const row of derived) {
                log?.['debug']?.('sport {sportName}: gender {sportGender}', {
                    context: 'sport.nomenclature',
                    signal: 'sportSportGenderDerived',
                    params: {
                        sportName: (row as {sportName?: string}).sportName,
                        sportGender: (row as {sportGender?: string}).sportGender,
                    },
                });
            }
            log?.['info']?.('seeded {sports} sport(s) and {disciplines} discipline(s)', {
                context: 'sport.nomenclature',
                signal: 'sportSeedMerged',
                params: {sports: sports.length, disciplines: rows.length},
            });

            return {sport: sports.length, discipline: rows.length};
        },
    };
});
