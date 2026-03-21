import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "@/lib/axios";

export const fetchCommunications = createAsyncThunk("communications/fetchAll", async (params, { rejectWithValue }) => {
  try {
    const res = await api.get("/communications/", { params });
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

export const createCommunication = createAsyncThunk("communications/create", async (data, { rejectWithValue }) => {
  try {
    const res = await api.post("/communications/", data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

const communicationSlice = createSlice({
  name: "communications",
  initialState: { list: [], loading: false, error: null, count: 0 },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCommunications.pending, (state) => { state.loading = true; })
      .addCase(fetchCommunications.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.results || action.payload;
        state.count = action.payload.count || action.payload.length;
      })
      .addCase(fetchCommunications.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(createCommunication.fulfilled, (state, action) => { state.list.unshift(action.payload); });
  },
});

export default communicationSlice.reducer;
