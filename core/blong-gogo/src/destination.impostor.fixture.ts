/** A module that answers something which is not a writer, which is the mistake worth reporting. */
export default function impostor(): object {
    return {flush: () => undefined};
}
