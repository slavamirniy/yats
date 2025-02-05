// Каждая строка кода — как маленькая победа

// #UTILS
export type MaybePromise<T> = Promise<T> | T;
export type Unpromise<T> = T extends Promise<infer D> ? D : T;
export type UnionToArray<U> = U[];
export type PromiseIfNot<T> = T extends Promise<any> ? T : Promise<T>

export class QueuedAccessVariable<T> {
    private value: T;
    private queue: ((value: T) => Promise<void>)[] = [];
    private nextRequest: (() => void) | null = null;

    constructor(initialValue: T) {
        this.value = initialValue;
        this.processQueue();
    }

    access(accessFunction: (value: T) => Promise<T> | T): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.queue.push(async (value: T) => {
                try {
                    this.value = await accessFunction(value);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });

            if (this.nextRequest) {
                const notify = this.nextRequest;
                this.nextRequest = null;
                notify();
            }
        });
    }

    private async processQueue() {
        while (true) {
            if (this.queue.length === 0) {
                await new Promise((resolve) => this.nextRequest = resolve as any);
            }

            const func = this.queue.shift();
            if (func) {
                await func(this.value);
            }
        }
    }
}


// #TYPES
type OperationGeneral<IN, OUT> = {
    in: IN,
    out: OUT,
};

type OperationWithAdditionalData<IN, OUT, AD> = OperationGeneral<IN, OUT> & {
    additionalData: AD
};

// #ACTIVITIES
type Activity<IN, OUT, AD> = OperationWithAdditionalData<IN, OUT, AD>;

type ActivitiesDescription<ActivitesNames extends keyof any> = { [Name in ActivitesNames]: OperationWithAdditionalData<any, any, any> };
// type ActivitiesDescriptionWithAdditionalData<ActivitesNames extends keyof any> = { [Name in ActivitesNames]: OperationWithAdditionalData<any, any, any> };
export abstract class IActivitesProvider<Activities extends ActivitiesDescription<keyof Activities>> {
    readonly abstract InferActivities: Activities;
    abstract getActivityResult<Name extends keyof Activities>(activityname: Name, arg: Activities[Name]['in']): MaybePromise<Activities[Name]['out']>;
    abstract getActivitiesNames(): UnionToArray<keyof Activities>;
}

class ActivitiesCollector<State extends Record<string, any>, Value extends IActivitesProvider<ActivitiesDescription<any>>> {
    constructor(private state: State) { }

    add<Key extends keyof any, NewValue extends Value>(key: Key, value: NewValue) {
        return new ActivitiesCollector<
            State & { [K in Key]: NewValue },
            Value
        >({ ...this.state, [key]: value } as State & { [K in Key]: NewValue });
    }

    getState() {
        return this.state;
    }
}

type ActivityExecutor<ActivitiesProviders extends Record<string, IActivitesProvider<any>>> = {
    [K in keyof ActivitiesProviders]: { [ActivityName in keyof ActivitiesProviders[K]['InferActivities']]: (arg: ActivitiesProviders[K]['InferActivities'][ActivityName]['in']) => PromiseIfNot<ActivitiesProviders[K]['InferActivities'][ActivityName]['out']> }
};

// #MIDDLEWARES
type MiddlewareEventCollectorDefaultHiddenFields = 'whenActivityNameIs';

type Middleware<Activities extends Record<string, IActivitesProvider<any>>, Workflows extends Record<string, any>> =
    (collector: Omit<MiddlewareEventCollector<MiddlewareInput<Activities, Workflows>, Activities, Workflows, {
    }, true>, MiddlewareEventCollectorDefaultHiddenFields>, event: MiddlewareInput<Activities, Workflows>) => MaybePromise<MiddlewareOutput<Activities, Workflows> | undefined | void>;

type MiddlewareOutput<Activities extends Record<string, IActivitesProvider<any>>, Workflows extends Record<string, any>> = {
    input?: any;
    output?: any;
    additionalData?: any;
    workflowAdditionalData?: any;
};

type MiddlewareInputGeneric = { entrypoint: "workflow" | "middleware"; commands: { exit: (reason: string) => void; } };

type MiddlewareInput<Activities extends Record<string, IActivitesProvider<any>>, Workflows extends Record<string, any>> = MiddlewareInputGeneric & (
    ({ type: "activity"; } &
        ({ [Provider in keyof Activities]:
            {
                [ActivityName in keyof Activities[Provider]['InferActivities']]:
                ({ commands: { resolve: (output: Activities[Provider]['InferActivities'][ActivityName]['out']) => void; } }) &
                (
                    { order: "input"; commands: { executor: ActivityExecutor<Activities>; return: MiddlewareOutputCollector<Activities[Provider]['InferActivities'][ActivityName], MiddlewareOutput<Activities, Workflows>, 'setOutput'>['Type'] } } |
                    { order: "start"; commands: { return: MiddlewareOutputCollector<Activities[Provider]['InferActivities'][ActivityName], MiddlewareOutput<Activities, Workflows>, 'setOutput' | 'setInput'>['Type'] } } |
                    { order: "output"; commands: { executor: ActivityExecutor<Activities>; return: MiddlewareOutputCollector<Activities[Provider]['InferActivities'][ActivityName], MiddlewareOutput<Activities, Workflows>, 'setInput'>['Type'] }; operation: { output: Activities[Provider]['InferActivities'][ActivityName]['out']; }; })
                &
                {
                    provider: Provider;
                    activityName: ActivityName;
                    workflowName: keyof Workflows;
                    operation: {
                        input: Activities[Provider]['InferActivities'][ActivityName]['in'];
                        output?: Activities[Provider]['InferActivities'][ActivityName]['out'];
                        additionalData: Activities[Provider]['InferActivities'][ActivityName]['additionalData'];
                    };
                    workflowOperation: {
                        input: Workflows[keyof Workflows]['in'];
                        output?: Workflows[keyof Workflows]['out'];
                        additionalData: Workflows[keyof Workflows]['additionalData'];
                    }
                }
            }[keyof Activities[Provider]['InferActivities']]

        }[keyof Activities])
    ) |
    { type: "workflow"; } & ({
        [WorkflowName in keyof Workflows]:
        ({
            workflowName: WorkflowName;
            operation: {
                input: Workflows[WorkflowName]['in'];
                output?: Workflows[WorkflowName]['out'];
                workflowAdditionalData: Workflows[WorkflowName]['additionalData']
            }
        }
        ) &
        (
            { order: "input"; commands: { return: MiddlewareOutputCollector<Workflows[WorkflowName], MiddlewareOutput<Activities, Workflows>, 'setWorkflowAdditionalData' | 'setOutput'>['Type'] } } |
            { order: "start"; commands: { return: MiddlewareOutputCollector<Workflows[WorkflowName], MiddlewareOutput<Activities, Workflows>, 'setWorkflowAdditionalData' | 'setOutput' | 'setInput'>['Type'] } } |
            { order: "output"; opearion: { output: Workflows[WorkflowName]['out']; }; commands: { return: MiddlewareOutputCollector<Workflows[WorkflowName], MiddlewareOutput<Activities, Workflows>, 'setWorkflowAdditionalData' | 'setInput'>['Type'] } }
        )
    }[keyof Workflows]
    )
)

type AdditionalData<Operation, State> = {
    workflowAdditionalData: State extends { workflowAdditionalData: infer WAD } ? WAD : never,
    activityAdditionalData: Operation extends { additionalData: infer AD } ? AD : never
};

class MiddlewareOutputCollector<
    Operation extends OperationWithAdditionalData<any, any, any>,
    State extends MiddlewareOutput<any, any>,
    FieldsToOmit extends string
> {
    constructor(private state: State, private workflowAdditionalData?: any) { }

    // @ts-ignore
    readonly Type: Omit<MiddlewareOutputCollector<Operation, State, FieldsToOmit>, FieldsToOmit | 'Type'>

    setAdditionalData<NewData extends Operation['additionalData']>(configurator: (prev: Operation['additionalData'], additionalDatas: AdditionalData<Operation, State>) => NewData) {
        const result = new MiddlewareOutputCollector<Operation & { "additionalData": NewData }, State & { additionalData: NewData }, FieldsToOmit>({
            ...this.state,
            additionalData: configurator(this.state.additionalData, { workflowAdditionalData: this.state.workflowAdditionalData, activityAdditionalData: this.state.additionalData })
        });
        return result as Omit<typeof result, FieldsToOmit | 'Type'>
    }

    setWorkflowAdditionalData<NewData extends typeof this.workflowAdditionalData>(configurator: (prev: typeof this.workflowAdditionalData, additionalDatas: AdditionalData<Operation, State>) => NewData) {
        const result = new MiddlewareOutputCollector<Operation & { "additionalData": NewData }, State, FieldsToOmit>(this.state, configurator(this.workflowAdditionalData, { workflowAdditionalData: this.state.workflowAdditionalData, activityAdditionalData: this.state.additionalData }));
        return result as Omit<typeof result, FieldsToOmit>
    }

    setInput<NewData extends Operation['in']>(configurator: (prev: Operation['in'], additionalDatas: AdditionalData<Operation, State>) => NewData) {
        const result = new MiddlewareOutputCollector<Operation & { "in": NewData }, State, FieldsToOmit>({
            ...this.state,
            input: configurator(this.state.input, { workflowAdditionalData: this.state.workflowAdditionalData, activityAdditionalData: this.state.additionalData })
        });
        return result as Omit<typeof result, FieldsToOmit | 'Type'>
    }

    setOutput<NewData extends Operation['out']>(configurator: (prev: Operation['out'], additionalDatas: AdditionalData<Operation, State>) => NewData) {
        const result = new MiddlewareOutputCollector<Operation & { "in": NewData }, State, FieldsToOmit>({
            ...this.state,
            output: configurator(this.state.output, { workflowAdditionalData: this.state.workflowAdditionalData, activityAdditionalData: this.state.additionalData })
        });
        return result as Omit<typeof result, FieldsToOmit | 'Type'>
    }

    getState() {
        return this.state;
    }
}

class MiddlewaresCollector<State extends Record<string, any>, Value extends Middleware<any, any>> {
    constructor(private state: State) { }

    add<Key extends keyof any, NewValue extends Value>(key: Key, value: NewValue) {
        return new MiddlewaresCollector<
            State & { [K in Key]: NewValue },
            Value
        >({ ...this.state, [key]: value } as State & { [K in Key]: NewValue });
    }

    // add<Key extends keyof any, NewValue extends Value>(key: Key, value: NewValue) {
    //     this.state = { ...this.state, [key]: value } as State & { [K in Key]: NewValue };
    //     return this;
    // }

    getState() {
        return this.state;
    }
}

// #STORAGES

type StorageReturn<T> = T & { _brand: "return" };
type StorageReturnFunc<T> = (data: T) => MaybePromise<StorageReturn<T>>;

export interface IActivitiesStorage<ACTIVITIES extends Record<string, IActivitesProvider<ActivitiesDescription<any>>>, PROVIDER extends keyof ACTIVITIES> {
    getActivity(data: { [ProviderName in PROVIDER]: { [ActivityName in keyof ACTIVITIES[ProviderName]['InferActivities']]: { providerName: ProviderName, activityName: ActivityName, args: ACTIVITIES[ProviderName]['InferActivities'][ActivityName]['in'], activityId: string, return: StorageReturnFunc<ACTIVITIES[ProviderName]['InferActivities'][ActivityName]['out']> } }[keyof ACTIVITIES[ProviderName]['InferActivities']] }[PROVIDER]): MaybePromise<StorageReturn<ACTIVITIES[PROVIDER]['InferActivities'][keyof ACTIVITIES]['out']> | undefined>
    setActivity(data: { [ProviderName in PROVIDER]: { [ActivityName in keyof ACTIVITIES[ProviderName]['InferActivities']]: { result: ACTIVITIES[ProviderName]['InferActivities'][ActivityName]['out'], args: ACTIVITIES[ProviderName]['InferActivities'][ActivityName]['in'], activityname: ActivityName, providername: ProviderName, activityId: string } }[keyof ACTIVITIES[ProviderName]['InferActivities']] }[PROVIDER]): MaybePromise<void>
    getActivityAdditionalData(data: { [ProviderName in PROVIDER]: { [ActivityName in keyof ACTIVITIES[ProviderName]['InferActivities']]: { activityname: ActivityName, providername: ProviderName, args: ACTIVITIES[ProviderName]['InferActivities'][ActivityName]['in'], activityId: string, return: StorageReturnFunc<ACTIVITIES[ProviderName]['InferActivities'][ActivityName]['additionalData']> } }[keyof ACTIVITIES[ProviderName]['InferActivities']] }[PROVIDER]): MaybePromise<StorageReturn<ACTIVITIES[PROVIDER]['InferActivities'][keyof ACTIVITIES]['additionalData']> | undefined>
    setActivityAdditionalData(data: { [ProviderName in PROVIDER]: { [ActivityName in keyof ACTIVITIES[ProviderName]['InferActivities']]: { additionalData: ACTIVITIES[ProviderName]['InferActivities'][ActivityName]['additionalData'], activityname: ActivityName, providername: ProviderName, args: ACTIVITIES[ProviderName]['InferActivities'][ActivityName]['in'], activityId: string } }[keyof ACTIVITIES[ProviderName]['InferActivities']] }[PROVIDER]): MaybePromise<void>
}

export interface IWorkflowStorage<WorkflowsDict extends WorkflowsDescriptionWithAdditionalData<keyof any>> {
    getWorkflow(data: { [K in keyof WorkflowsDict]: { workflowname: K, workflowId: string, return: StorageReturnFunc<{ args: WorkflowsDict[K]['in'], result?: WorkflowsDict[K]['out'] }> } }[keyof WorkflowsDict]): MaybePromise<StorageReturn<{ args: WorkflowsDict[keyof WorkflowsDict]['in'], result?: WorkflowsDict[keyof WorkflowsDict]['out'] }> | undefined>
    setWorkflow(data: { [K in keyof WorkflowsDict]: { args: WorkflowsDict[K]['in'], result?: WorkflowsDict[K]['out'], workflowname: K, workflowId: string } }[keyof WorkflowsDict]): MaybePromise<void>
    getWorkflowAdditionalData(data: { [K in keyof WorkflowsDict]: { workflowname: K, workflowId: string, return: StorageReturnFunc<WorkflowsDict[K]['additionalData']> } }[keyof WorkflowsDict]): MaybePromise<StorageReturn<WorkflowsDict[keyof WorkflowsDict]['additionalData']> | undefined>
    setWorkflowAdditionalData(data: { [K in keyof WorkflowsDict]: { additionalData: WorkflowsDict[K]['additionalData'], workflowname: K, workflowId: string } }[keyof WorkflowsDict]): MaybePromise<void>
}

// #WORKFLOWS
type WorkflowToOperation<T extends WorkflowDescription<any, any, any>> = OperationWithAdditionalData<
    Parameters<T>[1],
    Unpromise<ReturnType<T>>,
    any
>;

type WorkflowDictToOperations<T extends Record<string, WorkflowDescription<any, any, any>>> = {
    [K in keyof T]: WorkflowToOperation<T[K]>
};

type WorkflowWithAdditionalData<T extends WorkflowDescription<any, any, any>> = T & {
    in: Parameters<T>[1];
    out: Unpromise<ReturnType<T>>;
    additionalData: any;
};

type WorkflowsDictWithAdditionalData<T extends Record<string, WorkflowDescription<any, any, any>>> = {
    [K in keyof T]: WorkflowWithAdditionalData<T[K]>
};

export class WorkflowSystem<
    ActivitiesProvidersDict extends Record<string, any>,
    WorkflowsDict extends Record<string, any>,
    Middlewares extends Record<string, any>,
    StoragesTypes extends Record<string, any>
> {
    private awaitersCache: QueuedAccessVariable<{ [type: string]: { [workflowId: string]: Promise<any> } }> = new QueuedAccessVariable({});
    private storages: StoragesTypes = {} as StoragesTypes;

    constructor(public data: {
        activitiesProviders: ActivitiesProvidersDict,
        workflows: WorkflowsDict,
        middlewares: Middlewares,
        storageSelector: StorageSelectorFunction<ActivitiesProvidersDict, WorkflowsDict, any>,
        storages: StoragesTypes,
        id_generator: () => string
    }) { }

    public async execute<Name extends keyof WorkflowsDict>(workflowName: Name, args: WorkflowsDict[Name]['in']) {
        const workflowId = this.data.id_generator();
        const awaiter = this.executeWorkflow(workflowName, args, workflowId);
        await this.awaitersCache.access(val => {
            if (!(workflowName in val))
                val[workflowName as string] = {};
            val[workflowName as string]![workflowId] = awaiter;
            return val;
        });
        return { workflow_id: workflowId, promise: awaiter };
    }

    public async getPromiseByWorkflowId<T extends keyof WorkflowsDict>(workflowName: T, workflowId: string): Promise<Promise<Unpromise<WorkflowsDict[T]['out']>> | undefined> {
        let promise: Promise<Unpromise<WorkflowsDict[T]['out']>> | undefined;
        await this.awaitersCache.access(val => {
            promise = val[workflowName as string]![workflowId];
            return val;
        });

        if (promise !== undefined) {
            return promise;
        }

        const storage: IWorkflowStorage<WorkflowsDict> | undefined = await this.data.storageSelector({
            workflowname: workflowName as string,
            method: 'get',
            type: 'workflow',
            set_storage: (s) => this.getStorage(s)
        });
        if (storage === undefined) {
            throw new Error(`Storage for workflow ${String(workflowName)} not found`);
        }

        const workflow = await storage.getWorkflow({
            workflowname: workflowName as string,
            workflowId,
            return: (data) => data as any
        });

        if (workflow === undefined) return undefined;

        promise = this.executeWorkflow(workflowName, workflow.args, workflowId, 'workflow');

        await this.awaitersCache.access(val => {
            if (!(workflowName in val))
                val[workflowName as string] = {};
            val[workflowName as string]![workflowId] = promise!;
            return val;
        });

        return promise;
    }

    private async executeWorkflow<Name extends keyof WorkflowsDict>(
        workflowName: Name,
        arg: WorkflowsDict[Name]['in'],
        workflowId: string,
        entrypoint: "workflow" | "middleware" = "workflow"
    ): Promise<Unpromise<WorkflowsDict[Name]['out']>> {
        // Проверяем есть ли сохраненный воркфлоу

        const state: MiddlewareOutput<ActivitiesProvidersDict, WorkflowsDict> = {
            additionalData: {},
            input: arg,
            output: undefined
        }

        const savedWorkflow = await this.getWorkflowFromStorage(workflowName, workflowId);
        if (savedWorkflow) {
            state.input = savedWorkflow.args;
        }

        const outputFunction = {
            setAdditionalData(configurator: any) {
                state.additionalData = configurator(state.additionalData, { activityAdditionalData: state.additionalData, workflowAdditionalData: state.workflowAdditionalData });
                return outputFunction;
            },
            getState() {
                return state;
            }
        } as any;

        // Выполняем input middleware
        if (this.data.middlewares) {
            const event: MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict> = {
                type: "workflow",
                order: "input",
                workflowName,
                entrypoint: entrypoint,
                operation: state as any,
                commands: {
                    exit: (reason) => { throw new Error(reason) },
                    return: outputFunction
                }
            };
            const collector = MiddlewareEventCollector.from(event as any as MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict>);
            const result = await this.executeMiddlewares(collector as any, event);
            if (result?.input) {
                state.input = result.input;
            }
        }

        // Сохраняем воркфлоу в хранилище
        await this.saveWorkflowToStorage(workflowName, workflowId, state.input);

        // Создаем executor для активностей
        const executor = {} as {
            [P in keyof ActivitiesProvidersDict]: {
                [A in keyof ActivitiesProvidersDict[P]['InferActivities']]: (
                    arg: ActivitiesProvidersDict[P]['InferActivities'][A]['in']
                ) => PromiseIfNot<ActivitiesProvidersDict[P]['InferActivities'][A]['out']>
            }
        };

        const middlewareExecutor = {} as {
            [P in keyof ActivitiesProvidersDict]: {
                [A in keyof ActivitiesProvidersDict[P]['InferActivities']]: (
                    arg: ActivitiesProvidersDict[P]['InferActivities'][A]['in']
                ) => PromiseIfNot<ActivitiesProvidersDict[P]['InferActivities'][A]['out']>
            }
        };

        for (const [providerName, provider] of Object.entries(this.data.activitiesProviders)) {
            executor[providerName as keyof ActivitiesProvidersDict] = {} as any;
            middlewareExecutor[providerName as keyof ActivitiesProvidersDict] = {} as any;

            const activities = provider.getActivitiesNames();
            for (const activityName of activities) {
                (executor[providerName as keyof ActivitiesProvidersDict] as any)[activityName] =
                    (args: any) => this.executeActivity(
                        providerName as keyof ActivitiesProvidersDict,
                        activityName as string,
                        args,
                        workflowName,
                        workflowId,
                        middlewareExecutor,
                        state as any
                    );
                (middlewareExecutor[providerName as keyof ActivitiesProvidersDict] as any)[activityName] =
                    (args: any) => this.executeActivity(
                        providerName as keyof ActivitiesProvidersDict,
                        activityName as string,
                        args,
                        workflowName,
                        workflowId,
                        middlewareExecutor,
                        state as any,
                        'middleware'
                    );
            }
        }

        // Выполняем start middleware
        if (this.data.middlewares) {
            const event: MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict> = {
                type: "workflow",
                order: "start",
                entrypoint: entrypoint,
                workflowName,
                operation: state as any,
                commands: {
                    exit: (reason) => { throw new Error(reason) },
                    return: outputFunction
                }
            };
            const collector = MiddlewareEventCollector.from(event as any as MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict>);
            await this.executeMiddlewares(collector as any, event);
        }

        // Выполняем воркфлоу
        state.output = await this.data.workflows[workflowName](executor, state.input);

        // Сохраняем результат в хранилище
        await this.saveWorkflowResultToStorage(workflowName, workflowId, state.input, state.output);

        // Выполняем output middleware
        if (this.data.middlewares) {
            const event: MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict> = {
                type: "workflow",
                order: "output",
                workflowName,
                entrypoint: entrypoint,
                operation: state as any,
                commands: {
                    exit: (reason) => { throw new Error(reason) },
                    return: outputFunction
                }
            };
            const collector = MiddlewareEventCollector.from(event as any as MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict>);
            await this.executeMiddlewares(collector as any, event);
        }

        return state.output;
    }

    private async executeActivity<
        Provider extends keyof ActivitiesProvidersDict,
        ActivityName extends keyof ActivitiesProvidersDict[Provider]['InferActivities'] & string
    >(
        providerName: Provider,
        activityName: ActivityName,
        arg: any,
        workflowName: keyof WorkflowsDict,
        workflowId: string,
        executor: ActivityExecutor<ActivitiesProvidersDict>,
        workflowState: OperationWithAdditionalData<any, any, any>,
        entrypoint: "workflow" | "middleware" = "workflow"
    ): Promise<any> {
        const activityId = this.data.id_generator();

        const state: MiddlewareOutput<ActivitiesProvidersDict, WorkflowsDict> = {
            additionalData: {},
            input: arg,
            output: undefined
        }

        // Проверяем есть ли сохраненная активность
        const savedActivity = await this.getActivityFromStorage(providerName, activityName, activityId, arg);
        if (savedActivity) {
            return savedActivity;
        }
        const outputFunction: any = {
            setAdditionalData(configurator: any) {
                state.additionalData = (() => configurator(state.additionalData, { activityAdditionalData: state.additionalData, workflowAdditionalData: workflowState.additionalData }))();
                return outputFunction;
            },
            setInput(configurator: any) {
                state.input = (() => configurator(state.input, { activityAdditionalData: state.additionalData, workflowAdditionalData: workflowState.additionalData }))();
                return outputFunction;
            },
            setOutput(configurator: any) {
                state.output = (() => configurator(state.output, { activityAdditionalData: state.additionalData, workflowAdditionalData: workflowState.additionalData }))();
                return outputFunction;
            },
            getState() {
                return state;
            },
            setWorkflowAdditionalData(configurator: any) {
                workflowState.additionalData = (() => configurator(workflowState.additionalData, { workflowAdditionalData: workflowState.additionalData, activityAdditionalData: state.additionalData }))();
                return outputFunction;
            },
        }

        // Выполняем input middleware
        if (this.data.middlewares) {
            const event: MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict> = {
                type: "activity",
                order: "input",
                provider: providerName,
                activityName,
                entrypoint: entrypoint,
                workflowName,
                operation: state as any,
                commands: {
                    exit: (reason) => { throw new Error(reason) },
                    resolve: (output) => output,
                    executor: executor,
                    return: outputFunction
                },
                workflowOperation: {
                    input: workflowState.in,
                    output: workflowState.out,
                    additionalData: workflowState.additionalData
                }
            };
            const collector = MiddlewareEventCollector.from(event as any as MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict>);
            const result = await this.executeMiddlewares(collector as any as MiddlewareEventCollector<MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict>, ActivitiesProvidersDict, WorkflowsDict, {}, false>, event);

            if (result?.input) {
                state.input = result.input;
            }
        }

        // Выполняем start middleware
        const executeStartMiddleware = this.data.middlewares ? (async () => {
            const event: MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict> = {
                type: "activity",
                order: "start",
                provider: providerName,
                activityName,
                workflowName,
                entrypoint: entrypoint,
                operation: state as any,
                commands: {
                    exit: (reason) => { throw new Error(reason) },
                    resolve: (output) => output,
                    return: outputFunction
                },
                workflowOperation: {
                    input: workflowState.in,
                    output: workflowState.out,
                    additionalData: workflowState.additionalData
                }
            };
            const collector = MiddlewareEventCollector.from(event as any as MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict>);
            await this.executeMiddlewares(collector as any as MiddlewareEventCollector<MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict>, ActivitiesProvidersDict, WorkflowsDict, {}, false>, event);


        }) : () => undefined;

        // Выполняем активность
        await Promise.all([
            (this.data.activitiesProviders[providerName].getActivityResult(activityName, state.input) as Promise<any>)
                .then(result => {
                    state.output = result;
                }),
            executeStartMiddleware()
        ]);

        // Выполняем output middleware
        if (this.data.middlewares) {
            const event: MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict> = {
                type: "activity",
                order: "output",
                provider: providerName,
                activityName,
                workflowName,
                entrypoint: entrypoint,
                operation: state as any,
                commands: {
                    exit: (reason) => { throw new Error(reason) },
                    resolve: (output) => output,
                    executor: executor,
                    return: outputFunction
                },
                workflowOperation: {
                    input: workflowState.in,
                    output: workflowState.out,
                    additionalData: workflowState.additionalData
                }
            };
            const collector = MiddlewareEventCollector.from(event as any);
            await this.saveActivityToStorage(providerName, activityName, activityId, state.input, state.output);

            if (state.additionalData) {
                await this.saveActivityAdditionalDataToStorage(providerName, activityName, activityId, state.input, state.additionalData);
            }
            if (state.workflowAdditionalData) {
                workflowState.additionalData = state.workflowAdditionalData;
                await this.saveWorkflowAdditionalDataToStorage(workflowName, workflowId, workflowState.additionalData);
            }
            await this.executeMiddlewares(collector as any as MiddlewareEventCollector<MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict>, ActivitiesProvidersDict, WorkflowsDict, {}, false>, event);
        }

        return state.output;
    }

    private async executeMiddlewares(
        collector: MiddlewareEventCollector<MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict>, ActivitiesProvidersDict, WorkflowsDict, {}, false>,
        event: MiddlewareInput<ActivitiesProvidersDict, WorkflowsDict>
    ): Promise<MiddlewareOutput<ActivitiesProvidersDict, WorkflowsDict> | undefined> {
        if (!this.data.middlewares) return undefined;

        const middlewares = Object.values(this.data.middlewares);

        for (const middleware of middlewares) {
            try {
                await middleware(collector, event);
            } catch (err) {
                if (err instanceof MiddlewareUndefinedExitException) {
                    continue;
                }
                throw err;
            }
        }
        return undefined;
    }

    private async getWorkflowFromStorage(workflowName: keyof WorkflowsDict, workflowId: string) {
        if (!this.data.storageSelector) return null;
        const storage = (this.data.storageSelector as any)({
            method: 'get',
            type: 'workflow',
            workflowname: workflowName,
            set_storage: (s: keyof StoragesTypes) => this.getStorage(s)
        }) as IWorkflowStorage<WorkflowsDict>;
        return await storage?.getWorkflow?.({
            workflowname: workflowName,
            workflowId,
            return: (data) => (data as StorageReturn<typeof data>)
        });
    }

    private async saveWorkflowToStorage(workflowName: keyof WorkflowsDict, workflowId: string, args: any) {
        if (!this.data.storageSelector) return;
        const storage = (this.data.storageSelector as any)({
            method: 'set',
            type: 'workflow',
            workflowname: workflowName,
            set_storage: (s: keyof StoragesTypes) => this.getStorage(s)
        }) as IWorkflowStorage<WorkflowsDict>;
        await storage?.setWorkflow?.({ workflowname: workflowName, workflowId, args, result: undefined });
    }

    private async saveWorkflowResultToStorage(workflowName: keyof WorkflowsDict, workflowId: string, args: any, result: any) {
        if (!this.data.storageSelector) return;
        const storage = (this.data.storageSelector as any)({
            method: 'set',
            type: 'workflow',
            workflowname: workflowName,
            set_storage: (s: keyof StoragesTypes) => this.getStorage(s)
        }) as IWorkflowStorage<WorkflowsDict>;
        await storage?.setWorkflow?.({ workflowname: workflowName, workflowId, args, result });
    }

    private async saveWorkflowAdditionalDataToStorage(workflowName: keyof WorkflowsDict, workflowId: string, additionalData: any) {
        if (!this.data.storageSelector) return;
        const storage = (this.data.storageSelector as any)({
            method: 'set',
            type: 'workflow',
            workflowname: workflowName,
            set_storage: (s: keyof StoragesTypes) => this.getStorage(s)
        }) as IWorkflowStorage<WorkflowsDict>;
        await storage?.setWorkflowAdditionalData?.({ workflowname: workflowName, workflowId, additionalData });
    }

    private async getActivityFromStorage(providerName: keyof ActivitiesProvidersDict, activityName: string, activityId: string, args: any) {
        if (!this.data.storageSelector) return null;
        const storage = (this.data.storageSelector as any)({
            method: 'get',
            type: 'activity',
            providername: providerName,
            activityname: activityName,
            set_storage: (s: keyof StoragesTypes) => this.getStorage(s)
        }) as IActivitiesStorage<ActivitiesProvidersDict, keyof ActivitiesProvidersDict>;
        return await storage?.getActivity?.({
            providerName,
            activityName,
            activityId,
            args,
            return: (data) => (data as StorageReturn<typeof data>)
        });
    }

    private async saveActivityToStorage(providerName: keyof ActivitiesProvidersDict, activityName: string, activityId: string, args: any, result: any) {
        if (!this.data.storageSelector) return;
        const storage = (this.data.storageSelector as any)({
            method: 'set',
            type: 'activity',
            providername: providerName,
            activityname: activityName,
            set_storage: (s: keyof StoragesTypes) => this.getStorage(s)
        }) as IActivitiesStorage<ActivitiesProvidersDict, keyof ActivitiesProvidersDict>;
        await storage?.setActivity?.({ result, args, activityname: activityName, providername: providerName, activityId });
    }

    private async saveActivityAdditionalDataToStorage(providerName: keyof ActivitiesProvidersDict, activityName: string, activityId: string, args: any, additionalData: any) {
        if (!this.data.storageSelector) return;
        const storage = (this.data.storageSelector as any)({
            method: 'set',
            type: 'activity',
            providername: providerName,
            activityname: activityName,
            set_storage: (s: keyof StoragesTypes) => this.getStorage(s)
        }) as IActivitiesStorage<ActivitiesProvidersDict, keyof ActivitiesProvidersDict>;
        await storage?.setActivityAdditionalData?.({ additionalData, activityname: activityName, providername: providerName, activityId, args: args });
    }

    public setStorage<T extends keyof StoragesTypes>(storageName: T, storage: StoragesTypes[T]) {
        this.storages[storageName] = storage;
    }

    private getStorage(storageName: keyof StoragesTypes) {
        const key = String(storageName);
        if (key in this.storages) {
            return this.storages[storageName];
        }
        throw new Error(`Storage with name ${key} is not initialized`);
    }
}

class WorkflowsCollector<Activities extends Record<string, IActivitesProvider<any>>, State extends Record<string, any>, Value extends WorkflowDescription<Activities, any, any>> {
    constructor(private state: State) { }

    add<Key extends keyof any, NewValue extends Value>(key: Key, value: NewValue) {
        return new WorkflowsCollector<
            Activities,
            State & { [K in Key]: {
                in: Parameters<NewValue>[1],
                out: Unpromise<ReturnType<NewValue>>,
                additionalData: {}
            } },
            Value
        >({ ...this.state, [key]: value } as State & { [K in Key]: NewValue });
    }

    getState() {
        return this.state;
    }
}

type WorkflowDescription<Activities extends Record<string, IActivitesProvider<any>>, ARGS, OUT> = (executor: ActivityExecutor<Activities>, args: ARGS) => MaybePromise<OUT>;

export class WorkflowSystemBuilder<
    ActivitiesProvidersDict extends Record<string, any>,
    WorkflowsDict extends Record<string, any>,
    Middlewares extends Record<string, any>,
    StoragesTypes extends Record<string, any>
> {
    private constructor(private data: {
        activitiesProviders: ActivitiesProvidersDict,
        workflows: WorkflowsDict,
        middlewares: Middlewares,
        storageSelector?: StorageSelectorFunction<ActivitiesProvidersDict, WorkflowsDict, any>,
        storages: StoragesTypes,
        id_generator: () => string
    }) { }

    static create() {
        return new WorkflowSystemBuilder({
            activitiesProviders: {},
            workflows: {},
            middlewares: {},
            storages: {},
            id_generator: () => Math.random().toString(36).substring(7)
        });
    }

    setActivities<NewActivities extends Record<string, any>>(configurator: (prevvalue: ActivitiesCollector<ActivitiesProvidersDict, any>) => ActivitiesCollector<NewActivities, any>) {
        return this
            .cloneWith({
                activitiesProviders: configurator(new ActivitiesCollector(this.data.activitiesProviders)).getState() as NewActivities
            });
    }

    setWorkflows<NewWorkflows extends Record<string, Record<string, any>>>(configurator: (prevvalue: WorkflowsCollector<ActivitiesProvidersDict, {}, WorkflowDescription<ActivitiesProvidersDict, any, any>>) => WorkflowsCollector<ActivitiesProvidersDict, NewWorkflows, WorkflowDescription<ActivitiesProvidersDict, any, any>>) {
        return this
            .cloneWith({
                workflows: configurator(new WorkflowsCollector(this.data.workflows)).getState() as NewWorkflows
            });
    }

    setMiddlewares<NewMiddlewares extends Record<string, Middleware<ActivitiesProvidersDict, WorkflowsDict>>>(configurator: (prevvalue: MiddlewaresCollector<Middlewares, Middleware<ActivitiesProvidersDict, WorkflowsDict>>) => MiddlewaresCollector<NewMiddlewares, any>) {
        return this
            .cloneWith({
                middlewares: configurator(new MiddlewaresCollector(this.data.middlewares)).getState() as NewMiddlewares
            });
    }

    setStorageSelector<NewStorageSelector extends Record<string, any>>(fn: StorageSelectorFunction<ActivitiesProvidersDict, WorkflowsDict, NewStorageSelector>) {
        return this
            .cloneWith({ storageSelector: fn })
            .cloneWith({ storages: {} as StoragesTypesInferer<StorageSelectorInferer<NewStorageSelector>, ActivitiesProvidersDict, WorkflowsDict> });
    }

    private cloneWith<FIELD extends keyof typeof this.data, VALUE>(
        update: { [K in FIELD]: VALUE }
    ) {
        const updates = {
            ...this.data,
            ...update as { [K in FIELD]: VALUE }
        } as typeof this.data & { [K in FIELD]: VALUE }
        //@ts-ignore
        return new WorkflowSystemBuilder<typeof updates['activitiesProviders'], typeof updates['workflows'], typeof updates['middlewares'], typeof updates['storages']>(updates);
    }

    setIdGenerator(fn: () => string) {
        return this.cloneWith({ id_generator: fn });
    }

    build() {
        const data = this.data;

        if (data.storageSelector === undefined)
            throw new Error("Attempt to build WorkflowSystem without StorageSelector")

        return new WorkflowSystem(data as Required<typeof data>);
    }
}

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

type StoragesTypesInferer<
    ST extends Record<string, any>,
    Activities extends Record<string, IActivitesProvider<any>>,
    Workflows extends Record<string, WorkflowDescription<any, any, any>>
> = {
        [STNAME in keyof ST]: UnionToIntersection<
            ST[STNAME] extends infer U
            ? U extends any
            ? [U] extends [{ type: 'activity', providername: infer PROVIDER }]
            ? IActivitiesStorage<Activities, PROVIDER & keyof Activities>
            : [U] extends [{ type: 'workflow', workflowname: infer WORKFLOW }]
            //@ts-ignore
            ? IWorkflowStorage<Pick<Workflows, WORKFLOW & keyof Workflows>>
            : never
            : never
            : never
        >
    }



type WorkflowsDescription<WorkflowsNames extends keyof any> = {
    [K in WorkflowsNames]: OperationGeneral<any, any>
};
type WorkflowsDescriptionWithAdditionalData<WorkflowsNames extends keyof any> = {
    [K in WorkflowsNames]: OperationWithAdditionalData<any, any, any>
};


export type StorageSelectorInferer<T extends Record<string, any>> =
    { [STNAME in T['storage_name']]:
        Extract<T, { storage_name: STNAME }>['storage']
    }

type StorageSelectorInput<Activities extends Record<string, any>, WorkflowsNames extends string> =
    { [K in WorkflowsNames]: {
        type: 'workflow'
        workflowname: K,
        method: 'get' | 'set',
        set_storage: <STNAME extends string>(storage_name: STNAME) => {
            storage_name: STNAME,
            storage: {
                type: 'workflow'
                workflowname: K,
            }
        }
    } }[WorkflowsNames]
    |
    { [K in keyof Activities]: {
        type: 'activity',
        providername: K,
        activityname: keyof Activities[K]['InferActivities'],
        method: 'get' | 'set',
        set_storage: <STNAME extends string>(storage_name: STNAME) => {
            storage_name: STNAME,
            storage: {
                type: 'activity',
                providername: K,
            }
        }

    } }[keyof Activities]

type StorageSelectorFunctionPreparer<Activities extends Record<string, any>, Workflows extends Record<string, any>, RESULT extends any, DATA = StorageSelectorInput<Activities, (keyof Workflows) & string>> = (d: DATA) => RESULT

export type StorageSelectorFunction<Activities extends Record<string, any>, Workflows extends Record<string, any>, RESULT extends any> = StorageSelectorFunctionPreparer<Activities, Workflows, RESULT>;


// # BASE CLASSES
class MiddlewareUndefinedExitException extends Error {
    constructor() {
        super("Middleware exit because value is undefined");
    }
}

type MiddlewareEventCollectorFlags = {
    whenEntrypointIs?: boolean;
    whenTypeIs?: boolean;
    whenOrderIs?: boolean;
    whenProviderIs?: boolean;
    whenWorkflowNameIs?: boolean;
    whenActivityNameIs?: boolean;
};

type ExcludedMethods<Flags> = keyof {
    [K in keyof Flags as Flags[K] extends true ? K : never]: true;
};


class MiddlewareEventCollector<
    Event extends MiddlewareInput<Activities, Workflows>,
    Activities extends Record<string, any>,
    Workflows extends Record<string, any>,
    Flags extends MiddlewareEventCollectorFlags = {},
    AllowUndefined extends boolean = true
> {
    public return: Event['commands']['return'];

    constructor(private event: Event) {
        this.return = event.commands.return;
    }

    static from<A extends Record<string, any>, W extends Record<string, any>>(
        event: MiddlewareInput<A, W>
    ): MiddlewareEventCollector<MiddlewareInput<A, W>, A, W> {
        return new MiddlewareEventCollector(event);
    }

    private clone<NewEvent extends Event, NewFlags extends Flags>(
        newEvent: NewEvent,
        newFlags: NewFlags
    ): Omit<MiddlewareEventCollector<NewEvent, Activities, Workflows, NewFlags, AllowUndefined>, ExcludedMethods<NewFlags>> {
        const collector = new MiddlewareEventCollector(newEvent as any);
        return collector as any;
    }

    filter<NewEvent extends Event>(fn: (event: Event) => event is NewEvent): MiddlewareEventCollector<NewEvent, Activities, Workflows, Flags, AllowUndefined> {
        return this.condition(fn(this.event), this.event as NewEvent, {} as Flags) as any;
    }


    whenEntrypointIs<E extends Event['entrypoint']>(
        e: E
    ): Omit<MiddlewareEventCollector<Event & { entrypoint: E }, Activities, Workflows, Flags & { whenEntrypointIs: true }, AllowUndefined>, ExcludedMethods<Flags & { whenEntrypointIs: true }>> {
        return this.condition(
            this.event.entrypoint === e,
            { ...this.event, entrypoint: e },
            { ...(this as any).flags, whenEntrypointIs: true }
        ) as any;
    }

    whenTypeIs<T extends Event['type']>(
        type: T
    ): T extends 'activity'
        ? Omit<MiddlewareEventCollector<Event & { type: T }, Activities, Workflows, Flags & { whenTypeIs: true }, AllowUndefined>, ExcludedMethods<Flags & { whenTypeIs: true }>>
        : T extends 'workflow'
        ? Omit<MiddlewareEventCollector<Event & { type: T }, Activities, Workflows, Flags & { whenTypeIs: true; whenProviderIs: true }, AllowUndefined>, ExcludedMethods<Flags & { whenTypeIs: true; whenProviderIs: true }>>
        : never {
        if (this.event.type === type) {
            const newEvent = { ...this.event, type };
            const newFlags = { ...(this as any).flags, whenTypeIs: true };
            if (type === 'workflow') (newFlags as any).whenProviderIs = true;
            return this.clone(newEvent, newFlags) as any;
        }
        return this.handleUndefined() as any;
    }

    whenOrderIs<O extends Event['order']>(
        order: O
    ): Omit<MiddlewareEventCollector<Event & { order: O }, Activities, Workflows, Flags & { whenOrderIs: true }, AllowUndefined>, ExcludedMethods<Flags & { whenOrderIs: true }>> {
        return this.condition(
            this.event.order === order,
            { ...this.event, order },
            { ...(this as any).flags, whenOrderIs: true }
        ) as any;
    }

    whenProviderIs<P extends keyof Activities>(
        provider: P
    ): Omit<MiddlewareEventCollector<Event & { type: 'activity'; provider: P }, Activities, Workflows, Flags & { whenProviderIs: true }, AllowUndefined>, ExcludedMethods<Flags & { whenProviderIs: true }>> {
        return this.condition(
            this.event.type === 'activity' && this.event.provider === provider,
            { ...this.event, type: 'activity', provider },
            { ...(this as any).flags, whenProviderIs: true, whenActivityNameIs: false }
        ) as any;
    }

    whenWorkflowNameIs<W extends Event['workflowName']>(
        workflowName: W
    ): Omit<MiddlewareEventCollector<Event & { workflowName: W }, Activities, Workflows, Flags & { whenWorkflowNameIs: true }, AllowUndefined>, ExcludedMethods<Flags & { whenWorkflowNameIs: true }>> {
        return this.condition(
            this.event.workflowName === workflowName,
            { ...this.event, workflowName },
            { ...(this as any).flags, whenWorkflowNameIs: true }
        ) as any;
    }

    // @ts-ignore
    whenActivityNameIs<A extends keyof Activities[Event['provider']]['InferActivities']>(
        activityName: A
    ): Omit<MiddlewareEventCollector<Event & { activityName: A }, Activities, Workflows, Flags & { whenActivityNameIs: true }, AllowUndefined>, ExcludedMethods<Flags & { whenActivityNameIs: true }>> {
        return this.condition(
            'activityName' in this.event && this.event.activityName === activityName,
            { ...this.event, activityName },
            { ...(this as any).flags, whenActivityNameIs: true }
        ) as any;
    }

    value(): Event {
        return this.event;
    }

    execWithValue<T>(operation: (value: Event) => MaybePromise<T>): Promise<T> {
        return Promise.resolve(operation(this.event));
    }

    private condition<NewEvent extends Event, NewFlags extends Flags>(
        condition: boolean,
        newEvent: NewEvent,
        newFlags: NewFlags
    ): Omit<MiddlewareEventCollector<NewEvent, Activities, Workflows, NewFlags, AllowUndefined>, ExcludedMethods<NewFlags>> {
        return (condition ? this.clone(newEvent, newFlags) : this.handleUndefined()) as any;
    }

    private handleUndefined() {
        throw new MiddlewareUndefinedExitException();
    }
}


// Какие юхкейсы должны быть реализуемы:
// 1. Перезапуск активити в случае таймаута (таймаут с каждым повтором увеличивается)
// 2. Во время вполнения ворклоу обратиться к полям таски или активити (например, какая-то особая логика, если затрачено денег на операцию больше среднего)
// 3. В случае ошибки во время выполнения ворклоу, хэндлить ошибку (с полями как в мидлвере) и давать возможность решить - продолжать выполнение или отменить ворклоу
// (например, если бд не отввечает, то сохранять в кэш, а как бд заработает (и прям сделать событие onErrorEnd) - продолжать выполнение и переписать в бд данные из кэша, и прям чтобы можно было напрямую делать подмену бд по названию)
// 4. Накапливать отмены для случая ошибки
// 5. Lazy start  - можно либо напрямую вызывать все по списку воркфлоу айди которые в процессе выполнения, чтобы запустить систему.
// 6. Сделать обязательным прописывать setStorageSelector (или наоборот необязтельным, чтобы все хранилось в кэше)
// Либо ждать возврать результата какого-нибудь активити, и только после этого запускать воркфлоу
