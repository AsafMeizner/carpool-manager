"use server";

// -----------------------------------------------------------
// 1) Remove any 'fs' or 'path' imports (no longer needed)
// -----------------------------------------------------------
// import fs from "fs/promises";
// import path from "path";

// -----------------------------------------------------------
// 2) Type Declarations
// -----------------------------------------------------------
export interface DriverData {
  name: string;      // Kid's name
  seats: number;     // # seats (excluding driver)
  isParent: boolean; // Parent or kid driver
}

export interface AssignRidesResult {
  rideAssignments: Record<string, string[]>; // driver => array of passengers
  unassignedPeople: string[];
}

// -----------------------------------------------------------
// 3) CSV Reading Utility (using fetch instead of fs)
// -----------------------------------------------------------
async function readCSV(filename: string): Promise<string> {
  // e.g. define NEXT_PUBLIC_BASE_URL = "http://localhost:3000" locally
  // or "https://your-vercel-app.vercel.app" in production
  const baseURL = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseURL) {
    throw new Error(
      "Missing NEXT_PUBLIC_BASE_URL. Set it in your .env or on Vercel."
    );
  }

  // Example: fetch("https://your-vercel-app.vercel.app/people_areas.csv")
  const url = `${baseURL}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${filename}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

// -----------------------------------------------------------
// 4) doAssignmentWithSwaps (same logic, but uses readCSV())
// -----------------------------------------------------------
export async function doAssignmentWithSwaps(
  presentKids: string[],                  // which kids are here
  drivers: DriverData[],                  // array in insertion order
  clientAreas: Record<string, string[]>   // area => kids
): Promise<AssignRidesResult> {
  // 1) Read CSVs via fetch
  const [peopleAreasCSV, distanceMatrixCSV] = await Promise.all([
    readCSV("people_areas.csv"),
    readCSV("distance_matrix.csv"),
  ]);

  // 2) Parse people_areas.csv => loadedAreas
  const loadedAreas: Record<string, string[]> = {};
  const linesAreas = peopleAreasCSV.trim().split(/\r?\n/);
  for (const line of linesAreas) {
    const parts = line.split(",").map((x) => x.trim());
    const areaName = parts[0];
    const kids = parts.slice(1).filter(Boolean);
    if (!loadedAreas[areaName]) {
      loadedAreas[areaName] = [];
    }
    for (const k of kids) {
      if (!loadedAreas[areaName].includes(k)) {
        loadedAreas[areaName].push(k);
      }
    }
  }
  // Merge in any area data from the client
  for (const [area, kids] of Object.entries(clientAreas)) {
    if (!loadedAreas[area]) {
      loadedAreas[area] = [];
    }
    for (const k of kids) {
      if (!loadedAreas[area].includes(k)) {
        loadedAreas[area].push(k);
      }
    }
  }

  // 3) Parse distance_matrix.csv => distanceMatrix[origin][dest]
  const distanceMatrix: Record<string, Record<string, number>> = {};
  const linesMatrix = distanceMatrixCSV.trim().split(/\r?\n/);
  const header = linesMatrix[0].split(",").slice(1).map((h) => h.trim());
  for (let i = 1; i < linesMatrix.length; i++) {
    const row = linesMatrix[i].split(",").map((r) => r.trim());
    const origin = row[0];
    const distValues = row.slice(1).map((r) => parseFloat(r));
    distanceMatrix[origin] = {};
    header.forEach((dest, idx) => {
      distanceMatrix[origin][dest] = distValues[idx];
    });
  }

  // -----------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------
  function findKidArea(kid: string): string | null {
    for (const [area, list] of Object.entries(loadedAreas)) {
      if (list.includes(kid)) return area;
    }
    return null;
  }

  // Approximate route cost: Tichonet->p1->p2->...->driverArea
  function approximateDriverCost(driverName: string, passengers: string[]): number {
    let cost = 0;
    let current = "Tichonet";
    // Visit each passenger in the listed order:
    for (const kid of passengers) {
      const kArea = findKidArea(kid);
      if (kArea && distanceMatrix[current]?.[kArea] != null) {
        cost += distanceMatrix[current][kArea];
        current = kArea;
      }
    }
    // Finally go to driver's area
    const driverArea = findKidArea(driverName);
    if (driverArea && distanceMatrix[current]?.[driverArea] != null) {
      cost += distanceMatrix[current][driverArea];
    }
    return cost;
  }

  // -----------------------------------------------------------
  // STEP A: Initial seat assignment
  // -----------------------------------------------------------
  const remaining = new Set(presentKids);
  const rideAssignments: Record<string, string[]> = {};
  drivers.forEach((d) => {
    rideAssignments[d.name] = [];
  });

  // Fill seats
  for (const d of drivers) {
    const driverName = d.name;
    let seatsLeft = d.seats;

    // Kid driver => remove them from "remaining"
    if (!d.isParent) {
      remaining.delete(driverName);
    } else {
      // Parent => that kid is a passenger if present
      if (remaining.has(driverName)) {
        rideAssignments[driverName].push(driverName);
        remaining.delete(driverName);
        seatsLeft = Math.max(0, seatsLeft - 1);
      }
    }

    // Fill seats with same-area kids first
    const driverArea = findKidArea(driverName);
    if (driverArea && seatsLeft > 0) {
      const sameAreaKids = Array.from(remaining).filter((kid) => {
        if (kid === driverName) return false;
        return findKidArea(kid) === driverArea;
      });
      for (const kid of sameAreaKids) {
        if (seatsLeft <= 0) break;
        rideAssignments[driverName].push(kid);
        remaining.delete(kid);
        seatsLeft--;
      }
    }

    // Route-based from Tichonet if seats remain
    let currentLoc = "Tichonet";
    while (seatsLeft > 0 && remaining.size > 0) {
      let bestKid: string | null = null;
      let bestDist = Infinity;
      for (const kid of remaining) {
        const kArea = findKidArea(kid);
        if (!kArea) continue;
        const dist = distanceMatrix[currentLoc]?.[kArea];
        if (dist != null && dist < bestDist) {
          bestDist = dist;
          bestKid = kid;
        }
      }
      if (!bestKid) break;

      rideAssignments[driverName].push(bestKid);
      remaining.delete(bestKid);
      seatsLeft--;

      const bestArea = findKidArea(bestKid);
      if (bestArea) currentLoc = bestArea;
    }
  }

  const unassignedPeople = Array.from(remaining);

  // -----------------------------------------------------------
  // STEP B: Local Improvement (Swaps)
  // -----------------------------------------------------------
  const driverNames = drivers.map((d) => d.name);
  function seatsForDriver(dName: string) {
    const dd = drivers.find((x) => x.name === dName);
    return dd ? dd.seats : 0;
  }

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < driverNames.length; i++) {
      for (let j = i + 1; j < driverNames.length; j++) {
        const dA = driverNames[i];
        const dB = driverNames[j];

        const arrA = rideAssignments[dA];
        const arrB = rideAssignments[dB];
        const seatsA = seatsForDriver(dA);
        const seatsB = seatsForDriver(dB);

        // Try each passenger pA in dA and pB in dB for a potential swap
        for (const pA of arrA) {
          // skip if pA is the driver
          const driverA = drivers.find((x) => x.name === dA);
          if (driverA?.isParent && pA === dA) continue;
          if (!driverA?.isParent && pA === dA) continue;

          for (const pB of arrB) {
            // skip if pB is the driver
            const driverB = drivers.find((x) => x.name === dB);
            if (driverB?.isParent && pB === dB) continue;
            if (!driverB?.isParent && pB === dB) continue;

            // after swap:
            const newA = arrA.filter((x) => x !== pA).concat(pB);
            const newB = arrB.filter((x) => x !== pB).concat(pA);

            if (newA.length > seatsA || newB.length > seatsB) {
              continue; // seat capacity exceeded
            }

            // cost difference
            const oldCostA = approximateDriverCost(dA, arrA);
            const oldCostB = approximateDriverCost(dB, arrB);
            const newCostA = approximateDriverCost(dA, newA);
            const newCostB = approximateDriverCost(dB, newB);
            const oldTotal = oldCostA + oldCostB;
            const newTotal = newCostA + newCostB;

            // If improved => do swap
            if (newTotal < oldTotal) {
              rideAssignments[dA] = newA;
              rideAssignments[dB] = newB;
              improved = true;
              break;
            }
          }
          if (improved) break;
        }
        if (improved) break;
      }
      if (improved) break;
    }
  }

  // -----------------------------------------------------------
  // Return final result
  // -----------------------------------------------------------
  return {
    rideAssignments,
    unassignedPeople,
  };
}
