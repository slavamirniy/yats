import { IActivitesProvider, Unpromise, MaybePromise, UnionToArray, IWorkflowStorage, IActivitiesStorage } from "./base.js";


export class MapStorage implements IWorkflowStorage<any>, IActivitiesStorage<any, any> {

    private cache: Map<string, any> = new Map();

    constructor() { }
    private getWorkflowKey(workflowname: string, workflowId: string): string {
        return `${workflowname}-${workflowId}`;
    }

    private getActivityKey(providername: any, activityname: string, activityId: string, args: any): string {
        return `${providername}-${activityname}-${activityId}-${JSON.stringify(args)}`;
    }

    getWorkflow(data: { workflowname: string; workflowId: string; return: (data: { args: any; result?: any; }) => MaybePromise<{ args: any; result?: any; } & { _brand: "return"; }>; }): MaybePromise<({ args: any; result?: any; } & { _brand: "return"; }) | undefined> {
        const key = this.getWorkflowKey(data.workflowname, data.workflowId);
        return data.return(this.cache.get(key));
    }
    setWorkflow(data: { args: any; result?: any; workflowname: string; workflowId: string; }): MaybePromise<void> {
        const key = this.getWorkflowKey(data.workflowname, data.workflowId);
        this.cache.set(key, data.result);
    }
    getWorkflowAdditionalData(data: { workflowname: string; workflowId: string; return: (data: any) => any; }) {
        const key = this.getWorkflowKey(data.workflowname, data.workflowId);
        return data.return(this.cache.get(key));
    }
    setWorkflowAdditionalData(data: { additionalData: any; workflowname: string; workflowId: string; }): MaybePromise<void> {
        const key = this.getWorkflowKey(data.workflowname, data.workflowId);
        this.cache.set(key, data.additionalData);
    }
    getActivity(data: { providerName: any; activityName: string; args: any; activityId: string; return: (data: any) => any; }) {
        const key = this.getActivityKey(data.providerName, data.activityName, data.activityId, data.args);
        return data.return({ result: this.cache.get(key) });
    }
    setActivity(data: { result: any; args: any; activityname: string; providername: any; activityId: string; }): MaybePromise<void> {
        const key = this.getActivityKey(data.providername, data.activityname, data.activityId, data.args);
        this.cache.set(key, data.result);
    }
    getActivityAdditionalData(data: { activityname: string; providername: any; args: any; activityId: string; return: (data: any) => any; }) {
        const key = this.getActivityKey(data.providername, data.activityname, data.activityId, data.args);
        return data.return({ additionalData: this.cache.get(key) });
    }
    setActivityAdditionalData(data: { additionalData: any; activityname: string; providername: any; args: any; activityId: string; }): MaybePromise<void> {
        const key = this.getActivityKey(data.providername, data.activityname, data.activityId, data.args);
        this.cache.set(key, data.additionalData);
    }
}

export class FunctionActivitiesProvider<T extends { [K: string]: (args: any) => any }> extends IActivitesProvider<{
    [K in keyof T]: {
        in: Parameters<T[K]>[0],
        out: Unpromise<ReturnType<T[K]>>,
        additionalData: {}
    }
}> {
    // @ts-ignore
    readonly InferActivities: { [K in keyof T]: { in: Parameters<T[K]>[0]; out: Unpromise<ReturnType<T[K]>>; additionalData: {} }; };

    constructor(private activities: T) { super() }

    getActivityResult<Name extends keyof T>(activityname: Name, arg: { [K in keyof T]: { in: Parameters<T[K]>[0]; out: Unpromise<ReturnType<T[K]>>; additionalData: {} }; }[Name]["in"]): MaybePromise<{ [K in keyof T]: { in: Parameters<T[K]>[0]; out: Unpromise<ReturnType<T[K]>>; additionalData: {} }; }[Name]["out"]> {
        if (!this.activities[activityname as any]) throw new Error(`Activity ${String(activityname)} not found`);
        return this.activities[activityname]!(arg);
    }
    getActivitiesNames(): UnionToArray<keyof T> {
        return Object.keys(this.activities) as any;
    }
}


export abstract class IProtocolActivitiesProvider<T extends Record<string, any>> extends IActivitesProvider<T> {
    InferActivities: T = {} as any;
    protected provider?: IActivitesProvider<T>;

    constructor() { super() }

    setProvider<K extends T>(provider: IActivitesProvider<K>) {
        if (this.provider !== undefined) throw new Error('Provider already set');
        this.provider = provider as any;
        return this as unknown as IProtocolActivitiesProvider<K>;
    }


    private isWorker: boolean = false;

    public start(): void {
        if (!this.provider) {
            throw new Error('Provider must be set before starting as worker');
        }
        this.isWorker = true;
        this.work();
    }

    protected abstract work(): MaybePromise<void>;

    abstract send<Name extends keyof T>(activityname: Name, arg: { [K in keyof T]: { in: T[K]["in"]; out: T[K]["out"]; additionalData: {}; }; }[Name]["in"]): MaybePromise<{ [K in keyof T]: { in: T[K]["in"]; out: T[K]["out"]; additionalData: {}; }; }[Name]["out"]>;

    async getActivityResult<Name extends keyof T>(activityname: Name, arg: { [K in keyof T]: { in: T[K]["in"]; out: T[K]["out"]; additionalData: {}; }; }[Name]["in"]): Promise<{ [K in keyof T]: { in: T[K]["in"]; out: T[K]["out"]; additionalData: {}; }; }[Name]["out"]> {
        if (this.isWorker) {
            if (!this.provider) throw new Error('Provider not set');
            return await this.provider.getActivityResult(activityname, arg);
        } else {
            return await this.send(activityname, arg);
        }
    }

    getActivitiesNames(): UnionToArray<keyof T> {
        if (!this.provider) throw new Error('Provider not set');
        return this.provider.getActivitiesNames();
    }
}

export class ProtocolCollector<T extends Record<string, any>> {
    private constructor(private provider: IActivitesProvider<T>) { }

    static from<T extends Record<string, any>>(provider: IActivitesProvider<T>): ProtocolCollector<T> {
        return new ProtocolCollector(provider);
    }

    use<NEW_T extends T>(protocol: { setProvider: (provider: IActivitesProvider<T>) => IProtocolActivitiesProvider<NEW_T> }): ProtocolCollector<NEW_T> {
        this.provider = protocol.setProvider(this.provider) as any;
        return this as unknown as ProtocolCollector<NEW_T>;
    }


    build(): IActivitesProvider<T> {
        return this.provider;
    }
}


