import {validation} from '@feasibleone/blong';

/**
 * `chat.prompt.find` — what is waiting for an answer.
 *
 * A read, and the only way to look at the prompt store without answering anything. It is what makes a
 * local run checkable: a platform accepting a message says nothing about whether the realm parked a
 * question behind it.
 */
export default validation(
    async ({lib: {type}}) =>
        function chatPromptFind() {
            return {
                auth: false as const,
                params: type.Object({}),
                result: type.Object({prompts: type.Array(type.Unknown())}),
            };
        },
);
