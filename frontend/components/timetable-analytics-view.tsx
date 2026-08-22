"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { TimetableAnalytics } from "../lib/types";
import { AlertTriangle, Calendar, Clock, DoorOpen, Users, CheckCircle, RefreshCw, Info } from "lucide-react";

interface TimetableAnalyticsViewProps {
  extractionId: string;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export function TimetableAnalyticsView({ extractionId }: TimetableAnalyticsViewProps) {
  const [data, setData] = useState<TimetableAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTimetableAnalytics(extractionId);
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load timetable analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [extractionId]);

  if (loading) {
    return (
      <div className="p-8 rounded-xl bg-neutral-900 border border-neutral-800 text-center flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
        <p className="text-xs text-neutral-400">Analyzing timetable conflicts & room utilization...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 text-xs">
        {error || "No analytics data found for this extraction."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-neutral-100">{data.totalSlots}</div>
            <div className="text-xs text-neutral-400">Scheduled Slots</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
            <DoorOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-neutral-100">{data.uniqueRoomsCount}</div>
            <div className="text-xs text-neutral-400">Active Rooms</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-neutral-100">{data.uniqueFacultyCount}</div>
            <div className="text-xs text-neutral-400">Faculty Members</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center gap-3">
          <div
            className={`p-2.5 rounded-lg border ${
              data.clashes.length > 0
                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-neutral-100">{data.clashes.length}</div>
            <div className="text-xs text-neutral-400">Conflicts Detected</div>
          </div>
        </div>
      </div>

      {/* Conflicts & Clashes Warning Cards */}
      {data.clashes.length > 0 ? (
        <div className="p-5 rounded-xl bg-amber-950/20 border border-amber-800/40 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <AlertTriangle className="w-4 h-4" /> Schedule Conflict & Clash Warnings ({data.clashes.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.clashes.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-lg bg-neutral-900/80 border border-amber-900/40 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between font-bold text-neutral-200">
                  <span className="text-amber-400">{c.locationOrPerson}</span>
                  <span className="text-neutral-500">
                    {c.dayName} · Period {c.period}
                  </span>
                </div>
                <p className="text-neutral-300">
                  <strong className="text-neutral-400">Clash: </strong> {c.conflictingCourses.join(" vs ")}
                </p>
                <p className="text-emerald-400 italic bg-emerald-950/30 p-1.5 rounded border border-emerald-900/30">
                  <strong className="text-emerald-300 font-semibold">AI Advice: </strong> {c.recommendation}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" /> Zero Schedule Conflicts Detected! Room & Faculty allocations are 100% clash-free.
        </div>
      )}

      {/* Room Utilization Heatmap & Matrix */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-200 flex items-center gap-2">
            <DoorOpen className="w-4 h-4 text-primary" /> Room occupancy
          </h3>
          <span className="text-xs text-neutral-400">Based on 40 weekly slots</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.roomUtilizations.map((ru) => (
            <div
              key={ru.room}
              className="p-3.5 rounded-lg bg-neutral-950/60 border border-neutral-800 space-y-2"
            >
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-neutral-200">Room {ru.room}</span>
                <span
                  className={
                    ru.utilizationRate > 60
                      ? "text-amber-400"
                      : ru.utilizationRate > 30
                        ? "text-emerald-400"
                        : "text-blue-400"
                  }
                >
                  {ru.utilizationRate}% ({ru.occupiedSlots}/40 slots)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    ru.utilizationRate > 60
                      ? "bg-amber-500"
                      : ru.utilizationRate > 30
                        ? "bg-emerald-500"
                        : "bg-blue-500"
                  }`}
                  style={{ width: `${ru.utilizationRate}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Faculty Workload Analysis */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-4">
        <h3 className="text-sm font-bold text-neutral-200 flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-400" /> Faculty Lecture Load & Max Consecutive Hours
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.facultyWorkloads.map((fw) => (
            <div
              key={fw.faculty}
              className="p-3.5 rounded-lg bg-neutral-950/60 border border-neutral-800 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between font-bold text-neutral-200">
                <span className="text-purple-300">{fw.faculty}</span>
                <span className="text-neutral-400">{fw.totalSlots} hrs/week</span>
              </div>
              <div className="text-neutral-400">
                Courses: <span className="text-neutral-300">{fw.assignedCourses.join(", ")}</span>
              </div>
              <div className="flex items-center gap-2 text-neutral-400 pt-1">
                <span>Max Consecutive:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    fw.maxConsecutiveHours >= 4
                      ? "bg-amber-950 text-amber-300 border border-amber-800"
                      : "bg-neutral-800 text-neutral-300"
                  }`}
                >
                  {fw.maxConsecutiveHours} Hours Block
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
