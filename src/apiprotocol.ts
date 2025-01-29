import express from "express";
import axios from "axios";
import { IProtocolActivitiesProvider } from "./default.js";
import { IActivitesProvider, MaybePromise } from "./base.js";

export class ApiProtocol<T extends Record<string, any>> extends IProtocolActivitiesProvider<T> {

    private app?: express.Application;

    constructor(private host: string, private port: number) {
        super();
    }

    startAsWorker(): MaybePromise<void> {
        const provider = this.provider;
        if (!provider) throw new Error('Provider not set');

        const app = express();
        app.use(express.json()); // Добавляем парсер JSON
        this.app = app;
        
        for (const name of provider.getActivitiesNames()) {
            this.app.post(`/${name as string}`, async (req, res) => {
                console.log("Получен запрос на порт " + this.port + " по пути " + `/${name as string}`, req.body);
                const result = await provider.getActivityResult(name, req.body.task);
                res.json(result);
            });
        }
        
        const promise = new Promise<void>((resolve, reject) => {
            app.listen(this.port, () => {
                console.log(`Server is running on port ${this.port}`);
                resolve();
            });
        });
        return promise;
    }

    async send<Name extends keyof T>(activityname: Name, arg: { [K in keyof T]: { in: T[K]["in"]; out: T[K]["out"]; additionalData: {}; }; }[Name]["in"]): Promise<{ [K in keyof T]: { in: T[K]["in"]; out: T[K]["out"]; additionalData: {}; }; }[Name]["out"]> {
        console.log("Отправка запроса на порт " + this.port + " по пути " + `/${activityname as string}`, arg);
        const response = await axios.post(`http://${this.host}:${this.port}/${activityname as string}`, { task: arg });
        try {
            return JSON.parse(response.data);
        } catch (error) {
            return response.data;
        }
    }
}