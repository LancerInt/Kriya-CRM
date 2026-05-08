import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "@/lib/axios";

export const fetchOrders = createAsyncThunk("orders/fetchAll", async (params, { rejectWithValue }) => {
  try {
    // page_size=5000 keeps the Sales Orders list contiguous regardless of
    // how many rows exist (default DRF pagination would cap at 20 and the
    // page would only show the most recent slice).
    const res = await api.get("/orders/", { params: { page_size: 5000, ...(params || {}) } });
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

const orderSlice = createSlice({
  name: "orders",
  initialState: { list: [], loading: false, error: null, count: 0 },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrders.pending, (state) => { state.loading = true; })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.results || action.payload;
        state.count = action.payload.count || action.payload.length;
      })
      .addCase(fetchOrders.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export default orderSlice.reducer;
