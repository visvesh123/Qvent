import express from "express";
import { createClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import dotenv from 'dotenv'

import { getEvents , getStudentInfo , markAttendanceDevice ,statsAttendance ,spotRegistrations , markAttendanceManual } from "./controllers/index.js";


dotenv.config()
dayjs.extend(utc);
dayjs.extend(timezone);

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY // use service role key
);

// API: Mark attendance

  app.get("/hello", (req, res)=>{
    res.json({"Hello" : "world"})
  })

app.get("/api/events" , getEvents)

app.get("/api/student-info",getStudentInfo)
app.get("/api/mark-attendance", markAttendanceDevice)
app.get("/api/mark-attendance-manual", markAttendanceManual)
app.get("/api/stats", statsAttendance)
app.get("/api/spotregistration" , spotRegistrations)


app.listen(3000, () =>
  console.log("✅ Server running on http://localhost:3000")
);
