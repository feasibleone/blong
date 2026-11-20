/** A module whose factory fails while starting, which must cost its records and not the process. */
export default function thrower(): object {
    throw new Error('could not reach 9999/udp');
}
