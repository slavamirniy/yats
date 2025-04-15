import { IProtocolActivitiesProvider } from "./default.js";
import { IActivitesProvider, MaybePromise, QueuedAccessVariable } from "./base.js";

export type QueueTask = {
    name: string,
    args: any,
    id: string
}

export interface IQueueStorage<Task extends QueueTask> {
    pushTask(
        task: Task
    ): MaybePromise<void>;
    popTask(): MaybePromise<Task | undefined>;
    completeTask(id: string, result: any, error?: any): MaybePromise<void>;
    getTaskResult(id: string): MaybePromise<any>;
}

export class QueueProtocol<T extends Record<string, any>> extends IProtocolActivitiesProvider<T> {

    private isRunning: boolean = false;

    constructor(
        protected queueStorage: IQueueStorage<QueueTask>,
        private queueManager: (cmd: {
            takeTask: () => Promise<QueueTask | undefined>,
            completeTask: (task: QueueTask) => Promise<void>,
            nextIteration: () => void
        }) => Promise<void>
    ) {
        super();
    }

    async work(): Promise<void> {
        this.isRunning = true;

        const cmd = {
            takeTask: async () => {
                const task = await this.queueStorage.popTask();
                if (!task) return undefined;
                return task;
            },

            completeTask: async (task: QueueTask) => {
                const provider = this.provider;
                if (!provider) throw new Error('Provider not set');

                try {
                    const result = await provider.getActivityResult(task.name as keyof T, task.args);
                    await this.queueStorage.completeTask(task.id, result);
                } catch (error) {
                    await this.queueStorage.completeTask(task.id, undefined, error);
                }
            },

            nextIteration: () => {

            }
        };

        while (this.isRunning) {
            const waitPromise = new Promise<void>(resolve => {
                cmd.nextIteration = resolve;
            })
            await this.queueManager(cmd);
            await waitPromise;
        }
    }

    async send<Name extends keyof T>(activityname: Name, arg: { [K in keyof T]: { in: T[K]["in"]; out: T[K]["out"]; additionalData: {}; }; }[Name]["in"], id?: string): Promise<{ [K in keyof T]: { in: T[K]["in"]; out: T[K]["out"]; additionalData: {}; }; }[Name]["out"]> {
        const taskId = id ?? Math.random().toString(36).substring(7);

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

type CachedTask<T extends QueueTask = QueueTask> = T & { result?: any, error?: any, state: 'queued' | 'running' | 'completed' }

export class QueueCacheStorage<T extends QueueTask = QueueTask> implements IQueueStorage<T> {
    protected tasks: QueuedAccessVariable<CachedTask<T>[]> = new QueuedAccessVariable([] as any);

    constructor(private timeout: number = 1000) { }

    async pushTask(task: T): Promise<void> {
        await this.tasks.access(val => {
            val.unshift({ ...task, state: 'queued' });
            return val;
        })
    }

    async popTask(): Promise<T | undefined> {
        let task: any = undefined;
        await this.tasks.access(val => {
            task = val.find(t => t.state === 'queued');
            if (task) {
                task.state = 'running';
            }
            return val;
        })
        return task;
    }

    async completeTask(id: string, result: any, error?: any): Promise<void> {
        let task: any = undefined;
        await this.tasks.access(val => {
            task = val.find(t => t.id === id);
            if (!task) return val;

            task.state = 'completed';
            task.result = result;
            task.error = error;
            return val;
        })

        if (!task) throw new Error(`Task with id ${id} not found`);
    }

    async getTaskResult(id: string): Promise<any> {
        return new Promise(async (resolve, reject) => {
            const checkTask = async () => {
                try {
                    let task: CachedTask<T> | undefined;
                    await this.tasks.access(val => {
                        task = val.find(t => t.id === id) as CachedTask<T>;
                        return val;
                    });
    
                    if (!task) {
                        reject(new Error(`Task with id ${id} not found`));
                        return;
                    }
    
                    if (task.state === 'completed') {
                        if (task.error) {
                            reject(task.error);
                        } else {
                            resolve(task.result);
                        }
                        return;
                    }
    
                    setTimeout(checkTask, this.timeout);
                } catch (error) {
                    reject(error);
                }
            };
    
            checkTask();
        });
    }
}
