import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice";
import clientReducer from "./slices/clientSlice";
import taskReducer from "./slices/taskSlice";
import pipelineReducer from "./slices/pipelineSlice";
import quotationReducer from "./slices/quotationSlice";
import orderReducer from "./slices/orderSlice";
import communicationReducer from "./slices/communicationSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    clients: clientReducer,
    tasks: taskReducer,
    pipeline: pipelineReducer,
    quotations: quotationReducer,
    orders: orderReducer,
    communications: communicationReducer,
  },
});
