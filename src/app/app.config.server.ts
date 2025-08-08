import { provideServerRendering, withRoutes } from '@angular/ssr';
// src/app/app.config.server.ts

import { mergeApplicationConfig, ApplicationConfig } from "@angular/core";
import { appConfig } from "./app.config";
import { serverRoutes } from "./app.routes.server";

const serverConfig: ApplicationConfig = {
	providers: [provideServerRendering(withRoutes(serverRoutes))],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
