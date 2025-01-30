import { IActivitesProvider, UnionToArray, WorkflowSystem } from "./base";

export class WorkflowSystemActivityProvider<T extends WorkflowSystem<any, any, any, any>> extends IActivitesProvider<{
    [K in keyof T['data']['workflows']]: {
        in: { args: T['data']['workflows'][K]['in'] },
        out: { workflowId: string },
        additionalData: {}
    } |
    {
        in: { workflowId: string },
        out: T['data']['workflows'][K]['out'],
        additionalData: T['data']['workflows'][K]['additionalData']
    }
}> {
    InferActivities!: { [K in keyof T["data"]["workflows"]]: { in: { args: T["data"]["workflows"][K]["in"]; }; out: { workflowId: string; }; additionalData: {}; } | { in: { workflowId: string; }; out: T["data"]["workflows"][K]["out"]; additionalData: T["data"]["workflows"][K]["additionalData"]; }; };

    constructor(private workflowSystem: T) {
        super();
    }

    async getActivityResult<Name extends keyof T["data"]["workflows"]>(
        activityname: Name,
        arg: { workflowId: string } | { args: T["data"]["workflows"][Name]["in"] }
    ): Promise<{ workflowId: string } | T["data"]["workflows"][Name]["out"]> {
        if ('args' in arg) {
            const data = await this.workflowSystem.execute(activityname, arg.args);
            return { workflowId: data.workflow_id };
        }
        return this.workflowSystem.getPromiseByWorkflowId(activityname, arg.workflowId);
    }

    getActivitiesNames(): UnionToArray<keyof T["data"]["workflows"]> {
        throw new Error("Method not implemented.");
    }

}
