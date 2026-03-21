import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "@/lib/axios";

export const fetchClients = createAsyncThunk("clients/fetchAll", async (params, { rejectWithValue }) => {
  try {
    const res = await api.get("/clients/", { params });
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

export const fetchClient = createAsyncThunk("clients/fetchOne", async (id, { rejectWithValue }) => {
  try {
    const res = await api.get(`/clients/${id}/`);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

export const createClient = createAsyncThunk("clients/create", async (data, { rejectWithValue }) => {
  try {
    const res = await api.post("/clients/", data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

export const updateClient = createAsyncThunk("clients/update", async ({ id, data }, { rejectWithValue }) => {
  try {
    const res = await api.patch(`/clients/${id}/`, data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

const clientSlice = createSlice({
  name: "clients",
  initialState: {
    list: [],
    current: null,
    loading: false,
    error: null,
    count: 0,
  },
  reducers: {
    clearCurrent(state) { state.current = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchClients.pending, (state) => { state.loading = true; })
      .addCase(fetchClients.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.results || action.payload;
        state.count = action.payload.count || action.payload.length;
      })
      .addCase(fetchClients.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(fetchClient.pending, (state) => { state.loading = true; })
      .addCase(fetchClient.fulfilled, (state, action) => { state.loading = false; state.current = action.payload; })
      .addCase(fetchClient.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(createClient.fulfilled, (state, action) => { state.list.unshift(action.payload); state.count++; })
      .addCase(updateClient.fulfilled, (state, action) => {
        const idx = state.list.findIndex((c) => c.id === action.payload.id);
        if (idx !== -1) state.list[idx] = action.payload;
        if (state.current?.id === action.payload.id) state.current = action.payload;
      });
  },
});

export const { clearCurrent } = clientSlice.actions;
export default clientSlice.reducer;
