"use server";

import fs from "fs/promises";
import path from "path";

// ------------------------------------------------------------------
// Type Declarations
// ------------------------------------------------------------------
export interface DriverData {
  name: string;      // Kid's name
  seats: number;     // # seats (excluding driver)
  isParent: boolean; // Parent or kid driver
}

export interface AssignRidesResult {
  rideAssignments: Record<string, string[]>; // driver => array of passengers
  unassignedPeople: string[];
}

// ------------------------------------------------------------------
// CSV reading utilities
// ------------------------------------------------------------------
async function readCSV(filename: string): Promise<string> {
  const fullPath = path.join(process.cwd(), "public", filename);
  return fs.readFile(fullPath, "utf-8");
}

// ------------------------------------------------------------------
// doAssignmentWithSwaps
//   1) Perform the initial assignment
//   2) Perform local improvement swaps
// ------------------------------------------------------------------
export async function doAssignmentWithSwaps(
  presentKids: string[],                  // which kids are here
  drivers: DriverData[],                  // array in insertion order
  clientAreas: Record<string, string[]>   // area => kids
): Promise<AssignRidesResult> {
  // 1) Read CSVs
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
  // Merge client area data
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

  // Helpers
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

  // ----------------------------------------------------------------
  // STEP A: Initial seat assignment
  // ----------------------------------------------------------------
  const remaining = new Set(presentKids);
  const rideAssignments: Record<string, string[]> = {};
  drivers.forEach((d) => {
    rideAssignments[d.name] = [];
  });

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

    // Fill seats with same-area kids
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

  // ----------------------------------------------------------------
  // STEP B: Local Improvement (Swaps)
  // ----------------------------------------------------------------
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

        // We'll attempt each passenger pA in dA and pB in dB
        // If swapping them lowers total cost => do it
        for (const pA of arrA) {
          // skip if pA is the driver or parent's kid for dA
          const driverA = drivers.find((x) => x.name === dA);
          const driverB = drivers.find((x) => x.name === dB);

          // if driverA isParent and pA == dA => must keep
          if (driverA?.isParent && pA === dA) continue;
          // if driverA isKid and pA == dA => must keep
          if (!driverA?.isParent && pA === dA) continue;

          for (const pB of arrB) {
            // same checks for pB
            if (driverB?.isParent && pB === dB) continue;
            if (!driverB?.isParent && pB === dB) continue;

            // after swap:
            const newA = arrA.filter((x) => x !== pA).concat(pB);
            const newB = arrB.filter((x) => x !== pB).concat(pA);

            if (newA.length > seatsA || newB.length > seatsB) {
              continue; // seat capacity exceeded
            }

            // compute cost difference
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

  // Done
  return {
    rideAssignments,
    unassignedPeople,
  };
}
