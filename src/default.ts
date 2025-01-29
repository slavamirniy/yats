import { IActivitesProvider, Unpromise, MaybePromise, UnionToArray } from "./base.js";

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

    public startWorking(): void {
        if (!this.provider) {
            throw new Error('Provider must be set before starting as worker');
        }
        this.isWorker = true;
        this.startAsWorker();
    }

    abstract startAsWorker(): MaybePromise<void>;

    abstract send<Name extends keyof T>(activityname: Name, arg: { [K in keyof T]: { in: T[K]["in"]; out: T[K]["out"]; additionalData: {}; }; }[Name]["in"]): MaybePromise<{ [K in keyof T]: { in: T[K]["in"]; out: T[K]["out"]; additionalData: {}; }; }[Name]["out"]>;

    getActivityResult<Name extends keyof T>(activityname: Name, arg: { [K in keyof T]: { in: T[K]["in"]; out: T[K]["out"]; additionalData: {}; }; }[Name]["in"]): MaybePromise<{ [K in keyof T]: { in: T[K]["in"]; out: T[K]["out"]; additionalData: {}; }; }[Name]["out"]> {
        if (this.isWorker) {
        if (!this.provider) throw new Error('Provider not set');
        return this.provider.getActivityResult(activityname, arg);
        } else {
            return this.send(activityname, arg);
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

    use(protocol: { setProvider: (provider: IActivitesProvider<T>) => IProtocolActivitiesProvider<T> }): ProtocolCollector<T> {
        this.provider = protocol.setProvider(this.provider);
        return this;
    }


    build(): IActivitesProvider<T> {
        return this.provider;
    }
}


