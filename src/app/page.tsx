"use client";

import { useState } from "react";
import Image from "next/image";
import { doAssignmentWithSwaps } from "./server";

export interface DriverData {
  name: string;
  seats: number;
  isParent: boolean;
}

export interface AssignRidesResult {
  rideAssignments: Record<string, string[]>;
  unassignedPeople: string[];
}

export default function Home() {
  // Step states
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // CSV
  const [csvLoaded, setCsvLoaded] = useState(false);
  const [areas, setAreas] = useState<Record<string, string[]>>({});
  const [allKids, setAllKids] = useState<string[]>([]);

  // Step 1
  const [selectedKids, setSelectedKids] = useState<Set<string>>(new Set());
  const [newKidName, setNewKidName] = useState("");
  const [newKidArea, setNewKidArea] = useState("");

  // Step 2
  const [drivers, setDrivers] = useState<DriverData[]>([]);
  const [driverName, setDriverName] = useState("");
  const [driverSeats, setDriverSeats] = useState("");
  const [driverIsParent, setDriverIsParent] = useState(false);

  // Step 3
  const [assignments, setAssignments] = useState<AssignRidesResult | null>(
    null
  );

  // ----------------------------------------------------
  // 1) Load CSV from public folder
  // ----------------------------------------------------
  async function handleLoadCSV() {
    try {
      const res = await fetch("/people_areas.csv");
      if (!res.ok) throw new Error("Failed to load people_areas.csv");
      const text = await res.text();

      const lines = text.trim().split(/\r?\n/);
      const localAreas: Record<string, string[]> = {};
      for (const line of lines) {
        const parts = line.split(",").map((p) => p.trim());
        const areaName = parts[0];
        const kids = parts.slice(1).filter(Boolean);
        if (!localAreas[areaName]) {
          localAreas[areaName] = [];
        }
        for (const k of kids) {
          if (!localAreas[areaName].includes(k)) {
            localAreas[areaName].push(k);
          }
        }
      }

      // Flatten
      const allSet = new Set<string>();
      for (const arr of Object.values(localAreas)) {
        arr.forEach((k) => allSet.add(k));
      }

      setAreas(localAreas);
      setAllKids(Array.from(allSet).sort());
      setCsvLoaded(true);
    } catch (err) {
      console.error(err);
      alert("Error loading CSV. See console for details.");
    }
  }

  // ----------------------------------------------------
  // Step 1: Select Kids Present
  // ----------------------------------------------------
  function toggleKidPresent(kid: string) {
    const newSet = new Set(selectedKids);
    if (newSet.has(kid)) newSet.delete(kid);
    else newSet.add(kid);
    setSelectedKids(newSet);
  }

  function handleAddKid() {
    if (!newKidName.trim() || !newKidArea.trim()) {
      alert("Please enter both kid name and area.");
      return;
    }
    const updated = { ...areas };
    if (!updated[newKidArea]) {
      updated[newKidArea] = [];
    }
    updated[newKidArea].push(newKidName.trim());

    const newAll = new Set([...allKids, newKidName.trim()]);
    setAreas(updated);
    setAllKids(Array.from(newAll).sort());

    setNewKidName("");
    setNewKidArea("");
  }

  function handleNextFromStep1() {
    if (selectedKids.size === 0) {
      alert("Please select at least one kid for today.");
      return;
    }
    setStep(2);
  }

  // ----------------------------------------------------
  // Step 2: Assign Drivers (Modified for Unified Heights)
  // ----------------------------------------------------
  function handleAddDriver() {
    if (!driverName) {
      alert("Select a driver (kid) name.");
      return;
    }
    const seatsNum = parseInt(driverSeats, 10);
    if (isNaN(seatsNum) || seatsNum < 0) {
      alert("Invalid seats number.");
      return;
    }
    const newDriver: DriverData = {
      name: driverName,
      seats: seatsNum,
      isParent: driverIsParent,
    };
    setDrivers((prev) => [...prev, newDriver]);
    setDriverName("");
    setDriverSeats("");
    setDriverIsParent(false);
  }

  async function handleFinalizeDrivers() {
    if (drivers.length === 0) {
      alert("Please add at least one driver.");
      return;
    }
    try {
      const presentArr = Array.from(selectedKids);
      // call server action
      const result = await doAssignmentWithSwaps(presentArr, drivers, areas);
      setAssignments(result);
      setStep(3);
    } catch (err) {
      console.error(err);
      alert("Error during assignment. Check console.");
    }
  }

  // ----------------------------------------------------
  // Render
  // ----------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col bg-gray-100 text-gray-800">
      {/* Header */}
      <header className="bg-white shadow px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/car.png"
            alt="Carpool Manager"
            width={55}
            height={20}
          />
          <h1 className="text-xl font-bold">Carpool Manager</h1>
        </div>
        <button
          onClick={handleLoadCSV}
          disabled={csvLoaded}
          className={`px-5 py-2 rounded font-semibold transition-colors ${
            csvLoaded
              ? "bg-gray-400 text-white cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          {csvLoaded ? "CSV Loaded" : "Load CSV"}
        </button>
      </header>

      <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
        {/* STEP 1 */}
        {csvLoaded && step === 1 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-2xl font-semibold mb-4">
              Step 1: Select Kids Present
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="font-medium mb-2">All Kids:</p>
                <div className="border rounded p-3 h-64 overflow-auto space-y-1">
                  {allKids.map((kid) => (
                    <label key={kid} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedKids.has(kid)}
                        onChange={() => toggleKidPresent(kid)}
                      />
                      <span>{kid}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-medium mb-2">Add Temporary Kid:</p>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="Kid Name"
                    value={newKidName}
                    onChange={(e) => setNewKidName(e.target.value)}
                    className="border rounded px-2 py-1"
                  />
                  {/* <input
                    type="text"
                    placeholder="Area"
                    value={newKidArea}
                    onChange={(e) => setNewKidArea(e.target.value)}
                    className="border rounded px-2 py-1"
                  /> */}
                  <select
                    value={newKidArea}
                    onChange={(e) => setNewKidArea(e.target.value)}
                    className="border rounded px-2 py-1"
                  >
                    <option value="">— Select Area —</option>
                    {Object.keys(areas).map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddKid}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-semibold transition-colors"
                  >
                    Add Kid
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-4">
              <button
                onClick={handleNextFromStep1}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded font-semibold transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 (Improved styling for uniform heights) */}
        {step === 2 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-2xl font-semibold mb-4">Step 2: Assign Drivers</h2>

            <div className="flex flex-col sm:flex-row gap-4 mb-4 items-end sm:items-center">
              {/* Driver Name (select) */}
              <div className="flex-1">
                <label className="block font-medium mb-1">Driver Kid Name:</label>
                <select
                  className="border rounded px-3 py-2 w-full h-10"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                >
                  <option value="">— Select Kid —</option>
                  {allKids.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>

              {/* Seats Input */}
              <div className="flex-1">
                <label className="block font-medium mb-1">
                  Seats (excluding driver):
                </label>
                <input
                  type="number"
                  className="border rounded px-3 py-2 w-full h-10"
                  placeholder="0"
                  value={driverSeats}
                  onChange={(e) => setDriverSeats(e.target.value)}
                />
              </div>

              {/* Parent Driving Checkbox */}
              <div className="flex items-center gap-2 mt-6">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={driverIsParent}
                  onChange={(e) => setDriverIsParent(e.target.checked)}
                />
                <label className="text-sm font-medium select-none">
                  Parent Driving
                </label>
              </div>
            </div>

            <button
              onClick={handleAddDriver}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-semibold transition-colors mb-4"
            >
              Add Driver
            </button>

            <div className="border rounded p-3">
              <h3 className="font-medium mb-2">Current Drivers:</h3>
              {drivers.length === 0 ? (
                <p className="text-sm text-gray-500">None yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {drivers.map((d, idx) => (
                    <li key={idx}>
                      <strong>{d.name}</strong> — {d.seats} seats,{" "}
                      {d.isParent ? "Parent" : "Kid"} Driving
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6 flex gap-4">
              {/* Back => Step 1 */}
              <button
                onClick={() => setStep(1)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded font-semibold transition-colors"
              >
                Back
              </button>
              {/* Finalize => Step 3 */}
              <button
                onClick={handleFinalizeDrivers}
                // className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded font-semibold transition-colors"
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded font-semibold transition-colors"
              >
                Finalize
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: RESULTS */}
        {step === 3 && assignments && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4">Step 3: Ride Assignments</h2>

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full border border-red-700 text-sm">
                <thead className="bg-red-700 text-white">
                  <tr>
                    <th className="border px-4 py-2 text-left">Driver</th>
                    <th className="border px-4 py-2 text-left">Passengers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {Object.entries(assignments.rideAssignments).map(
                    ([driver, passengers]) => (
                      <tr key={driver}>
                        <td className="border px-4 py-2 font-semibold w-1/4">
                          {driver}
                        </td>
                        <td className="border px-4 py-2 align-top">
                          {passengers.length > 0 ? (
                            <ul className="list-disc ml-6">
                              {passengers.map((kid) => (
                                <li key={kid}>{kid}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-gray-500">No passengers</span>
                          )}
                        </td>
                      </tr>
                    )
                  )}

                  {/* Unassigned row if any */}
                  {assignments.unassignedPeople.length > 0 && (
                    <tr className="bg-red-50">
                      <td className="border px-4 py-2 font-semibold">
                        Unassigned
                      </td>
                      <td className="border px-4 py-2">
                        <ul className="list-disc ml-6">
                          {assignments.unassignedPeople.map((kid) => (
                            <li key={kid}>{kid}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Back => Step 2 */}
            <div className="mt-6">
              <button
                onClick={() => setStep(2)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded font-semibold transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white px-6 py-4 text-center text-gray-500 text-sm mt-auto">
        © {new Date().getFullYear()} Carpool Manager
      </footer>
    </div>
  );
}
