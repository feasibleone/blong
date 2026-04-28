import type {IMeta} from '@feasibleone/blong/types';
import hrtime from 'browser-process-hrtime';

type HRTime = ReturnType<typeof hrtime>;
const now = (): HRTime => hrtime();

const isAfter = (time: HRTime, timeout: HRTime): boolean =>
    Array.isArray(timeout) &&
    (time[0] > timeout[0] || (time[0] === timeout[0] && time[1] > timeout[1]));

interface IEnd {
    (error?: Error): void;
    checkTimeout: (time: HRTime) => void;
}

class Timeout {
    #calls: Set<IEnd> = new Set();
    #interval: NodeJS.Timeout | undefined;

    protected clean(): void {
        Array.from(this.#calls).forEach((end: {checkTimeout: (time: HRTime) => void}) =>
            end.checkTimeout(now()),
        );
    }

    protected startWait(
        onTimeout: (error: Error) => void,
        timeout: HRTime,
        createTimeoutError: () => Error,
        set?: Set<IEnd>,
    ): IEnd {
        this.#interval = this.#interval || setInterval(this.clean.bind(this), 500);
        const end: IEnd = (error?: Error) => {
            this.endWait(end, set);
            if (error) onTimeout(error);
        };
        end.checkTimeout = time => isAfter(time, timeout) && end(createTimeoutError());
        this.#calls.add(end);
        set?.add(end);
        return end;
    }

    protected endWait(end: IEnd, set?: Set<IEnd>): void {
        this.#calls.delete(end);
        if (set) set.delete(end);
        if (this.#calls.size <= 0 && this.#interval) {
            clearInterval(this.#interval as NodeJS.Timeout);
            this.#interval = undefined;
        }
    }

    protected startPromise(
        params: unknown,
        fn: (params: unknown) => Promise<unknown>,
        $meta: IMeta,
        error: () => Error,
        set: Set<IEnd>,
    ): Promise<unknown> {
        if (Array.isArray($meta && $meta.timeout)) {
            return new Promise((resolve, reject) => {
                const endWait = this.startWait(
                    waitError => {
                        $meta.mtid = 'error';
                        if ($meta.dispatch) {
                            Promise.resolve($meta.dispatch(waitError, $meta)).catch(() => {});
                            resolve(false);
                        } else {
                            resolve([waitError, $meta]);
                        }
                    },
                    $meta.timeout as HRTime,
                    error,
                    set,
                );
                Promise.resolve(params)
                    .then(fn)
                    .then(result => {
                        endWait();
                        resolve(result);
                        return result;
                    })
                    .catch(fnError => {
                        endWait();
                        reject(fnError);
                    });
            });
        } else {
            return Promise.resolve(params).then(fn);
        }
    }

    public startRequest(
        $meta: IMeta,
        error: () => Error,
        onTimeout: (error: Error) => void,
    ): IEnd | false {
        return (
            Array.isArray($meta && $meta.timeout) &&
            this.startWait(onTimeout, $meta.timeout as HRTime, error)
        );
    }
}

export default new Timeout();
