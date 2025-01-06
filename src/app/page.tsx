"use client";

import { useState } from "react";
import Image from "next/image";
import { doAssignmentWithSwaps } from "./actions";

export interface DriverData {
  name: string;      
  seats: number;     
  isParent: boolean; // true => parent's driving that kid, false => kid is driver
}

export interface AssignRidesResult {
  rideAssignments: Record<string, string[]>;
  unassignedPeople: string[];
}

export default function Home() {
  // Steps
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

  // -------------------------------------------
  // 1) Load CSV
  // -------------------------------------------
  async function handleLoadCSV() {
    try {
      const res = await fetch("/people_areas.csv");
      if (!res.ok) {
        throw new Error("Failed to load people_areas.csv");
      }
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
      alert("Error: see console for details.");
    }
  }

  // -------------------------------------------
  // Step 1: Select Kids
  // -------------------------------------------
  function toggleKidPresent(kid: string) {
    const newSet = new Set(selectedKids);
    if (newSet.has(kid)) newSet.delete(kid);
    else newSet.add(kid);
    setSelectedKids(newSet);
  }

  function handleAddKid() {
    if (!newKidName.trim() || !newKidArea.trim()) {
      alert("Please provide both kid name and area.");
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

  // -------------------------------------------
  // Step 2: Add Drivers
  // -------------------------------------------
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
      // CALL doAssignmentWithSwaps => this includes local improvements
      const result = await doAssignmentWithSwaps(presentArr, drivers, areas);
      setAssignments(result);
      setStep(3);
    } catch (err) {
      console.error(err);
      alert("Error: see console.");
    }
  }

  // -------------------------------------------
  // Render Steps
  // -------------------------------------------
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-800">
      <header className="bg-white shadow px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image
            src="/car.png"
            alt="Next.js"
            width={55}
            height={20}
          />
          <h1 className="text-lg font-bold">Carpool Manager</h1>
        </div>
        <button
          onClick={handleLoadCSV}
          disabled={csvLoaded}
          className={`px-4 py-1 rounded font-semibold ${
            csvLoaded
              ? "bg-gray-400 text-white cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {csvLoaded ? "CSV Loaded" : "Load CSV"}
        </button>
      </header>

      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">
        {/* STEP 1 */}
        {csvLoaded && step === 1 && (
          <div className="bg-white rounded shadow p-4 mt-4">
            <h2 className="text-xl font-semibold mb-4">
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
                <p className="font-medium mb-2">Add Kid:</p>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="Kid Name"
                    value={newKidName}
                    onChange={(e) => setNewKidName(e.target.value)}
                    className="border px-2 py-1 rounded"
                  />
                  <input
                    type="text"
                    placeholder="Area"
                    value={newKidArea}
                    onChange={(e) => setNewKidArea(e.target.value)}
                    className="border px-2 py-1 rounded"
                  />
                  <button
                    onClick={handleAddKid}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-1 rounded"
                  >
                    Add Kid
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={handleNextFromStep1}
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Next
            </button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="bg-white rounded shadow p-4 mt-4">
            <h2 className="text-xl font-semibold mb-4">Step 2: Assign Drivers</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block font-medium mb-1">Driver Kid Name:</label>
                <select
                  className="border px-2 py-1 rounded w-full"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                >
                  <option value="">-- Select Kid --</option>
                  {allKids.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block font-medium mb-1">Seats (excl. driver):</label>
                <input
                  type="number"
                  className="border px-2 py-1 rounded w-full"
                  placeholder="0"
                  value={driverSeats}
                  onChange={(e) => setDriverSeats(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 mt-6 sm:mt-0">
                <input
                  type="checkbox"
                  checked={driverIsParent}
                  onChange={(e) => setDriverIsParent(e.target.checked)}
                />
                <span>Parent Driving (kid is passenger)</span>
              </div>
            </div>
            <button
              onClick={handleAddDriver}
              className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Add Driver
            </button>

            <div className="border rounded p-3 mt-4">
              <h3 className="font-medium mb-2">Current Drivers:</h3>
              {drivers.length === 0 ? (
                <p className="text-sm text-gray-500">None yet.</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {drivers.map((d, idx) => (
                    <li key={idx}>
                      <strong>{d.name}</strong> — {d.seats} seats,{" "}
                      {d.isParent ? "Parent" : "Kid"} Driving
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              onClick={handleFinalizeDrivers}
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Finalize
            </button>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && assignments && (
          <div className="bg-white rounded shadow p-4 mt-4">
            <h2 className="text-xl font-semibold mb-4">Step 3: Ride Assignments</h2>
            {Object.entries(assignments.rideAssignments).map(
              ([driver, passengers]) => (
                <div key={driver} className="mb-4">
                  <p className="font-medium">Driver: {driver}</p>
                  {passengers.map((kid) => (
                    <div key={kid} className="ml-4">
                      - {kid}
                    </div>
                  ))}
                </div>
              )
            )}
            {assignments.unassignedPeople.length > 0 && (
              <div className="mt-2">
                <p className="font-medium">Unassigned Kids:</p>
                {assignments.unassignedPeople.map((kid) => (
                  <div key={kid} className="ml-4">
                    - {kid}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-white p-4 text-center text-gray-500 text-sm mt-auto">
        © {new Date().getFullYear()} Carpool Manager
      </footer>
    </div>
  );
}
