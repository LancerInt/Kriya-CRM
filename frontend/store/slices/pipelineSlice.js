import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "@/lib/axios";

export const fetchInquiries = createAsyncThunk("pipeline/fetchAll", async (params, { rejectWithValue }) => {
  try {
    const res = await api.get("/quotations/inquiries/", { params });
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

export const createInquiry = createAsyncThunk("pipeline/create", async (data, { rejectWithValue }) => {
  try {
    const res = await api.post("/quotations/inquiries/", data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

export const advanceInquiry = createAsyncThunk("pipeline/advance", async (id, { rejectWithValue }) => {
  try {
    const res = await api.post(`/quotations/inquiries/${id}/advance/`);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

const pipelineSlice = createSlice({
  name: "pipeline",
  initialState: { list: [], loading: false, error: null, count: 0 },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchInquiries.pending, (state) => { state.loading = true; })
      .addCase(fetchInquiries.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.results || action.payload;
        state.count = action.payload.count || action.payload.length;
      })
      .addCase(fetchInquiries.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(createInquiry.fulfilled, (state, action) => { state.list.unshift(action.payload); })
      .addCase(advanceInquiry.fulfilled, (state, action) => {
        const idx = state.list.findIndex((i) => i.id === action.payload.id);
        if (idx !== -1) state.list[idx] = action.payload;
      });
  },
});

export default pipelineSlice.reducer;
