import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "@/lib/axios";

export const fetchTasks = createAsyncThunk("tasks/fetchAll", async (params, { rejectWithValue }) => {
  try {
    const res = await api.get("/tasks/", { params });
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

export const createTask = createAsyncThunk("tasks/create", async (data, { rejectWithValue }) => {
  try {
    const res = await api.post("/tasks/", data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

export const updateTask = createAsyncThunk("tasks/update", async ({ id, data }, { rejectWithValue }) => {
  try {
    const res = await api.patch(`/tasks/${id}/`, data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

export const completeTask = createAsyncThunk("tasks/complete", async (id, { rejectWithValue }) => {
  try {
    const res = await api.post(`/tasks/${id}/complete/`);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data);
  }
});

const taskSlice = createSlice({
  name: "tasks",
  initialState: { list: [], loading: false, error: null, stats: null, count: 0 },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTasks.pending, (state) => { state.loading = true; })
      .addCase(fetchTasks.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.results || action.payload;
        state.count = action.payload.count || action.payload.length;
      })
      .addCase(fetchTasks.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(createTask.fulfilled, (state, action) => { state.list.unshift(action.payload); })
      .addCase(updateTask.fulfilled, (state, action) => {
        const idx = state.list.findIndex((t) => t.id === action.payload.id);
        if (idx !== -1) state.list[idx] = action.payload;
      })
      .addCase(completeTask.fulfilled, (state, action) => {
        const idx = state.list.findIndex((t) => t.id === action.payload.id);
        if (idx !== -1) state.list[idx] = action.payload;
      });
  },
});

export default taskSlice.reducer;
