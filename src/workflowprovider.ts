import { IActivitesProvider, UnionToArray, WorkflowSystem } from "./base.js";

export class WorkflowSystemActivityProvider<T extends WorkflowSystem<any, any, any, any>> extends IActivitesProvider<{
    [K in `start_${Extract<keyof T['data']['workflows'], string>}` | `complete_${Extract<keyof T['data']['workflows'], string>}`]: K extends `start_${infer W}` ? {
        in: T['data']['workflows'][W]['in'],
        out: { workflow_id: string & { __brand: W } },
        additionalData: {}
    } : K extends `complete_${infer W}` ? {
        in: { workflow_id: string & { __brand: W } },
        out: T['data']['workflows'][W]['out'],
        additionalData: T['data']['workflows'][W]['additionalData']
    } : never
}> {
    InferActivities!: {
        [K in `start_${Extract<keyof T['data']['workflows'], string>}` | `complete_${Extract<keyof T['data']['workflows'], string>}`]: K extends `start_${infer W}` ? {
            in: T['data']['workflows'][W]['in'],
            out: { workflow_id: string & { __brand: W } },
            additionalData: {}
        } : K extends `complete_${infer W}` ? {
            in: { workflow_id: string & { __brand: W } },
            out: T['data']['workflows'][W]['out'],
            additionalData: T['data']['workflows'][W]['additionalData']
        } : never
    };

    constructor(private workflowSystem: T) {
        super();
    }

    async getActivityResult<Name extends keyof this['InferActivities']>(
        activityname: Name,
        args: this['InferActivities'][Name]['in']
    ): Promise<this['InferActivities'][Name]['out']> {
        if (String(activityname).startsWith('start_')) {
            const workflowName = String(activityname).slice('start_'.length);
            const workflow = await this.workflowSystem.execute(workflowName, args);
            return { workflow_id: workflow.workflow_id } as any;
        }

        if (String(activityname).startsWith('complete_')) {
            const workflowName = String(activityname).slice('complete_'.length);
            const result = await this.workflowSystem.getPromiseByWorkflowId(workflowName, (args as any).workflow_id);
            return result as any;
        }

        throw new Error(`Unknown activity ${String(activityname)}`);
    }

    getActivitiesNames(): UnionToArray<`start_${Extract<keyof T['data']['workflows'], string>}` | `complete_${Extract<keyof T['data']['workflows'], string>}`> {
        return Object.keys(this.workflowSystem.data.workflows).map(name =>
            [`start_${name}`, `complete_${name}`]
        ).flat() as any;
    }
}
