import ws from "ws";

export const supabaseServerOptions = {
  auth: { persistSession: false },
  realtime: { transport: ws }
} as any;
