import { WILAYAH } from "@/lib/master-data";
import { masterDataItemRoutes } from "@/lib/master-data-routes";

const routes = masterDataItemRoutes(WILAYAH);

export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;
