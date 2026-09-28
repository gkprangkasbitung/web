import { LABEL_JEMAAT } from "@/lib/master-data";
import { masterDataCollectionRoutes } from "@/lib/master-data-routes";

const routes = masterDataCollectionRoutes(LABEL_JEMAAT);

export const GET = routes.GET;
export const POST = routes.POST;
