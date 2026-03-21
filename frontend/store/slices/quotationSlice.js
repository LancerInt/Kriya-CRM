import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "@/lib/axios";

export const fetchQuotations = createAsyncThunk("quotations/fetchAll", async (params, { rejectWithValue }) => {
  try {
    const res = await api.get("/quotations/quotations/", { params });
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

export const createQuotation = createAsyncThunk("quotations/create", async (data, { rejectWithValue }) => {
  try {
    const res = await api.post("/quotations/quotations/", data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

export const submitForApproval = createAsyncThunk("quotations/submit", async (id, { rejectWithValue }) => {
  try {
    const res = await api.post(`/quotations/quotations/${id}/submit_for_approval/`);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

export const approveQuotation = createAsyncThunk("quotations/approve", async (id, { rejectWithValue }) => {
  try {
    const res = await api.post(`/quotations/quotations/${id}/approve/`);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

export const convertToOrder = createAsyncThunk("quotations/convert", async (id, { rejectWithValue }) => {
  try {
    const res = await api.post(`/quotations/quotations/${id}/convert_to_order/`);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

const quotationSlice = createSlice({
  name: "quotations",
  initialState: { list: [], loading: false, error: null, count: 0 },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchQuotations.pending, (state) => { state.loading = true; })
      .addCase(fetchQuotations.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.results || action.payload;
        state.count = action.payload.count || action.payload.length;
      })
      .addCase(fetchQuotations.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(createQuotation.fulfilled, (state, action) => { state.list.unshift(action.payload); })
      .addCase(submitForApproval.fulfilled, (state, action) => {
        const idx = state.list.findIndex((q) => q.id === action.payload.id);
        if (idx !== -1) state.list[idx] = action.payload;
      })
      .addCase(approveQuotation.fulfilled, (state, action) => {
        const idx = state.list.findIndex((q) => q.id === action.payload.id);
        if (idx !== -1) state.list[idx] = action.payload;
      });
  },
});

export default quotationSlice.reducer;
