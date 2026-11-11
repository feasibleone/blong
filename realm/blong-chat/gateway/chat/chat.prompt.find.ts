import {validation} from '@feasibleone/blong';

/**
 * `chat.prompt.find` — what is waiting for an answer.
 *
 * A read, and the only way to look at the prompt store without answering anything. It is what makes a
 * local run checkable: a platform accepting a message says nothing about whether the realm parked a
 * question behind it.
 *
 * Authenticated and granted to the reading capability: the answers waiting in the store belong to
 * the conversations they were asked in, so who may look is a question the realm answers the same way
 * it answers who may ask (`@@D-802`).
 */
export default validation(
    async ({lib: {type}}) =>
        function chatPromptFind() {
            return {
                params: type.Object({}),
                result: type.Object({prompts: type.Array(type.Unknown())}),
            };
        },
);
