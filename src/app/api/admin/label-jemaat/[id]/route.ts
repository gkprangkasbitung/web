import { LABEL_JEMAAT } from "@/lib/master-data";
import { masterDataItemRoutes } from "@/lib/master-data-routes";

const routes = masterDataItemRoutes(LABEL_JEMAAT);

export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;
