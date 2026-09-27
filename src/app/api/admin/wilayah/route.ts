import { WILAYAH } from "@/lib/master-data";
import { masterDataCollectionRoutes } from "@/lib/master-data-routes";

const routes = masterDataCollectionRoutes(WILAYAH);

export const GET = routes.GET;
export const POST = routes.POST;
