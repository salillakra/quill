import type { TimetableSlot } from "@prisma/client";

export interface ClashWarning {
  id: string;
  type: "ROOM_CLASH" | "FACULTY_CLASH" | "OVERLOAD";
  day: number;
  dayName: string;
  period: number;
  locationOrPerson: string;
  conflictingCourses: string[];
  recommendation: string;
}

export interface RoomUtilization {
  room: string;
  occupiedSlots: number;
  totalPossibleSlots: number;
  utilizationRate: number; // 0..100%
  busyPeriods: { day: number; period: number }[];
}

export interface FacultyWorkload {
  faculty: string;
  totalSlots: number;
  assignedCourses: string[];
  maxConsecutiveHours: number;
}

export interface TimetableAnalyticsResult {
  timetableId?: string;
  branch?: string;
  semester?: number;
  totalSlots: number;
  uniqueRoomsCount: number;
  uniqueFacultyCount: number;
  uniqueCoursesCount: number;
  clashes: ClashWarning[];
  roomUtilizations: RoomUtilization[];
  facultyWorkloads: FacultyWorkload[];
  freeSlotsMatrix: { day: number; dayName: string; freeRooms: string[]; availablePeriods: number[] }[];
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function analyzeTimetable(
  slots: Pick<TimetableSlot, "day" | "period" | "course" | "code" | "room" | "faculty">[],
): TimetableAnalyticsResult {
  const clashes: ClashWarning[] = [];
  const roomMap = new Map<string, { day: number; period: number }[]>();
  const facultyMap = new Map<string, { day: number; period: number; course: string }[]>();
  const courseSet = new Set<string>();

  // Map to group slots by day-period key
  const slotByDayPeriod = new Map<string, typeof slots>();

  for (const s of slots) {
    if (s.course) courseSet.add(s.course);

    const key = `${s.day}-${s.period}`;
    if (!slotByDayPeriod.has(key)) {
      slotByDayPeriod.set(key, []);
    }
    slotByDayPeriod.get(key)!.push(s);

    if (s.room) {
      if (!roomMap.has(s.room)) roomMap.set(s.room, []);
      roomMap.get(s.room)!.push({ day: s.day, period: s.period });
    }

    if (s.faculty) {
      if (!facultyMap.has(s.faculty)) facultyMap.set(s.faculty, []);
      facultyMap.get(s.faculty)!.push({ day: s.day, period: s.period, course: s.course });
    }
  }

  // 1. Clash & Conflict Detection
  for (const [key, group] of slotByDayPeriod.entries()) {
    const [dayStr, periodStr] = key.split("-");
    const day = Number(dayStr);
    const period = Number(periodStr);
    const dayName = DAY_NAMES[day] || `Day ${day}`;

    // Room conflict check
    const roomGroups = new Map<string, typeof slots>();
    for (const item of group) {
      if (item.room) {
        if (!roomGroups.has(item.room)) roomGroups.set(item.room, []);
        roomGroups.get(item.room)!.push(item);
      }
    }
    for (const [room, rSlots] of roomGroups.entries()) {
      if (rSlots.length > 1) {
        const courses = rSlots.map((x) => x.course);
        clashes.push({
          id: `clash-room-${room}-${day}-${period}`,
          type: "ROOM_CLASH",
          day,
          dayName,
          period,
          locationOrPerson: `Room ${room}`,
          conflictingCourses: courses,
          recommendation: `Reschedule ${courses[1]} to an unoccupied room at period ${period} or move to period ${period + 1}.`,
        });
      }
    }

    // Faculty conflict check
    const facultyGroups = new Map<string, typeof slots>();
    for (const item of group) {
      if (item.faculty) {
        if (!facultyGroups.has(item.faculty)) facultyGroups.set(item.faculty, []);
        facultyGroups.get(item.faculty)!.push(item);
      }
    }
    for (const [fac, fSlots] of facultyGroups.entries()) {
      if (fSlots.length > 1) {
        const courses = fSlots.map((x) => x.course);
        clashes.push({
          id: `clash-fac-${fac}-${day}-${period}`,
          type: "FACULTY_CLASH",
          day,
          dayName,
          period,
          locationOrPerson: fac,
          conflictingCourses: courses,
          recommendation: `Faculty member ${fac} is double-booked for ${courses.join(" & ")}. Reassign instructor or swap session slot.`,
        });
      }
    }
  }

  // 2. Room Utilization Calculations (Assumes 5 days x 8 periods = 40 possible slots)
  const totalPossibleSlotsPerWeek = 40;
  const roomUtilizations: RoomUtilization[] = [];
  for (const [room, busy] of roomMap.entries()) {
    const rate = Math.round((busy.length / totalPossibleSlotsPerWeek) * 100);
    roomUtilizations.push({
      room,
      occupiedSlots: busy.length,
      totalPossibleSlots: totalPossibleSlotsPerWeek,
      utilizationRate: Math.min(100, rate),
      busyPeriods: busy,
    });
  }

  // Sort rooms by utilization rate descending
  roomUtilizations.sort((a, b) => b.utilizationRate - a.utilizationRate);

  // 3. Faculty Workload
  const facultyWorkloads: FacultyWorkload[] = [];
  for (const [faculty, list] of facultyMap.entries()) {
    const courses = Array.from(new Set(list.map((x) => x.course)));

    // Calculate max consecutive periods in a single day
    let maxConsecutive = 0;
    for (let d = 0; d < 5; d++) {
      const dayPeriods = list.filter((x) => x.day === d).map((x) => x.period).sort((a, b) => a - b);
      let currentSeq = 1;
      let maxDaySeq = dayPeriods.length ? 1 : 0;
      for (let i = 1; i < dayPeriods.length; i++) {
        if (dayPeriods[i] === dayPeriods[i - 1] + 1) {
          currentSeq++;
          if (currentSeq > maxDaySeq) maxDaySeq = currentSeq;
        } else if (dayPeriods[i] !== dayPeriods[i - 1]) {
          currentSeq = 1;
        }
      }
      if (maxDaySeq > maxConsecutive) maxConsecutive = maxDaySeq;
    }

    facultyWorkloads.push({
      faculty,
      totalSlots: list.length,
      assignedCourses: courses,
      maxConsecutiveHours: maxConsecutive,
    });

    if (maxConsecutive >= 4) {
      clashes.push({
        id: `overload-${faculty}`,
        type: "OVERLOAD",
        day: 0,
        dayName: "Weekly",
        period: 0,
        locationOrPerson: faculty,
        conflictingCourses: courses,
        recommendation: `Faculty ${faculty} has ${maxConsecutive} consecutive lecture hours. Recommend inserting a mandatory break slot.`,
      });
    }
  }

  facultyWorkloads.sort((a, b) => b.totalSlots - a.totalSlots);

  // 4. Free Slot Matrix per day
  const allRooms = Array.from(roomMap.keys());
  const freeSlotsMatrix: TimetableAnalyticsResult["freeSlotsMatrix"] = [];

  for (let d = 0; d < 5; d++) {
    const dayName = DAY_NAMES[d] || `Day ${d}`;
    const usedPeriods = new Set(slots.filter((x) => x.day === d).map((x) => x.period));
    const availablePeriods = [1, 2, 3, 4, 5, 6, 7, 8].filter((p) => !usedPeriods.has(p));

    const occupiedRoomsToday = new Set(slots.filter((x) => x.day === d && x.room).map((x) => x.room!));
    const freeRooms = allRooms.filter((r) => !occupiedRoomsToday.has(r));

    freeSlotsMatrix.push({
      day: d,
      dayName,
      freeRooms: freeRooms.length ? freeRooms : ["All rooms partially free across periods"],
      availablePeriods,
    });
  }

  return {
    totalSlots: slots.length,
    uniqueRoomsCount: roomMap.size,
    uniqueFacultyCount: facultyMap.size,
    uniqueCoursesCount: courseSet.size,
    clashes,
    roomUtilizations,
    facultyWorkloads,
    freeSlotsMatrix,
  };
}
