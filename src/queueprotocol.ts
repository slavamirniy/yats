import { IProtocolActivitiesProvider } from "./default.js";
import { IActivitesProvider, MaybePromise } from "./base.js";

export type QueueTask = {
    name: string,
    args: any,
    id: string
}

export interface IQueueStorage {
    pushTask(
        task: QueueTask
    ): MaybePromise<void>;
    popTask(): MaybePromise<QueueTask | undefined>;
    completeTask(id: string, result: any): MaybePromise<void>;
    getTaskResult(id: string): MaybePromise<any>;
}

export class QueueProtocol<T extends Record<string, any>> extends IProtocolActivitiesProvider<T> {

    private isRunning: boolean = false;

    constructor(
        protected queueStorage: IQueueStorage,
        private queueManager: (cmd: {
            takeTask: () => Promise<QueueTask | undefined>,
            completeTask: (task: QueueTask) => Promise<void>,
            nextIteration: () => void
        }) => void
    ) {
        super();
    }

    async startAsWorker(): Promise<void> {
        const provider = this.provider;
        if (!provider) throw new Error('Provider not set');

        this.isRunning = true;

        const cmd = {
            takeTask: async () => {
                const task = await this.queueStorage.popTask();
                if (!task) return undefined;
                return task;
            },

            completeTask: async (task: QueueTask) => {
                const result = await provider.getActivityResult(task.name as keyof T, task.args);
                await this.queueStorage.completeTask(task.id, result);
            },

            nextIteration: () => {

            }
        };

        while (this.isRunning) {
            const waitPromise = new Promise<void>(resolve => {
                cmd.nextIteration = resolve;
            })
            this.queueManager(cmd);
            await waitPromise;
        }
    }

    async send<Name extends keyof T>(activityname: Name, arg: { [K in keyof T]: { in: T[K]["in"]; out: T[K]["out"]; additionalData: {}; }; }[Name]["in"]): Promise<{ [K in keyof T]: { in: T[K]["in"]; out: T[K]["out"]; additionalData: {}; }; }[Name]["out"]> {
        const taskId = Math.random().toString(36).substring(7);

        await this.queueStorage.pushTask({
            name: activityname as string,
            args: arg,
            id: taskId
        });

        return await this.queueStorage.getTaskResult(taskId);
    }

    stopWorker(): void {
        this.isRunning = false;
    }
}
