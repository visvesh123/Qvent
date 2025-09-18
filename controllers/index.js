import { supabase } from "../supabase.js";



export const getEvents = async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: true });
  
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      return res.json(data);
    } catch (err) {
      console.error("Server error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };




  export const getStudentInfo = async (req, res) => { 
    const { event_id, htno } = req.query;

  if (!event_id || !htno) {
    return res.status(400).json({
      error: "Missing required params: event_id and htno"
    });
  }

  try {
    // 1. Get student details
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("htno, name, program, batch")
      .eq("htno", htno)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // 2. Check registration
    const { data: registration, error: regError } = await supabase
      .from("registrations")
      .select("reg_id, reg_type")
      .eq("htno", htno)
      .eq("event_id", event_id)
      .maybeSingle();

    if (regError) {
      return res.status(400).json({ error: regError.message });
    }

    if (!registration) {
      return res.json({
        htno: student.htno,
        name: student.name,
        program: student.program,
        batch: student.batch,
        registered: false,
        reg_type: null,
        checked_in: false
      });
    }

    // 3. Check attendance
    const { data: attendance, error: attError } = await supabase
      .from("attendance")
      .select("att_id")
      .eq("reg_id", registration.reg_id)
      .eq("is_present", true)
      .maybeSingle();

    if (attError) {
      return res.status(400).json({ error: attError.message });
    }

    return res.json({
      htno: student.htno,
      name: student.name,
      program: student.program,
      batch: student.batch,
      registered: true,
      reg_type: registration.reg_type,
      checked_in: !!attendance
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  } 
}


export const markAttendanceDevice = async (req, res) => { 
    const { event_id, rfid_hex } = req.query;

    if (!event_id || !rfid_hex) {
      return res.status(400).json({ error: "event_id and rfid_hex are required" });
    }
    
    try {
      const now = new Date();
    
      // Step 1: Map RFID → HTNO
      const { data: mapping } = await supabase
        .from("rfid_mappings")
        .select("htno")
        .eq("rfid_hex", rfid_hex)
        .maybeSingle();
    
      if (!mapping) {
        return res.status(404).json({ error: "RFID not mapped" });
      }
      const htno = mapping.htno;
    
      // Step 2: Get student details
      const { data: student } = await supabase
        .from("students")
        .select("htno, name, program, batch")
        .eq("htno", htno)
        .maybeSingle();
    
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }
    
      // Step 3: Check registration
      const { data: registration } = await supabase
        .from("registrations")
        .select("reg_id, reg_type")
        .eq("htno", htno)
        .eq("event_id", event_id)
        .maybeSingle();
    
      if (!registration) {
        return res.json({
          htno: student.htno,
          name: student.name,
          program: student.program,
          batch: student.batch,
          registered: false,
          attendance: "not registered",
        });
      }
    
      // Step 4: Get event timing
      const { data: eventData } = await supabase
        .from("events")
        .select("from, to")
        .eq("event_id", event_id)
        .maybeSingle();
    
      if (!eventData) {
        return res.status(404).json({ error: "Event not found" });
      }
    
      const fromTime = new Date(eventData.from);
      const toTime = new Date(eventData.to);
    
      if (now < fromTime || now > toTime) {
        return res.json({
          htno: student.htno,
          name: student.name,
          program: student.program,
          batch: student.batch,
          registered: true,
          reg_type: registration.reg_type,
          attendance: "outside event time",
        });
      }
    
      // Step 5: Check attendance
      const { data: attendance } = await supabase
        .from("attendance")
        .select("att_id, is_present, marked_at")
        .eq("reg_id", registration.reg_id)
        .eq("htno", htno)
        .maybeSingle();
    
      let attendanceStatus = "";
    console.log(attendance)
      if (attendance) {
        // Update the existing attendance with new timestamp
        const { data: updatedAtt } = await supabase
          .from("attendance")
          .update({ is_present: true, moving: "IN" })
          .eq("att_id", attendance.att_id)
          .select()
          .maybeSingle();
    
        const updatedTime = updatedAtt ? new Date(updatedAtt.updated_at).toLocaleTimeString() : "unknown";
        attendanceStatus = `Already entered ! `;
      } else {
        // Insert new attendance
        const { data: newAtt } = await supabase
          .from("attendance")
          .insert([
            {
              htno,
              reg_id: registration.reg_id,
              reg_type: registration.reg_type,
              is_present: true,
              moving: "IN",
            },
          ])
          .select()
          .maybeSingle();
    
        attendanceStatus = "present";
      }
    
      return res.json({
        htno: student.htno,
        name: student.name,
        program: student.program,
        batch: student.batch,
        registered: true,
        reg_type: registration.reg_type,
        attendance: attendanceStatus,
      });
    } catch (err) {
      console.error("Server error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
    

}



export const statsAttendance = async (req, res) => { 
    const { event_id } = req.query;

    if (!event_id) {
      return res.status(400).json({ error: "event_id is required" });
    }
  
    try {
      // Step 1: Get all registration IDs for this event
      const { data: regs, error: regListError } = await supabase
        .from("registrations")
        .select("reg_id")
        .eq("event_id", event_id);
  
      if (regListError) {
        return res.status(500).json({ error: "Failed to fetch registrations" });
      }
  
      const regIds = regs.map(r => r.reg_id);
  
      // Step 2: Total registrations
      const totalRegistrations = regIds.length;
  
      // Step 3: Total attended
      const { count: totalAttended } = await supabase
        .from("attendance")
        .select("att_id", { count: "exact", head: true })
        .eq("is_present", true)
        .in("reg_id", regIds);
  
      // Step 4: Moving IN
      const { count: movingIn } = await supabase
        .from("attendance")
        .select("att_id", { count: "exact", head: true })
        .eq("moving", "IN")
        .in("reg_id", regIds);
  
      // Step 5: Moving OUT
      const { count: movingOut } = await supabase
        .from("attendance")
        .select("att_id", { count: "exact", head: true })
        .eq("moving", "OUT")
        .in("reg_id", regIds);
  
      // Final response
      return res.json({
        event_id,
        total_registrations: totalRegistrations,
        total_attended: totalAttended || 0,
        moving_in: movingIn || 0,
        moving_out: movingOut || 0
      });
    } catch (err) {
      console.error("Server error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
}


export const spotRegistrations = async (req, res) => { 

    const { htno, event_id, type } = req.query;

    if (!htno || !event_id || !type) {
      return res.status(400).json({ success: false, message: "Missing parameters" });
    }
  
    try {
      // Step 1: Check if student exists
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("*")
        .eq("htno", htno)
        .single();
  
      if (studentError || !student) {
        return res.json({ success: false, message: "Student not found" });
      }
  
      // Step 2: Check if already registered
      const { data: existingRegs, error: regError } = await supabase
        .from("registrations")
        .select("*")
        .eq("htno", htno)
        .eq("event_id", event_id);
  
      if (regError) {
        return res.status(500).json({ success: false, message: "DB error checking registration" });
      }
  
      if (existingRegs.length > 0) {
        return res.json({
          success: false,
          message: "Already registered",
          registration_type: existingRegs[0].reg_type
        });
      }
  
      // Step 3: Insert as spot registration
      const { data: newReg, error: insertError } = await supabase
        .from("registrations")
        .insert([{ htno, event_id, reg_type: type }])
        .select()
        .single();
  
      if (insertError) {
        return res.status(500).json({ success: false, message: "Failed to insert registration" });
      }
  
      return res.json({
        success: true,
        message: "Spot registration successful",
        htno,
        event_id,
        type
      });
  
    } catch (err) {
      console.error("Server error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
}





export const markAttendanceManual = async (req, res) => { 
    const { event_id, htno } = req.query;

    if (!event_id || !htno) {
      return res.status(400).json({ error: "event_id and htno are required" });
    }
    
    try {
      const now = new Date();
    
      // Step 1: Map RFID → HTNO
    //   const { data: mapping } = await supabase
    //     .from("rfid_mappings")
    //     .select("htno")
    //     .eq("rfid_hex", rfid_hex)
    //     .maybeSingle();
    
    //   if (!mapping) {
    //     return res.status(404).json({ error: "RFID not mapped" });
    // //   }
    //   const htno = mapping.htno;
    
      // Step 2: Get student details
      const { data: student } = await supabase
        .from("students")
        .select("htno, name, program, batch")
        .eq("htno", htno)
        .maybeSingle();
    
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }
    
      // Step 3: Check registration
      const { data: registration } = await supabase
        .from("registrations")
        .select("reg_id, reg_type")
        .eq("htno", htno)
        .eq("event_id", event_id)
        .maybeSingle();
    
      if (!registration) {
        return res.json({
          htno: student.htno,
          name: student.name,
          program: student.program,
          batch: student.batch,
          registered: false,
          attendance: "not registered",
        });
      }
    
      // Step 4: Get event timing
      const { data: eventData } = await supabase
        .from("events")
        .select("from, to")
        .eq("event_id", event_id)
        .maybeSingle();
    
      if (!eventData) {
        return res.status(404).json({ error: "Event not found" });
      }
    
      const fromTime = new Date(eventData.from);
      const toTime = new Date(eventData.to);
    
      if (now < fromTime || now > toTime) {
        return res.json({
          htno: student.htno,
          name: student.name,
          program: student.program,
          batch: student.batch,
          registered: true,
          reg_type: registration.reg_type,
          attendance: "outside event time",
        });
      }
    
      // Step 5: Check attendance
      const { data: attendance } = await supabase
        .from("attendance")
        .select("att_id, is_present, marked_at")
        .eq("reg_id", registration.reg_id)
        .eq("htno", htno)
        .maybeSingle();
    
      let attendanceStatus = "";
    console.log(attendance)
      if (attendance) {
        // Update the existing attendance with new timestamp
        const { data: updatedAtt } = await supabase
          .from("attendance")
          .update({ is_present: true, moving: "IN" })
          .eq("att_id", attendance.att_id)
          .select()
          .maybeSingle();
    
        const updatedTime = updatedAtt ? new Date(updatedAtt.updated_at).toLocaleTimeString() : "unknown";
        attendanceStatus = `Already entered ! `;
      } else {
        // Insert new attendance
        const { data: newAtt } = await supabase
          .from("attendance")
          .insert([
            {
              htno,
              reg_id: registration.reg_id,
              reg_type: registration.reg_type,
              is_present: true,
              moving: "IN",
            },
          ])
          .select()
          .maybeSingle();
    
        attendanceStatus = "present";
      }
    
      return res.json({
        htno: student.htno,
        name: student.name,
        program: student.program,
        batch: student.batch,
        registered: true,
        reg_type: registration.reg_type,
        attendance: attendanceStatus,
      });
    } catch (err) {
      console.error("Server error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
    
}


