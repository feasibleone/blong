import { validation } from '@feasibleone/blong';

/**
 * $subject.$object.add — create a `$object`, optionally with its `line` items.
 *
 * PUBLIC-MODEL OVERRIDE PATTERN: the model (`$subject$ObjectModel`) is
 * `public: true`, so `subject.validation` auto-generates the standard CRUD
 * validations. This file overrides the auto-generated `add` for the one
 * operation that differs — it accepts an extra optional `details` payload.
 * Keep the model public; override only the operations that need it.
 */
export default validation(
    async ({lib: {type}}) =>
        function $subject$ObjectAdd() {
            return {
                params: type.Object({
                    $object: type.Object({
                        $objectId: type.Optional(type.Number()),
                        $objectName: type.String(),
                        $objectStatus: type.String(),
                    }),
                    details: type.Optional(
                        type.Array(
                            type.Object({
                                lineName: type.String(),
                                lineQuantity: type.Number(),
                            }),
                        ),
                    ),
                }),
                result: type.Object({
                    $object: type.Object({
                        $objectId: type.Number(),
                        $objectName: type.String(),
                        $objectStatus: type.String(),
                        createdAt: type.Optional(type.String()),
                    }),
                    details: type.Array(
                        type.Object({
                            lineId: type.Number(),
                            $objectId: type.Number(),
                            lineName: type.String(),
                            lineQuantity: type.Number(),
                        }),
                    ),
                }),
            };
        },
);
