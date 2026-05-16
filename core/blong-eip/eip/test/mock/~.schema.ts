import {validationHandlers} from '@feasibleone/blong';

export default validationHandlers({});

declare module '@feasibleone/blong' {
    interface IRemoteHandler {
        // Mock handler signatures
        mockPipeA<T = Promise<unknown>>(params: unknown, $meta: IMeta): T;
        mockPipeB<T = Promise<unknown>>(params: unknown, $meta: IMeta): T;
        mockPipeC<T = Promise<unknown>>(params: unknown, $meta: IMeta): T;
        mockItemProcess<T = Promise<unknown>>(item: unknown, $meta: IMeta): T;
        mockDataEnrich<T = Promise<{enrichment: string}>>(params: unknown, $meta: IMeta): T;
        mockDataSave<T = Promise<{id: string}>>(data: unknown, $meta: IMeta): T;
        mockDataGet<T = Promise<{id: string; payload: unknown}>>(
            params: {id: string},
            $meta: IMeta,
        ): T;
    }
}
